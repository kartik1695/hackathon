import logging

from .base import BaseLLMProvider, LLMMessage, LLMResponse

logger = logging.getLogger("hrms")


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, model: str = "claude-sonnet-4-6", api_key: str | None = None):
        try:
            from langchain_anthropic import ChatAnthropic
        except ImportError as exc:
            logger.exception("langchain-anthropic not installed")
            raise exc

        self._model = model
        self._client = ChatAnthropic(model=model, api_key=api_key)

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
            provider="anthropic",
            tokens_used=tokens_used,
        )

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def model_name(self) -> str:
        return self._model
