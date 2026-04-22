from django.db import models


class Skill(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class EmployeeSkill(models.Model):
    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="skills")
    skill = models.ForeignKey(Skill, on_delete=models.CASCADE)
    level = models.IntegerField(default=1)  # 1-5 or similar
    acquired_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("employee", "skill")

    def __str__(self):
        return f"{self.employee.user.name} - {self.skill.name}"


class SkillRoadmap(models.Model):
    STATUS_CHOICES = (
        ("PENDING_APPROVAL", "Pending Manager Approval"),
        ("IN_PROGRESS", "In Progress"),
        ("PENDING_REVIEW", "Pending Final Review"),
        ("COMPLETED", "Completed"),
        ("ABANDONED", "Abandoned"),
        ("REJECTED", "Rejected by Manager"),
    )

    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="roadmaps")
    skill_name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING_APPROVAL")
    mentors = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Roadmap for {self.skill_name} ({self.employee.user.name})"


class RoadmapStep(models.Model):
    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("IN_PROGRESS", "In Progress"),
        ("SUBMITTED", "Submitted for Review"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
    )

    roadmap = models.ForeignKey(SkillRoadmap, on_delete=models.CASCADE, related_name="steps")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Evidence / Submission Tracking
    submission_notes = models.TextField(blank=True, default="")
    submission_url = models.URLField(max_length=500, null=True, blank=True)
    
    # Review / Audit
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey("employees.Employee", on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_steps")
    feedback = models.TextField(blank=True, default="")

    resource_url = models.URLField(max_length=500, null=True, blank=True)
    resource_type = models.CharField(max_length=20, null=True, blank=True)  # 'video', 'blog', etc.
    phase = models.CharField(max_length=100, null=True, blank=True)
    difficulty = models.CharField(max_length=20, null=True, blank=True)
    duration = models.PositiveIntegerField(null=True, blank=True) # in hours

    class Meta:
        ordering = ["roadmap", "order"]

    def __str__(self):
        return f"Step {self.order}: {self.title}"
