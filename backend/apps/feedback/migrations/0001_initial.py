from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="AnonymousFeedback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("raw_text", models.TextField(blank=True, default="")),
                ("sentiment_score", models.FloatField(blank=True, null=True)),
                ("sentiment_label", models.CharField(
                    blank=True,
                    choices=[("positive", "Positive"), ("neutral", "Neutral"), ("negative", "Negative")],
                    max_length=20,
                    null=True,
                )),
                ("emotions", models.JSONField(default=dict)),
                ("topics", models.JSONField(default=list)),
                ("risk_flags", models.JSONField(default=dict)),
                ("confidence", models.FloatField(blank=True, null=True)),
                ("is_processed", models.BooleanField(db_index=True, default=False)),
            ],
            options={"ordering": ["-submitted_at"]},
        ),
        migrations.CreateModel(
            name="OrgInsightSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                ("feedback_count", models.IntegerField(default=0)),
                ("avg_sentiment", models.FloatField(blank=True, null=True)),
                ("ai_summary", models.TextField(blank=True, default="")),
                ("recommendations", models.JSONField(default=list)),
                ("topic_summary", models.JSONField(default=dict)),
                ("risk_summary", models.JSONField(default=dict)),
                ("generated_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["-period_end"]},
        ),
    ]
