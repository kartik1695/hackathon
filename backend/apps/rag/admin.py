from django.contrib import admin

from .models import RAGDocument


@admin.register(RAGDocument)
class RAGDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "source", "chunk_index", "created_at")
    list_filter = ("title", "source")
    search_fields = ("title", "source", "content")

