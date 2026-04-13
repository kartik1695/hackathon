import logging

from .base import BaseEmbeddingProvider, BaseLLMProvider, LLMMessage, LLMResponse

logger = logging.getLogger("hrms")


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, model: str = "gpt-4o", api_key: str | None = None):
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:
            logger.exception("langchain-openai not installed")
            raise exc

        self._model = model
        self._client = ChatOpenAI(model=model, api_key=api_key)

    def complete(self, messages: list[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        lc_messages = [{"role": m.role, "content": m.content} for m in messages]
        self._client.temperature = temperature
        response = self._client.invoke(lc_messages)
        tokens_used = 0
        if hasattr(response, "usage_metadata") and isinstance(response.usage_metadata, dict):
            tokens_used = response.usage_metadata.get("total_tokens", 0)
        return LLMResponse(
            content=response.content,
            model=self._model,
            provider="openai",
            tokens_used=tokens_used,
        )

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self, model: str = "text-embedding-3-small", api_key: str | None = None):
        try:
            from langchain_openai import OpenAIEmbeddings
        except ImportError as exc:
            logger.exception("langchain-openai not installed")
            raise exc

        self._model = model
        self._embedder = OpenAIEmbeddings(model=model, api_key=api_key)

    def embed(self, text: str) -> list[float]:
        vec = self._embedder.embed_query(text)
        return _normalize_to_1536(vec)

    @property
    def provider_name(self) -> str:
        return "openai"

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
