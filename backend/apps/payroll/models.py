from django.db import models


class PayrollSlip(models.Model):
    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="payroll_slips")
    period_year = models.IntegerField()
    period_month = models.IntegerField()
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_year", "-period_month", "-created_at"]
        unique_together = (("employee", "period_year", "period_month"),)

    def __str__(self) -> str:
        return f"Payroll {self.employee.employee_id} {self.period_year}-{self.period_month}"
