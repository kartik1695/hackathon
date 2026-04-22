import logging
from .base import BaseEmbeddingProvider

logger = logging.getLogger("hrms")

class HuggingFaceEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self, model: str = "BAAI/bge-small-en-v1.5"):
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:
            logger.exception("fastembed not installed")
            raise exc

        self._model = model
        self._embedder = TextEmbedding(model_name=model)

    def embed(self, text: str) -> list[float]:
        # fastembed returns a generator of embeddings
        embeddings = list(self._embedder.embed([text]))
        vec = embeddings[0].tolist()
        return _normalize_to_1536(vec)

    @property
    def provider_name(self) -> str:
        return "huggingface"

    @property
    def model_name(self) -> str:
        return self._model

def _normalize_to_1536(vec: list[float]) -> list[float]:
    if not isinstance(vec, list) or not vec:
        return [0.0] * 1536
    if len(vec) == 1536:
        return [float(x) for x in vec]
    out = [0.0] * 1536
    for i, v in enumerate(vec):
        out[i % 1536] += float(v)
    return out
