from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("upskilling", "0003_remove_draftroadmap_unique_draft_per_employee_skill_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="skillroadmap",
            name="category",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]

