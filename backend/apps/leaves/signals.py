import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CompOffRequest, LeaveRequest

logger = logging.getLogger("hrms")


@receiver(post_save, sender=LeaveRequest)
def on_leave_request_saved(sender, instance: LeaveRequest, created: bool, **kwargs):
    if created and instance.status == LeaveRequest.STATUS_PENDING:
        # Queue AI processing (spof / conflict detection)
        from tasks.leave_tasks import process_leave_application
        try:
            process_leave_application.delay(instance.pk)
            logger.info("Queued leave application processing leave_id=%s", instance.pk)
        except Exception as exc:
            logger.exception("Failed to queue leave processing leave_id=%s error=%s", instance.pk, exc)

        # Notify manager with team context
        _notify_manager_new_leave(instance)

    elif not created and instance.status == LeaveRequest.STATUS_APPROVED:
        from tasks.leave_tasks import process_leave_approval
        try:
            process_leave_approval.delay(instance.pk)
            logger.info("Queued leave approval processing leave_id=%s", instance.pk)
        except Exception as exc:
            logger.exception("Failed to queue leave approval leave_id=%s error=%s", instance.pk, exc)

    elif not created and instance.status == LeaveRequest.STATUS_REJECTED:
        _notify_employee_rejection(instance)

    elif not created and instance.status == LeaveRequest.STATUS_CANCELLED:
        _notify_manager_cancellation(instance)


def _notify_manager_new_leave(instance: LeaveRequest):
    try:
        from tasks.notification_tasks import dispatch_notification

        from apps.employees.models import Employee
        from apps.leaves.models import LeaveBalance

        employee = (
            Employee.objects.select_related("user", "manager", "manager__user", "department")
            .filter(pk=instance.employee_id)
            .first()
        )
        manager = getattr(employee, "manager", None) if employee else None
        manager_user = getattr(manager, "user", None) if manager else None
        manager_email = getattr(manager_user, "email", "") if manager_user else ""
        if not manager_email:
            return

        # ── Overlapping team leaves ───────────────────────────────────────────
        overlaps_qs = (
            LeaveRequest.objects.filter(
                employee__manager_id=manager.id,
                from_date__lte=instance.to_date,
                to_date__gte=instance.from_date,
                status__in=[LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_APPROVED],
            )
            .exclude(pk=instance.pk)
            .select_related("employee__user")
            .order_by("from_date")[:10]
        )
        overlaps = [
            {
                "leave_id": lr.pk,
                "employee_name": lr.employee.user.name if lr.employee.user else "",
                "employee_id": getattr(lr.employee, "employee_id", ""),
                "from_date": str(lr.from_date),
                "to_date": str(lr.to_date),
                "leave_type": lr.leave_type,
                "status": lr.status,
            }
            for lr in overlaps_qs
        ]

        # ── Team coverage insight ─────────────────────────────────────────────
        total_reports = Employee.objects.filter(manager_id=manager.id, is_active=True).count()
        on_leave_count = len([o for o in overlaps if o["status"] == LeaveRequest.STATUS_APPROVED]) + 1
        coverage_pct = round(((total_reports - on_leave_count) / max(total_reports, 1)) * 100)

        # ── Employee balance snapshot ─────────────────────────────────────────
        bal = LeaveBalance.objects.filter(employee_id=instance.employee_id).first()
        balance_snapshot = None
        if bal:
            balance_snapshot = {
                "CL": bal.casual_remaining,
                "PL": bal.privilege_remaining,
                "SL": bal.sick_remaining,
                "CO": bal.comp_off_remaining,
            }

        # ── Pending approvals count ───────────────────────────────────────────
        pending_count = LeaveRequest.objects.filter(
            employee__manager_id=manager.id, status=LeaveRequest.STATUS_PENDING
        ).count()

        half_day_note = (
            f" [{instance.get_half_day_session_display()} half-day]" if instance.is_half_day else ""
        )
        applied_by_note = ""
        if instance.applied_by_id and instance.applied_by_id != (
            employee.user_id if employee else None
        ):
            applied_by_note = f" (applied on behalf by {instance.applied_by.get_full_name()})"

        overlap_note = f" ⚠️ {len(overlaps)} team member(s) also on leave this period." if overlaps else ""

        dispatch_notification.delay(
            ["inapp"],
            manager_email,
            f"New Leave Request #{instance.pk} — {employee.user.name if employee and employee.user else 'Employee'}",
            (
                f"{employee.user.name if employee and employee.user else 'An employee'} has requested "
                f"{instance.get_leave_type_display()} from {instance.from_date} to {instance.to_date} "
                f"({instance.days_count:.1f} day(s)){half_day_note}.{applied_by_note}"
                f"\nReason: {instance.reason or 'Not specified'}"
                f"{overlap_note}"
                f"\nYou have {pending_count} pending leave request(s) awaiting approval."
            ),
            {
                "leave_id": instance.pk,
                "employee_id": employee.employee_id if employee else "",
                "employee_name": employee.user.name if employee and employee.user else "",
                "leave_type": instance.leave_type,
                "from_date": str(instance.from_date),
                "to_date": str(instance.to_date),
                "days_count": float(instance.days_count),
                "is_half_day": instance.is_half_day,
                "half_day_session": instance.half_day_session,
                "reason": instance.reason,
                "overlapping_team_leaves": overlaps,
                "team_coverage_pct": coverage_pct,
                "total_reports": total_reports,
                "on_leave_count": on_leave_count,
                "leave_balance_snapshot": balance_snapshot,
                "pending_approvals_total": pending_count,
                "spof_flag": instance.spof_flag,
                "ai_insights": "pending",
                "action_required": True,
            },
        )
        logger.info(
            "Queued leave request notification leave_id=%s manager_email=%s overlaps=%s",
            instance.pk, manager_email, len(overlaps),
        )
    except Exception as exc:
        logger.exception(
            "Failed to queue leave request manager notification leave_id=%s error=%s", instance.pk, exc
        )


def _notify_employee_rejection(instance: LeaveRequest):
    try:
        from tasks.notification_tasks import dispatch_notification

        recipient = (
            instance.employee.user.email
            if hasattr(instance.employee, "user") and instance.employee.user
            else ""
        )
        if not recipient:
            return

        dispatch_notification.delay(
            ["inapp"],
            recipient,
            f"Leave Request #{instance.pk} Rejected",
            (
                f"Your {instance.get_leave_type_display()} request ({instance.from_date} → {instance.to_date}) "
                f"has been rejected."
                + (f"\nReason: {instance.rejection_reason}" if instance.rejection_reason else "")
            ),
            {
                "leave_id": instance.pk,
                "leave_type": instance.leave_type,
                "status": "REJECTED",
                "rejection_reason": instance.rejection_reason,
            },
        )
        logger.info("Queued rejection notification leave_id=%s recipient=%s", instance.pk, recipient)
    except Exception as exc:
        logger.exception("Failed to notify employee of rejection leave_id=%s error=%s", instance.pk, exc)


def _notify_manager_cancellation(instance: LeaveRequest):
    """Notify manager if employee cancels their own leave."""
    try:
        from tasks.notification_tasks import dispatch_notification

        from apps.employees.models import Employee

        employee = (
            Employee.objects.select_related("manager__user")
            .filter(pk=instance.employee_id)
            .first()
        )
        manager = getattr(employee, "manager", None) if employee else None
        manager_email = (
            manager.user.email if manager and hasattr(manager, "user") and manager.user else ""
        )
        if not manager_email:
            return

        dispatch_notification.delay(
            ["inapp"],
            manager_email,
            f"Leave #{instance.pk} Cancelled — {employee.user.name if employee and employee.user else ''}",
            (
                f"{employee.user.name if employee and employee.user else 'Employee'} has cancelled their "
                f"{instance.get_leave_type_display()} request ({instance.from_date} → {instance.to_date}). "
                f"No action required."
            ),
            {
                "leave_id": instance.pk,
                "leave_type": instance.leave_type,
                "status": "CANCELLED",
                "from_date": str(instance.from_date),
                "to_date": str(instance.to_date),
            },
        )
        logger.info("Queued cancellation notification leave_id=%s manager_email=%s", instance.pk, manager_email)
    except Exception as exc:
        logger.exception("Failed to notify manager of cancellation leave_id=%s error=%s", instance.pk, exc)


@receiver(post_save, sender=CompOffRequest)
def on_comp_off_saved(sender, instance: CompOffRequest, created: bool, **kwargs):
    if created and instance.status == CompOffRequest.STATUS_PENDING:
        _notify_manager_comp_off_request(instance)
    elif not created and instance.status == CompOffRequest.STATUS_APPROVED:
        _notify_employee_comp_off_approved(instance)
    elif not created and instance.status == CompOffRequest.STATUS_REJECTED:
        _notify_employee_comp_off_rejected(instance)


def _notify_manager_comp_off_request(instance: CompOffRequest):
    try:
        from tasks.notification_tasks import dispatch_notification

        from apps.employees.models import Employee

        employee = (
            Employee.objects.select_related("manager__user", "user")
            .filter(pk=instance.employee_id)
            .first()
        )
        manager = getattr(employee, "manager", None) if employee else None
        manager_email = (
            manager.user.email if manager and hasattr(manager, "user") and manager.user else ""
        )
        if not manager_email:
            return

        dispatch_notification.delay(
            ["inapp"],
            manager_email,
            f"Comp Off Request #{instance.pk} — {employee.user.name if employee and employee.user else ''}",
            (
                f"{employee.user.name if employee and employee.user else 'Employee'} worked on "
                f"{instance.worked_on} and is claiming {instance.days_claimed:.1f} comp off day(s)."
                f"\nReason: {instance.reason or 'Not specified'}"
            ),
            {
                "comp_off_id": instance.pk,
                "employee_id": employee.employee_id if employee else "",
                "worked_on": str(instance.worked_on),
                "days_claimed": float(instance.days_claimed),
                "reason": instance.reason,
                "action_required": True,
            },
        )
    except Exception as exc:
        logger.exception("Failed to notify manager of comp off request id=%s error=%s", instance.pk, exc)


def _notify_employee_comp_off_approved(instance: CompOffRequest):
    try:
        from tasks.notification_tasks import dispatch_notification

        from apps.leaves.models import LeaveBalance

        recipient = (
            instance.employee.user.email
            if hasattr(instance.employee, "user") and instance.employee.user
            else ""
        )
        if not recipient:
            return

        bal = LeaveBalance.objects.filter(employee_id=instance.employee_id).first()
        new_balance = bal.comp_off_remaining if bal else "N/A"

        dispatch_notification.delay(
            ["inapp"],
            recipient,
            f"Comp Off #{instance.pk} Approved — {instance.days_claimed:.1f} day(s) credited",
            (
                f"Your comp off request for working on {instance.worked_on} has been approved. "
                f"{instance.days_claimed:.1f} day(s) have been credited to your CO balance. "
                f"Current CO balance: {new_balance}"
            ),
            {
                "comp_off_id": instance.pk,
                "days_claimed": float(instance.days_claimed),
                "new_co_balance": float(new_balance) if isinstance(new_balance, (int, float)) else None,
            },
        )
    except Exception as exc:
        logger.exception("Failed to notify employee of comp off approval id=%s error=%s", instance.pk, exc)


def _notify_employee_comp_off_rejected(instance: CompOffRequest):
    try:
        from tasks.notification_tasks import dispatch_notification

        recipient = (
            instance.employee.user.email
            if hasattr(instance.employee, "user") and instance.employee.user
            else ""
        )
        if not recipient:
            return

        dispatch_notification.delay(
            ["inapp"],
            recipient,
            f"Comp Off #{instance.pk} Rejected",
            (
                f"Your comp off request for working on {instance.worked_on} has been rejected."
                + (f"\nReason: {instance.rejection_reason}" if instance.rejection_reason else "")
            ),
            {
                "comp_off_id": instance.pk,
                "rejection_reason": instance.rejection_reason,
            },
        )
    except Exception as exc:
        logger.exception("Failed to notify employee of comp off rejection id=%s error=%s", instance.pk, exc)
