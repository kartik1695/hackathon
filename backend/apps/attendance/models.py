from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class AttendanceLog(models.Model):
    STATUS_PRESENT = "PRESENT"
    STATUS_ABSENT = "ABSENT"
    STATUS_WFH = "WFH"
    STATUS_REGULARIZED = "REGULARIZED"
    STATUS_ON_LEAVE = "ON_LEAVE"
    STATUS_WFH_PENDING = "WFH_PENDING"  # WFH applied but not yet approved

    STATUS_CHOICES = (
        (STATUS_PRESENT, "Present"),
        (STATUS_ABSENT, "Absent"),
        (STATUS_WFH, "Work From Home"),
        (STATUS_REGULARIZED, "Regularized"),
        (STATUS_ON_LEAVE, "On Leave"),
        (STATUS_WFH_PENDING, "WFH Pending Approval"),
    )

    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="attendance_logs")
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    check_in_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_accuracy_m = models.IntegerField(null=True, blank=True)
    check_in_distance_m = models.IntegerField(null=True, blank=True)
    check_in_geofence_ok = models.BooleanField(null=True, blank=True)
    check_out_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_accuracy_m = models.IntegerField(null=True, blank=True)
    check_out_distance_m = models.IntegerField(null=True, blank=True)
    check_out_geofence_ok = models.BooleanField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PRESENT)
    # Set when regularization approved — links back for audit
    regularization_request = models.ForeignKey(
        "RegularizationRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = (("employee", "date"),)

    def __str__(self) -> str:
        return f"{self.employee.employee_id} {self.date} {self.status}"

    @property
    def needs_regularization(self) -> bool:
        """True if log is missing check_in or check_out (and not on leave/WFH)."""
        if self.status in (self.STATUS_ON_LEAVE, self.STATUS_WFH, self.STATUS_REGULARIZED):
            return False
        return self.check_in is None or self.check_out is None


class AttendanceAnomaly(models.Model):
    TYPE_LATE = "LATE"
    TYPE_MISSING = "MISSING"
    TYPE_OTHER = "OTHER"

    TYPE_CHOICES = (
        (TYPE_LATE, "Late"),
        (TYPE_MISSING, "Missing"),
        (TYPE_OTHER, "Other"),
    )

    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="attendance_anomalies")
    date = models.DateField()
    anomaly_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OTHER)
    description = models.TextField(blank=True, default="")
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.employee.employee_id} {self.date} {self.anomaly_type}"


class AttendancePolicy(models.Model):
    """
    Versioned attendance rules. HR creates a new version; old one is deactivated.
    Rules engine always reads is_active=True record.
    """
    PENALTY_ORDER_PL_THEN_LOP = ["PL", "LOP"]

    version = models.PositiveIntegerField(unique=True)
    regularization_window_working_days = models.PositiveIntegerField(
        default=3,
        help_text="Working days employee has to regularize before penalty is applied",
    )
    wfh_min_lead_days = models.PositiveIntegerField(
        default=1,
        help_text="Minimum calendar days in advance WFH must be applied",
    )
    penalty_order = models.JSONField(
        default=list,
        help_text='Ordered list of leave types to deduct on penalty. E.g. ["PL", "LOP"]',
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version"]

    def __str__(self) -> str:
        return f"AttendancePolicy v{self.version} active={self.is_active}"


class RegularizationRequest(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"
    STATUS_CANCELLED = "CANCELLED"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    employee = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="regularization_requests"
    )
    attendance_log = models.ForeignKey(
        AttendanceLog,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="regularization_requests",
    )
    date = models.DateField()
    requested_check_in = models.TimeField(
        null=True, blank=True, help_text="New check-in time (optional)"
    )
    requested_check_out = models.TimeField(
        help_text="New check-out time (required)"
    )
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    applied_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="regularizations_applied",
        help_text="Employee or manager who submitted",
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="regularizations_reviewed",
    )
    rejection_reason = models.TextField(blank=True, default="")
    attempt_number = models.PositiveSmallIntegerField(default=1, help_text="Max 3 attempts per date")
    penalty_reversed = models.BooleanField(default=False, help_text="True if a penalty was restored on approval")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        # Each attempt is a unique row; uniqueness enforced in service
        indexes = [models.Index(fields=["employee", "date", "status"])]

    def __str__(self) -> str:
        return f"Regularization #{self.pk} {self.employee.employee_id} {self.date} {self.status}"


class WFHRequest(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"
    STATUS_CANCELLED = "CANCELLED"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    employee = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="wfh_requests"
    )
    # Stored as sorted list of ISO date strings: ["2026-04-21", "2026-04-23"]
    # Supports both ranges (expanded to individual dates) and non-consecutive
    dates = models.JSONField(help_text="List of ISO date strings for WFH")
    reason = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    applied_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wfh_applied",
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wfh_reviewed",
    )
    rejection_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        n = len(self.dates or [])
        return f"WFHRequest #{self.pk} {self.employee.employee_id} dates={n} {self.status}"


class AttendancePenalty(models.Model):
    """Immutable audit ledger. One row per penalty slice (PL or LOP) per date."""

    TYPE_PL = "PL"
    TYPE_LOP = "LOP"
    TYPE_CHOICES = (
        (TYPE_PL, "Privilege Leave"),
        (TYPE_LOP, "Loss of Pay"),
    )

    STATUS_ACTIVE = "ACTIVE"
    STATUS_REVERSED = "REVERSED"
    STATUS_WAIVED = "WAIVED"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_REVERSED, "Reversed"),
        (STATUS_WAIVED, "Waived"),
    )

    employee = models.ForeignKey(
        "employees.Employee", on_delete=models.CASCADE, related_name="attendance_penalties"
    )
    date = models.DateField(help_text="The anomaly date that triggered this penalty")
    penalty_type = models.CharField(max_length=3, choices=TYPE_CHOICES)
    days_deducted = models.DecimalField(max_digits=4, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    reversed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="penalties_reversed",
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True, default="")
    payroll_locked = models.BooleanField(
        default=False,
        help_text="True if payroll for this month was already processed — reversal must wait for next cycle",
    )
    regularization_request = models.ForeignKey(
        RegularizationRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="penalties",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["employee", "date", "status"])]

    def __str__(self) -> str:
        return f"Penalty #{self.pk} {self.employee.employee_id} {self.date} {self.penalty_type} {self.days_deducted}d {self.status}"
