import logging
import os
from .base import BaseLLMProvider, LLMMessage, LLMResponse

logger = logging.getLogger("hrms")

class AzureOpenAIProvider(BaseLLMProvider):
    def __init__(
        self,
        model: str,
        api_key: str | None = None,
        endpoint: str | None = None,
        api_version: str | None = None,
        deployment: str | None = None,
    ):
        try:
            from langchain_openai import AzureChatOpenAI
        except ImportError as exc:
            logger.exception("langchain-openai not installed")
            raise exc

        azure_endpoint = endpoint or os.environ.get("AZURE_OPENAI_ENDPOINT")
        azure_api_key = api_key or os.environ.get("AZURE_OPENAI_KEY")
        azure_api_version = api_version or os.environ.get("AZURE_OPENAI_API_VERSION")
        azure_deployment = deployment or os.environ.get("AZURE_OPENAI_DEPLOYMENT")

        self._model = model
        self._client = AzureChatOpenAI(
            azure_deployment=azure_deployment,
            openai_api_version=azure_api_version,
            azure_endpoint=azure_endpoint,
            api_key=azure_api_key,
            model=model,
        )

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
            provider="azure_openai",
            tokens_used=tokens_used,
        )

    @property
    def provider_name(self) -> str:
        return "azure_openai"

    @property
    def model_name(self) -> str:
        return self._model
