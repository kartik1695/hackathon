import uuid

from django.conf import settings
from django.db import models
from pgvector.django import VectorField


class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_chat_sessions",
    )
    # FK enforces referential integrity — a session always belongs to a real employee.
    # SET_NULL so historical sessions survive if an employee record is deleted.
    employee = models.ForeignKey(
        "employees.Employee",
        on_delete=models.SET_NULL,
        null=True,
        related_name="chat_sessions",
    )
    title = models.CharField(max_length=200, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_active_at"]
        indexes = [
            models.Index(fields=["user", "is_active", "last_active_at"]),
        ]

    def __str__(self) -> str:
        return f"ChatSession {self.id}"


class ChatMessage(models.Model):
    ROLE_USER = "user"
    ROLE_ASSISTANT = "assistant"
    ROLE_SYSTEM = "system"

    ROLE_CHOICES = (
        (ROLE_USER, "User"),
        (ROLE_ASSISTANT, "Assistant"),
        (ROLE_SYSTEM, "System"),
    )

    id = models.BigAutoField(primary_key=True)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    intent = models.CharField(max_length=64, default="", blank=True)
    tool_snapshot = models.JSONField(default=dict, blank=True)
    retrieved_docs = models.JSONField(default=list, blank=True)
    embedding = VectorField(dimensions=1536)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
            models.Index(fields=["session", "role", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"ChatMessage {self.id} {self.role}"


class ChatSummary(models.Model):
    id = models.BigAutoField(primary_key=True)
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="summaries")
    start_message_id = models.BigIntegerField()
    end_message_id = models.BigIntegerField()
    summary = models.TextField()
    embedding = VectorField(dimensions=1536)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
            models.Index(fields=["session", "end_message_id"]),
        ]

    def __str__(self) -> str:
        return f"ChatSummary {self.id}"

