import json
import logging
import os
import urllib.error
import urllib.request

from .base import BaseLLMProvider, LLMMessage, LLMResponse

logger = logging.getLogger("hrms")


class OllamaProvider(BaseLLMProvider):
    def __init__(self, model: str | None = None, api_key: str | None = None, base_url: str | None = None):
        self._base_url = (base_url or os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
        self._model = (
            model
            or os.environ.get("OLLAMA_MODEL")
            or os.environ.get("LLM_MODEL")
            or "gpt-oss:120b-cloud"
        )
        self._api_key = api_key or os.environ.get("OLLAMA_API_KEY") or ""

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    def complete(self, messages: list[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        payload = {
            "model": self._model,
            "stream": False,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "options": {"temperature": float(temperature)},
        }
        data = self._post_json("/api/chat", payload)
        msg = (data.get("message") or {}).get("content") or ""
        tokens = int(data.get("eval_count") or 0)
        return LLMResponse(content=str(msg), model=self._model, provider=self.provider_name, tokens_used=tokens)

    def _post_json(self, path: str, payload: dict) -> dict:
        url = self._base_url + path
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read().decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="ignore") if exc.fp else ""
            raise RuntimeError(f"Ollama HTTP {exc.code}: {raw}") from exc
        except Exception as exc:
            raise RuntimeError(f"Ollama request failed: {exc}") from exc

        try:
            return json.loads(data) if data else {}
        except Exception as exc:
            raise RuntimeError("Ollama returned invalid JSON") from exc
