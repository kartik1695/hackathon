from django.db import migrations, models
import django.db.models.deletion
from pgvector.django import VectorField


class Migration(migrations.Migration):
    dependencies = [
        ("rag", "0001_pgvector_extension"),
    ]

    operations = [
        migrations.CreateModel(
            name="PolicyDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.SlugField(max_length=120, unique=True)),
                ("title", models.CharField(max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="RAGDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("source", models.CharField(default="", max_length=200)),
                ("chunk_index", models.IntegerField(default=0)),
                ("content", models.TextField()),
                ("embedding", VectorField(dimensions=1536)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["title", "chunk_index", "-created_at"]},
        ),
        migrations.CreateModel(
            name="PolicyVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.CharField(max_length=64)),
                ("chunk_strategy", models.CharField(default="simple", max_length=32)),
                ("source_path", models.CharField(default="", max_length=500)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "document",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="versions", to="rag.policydocument"),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("document", "version")},
            },
        ),
        migrations.CreateModel(
            name="PolicyChunk",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("chunk_index", models.IntegerField()),
                ("content", models.TextField()),
                ("embedding", VectorField(dimensions=1536)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "version",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chunks", to="rag.policyversion"),
                ),
            ],
            options={
                "ordering": ["version", "chunk_index"],
                "unique_together": {("version", "chunk_index")},
            },
        ),
        migrations.AddIndex(
            model_name="ragdocument",
            index=models.Index(fields=["title", "chunk_index"], name="rag_ragdoc_title_7cf1b5_idx"),
        ),
        migrations.AddIndex(
            model_name="policyversion",
            index=models.Index(fields=["document", "version"], name="rag_policyv_documen_1089c9_idx"),
        ),
        migrations.AddIndex(
            model_name="policychunk",
            index=models.Index(fields=["version", "chunk_index"], name="rag_policyc_version_ee9b77_idx"),
        ),
    ]

