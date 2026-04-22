from django.db import models


class AttendanceLog(models.Model):
    STATUS_PRESENT = "PRESENT"
    STATUS_ABSENT = "ABSENT"
    STATUS_WFH = "WFH"

    STATUS_CHOICES = (
        (STATUS_PRESENT, "Present"),
        (STATUS_ABSENT, "Absent"),
        (STATUS_WFH, "Work From Home"),
    )

    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="attendance_logs")
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PRESENT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = (("employee", "date"),)

    def __str__(self) -> str:
        return f"{self.employee.employee_id} {self.date} {self.status}"


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
