import logging

from django.db import models

logger = logging.getLogger("hrms")

from pgvector.django import VectorField


class RAGDocument(models.Model):
    title = models.CharField(max_length=200)
    source = models.CharField(max_length=200, default="")
    chunk_index = models.IntegerField(default=0)
    content = models.TextField()
    embedding = VectorField(dimensions=1536)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title", "chunk_index", "-created_at"]
        indexes = [
            models.Index(fields=["title", "chunk_index"]),
        ]

    def __str__(self) -> str:
        return f"RAGDocument {self.title}#{self.chunk_index}"


class PolicyDocument(models.Model):
    name = models.SlugField(max_length=120, unique=True)
    title = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.title


class PolicyVersion(models.Model):
    document = models.ForeignKey(PolicyDocument, on_delete=models.CASCADE, related_name="versions")
    version = models.CharField(max_length=64)
    chunk_strategy = models.CharField(max_length=32, default="simple")
    source_path = models.CharField(max_length=500, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("document", "version"),)
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["document", "version"])]

    def __str__(self) -> str:
        return f"{self.document.name}@{self.version}"


class PolicyChunk(models.Model):
    version = models.ForeignKey(PolicyVersion, on_delete=models.CASCADE, related_name="chunks")
    chunk_index = models.IntegerField()
    content = models.TextField()
    embedding = VectorField(dimensions=1536)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("version", "chunk_index"),)
        ordering = ["version", "chunk_index"]
        indexes = [models.Index(fields=["version", "chunk_index"])]
