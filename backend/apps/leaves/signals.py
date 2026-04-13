import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import LeaveRequest

logger = logging.getLogger("hrms")


@receiver(post_save, sender=LeaveRequest)
def on_leave_request_saved(sender, instance: LeaveRequest, created: bool, **kwargs):
    if created and instance.status == LeaveRequest.STATUS_PENDING:
        from tasks.leave_tasks import process_leave_application
        from tasks.notification_tasks import dispatch_notification

        process_leave_application.delay(instance.pk)
        logger.info("Queued leave application processing leave_id=%s", instance.pk)
        try:
            from apps.employees.models import Employee
            from apps.leaves.models import LeaveBalance, LeaveRequest

            employee = (
                Employee.objects.select_related("user", "manager", "manager__user", "department")
                .filter(pk=instance.employee_id)
                .first()
            )
            manager = getattr(employee, "manager", None) if employee else None
            manager_user = getattr(manager, "user", None) if manager else None
            manager_email = getattr(manager_user, "email", "") if manager_user else ""
            if manager_email:
                overlaps_qs = (
                    LeaveRequest.objects.filter(
                        employee__manager_id=manager.id,
                        from_date__lte=instance.to_date,
                        to_date__gte=instance.from_date,
                    )
                    .exclude(pk=instance.pk)
                    .select_related("employee")
                    .order_by("from_date")[:10]
                )
                overlaps = []
                for lr in overlaps_qs:
                    overlaps.append(
                        {
                            "leave_id": lr.pk,
                            "employee_id": getattr(lr.employee, "employee_id", ""),
                            "from_date": str(lr.from_date),
                            "to_date": str(lr.to_date),
                            "leave_type": lr.leave_type,
                            "status": lr.status,
                        }
                    )

                bal = LeaveBalance.objects.filter(employee_id=instance.employee_id).first()
                balance_snapshot = None
                if bal:
                    balance_snapshot = {
                        "CL": float(bal.casual_remaining),
                        "EL": float(bal.earned_remaining),
                        "SL": float(bal.sick_remaining),
                    }

                overlap_note = f" Overlaps with {len(overlaps)} other leave(s) in this period." if overlaps else ""
                dispatch_notification.delay(
                    ["inapp"],
                    manager_email,
                    "New Leave Request",
                    f"New leave request {instance.pk} from {employee.employee_id if employee else instance.employee_id} ({instance.from_date} → {instance.to_date}).{overlap_note}",
                    {
                        "leave_id": instance.pk,
                        "employee_id": employee.employee_id if employee else instance.employee_id,
                        "status": instance.status,
                        "from_date": str(instance.from_date),
                        "to_date": str(instance.to_date),
                        "leave_type": instance.leave_type,
                        "days_count": float(instance.days_count),
                        "overlapping_team_leaves": overlaps,
                        "leave_balance_snapshot": balance_snapshot,
                        "ai_insights": "pending",
                    },
                )
                logger.info("Queued leave request notification leave_id=%s manager_email=%s", instance.pk, manager_email)
        except Exception as exc:
            logger.exception("Failed to queue leave request manager notification leave_id=%s error=%s", instance.pk, exc)
    elif not created and instance.status == LeaveRequest.STATUS_APPROVED:
        from tasks.leave_tasks import process_leave_approval

        process_leave_approval.delay(instance.pk)
        logger.info("Queued leave approval processing leave_id=%s", instance.pk)
