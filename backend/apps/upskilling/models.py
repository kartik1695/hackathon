from django.db import models


class Skill(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    objects = models.Manager()

    def __str__(self) -> str:
        val: str = str(self.name)
        return val


class EmployeeSkill(models.Model):
    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="skills")
    skill = models.ForeignKey(Skill, on_delete=models.CASCADE)
    level = models.IntegerField(default=1)  # 1-5 or similar
    acquired_at = models.DateTimeField(auto_now_add=True)
    objects = models.Manager()

    class Meta:
        unique_together = ("employee", "skill")

    def __str__(self) -> str:
        user = getattr(self.employee, "user", None)
        name = getattr(user, "name", "")
        return f"{name} - {self.skill.name}"


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
    category = models.CharField(max_length=120, blank=True, default="")
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING_APPROVAL")
    mentors = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = models.Manager()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        user = getattr(self.employee, "user", None)
        name = getattr(user, "name", "")
        return f"Roadmap for {self.skill_name} ({name})"


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
    objects = models.Manager()

    class Meta:
        ordering = ["roadmap", "order"]

    def __str__(self) -> str:
        return f"Step {self.order}: {self.title}"


class DraftRoadmap(models.Model):
    """Holds an AI-generated roadmap draft before the employee submits for manager approval."""
    STATUS_GATHERING = "GATHERING"
    STATUS_READY = "READY"
    STATUS_SUBMITTED = "SUBMITTED"
    STATUS_CHOICES = (
        (STATUS_GATHERING, "Gathering Info"),
        (STATUS_READY, "Draft Ready"),
        (STATUS_SUBMITTED, "Submitted"),
    )

    employee = models.ForeignKey("employees.Employee", on_delete=models.CASCADE, related_name="roadmap_drafts")
    skill_name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_GATHERING)
    mentor_context = models.JSONField(default=dict)   # collected Q&A answers
    draft_description = models.TextField(blank=True, default="")
    draft_steps = models.JSONField(default=list)       # generated step list
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = models.Manager()

    class Meta:
        ordering = ["-updated_at"]
        unique_together = ("employee", "skill_name", "status")

    def __str__(self) -> str:
        user = getattr(self.employee, "user", None)
        name = getattr(user, "name", "")
        return f"Draft: {self.skill_name} ({name}) [{self.status}]"


def infer_roadmap_category(
    skill_name: str, description: str = "", step_titles: list[str] | None = None
) -> str:
    text = " ".join(
        [skill_name or "", description or "", " ".join(step_titles or [])]
    ).lower()

    def has_any(keys: list[str]) -> bool:
        return any(k in text for k in keys)

    if has_any(
        [
            "genai",
            "gen ai",
            "llm",
            "prompt",
            "rag",
            "retrieval augmented",
            "nlp",
            "machine learning",
            "deep learning",
            "transformer",
            "ai ",
            "artificial intelligence",
            "data science",
            "ml ",
        ]
    ):
        return "AI & Data"
    if has_any(
        [
            "python",
            "django",
            "fastapi",
            "flask",
            "react",
            "node",
            "typescript",
            "javascript",
            "java",
            "spring",
            "dotnet",
            ".net",
            "golang",
            "go lang",
            "api",
            "backend",
            "frontend",
            "microservice",
            "system design",
            "dsa",
            "data structures",
            "algorithms",
        ]
    ):
        return "Software Engineering"
    if has_any(
        [
            "aws",
            "azure",
            "gcp",
            "docker",
            "kubernetes",
            "k8s",
            "terraform",
            "devops",
            "ci/cd",
            "jenkins",
            "github actions",
            "observability",
            "prometheus",
            "grafana",
            "sre",
        ]
    ):
        return "Cloud & DevOps"
    if has_any(
        [
            "supply chain",
            "logistics",
            "warehouse",
            "inventory",
            "procurement",
            "demand planning",
            "transport",
            "fulfillment",
        ]
    ):
        return "Supply Chain"
    if has_any(
        [
            "leadership",
            "people management",
            "manager",
            "stakeholder",
            "communication",
            "presentation",
            "negotiation",
            "coaching",
        ]
    ):
        return "Leadership"
    if has_any(["finance", "accounting", "payroll", "p&l", "fp&a", "tax", "audit"]):
        return "Finance"
    if has_any(["sales", "marketing", "seo", "content", "campaign", "crm", "lead gen"]):
        return "Sales & Marketing"
    return "Other"
