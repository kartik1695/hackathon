import logging
import os

from .base import BaseEmbeddingProvider
from .ollama_embedding_provider import OllamaEmbeddingProvider
from .openai_provider import OpenAIEmbeddingProvider
from .hf_embedding_provider import HuggingFaceEmbeddingProvider

logger = logging.getLogger("hrms")

_REGISTRY: dict[str, type[BaseEmbeddingProvider]] = {
    "ollama": OllamaEmbeddingProvider,
    "openai": OpenAIEmbeddingProvider,
    "huggingface": HuggingFaceEmbeddingProvider,
}


class EmbeddingProviderFactory:
    @staticmethod
    def get_provider(provider_name: str | None = None) -> BaseEmbeddingProvider:
        env_name = os.environ.get("EMBEDDING_PROVIDER")
        if provider_name:
            name = provider_name.lower()
        elif env_name:
            name = env_name.lower()
        else:
            name = "huggingface" if os.environ.get("AZURE_OPENAI_KEY") else "openai" if os.environ.get("OPENAI_API_KEY") else "ollama"

        if name not in _REGISTRY:
            raise ValueError(f"Unknown embedding provider '{name}'. Available: {list(_REGISTRY.keys())}")

        if name == "ollama":
            model = os.environ.get("OLLAMA_EMBED_MODEL") or os.environ.get("EMBEDDING_MODEL") or "nomic-embed-text"
            api_key = os.environ.get("OLLAMA_API_KEY")
            base_url = os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434"
            logger.info("Embedding provider selected provider=%s model=%s", name, model)
            return OllamaEmbeddingProvider(model=model, api_key=api_key, base_url=base_url)

        model = (
            os.environ.get("EMBEDDING_MODEL")
            or os.environ.get("OPENAI_EMBED_MODEL")
            or "text-embedding-3-small"
        )
        api_key = os.environ.get("OPENAI_API_KEY")

        logger.info("Embedding provider selected provider=%s model=%s", name, model)
        cls = _REGISTRY[name]

        if name == "huggingface":
            return cls(model=model)
        return cls(model=model, api_key=api_key)

    @staticmethod
    def register(name: str, cls: type[BaseEmbeddingProvider]) -> None:
        _REGISTRY[name] = cls

