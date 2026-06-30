"""Ollama — local, via Ollama's native API. Self-contained.

We use Ollama's native `/api/chat` (not the OpenAI-compatible `/v1`) on purpose:
it lets us set `num_ctx` — otherwise a model with a huge default context (e.g.
Qwen3.5's 256K) allocates an enormous KV cache and stalls on a ~16GB machine —
and `think: false` to skip thinking-model reasoning (faster, cleaner output).

The user's `llm_base_url` may end in `/v1` (shared with the OpenAI shape); we
strip it to reach the native API root.
"""

from __future__ import annotations

import json
import urllib.request
from collections.abc import Iterator

from core.llm.base import LLMProvider, Message

NUM_CTX = 8192  # context window cap — keeps the KV cache small enough for ~16GB machines


class OllamaProvider(LLMProvider):
    provider_id = "ollama"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]
        base = settings["llm_base_url"].rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3].rstrip("/")
        self._chat_url = f"{base}/api/chat"

    @property
    def model(self) -> str:
        return self._model

    def _open(self, messages: list[Message], *, stream: bool, temperature: float, max_tokens: int | None):
        options: dict[str, object] = {"num_ctx": NUM_CTX, "temperature": temperature}
        if max_tokens:
            options["num_predict"] = max_tokens
        body = json.dumps(
            {"model": self._model, "messages": messages, "stream": stream, "think": False, "options": options}
        ).encode()
        request = urllib.request.Request(
            self._chat_url, data=body, headers={"Content-Type": "application/json"}
        )
        return urllib.request.urlopen(request)

    def complete(self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int | None = None) -> str:
        with self._open(messages, stream=False, temperature=temperature, max_tokens=max_tokens) as resp:
            obj = json.loads(resp.read())
        return obj.get("message", {}).get("content", "") or ""

    def stream(self, messages: list[Message], *, temperature: float = 0.7) -> Iterator[str]:
        with self._open(messages, stream=True, temperature=temperature, max_tokens=None) as resp:
            for line in resp:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                token = obj.get("message", {}).get("content", "")
                if token:
                    yield token
                if obj.get("done"):
                    break
