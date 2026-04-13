import logging
from datetime import datetime
from pathlib import Path

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")


class PolicyIngestTask(BaseHRMSTask):
    name = "tasks.rag_policy_tasks.policy_ingest"

    def execute(self, document_name: str, document_title: str, chunk_strategy: str, version: str | None, activate: bool = True, file_content: str | None = None, document_path: str | None = None):
        try:
            from apps.rag.models import PolicyChunk, PolicyDocument, PolicyVersion
        except ImportError as exc:
            logger.exception("RAG policy models import failed")
            return {"status": "error", "error": str(exc)}
        try:
            from rag.chunkers import SimpleChunker, MetadataChunker, SchemaChunker, load_text
        except ImportError as exc:
            logger.exception("RAG chunkers import failed")
            return {"status": "error", "error": str(exc)}
        try:
            from core.llm.embedding_factory import EmbeddingProviderFactory
        except ImportError:
            EmbeddingProviderFactory = None

        if not file_content:
            if not document_path:
                return {"status": "error", "error": "file_content or document_path is required"}
            path = Path(document_path).expanduser().resolve()
            if not path.exists():
                return {"status": "error", "error": "document_path not found"}
            text = load_text(path)
            source_path_val = str(path)
        else:
            text = file_content
            source_path_val = document_path or ""

        doc, _ = PolicyDocument.objects.get_or_create(name=document_name, defaults={"title": document_title})
        if doc.title != document_title:
            doc.title = document_title
            doc.save(update_fields=["title"])

        ver = version or datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        pv, created = PolicyVersion.objects.get_or_create(document=doc, version=ver, defaults={"chunk_strategy": chunk_strategy, "source_path": source_path_val, "is_active": activate})
        if not created:
            pv.chunk_strategy = chunk_strategy
            pv.source_path = source_path_val
            pv.is_active = activate
            pv.save(update_fields=["chunk_strategy", "source_path", "is_active"])
        if activate:
            PolicyVersion.objects.filter(document=doc).exclude(pk=pv.pk).update(is_active=False)

        if chunk_strategy == "metadata":
            chunker = MetadataChunker()
        elif chunk_strategy == "schema":
            chunker = SchemaChunker()
        else:
            chunker = SimpleChunker()
        chunks = chunker.chunk(text)

        provider = None
        if EmbeddingProviderFactory:
            try:
                provider = EmbeddingProviderFactory.get_provider()
            except Exception:
                provider = None
        try:
            from rag.retrieval import _fallback_embed
        except Exception:
            _fallback_embed = None

        PolicyChunk.objects.filter(version=pv).delete()
        created_count = 0
        for ch in chunks:
            embedding = None
            if provider:
                try:
                    embedding = provider.embed(ch.content)
                except Exception:
                    embedding = None
            if embedding is not None and len(embedding) != 1536:
                logger.info("Embedding dim mismatch doc=%s version=%s chunk=%s dim=%s", document_name, ver, ch.index, len(embedding))
                embedding = None
            if embedding is None:
                if _fallback_embed:
                    embedding = _fallback_embed(ch.content)
                else:
                    embedding = [0.0] * 1536
            PolicyChunk.objects.create(version=pv, chunk_index=ch.index, content=ch.content, embedding=embedding, metadata=ch.metadata or {})
            created_count += 1
        logger.info("Policy ingest complete name=%s version=%s chunks=%s", document_name, ver, created_count)
        return {"status": "ok", "document": document_name, "version": ver, "chunks": created_count}


policy_ingest = app.register_task(PolicyIngestTask())
