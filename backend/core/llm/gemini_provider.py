import logging

from .base import BaseLLMProvider, LLMMessage, LLMResponse

logger = logging.getLogger("hrms")


class GeminiProvider(BaseLLMProvider):
    def __init__(self, model: str = "gemini-1.5-pro", api_key: str | None = None):
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as exc:
            logger.exception("langchain-google-genai not installed")
            raise exc

        self._model = model
        self._client = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)

    def complete(self, messages: list[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        lc_messages = [{"role": m.role, "content": m.content} for m in messages]
        response = self._client.invoke(lc_messages)
        return LLMResponse(content=response.content, model=self._model, provider="gemini", tokens_used=0)

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model
