import logging
import math
import re
from hashlib import sha256

logger = logging.getLogger("hrms")

def retrieve(intent: str, query: str, k: int = 3) -> list[str]:
    query = (query or "").strip()
    if not query:
        return []

    try:
        from apps.rag.models import RAGDocument
    except ImportError as exc:
        logger.exception("RAGDocument model import failed")
        return _fallback_keyword_search([], query, k, error=str(exc))

    try:
        from core.llm.embedding_factory import EmbeddingProviderFactory
    except ImportError as exc:
        logger.exception("EmbeddingProviderFactory import failed")
        query_embedding = _fallback_embed(query)
    else:
        try:
            provider = EmbeddingProviderFactory.get_provider()
            query_embedding = provider.embed(query)
        except Exception:
            logger.exception("Embedding generation failed; using fallback embedding")
            query_embedding = _fallback_embed(query)

    try:
        from pgvector.django import CosineDistance
    except ImportError:
        CosineDistance = None

    if CosineDistance and _is_vector_field(RAGDocument):
        qs = (
            RAGDocument.objects.annotate(distance=CosineDistance("embedding", query_embedding))
            .order_by("distance")[:k]
            .values_list("content", flat=True)
        )
        docs = list(qs)
        logger.info("RAG retrieved (pgvector) intent=%s docs=%s", intent, len(docs))
        return docs

    corpus = list(RAGDocument.objects.order_by("-created_at").values_list("content", flat=True)[:200])
    return _fallback_keyword_search(corpus, query, k)


def _tokenize(text: str) -> list[str]:
    if not text:
        return []
    parts = re.split(r"[^a-zA-Z0-9]+", text.lower())
    return [p for p in parts if len(p) >= 3]


def _fallback_keyword_search(corpus: list[str], query: str, k: int, error: str | None = None) -> list[str]:
    tokens = _tokenize(query)
    if not corpus:
        if error:
            logger.info("RAG fallback keyword search empty corpus error=%s", error)
        return []

    scored: list[tuple[int, str]] = []
    for doc in corpus:
        doc_l = doc.lower()
        score = sum(1 for t in tokens if t in doc_l)
        if score:
            scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    docs = [doc for _, doc in scored[:k]]
    logger.info("RAG retrieved (fallback) docs=%s", len(docs))
    return docs


def _fallback_embed(text: str, dim: int = 1536) -> list[float]:
    vec = [0.0] * dim
    digest = sha256(text.encode("utf-8")).digest()
    for i, b in enumerate(digest):
        idx = (b + i * 31) % dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _is_vector_field(RAGDocument) -> bool:
    try:
        field = RAGDocument._meta.get_field("embedding")
    except Exception:
        return False
    return field.__class__.__name__ == "VectorField"
