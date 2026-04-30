import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import List

from django.conf import settings
from django.db import transaction

from .models import (
    AttendanceLog,
    AttendancePenalty,
    AttendancePolicy,
    RegularizationRequest,
    WFHRequest,
)
from .penalty_strategies import PenaltyStrategyFactory
from .repositories import (
    AttendanceLogReadRepository,
    AttendanceLogWriteRepository,
    AttendancePenaltyReadRepository,
    AttendancePenaltyWriteRepository,
    AttendancePolicyReadRepository,
    AttendancePolicyWriteRepository,
    RegularizationReadRepository,
    RegularizationWriteRepository,
    WFHReadRepository,
    WFHWriteRepository,
)

logger = logging.getLogger("hrms")

_MAX_REGULARIZATION_ATTEMPTS = 3


class GeofenceError(ValueError):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    import math

    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(round(r * c))


def _geofence_enforced() -> bool:
    return bool(getattr(settings, "OFFICE_GEOFENCE_ENABLED", False))


def _geofence_params() -> tuple[float | None, float | None, int]:
    lat = getattr(settings, "OFFICE_GEOFENCE_CENTER_LAT", None)
    lon = getattr(settings, "OFFICE_GEOFENCE_CENTER_LON", None)
    radius_m = int(getattr(settings, "OFFICE_GEOFENCE_RADIUS_M", 250))
    return lat, lon, radius_m


def _validate_geofence(
    *, latitude: float | None, longitude: float | None, accuracy_m: int | None
) -> tuple[bool, int | None]:
    if not _geofence_enforced():
        return True, None

    center_lat, center_lon, radius_m = _geofence_params()
    if center_lat is None or center_lon is None:
        logger.warning("geofence_not_configured")
        raise GeofenceError(
            "Office geofence is not configured on the server.",
            "GEOFENCE_NOT_CONFIGURED",
        )

    if latitude is None or longitude is None:
        logger.info("geofence_location_missing")
        raise GeofenceError(
            "Location permission is required to clock in/out from office.",
            "LOCATION_REQUIRED",
        )

    distance_m = _haversine_m(
        float(center_lat), float(center_lon), float(latitude), float(longitude)
    )
    buffer_m = min(100, max(0, int(accuracy_m or 0)))
    allowed = distance_m <= (radius_m + buffer_m)
    if not allowed:
        logger.info(
            "geofence_denied distance_m=%s radius_m=%s buffer_m=%s",
            distance_m,
            radius_m,
            buffer_m,
        )
        raise GeofenceError(
            f"Outside office geofence (distance {distance_m}m, allowed {radius_m}m).",
            "GEOFENCE_DENIED",
        )
    return True, distance_m


def _working_days_between(start: date, end: date) -> int:
    """Count Mon–Fri days from start to end inclusive."""
    count = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            count += 1
        current += timedelta(days=1)
    return count


def _expand_dates(from_date: date, to_date: date) -> List[str]:
    """Expand date range to list of ISO date strings (Mon–Fri only)."""
    result = []
    current = from_date
    while current <= to_date:
        if current.weekday() < 5:
            result.append(current.isoformat())
        current += timedelta(days=1)
    return result


def _last_working_day_of_month(year: int, month: int) -> date:
    """Return last Mon–Fri of the given month."""
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    last_day = next_month - timedelta(days=1)
    while last_day.weekday() >= 5:
        last_day -= timedelta(days=1)
    return last_day


class AttendanceService:
    def __init__(
        self,
        employee,
        read_repo: AttendanceLogReadRepository | None = None,
        write_repo: AttendanceLogWriteRepository | None = None,
    ):
        self.employee = employee
        self.read_repo = read_repo or AttendanceLogReadRepository()
        self.write_repo = write_repo or AttendanceLogWriteRepository()

    @transaction.atomic
    def check_in(
        self,
        date,
        status: str,
        *,
        latitude: float | None = None,
        longitude: float | None = None,
        accuracy_m: int | None = None,
    ) -> AttendanceLog:
        existing = self.read_repo.get_by_employee_and_date(self.employee.id, date)
        now = datetime.now(tz=timezone.utc)
        _, distance_m = _validate_geofence(
            latitude=latitude, longitude=longitude, accuracy_m=accuracy_m
        )

        if existing:
            updates: dict = {"status": status}
            if not existing.check_in:
                updates["check_in"] = now
                updates["check_in_latitude"] = latitude
                updates["check_in_longitude"] = longitude
                updates["check_in_accuracy_m"] = accuracy_m
                updates["check_in_distance_m"] = distance_m
                updates["check_in_geofence_ok"] = True if _geofence_enforced() else None
            log = self.write_repo.update(existing, **updates)
        else:
            log = self.write_repo.create(
                employee=self.employee,
                date=date,
                check_in=now,
                status=status,
                check_in_latitude=latitude,
                check_in_longitude=longitude,
                check_in_accuracy_m=accuracy_m,
                check_in_distance_m=distance_m,
                check_in_geofence_ok=True if _geofence_enforced() else None,
            )
        logger.info(
            "Attendance check-in employee_id=%s date=%s geofence_enforced=%s distance_m=%s",
            self.employee.employee_id,
            date,
            _geofence_enforced(),
            distance_m,
        )
        return log

    @transaction.atomic
    def check_out(
        self,
        date,
        *,
        latitude: float | None = None,
        longitude: float | None = None,
        accuracy_m: int | None = None,
    ) -> AttendanceLog:
        existing = self.read_repo.get_by_employee_and_date(self.employee.id, date)
        if not existing or not existing.check_in:
            raise ValueError("Cannot check out without checking in first.")
        if existing.check_out:
            raise ValueError("Already checked out for today.")

        _, distance_m = _validate_geofence(
            latitude=latitude, longitude=longitude, accuracy_m=accuracy_m
        )
        now = datetime.now(tz=timezone.utc)
        log = self.write_repo.update(
            existing,
            check_out=now,
            check_out_latitude=latitude,
            check_out_longitude=longitude,
            check_out_accuracy_m=accuracy_m,
            check_out_distance_m=distance_m,
            check_out_geofence_ok=True if _geofence_enforced() else None,
        )
        logger.info(
            "Attendance check-out employee_id=%s date=%s geofence_enforced=%s distance_m=%s",
            self.employee.employee_id,
            date,
            _geofence_enforced(),
            distance_m,
        )
        return log


class AttendancePolicyService:
    def __init__(
        self,
        read_repo: AttendancePolicyReadRepository | None = None,
        write_repo: AttendancePolicyWriteRepository | None = None,
    ):
        self.read_repo = read_repo or AttendancePolicyReadRepository()
        self.write_repo = write_repo or AttendancePolicyWriteRepository()

    _DEFAULT = {
        "regularization_window_working_days": 3,
        "wfh_min_lead_days": 1,
        "penalty_order": ["PL", "LOP"],
    }

    def get_active(self) -> AttendancePolicy | None:
        return self.read_repo.get_active()

    def get_active_or_default(self) -> dict:
        policy = self.read_repo.get_active()
        if policy:
            return {
                "regularization_window_working_days": policy.regularization_window_working_days,
                "wfh_min_lead_days": policy.wfh_min_lead_days,
                "penalty_order": policy.penalty_order or ["PL", "LOP"],
            }
        return dict(self._DEFAULT)

    @transaction.atomic
    def create_version(self, data: dict, created_by) -> AttendancePolicy:
        # Deactivate all existing active policies
        AttendancePolicy.objects.filter(is_active=True).update(is_active=False)
        last = AttendancePolicy.objects.order_by("-version").first()
        new_version = (last.version + 1) if last else 1
        policy = self.write_repo.create(
            version=new_version,
            regularization_window_working_days=data.get("regularization_window_working_days", 3),
            wfh_min_lead_days=data.get("wfh_min_lead_days", 1),
            penalty_order=data.get("penalty_order", ["PL", "LOP"]),
            notes=data.get("notes", ""),
            created_by=created_by,
            is_active=True,
        )
        logger.info("AttendancePolicy v%s created by user_id=%s", policy.version, getattr(created_by, "id", None))
        return policy


class RegularizationService:
    def __init__(
        self,
        employee,
        read_repo: RegularizationReadRepository | None = None,
        write_repo: RegularizationWriteRepository | None = None,
        log_read_repo: AttendanceLogReadRepository | None = None,
        log_write_repo: AttendanceLogWriteRepository | None = None,
        penalty_read_repo: AttendancePenaltyReadRepository | None = None,
    ):
        self.employee = employee
        self.read_repo = read_repo or RegularizationReadRepository()
        self.write_repo = write_repo or RegularizationWriteRepository()
        self.log_read_repo = log_read_repo or AttendanceLogReadRepository()
        self.log_write_repo = log_write_repo or AttendanceLogWriteRepository()
        self.penalty_read_repo = penalty_read_repo or AttendancePenaltyReadRepository()

    @transaction.atomic
    def apply(self, target_date: date, requested_check_out, requested_check_in=None, reason: str = "", applied_by=None) -> RegularizationRequest:
        today = date.today()

        # Cannot regularize future dates
        if target_date > today:
            raise ValueError("Cannot regularize a future date")

        # Cannot regularize a day covered by approved leave
        from apps.leaves.models import LeaveRequest
        leave_overlap = LeaveRequest.objects.filter(
            employee_id=self.employee.id,
            status=LeaveRequest.STATUS_APPROVED,
            from_date__lte=target_date,
            to_date__gte=target_date,
        ).first()
        if leave_overlap:
            raise ValueError(f"Date {target_date} is covered by approved leave #{leave_overlap.pk}")

        # Cannot coexist with pending/approved WFH for same date
        wfh_conflict = WFHRequest.objects.filter(
            employee_id=self.employee.id,
            status__in=[WFHRequest.STATUS_PENDING, WFHRequest.STATUS_APPROVED],
            dates__contains=target_date.isoformat(),
        ).first()
        if wfh_conflict:
            raise ValueError(
                f"WFH request #{wfh_conflict.pk} already exists for {target_date}. "
                "Cancel WFH first or regularize after WFH resolution."
            )

        # Attempt count check (max 3)
        attempts = self.read_repo.count_attempts(self.employee.id, target_date)
        if attempts >= _MAX_REGULARIZATION_ATTEMPTS:
            raise ValueError(
                f"Maximum {_MAX_REGULARIZATION_ATTEMPTS} regularization attempts reached for {target_date}"
            )

        # Only 1 PENDING or APPROVED request allowed at a time
        active = self.read_repo.get_active_for_date(self.employee.id, target_date)
        if active:
            raise ValueError(
                f"A {active.status} regularization request #{active.pk} already exists for {target_date}"
            )

        log = self.log_read_repo.get_by_employee_and_date(self.employee.id, target_date)
        req = self.write_repo.create(
            employee=self.employee,
            attendance_log=log,
            date=target_date,
            requested_check_in=requested_check_in,
            requested_check_out=requested_check_out,
            reason=reason,
            applied_by=applied_by,
            attempt_number=attempts + 1,
        )
        logger.info(
            "Regularization request created id=%s employee_id=%s date=%s attempt=%s",
            req.pk, self.employee.employee_id, target_date, req.attempt_number,
        )
        return req

    @transaction.atomic
    def approve(self, req: RegularizationRequest, approver) -> RegularizationRequest:
        self._assert_can_review(req, approver)
        if req.status != RegularizationRequest.STATUS_PENDING:
            raise ValueError(f"Cannot approve request with status {req.status}")

        # Update or create AttendanceLog
        log = self.log_read_repo.get_by_employee_and_date(req.employee_id, req.date)
        now_date = req.date
        check_in_dt = None
        check_out_dt = None

        if req.requested_check_in:
            check_in_dt = datetime.combine(now_date, req.requested_check_in).replace(tzinfo=timezone.utc)
        if req.requested_check_out:
            check_out_dt = datetime.combine(now_date, req.requested_check_out).replace(tzinfo=timezone.utc)

        if log:
            update_kwargs = {"status": AttendanceLog.STATUS_REGULARIZED, "regularization_request": req}
            if check_in_dt:
                update_kwargs["check_in"] = check_in_dt
            if check_out_dt:
                update_kwargs["check_out"] = check_out_dt
            self.log_write_repo.update(log, **update_kwargs)
        else:
            AttendanceLog.objects.create(
                employee_id=req.employee_id,
                date=req.date,
                check_in=check_in_dt,
                check_out=check_out_dt,
                status=AttendanceLog.STATUS_REGULARIZED,
                regularization_request=req,
            )

        # Reverse any ACTIVE penalty for this date (if payroll not locked)
        penalty_reversed = self._reverse_penalties_for_date(req, approver)

        req = self.write_repo.update(
            req,
            status=RegularizationRequest.STATUS_APPROVED,
            reviewed_by=approver,
            penalty_reversed=penalty_reversed,
        )
        logger.info("Regularization approved id=%s approver_id=%s penalty_reversed=%s", req.pk, approver.id, penalty_reversed)
        return req

    @transaction.atomic
    def reject(self, req: RegularizationRequest, approver, rejection_reason: str = "") -> RegularizationRequest:
        self._assert_can_review(req, approver)
        if req.status != RegularizationRequest.STATUS_PENDING:
            raise ValueError(f"Cannot reject request with status {req.status}")

        req = self.write_repo.update(
            req,
            status=RegularizationRequest.STATUS_REJECTED,
            reviewed_by=approver,
            rejection_reason=rejection_reason,
        )
        logger.info("Regularization rejected id=%s approver_id=%s", req.pk, approver.id)
        return req

    @transaction.atomic
    def cancel(self, req: RegularizationRequest, requester) -> RegularizationRequest:
        requester_emp = getattr(requester, "employee", None)
        is_own = requester_emp and requester_emp.id == req.employee_id
        if not is_own:
            raise PermissionError("Only the request owner can cancel regularization")
        if req.status != RegularizationRequest.STATUS_PENDING:
            raise ValueError("Only PENDING requests can be cancelled")

        req = self.write_repo.update(req, status=RegularizationRequest.STATUS_CANCELLED)
        logger.info("Regularization cancelled id=%s by user_id=%s", req.pk, getattr(requester, "id", None))
        return req

    # ── Private ──────────────────────────────────────────────────────────────

    def _assert_can_review(self, req: RegularizationRequest, approver) -> None:
        approver_emp = getattr(approver, "employee", None)
        if not approver_emp:
            raise PermissionError("Approver has no employee profile")
        if approver_emp.role in ("hr", "admin"):
            return
        if req.employee.manager_id != approver_emp.id:
            raise PermissionError("Not the direct manager of this employee")

    def _reverse_penalties_for_date(self, req: RegularizationRequest, approver) -> bool:
        """Reverse ACTIVE non-locked penalties for the anomaly date. Returns True if any reversed."""
        from apps.leaves.models import LeaveBalance

        penalties = AttendancePenalty.objects.filter(
            employee_id=req.employee_id,
            date=req.date,
            status=AttendancePenalty.STATUS_ACTIVE,
            payroll_locked=False,
        )
        if not penalties.exists():
            return False

        balance = LeaveBalance.objects.select_for_update().filter(employee_id=req.employee_id).first()
        now = datetime.now(tz=timezone.utc)
        for penalty in penalties:
            if balance and penalty.penalty_type == "PL":
                balance.credit("PL", float(penalty.days_deducted))
            # LOP has no balance to restore — but mark reversed for payroll awareness
            penalty.status = AttendancePenalty.STATUS_REVERSED
            penalty.reversed_by = approver
            penalty.reversed_at = now
            penalty.reversal_reason = f"Regularization #{req.pk} approved"
            penalty.regularization_request = req
            penalty.save(update_fields=["status", "reversed_by", "reversed_at", "reversal_reason", "regularization_request"])

        logger.info(
            "Penalties reversed for employee_id=%s date=%s count=%s",
            req.employee_id, req.date, penalties.count(),
        )
        return True


class WFHService:
    def __init__(
        self,
        employee,
        read_repo: WFHReadRepository | None = None,
        write_repo: WFHWriteRepository | None = None,
        log_read_repo: AttendanceLogReadRepository | None = None,
        log_write_repo: AttendanceLogWriteRepository | None = None,
        policy_service: AttendancePolicyService | None = None,
    ):
        self.employee = employee
        self.read_repo = read_repo or WFHReadRepository()
        self.write_repo = write_repo or WFHWriteRepository()
        self.log_read_repo = log_read_repo or AttendanceLogReadRepository()
        self.log_write_repo = log_write_repo or AttendanceLogWriteRepository()
        self.policy_service = policy_service or AttendancePolicyService()

    @transaction.atomic
    def apply(self, dates: List[str], reason: str = "", applied_by=None) -> WFHRequest:
        """
        dates: list of ISO date strings (can be non-consecutive).
        Also accepts from_date/to_date expansion by callers before calling this.
        """
        if not dates:
            raise ValueError("At least one date required for WFH request")

        policy = self.policy_service.get_active_or_default()
        min_lead = policy["wfh_min_lead_days"]
        today = date.today()
        earliest_allowed = (today + timedelta(days=min_lead)).isoformat()

        invalid_past = [d for d in dates if d < earliest_allowed]
        if invalid_past:
            raise ValueError(
                f"WFH must be applied at least {min_lead} day(s) in advance. "
                f"Dates too soon: {invalid_past}"
            )

        # Dedup and sort
        dates = sorted(set(dates))

        # Check weekend dates
        weekend_dates = [d for d in dates if date.fromisoformat(d).weekday() >= 5]
        if weekend_dates:
            raise ValueError(f"WFH cannot be applied for weekends: {weekend_dates}")

        # Block if regularization already exists for any of these dates
        reg_conflict = RegularizationRequest.objects.filter(
            employee_id=self.employee.id,
            date__in=[date.fromisoformat(d) for d in dates],
            status__in=[RegularizationRequest.STATUS_PENDING, RegularizationRequest.STATUS_APPROVED],
        ).first()
        if reg_conflict:
            raise ValueError(
                f"Regularization request #{reg_conflict.pk} exists for {reg_conflict.date}. "
                "Cannot apply WFH while regularization is active for same date."
            )

        # Check existing WFH for overlapping dates
        overlap_dates = []
        for d_str in dates:
            existing = self.read_repo.get_pending_or_approved_for_date(self.employee.id, d_str)
            if existing:
                overlap_dates.append(d_str)
        if overlap_dates:
            raise ValueError(f"WFH request already exists for dates: {overlap_dates}")

        req = self.write_repo.create(
            employee=self.employee,
            dates=dates,
            reason=reason,
            applied_by=applied_by,
        )

        # Mark AttendanceLogs as WFH_PENDING (auto-create if not exist)
        for d_str in dates:
            d = date.fromisoformat(d_str)
            log = self.log_read_repo.get_by_employee_and_date(self.employee.id, d)
            if log:
                if log.status == AttendanceLog.STATUS_ABSENT:
                    self.log_write_repo.update(log, status=AttendanceLog.STATUS_WFH_PENDING)
            else:
                AttendanceLog.objects.get_or_create(
                    employee_id=self.employee.id,
                    date=d,
                    defaults={"status": AttendanceLog.STATUS_WFH_PENDING},
                )

        logger.info(
            "WFH request created id=%s employee_id=%s dates_count=%s",
            req.pk, self.employee.employee_id, len(dates),
        )
        return req

    @transaction.atomic
    def approve(self, req: WFHRequest, approver) -> WFHRequest:
        self._assert_can_review(req, approver)
        if req.status != WFHRequest.STATUS_PENDING:
            raise ValueError(f"Cannot approve WFH with status {req.status}")

        req = self.write_repo.update(
            req,
            status=WFHRequest.STATUS_APPROVED,
            reviewed_by=approver,
        )

        # Auto-create/update AttendanceLogs to WFH
        for d_str in req.dates:
            d = date.fromisoformat(d_str)
            log = self.log_read_repo.get_by_employee_and_date(req.employee_id, d)
            if log:
                self.log_write_repo.update(log, status=AttendanceLog.STATUS_WFH)
            else:
                AttendanceLog.objects.get_or_create(
                    employee_id=req.employee_id,
                    date=d,
                    defaults={"status": AttendanceLog.STATUS_WFH},
                )

        logger.info("WFH approved id=%s approver_id=%s dates=%s", req.pk, approver.id, req.dates)
        return req

    @transaction.atomic
    def reject(self, req: WFHRequest, approver, rejection_reason: str = "") -> WFHRequest:
        self._assert_can_review(req, approver)
        if req.status != WFHRequest.STATUS_PENDING:
            raise ValueError(f"Cannot reject WFH with status {req.status}")

        # Revert WFH_PENDING logs back to ABSENT
        for d_str in req.dates:
            d = date.fromisoformat(d_str)
            log = self.log_read_repo.get_by_employee_and_date(req.employee_id, d)
            if log and log.status == AttendanceLog.STATUS_WFH_PENDING:
                self.log_write_repo.update(log, status=AttendanceLog.STATUS_ABSENT)

        req = self.write_repo.update(
            req,
            status=WFHRequest.STATUS_REJECTED,
            reviewed_by=approver,
            rejection_reason=rejection_reason,
        )
        logger.info("WFH rejected id=%s approver_id=%s", req.pk, approver.id)
        return req

    @transaction.atomic
    def cancel(self, req: WFHRequest, requester) -> WFHRequest:
        requester_emp = getattr(requester, "employee", None)
        is_own = requester_emp and requester_emp.id == req.employee_id
        if not is_own:
            raise PermissionError("Only the request owner can cancel WFH")
        if req.status not in (WFHRequest.STATUS_PENDING,):
            raise ValueError("Only PENDING WFH requests can be cancelled")

        # Revert WFH_PENDING logs
        for d_str in req.dates:
            d = date.fromisoformat(d_str)
            log = self.log_read_repo.get_by_employee_and_date(req.employee_id, d)
            if log and log.status == AttendanceLog.STATUS_WFH_PENDING:
                self.log_write_repo.update(log, status=AttendanceLog.STATUS_ABSENT)

        req = self.write_repo.update(req, status=WFHRequest.STATUS_CANCELLED)
        logger.info("WFH cancelled id=%s by user_id=%s", req.pk, getattr(requester, "id", None))
        return req

    # ── Private ──────────────────────────────────────────────────────────────

    def _assert_can_review(self, req: WFHRequest, approver) -> None:
        approver_emp = getattr(approver, "employee", None)
        if not approver_emp:
            raise PermissionError("Approver has no employee profile")
        if approver_emp.role in ("hr", "admin"):
            return
        if req.employee.manager_id != approver_emp.id:
            raise PermissionError("Not the direct manager of this employee")


class AttendancePenaltyService:
    def __init__(
        self,
        read_repo: AttendancePenaltyReadRepository | None = None,
        write_repo: AttendancePenaltyWriteRepository | None = None,
        policy_service: AttendancePolicyService | None = None,
    ):
        self.read_repo = read_repo or AttendancePenaltyReadRepository()
        self.write_repo = write_repo or AttendancePenaltyWriteRepository()
        self.policy_service = policy_service or AttendancePolicyService()

    @transaction.atomic
    def apply_penalty(self, employee, anomaly_date: date, regularization_request=None) -> List[AttendancePenalty]:
        """
        Deduct PL/LOP per active policy. Idempotent — skips if ACTIVE penalty already exists.
        Returns list of created AttendancePenalty rows.
        """
        if self.read_repo.has_active_penalty(employee.id, anomaly_date):
            logger.info("Penalty already exists employee_id=%s date=%s — skip", employee.employee_id, anomaly_date)
            return []

        policy = self.policy_service.get_active_or_default()
        strategy = PenaltyStrategyFactory.get(policy["penalty_order"])

        from apps.leaves.models import LeaveBalance
        balance = LeaveBalance.objects.select_for_update().filter(employee_id=employee.id).first()
        pl_available = Decimal(str(balance.privilege_remaining)) if balance else Decimal("0")

        slices = strategy.calculate(Decimal("1.0"), pl_available)
        today = date.today()
        payroll_locked = anomaly_date.month != today.month  # previous month = locked

        created = []
        for s in slices:
            if s.days <= 0:
                continue
            # Deduct from balance
            if balance and s.leave_type == "PL":
                balance.deduct("PL", float(s.days))

            penalty = self.write_repo.create(
                employee=employee,
                date=anomaly_date,
                penalty_type=s.leave_type,
                days_deducted=s.days,
                status=AttendancePenalty.STATUS_ACTIVE,
                payroll_locked=payroll_locked,
                regularization_request=regularization_request,
            )
            created.append(penalty)
            logger.info(
                "Penalty applied employee_id=%s date=%s type=%s days=%s",
                employee.employee_id, anomaly_date, s.leave_type, s.days,
            )
        return created

    @transaction.atomic
    def reverse(self, penalty: AttendancePenalty, reversed_by, reason: str = "") -> AttendancePenalty:
        """HR or manager manually reverses a penalty."""
        approver_emp = getattr(reversed_by, "employee", None)
        if not approver_emp:
            raise PermissionError("Reverser has no employee profile")
        if approver_emp.role not in ("hr", "admin") and penalty.employee.manager_id != approver_emp.id:
            raise PermissionError("Not authorized to reverse this penalty")

        if penalty.status != AttendancePenalty.STATUS_ACTIVE:
            raise ValueError(f"Penalty is already {penalty.status}")

        if penalty.penalty_type == "PL":
            from apps.leaves.models import LeaveBalance
            balance = LeaveBalance.objects.select_for_update().filter(employee_id=penalty.employee_id).first()
            if balance:
                balance.credit("PL", float(penalty.days_deducted))

        now = datetime.now(tz=timezone.utc)
        penalty = self.write_repo.update(
            penalty,
            status=AttendancePenalty.STATUS_REVERSED,
            reversed_by=reversed_by,
            reversed_at=now,
            reversal_reason=reason,
        )
        logger.info("Penalty reversed id=%s by user_id=%s", penalty.pk, reversed_by.id)
        return penalty

    @transaction.atomic
    def waive(self, penalty: AttendancePenalty, waived_by, reason: str = "") -> AttendancePenalty:
        """HR waives penalty — no balance restoration (used for LOP / HR override)."""
        approver_emp = getattr(waived_by, "employee", None)
        if not approver_emp or approver_emp.role not in ("hr", "admin"):
            raise PermissionError("Only HR/Admin can waive penalties")

        if penalty.status != AttendancePenalty.STATUS_ACTIVE:
            raise ValueError(f"Penalty is already {penalty.status}")

        now = datetime.now(tz=timezone.utc)
        penalty = self.write_repo.update(
            penalty,
            status=AttendancePenalty.STATUS_WAIVED,
            reversed_by=waived_by,
            reversed_at=now,
            reversal_reason=reason,
        )
        logger.info("Penalty waived id=%s by user_id=%s", penalty.pk, waived_by.id)
        return penalty
