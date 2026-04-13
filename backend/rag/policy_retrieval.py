import logging
from typing import Iterable

logger = logging.getLogger("hrms")


def retrieve(query: str, document_name: str | None = None, k: int = 3) -> list[str]:
    try:
        from apps.rag.models import PolicyChunk, PolicyDocument, PolicyVersion
    except ImportError as exc:
        logger.exception("RAG policy models import failed")
        return []
    try:
        from core.llm.embedding_factory import EmbeddingProviderFactory
    except ImportError:
        EmbeddingProviderFactory = None
    try:
        from pgvector.django import CosineDistance
    except Exception:
        CosineDistance = None

    pv_qs = PolicyVersion.objects.filter(is_active=True)
    if document_name:
        pv_qs = pv_qs.filter(document__name=document_name)
    pv_ids = list(pv_qs.values_list("id", flat=True)[:50])
    if not pv_ids:
        return []

    if CosineDistance and EmbeddingProviderFactory:
        try:
            provider = EmbeddingProviderFactory.get_provider()
            embedding = provider.embed(query or "")
            qs = (
                PolicyChunk.objects.filter(version_id__in=pv_ids)
                .annotate(distance=CosineDistance("embedding", embedding))
                .order_by("distance")
                .values_list("content", flat=True)[:k]
            )
            docs = list(qs)
            logger.info("Policy RAG retrieved (pgvector) docs=%s", len(docs))
            return docs
        except Exception:
            pass

    qs = PolicyChunk.objects.filter(version_id__in=pv_ids).order_by("-created_at").values_list("content", flat=True)[:200]
    corpus = list(qs)
    from .retrieval import _fallback_keyword_search

    return _fallback_keyword_search(corpus, query or "", k)
