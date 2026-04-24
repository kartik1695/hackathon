from django.db import migrations


def _infer(skill_name: str, description: str) -> str:
    text = f"{skill_name or ''} {description or ''}".lower()
    ai_keys = [
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
        "artificial intelligence",
        "data science",
        " ai ",
        " ml ",
    ]
    se_keys = [
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
    cloud_keys = [
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
    sc_keys = [
        "supply chain",
        "logistics",
        "warehouse",
        "inventory",
        "procurement",
        "demand planning",
        "transport",
        "fulfillment",
    ]
    leader_keys = [
        "leadership",
        "people management",
        "stakeholder",
        "communication",
        "presentation",
        "negotiation",
        "coaching",
    ]
    fin_keys = ["finance", "accounting", "payroll", "p&l", "fp&a", "tax", "audit"]
    sm_keys = ["sales", "marketing", "seo", "content", "campaign", "crm", "lead gen"]

    if any(k in text for k in ai_keys):
        return "AI & Data"
    if any(k in text for k in cloud_keys):
        return "Cloud & DevOps"
    if any(k in text for k in sc_keys):
        return "Supply Chain"
    if any(k in text for k in leader_keys):
        return "Leadership"
    if any(k in text for k in fin_keys):
        return "Finance"
    if any(k in text for k in sm_keys):
        return "Sales & Marketing"
    if any(k in text for k in se_keys):
        return "Software Engineering"
    return "Other"


def backfill(apps, _schema_editor):
    SkillRoadmap = apps.get_model("upskilling", "SkillRoadmap")
    qs = SkillRoadmap.objects.filter(category="").only("id", "skill_name", "description")
    updates = []
    for r in qs.iterator():
        cat = _infer(getattr(r, "skill_name", ""), getattr(r, "description", ""))
        r.category = cat
        updates.append(r)
        if len(updates) >= 500:
            SkillRoadmap.objects.bulk_update(updates, ["category"])
            updates = []
    if updates:
        SkillRoadmap.objects.bulk_update(updates, ["category"])


class Migration(migrations.Migration):
    dependencies = [
        ("upskilling", "0004_skillroadmap_category"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]

