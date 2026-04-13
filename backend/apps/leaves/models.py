from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class LeavePolicy(models.Model):
    TYPE_CL = "CL"
    TYPE_EL = "EL"
    TYPE_SL = "SL"

    TYPE_CHOICES = (
        (TYPE_CL, "Casual Leave"),
        (TYPE_EL, "Earned Leave"),
        (TYPE_SL, "Sick Leave"),
    )

    leave_type = models.CharField(max_length=2, choices=TYPE_CHOICES, unique=True)
    annual_allocation = models.FloatField(default=0)
    accrual_per_month = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["leave_type"]

    def __str__(self) -> str:
        return f"{self.leave_type} policy"


class LeaveBalance(models.Model):
    employee = models.OneToOneField("employees.Employee", on_delete=models.CASCADE, related_name="leave_balance")
    casual_remaining = models.FloatField(default=0)
    earned_remaining = models.FloatField(default=0)
    sick_remaining = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["employee__employee_id"]

    def __str__(self) -> str:
        return f"LeaveBalance {self.employee.employee_id}"


class LeaveRequest(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    )

    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="leave_requests")
    approver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_leaves")

    leave_type = models.CharField(max_length=2, choices=LeavePolicy.TYPE_CHOICES)
    from_date = models.DateField()
    to_date = models.DateField()
    days_count = models.FloatField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)

    spof_flag = models.BooleanField(default=False)
    conflict_flag = models.BooleanField(default=False)
    conflict_context = models.JSONField(default=dict, blank=True)
    ai_context_card = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"LeaveRequest {self.pk} {self.employee.employee_id} {self.leave_type} {self.status}"
