from django.db import models


class Goal(models.Model):
    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="goals")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, default="OPEN")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Goal {self.employee.employee_id}: {self.title}"


class ReviewCycle(models.Model):
    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="review_cycles")
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, default="OPEN")
    ai_draft = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period_start", "-created_at"]

    def __str__(self) -> str:
        return f"ReviewCycle {self.employee.employee_id} {self.period_start} - {self.period_end}"
