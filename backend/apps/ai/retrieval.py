"""
ChatEmbedder — single responsibility: produce embedding vectors for chat text.

Separated from ContextService so that:
- ContextService never knows *how* embeddings are produced (DIP)
- The embedding strategy can be swapped without touching ContextService
- Tests can inject a fake embedder that returns a fixed vector

Fallback chain:
    1. EmbeddingProviderFactory (configured provider — OpenAI by default)
    2. RAG fallback embedder
    3. Zero vector (1536-dim) — last resort so the system never hard-fails
"""
from __future__ import annotations

import logging

logger = logging.getLogger("hrms")

_VECTOR_DIM = 1536


class ChatEmbedder:
    """Produces embedding vectors for chat messages and queries."""

    def embed(self, text: str) -> list[float]:
        """
        Return a 1536-dim embedding for `text`.
        Never raises — returns a zero vector on total failure.
        """
        text = (text or "").strip()

        vector = self._try_embedding_factory(text)
        if vector:
            return vector

        vector = self._try_rag_fallback(text)
        if vector:
            return vector

        logger.warning("All embedding providers failed — returning zero vector")
        return [0.0] * _VECTOR_DIM

    # ── private ──────────────────────────────────────────────────────────────

    @staticmethod
    def _try_embedding_factory(text: str) -> list[float] | None:
        try:
            from core.llm.embedding_factory import EmbeddingProviderFactory
            vec = EmbeddingProviderFactory.get_provider().embed(text)
            if vec and len(vec) == _VECTOR_DIM:
                return vec
        except Exception:
            pass
        return None

    @staticmethod
    def _try_rag_fallback(text: str) -> list[float] | None:
        try:
            from rag.retrieval import _fallback_embed
            return _fallback_embed(text)
        except Exception:
            pass
        return None
