import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.migrations import swappable_dependency
from pgvector.django import VectorField


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("rag", "0001_pgvector_extension"),
        swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ChatSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("employee_id", models.IntegerField()),
                ("title", models.CharField(default="", max_length=200)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_active_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_chat_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ChatSummary",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("start_message_id", models.BigIntegerField()),
                ("end_message_id", models.BigIntegerField()),
                ("summary", models.TextField()),
                ("embedding", VectorField(dimensions=1536)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="summaries", to="ai.chatsession"
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ChatMessage",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("role", models.CharField(choices=[("user", "User"), ("assistant", "Assistant"), ("system", "System")], max_length=20)),
                ("content", models.TextField()),
                ("intent", models.CharField(blank=True, default="", max_length=64)),
                ("tool_snapshot", models.JSONField(blank=True, default=dict)),
                ("retrieved_docs", models.JSONField(blank=True, default=list)),
                ("embedding", VectorField(dimensions=1536)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="ai.chatsession"
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="chatsession",
            index=models.Index(fields=["user", "is_active", "last_active_at"], name="ai_chatses_user_id_8b3e5c_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["session", "created_at"], name="ai_chatmes_sessio_9a4249_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["session", "role", "created_at"], name="ai_chatmes_sessio_34d9ed_idx"),
        ),
        migrations.AddIndex(
            model_name="chatsummary",
            index=models.Index(fields=["session", "created_at"], name="ai_chatsum_sessio_0b9605_idx"),
        ),
        migrations.AddIndex(
            model_name="chatsummary",
            index=models.Index(fields=["session", "end_message_id"], name="ai_chatsum_sessio_3c49ff_idx"),
        ),
    ]
