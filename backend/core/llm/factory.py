import logging
import os

from .base import BaseLLMProvider
from .anthropic_provider import AnthropicProvider
from .gemini_provider import GeminiProvider
from .ollama_provider import OllamaProvider
from .openai_provider import OpenAIProvider

logger = logging.getLogger("hrms")

_REGISTRY: dict[str, type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}


class LLMProviderFactory:
    @staticmethod
    def get_provider(provider_name: str | None = None) -> BaseLLMProvider:
        env_name = os.environ.get("LLM_PROVIDER")
        if provider_name:
            name = provider_name.lower()
        elif env_name:
            name = env_name.lower()
        else:
            has_cloud_key = any(
                os.environ.get(k)
                for k in (
                    "OPENAI_API_KEY",
                    "ANTHROPIC_API_KEY",
                    "GEMINI_API_KEY",
                    "GOOGLE_API_KEY",
                )
            )
            name = "openai" if has_cloud_key else "ollama"
        if name not in _REGISTRY:
            raise ValueError(f"Unknown LLM provider '{name}'. Available: {list(_REGISTRY.keys())}")

        if name == "ollama":
            model = os.environ.get("OLLAMA_MODEL") or os.environ.get("LLM_MODEL") or "kimi-k2.5:cloud"
        else:
            model = os.environ.get("LLM_MODEL") or ("gpt-4o" if name == "openai" else "claude-sonnet-4-6")
        api_key = os.environ.get(f"{name.upper()}_API_KEY")
        if name == "gemini" and not api_key:
            api_key = os.environ.get("GOOGLE_API_KEY")

        kwargs: dict[str, str | None] = {"model": model, "api_key": api_key}
        if name == "ollama":
            kwargs["base_url"] = os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434"

        logger.info("LLM provider selected provider=%s model=%s", name, model)
        cls = _REGISTRY[name]
        return cls(**{k: v for k, v in kwargs.items() if v is not None})

    @staticmethod
    def register(name: str, cls: type[BaseLLMProvider]) -> None:
        _REGISTRY[name] = cls
