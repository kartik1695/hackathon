from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("upskilling", "0001_initial"),
        ("employees", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="DraftRoadmap",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("skill_name", models.CharField(max_length=200)),
                ("status", models.CharField(
                    choices=[("GATHERING", "Gathering Info"), ("READY", "Draft Ready"), ("SUBMITTED", "Submitted")],
                    default="GATHERING",
                    max_length=20,
                )),
                ("mentor_context", models.JSONField(default=dict)),
                ("draft_description", models.TextField(blank=True, default="")),
                ("draft_steps", models.JSONField(default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="roadmap_drafts",
                    to="employees.employee",
                )),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.AddConstraint(
            model_name="draftroadmap",
            constraint=models.UniqueConstraint(
                fields=["employee", "skill_name", "status"],
                name="unique_draft_per_employee_skill_status",
            ),
        ),
    ]
