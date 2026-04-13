import json
import math
import os
import urllib.error
import urllib.request

from .base import BaseEmbeddingProvider


class OllamaEmbeddingProvider(BaseEmbeddingProvider):
    def __init__(self, model: str | None = None, api_key: str | None = None, base_url: str | None = None):
        self._base_url = (base_url or os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
        self._model = model or os.environ.get("OLLAMA_EMBED_MODEL") or os.environ.get("EMBEDDING_MODEL") or "nomic-embed-text"
        self._api_key = api_key or os.environ.get("OLLAMA_API_KEY") or ""

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    def embed(self, text: str) -> list[float]:
        text = (text or "").strip()
        if not text:
            return [0.0] * 1536

        payload = {"model": self._model, "input": text}
        vec = None
        try:
            data = self._post_json("/api/embed", payload)
            embeddings = data.get("embeddings")
            if isinstance(embeddings, list) and embeddings:
                vec = embeddings[0]
        except Exception:
            vec = None

        if vec is None:
            try:
                data = self._post_json("/api/embeddings", {"model": self._model, "prompt": text})
                vec = data.get("embedding") or []
            except Exception:
                vec = None

        if not isinstance(vec, list) or not vec:
            return _fallback_embed_1536(text)

        try:
            raw = [float(x) for x in vec]
        except Exception:
            return _fallback_embed_1536(text)

        return _normalize_to_1536(raw)

    def _post_json(self, path: str, payload: dict) -> dict:
        url = self._base_url + path
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
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


def _normalize_to_1536(vec: list[float]) -> list[float]:
    if len(vec) == 1536:
        return _l2_normalize(vec)
    out = [0.0] * 1536
    for i, v in enumerate(vec):
        out[i % 1536] += float(v)
    return _l2_normalize(out)


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _fallback_embed_1536(text: str) -> list[float]:
    try:
        from rag.retrieval import _fallback_embed
    except Exception:
        return [0.0] * 1536
    return _fallback_embed(text)
