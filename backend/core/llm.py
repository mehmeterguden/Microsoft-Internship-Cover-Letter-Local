"""Local LLM client — Microsoft Foundry Local (OpenAI-compatible).

Connection settings (base URL, model, API key) are read from the DB `settings`
table on every call, never from the environment. So when the user changes the
model or endpoint from the frontend, the next request uses it immediately.

Two entry points:
  • complete(messages)  — full reply as a string (extraction, analysis, ratings)
  • stream(messages)    — yields tokens as they arrive (real streaming for letters)

`health()` pings the model and reports status without ever raising, so the API can
tell the user "start Foundry Local" instead of returning a 500.
"""

from __future__ import annotations

from collections.abc import Iterator

from openai import OpenAI

from db import queries

# A chat message: {"role": "system"|"user"|"assistant", "content": "..."}.
Message = dict[str, str]


def _client_and_model() -> tuple[OpenAI, str]:
    """Build a fresh client from current settings. Cheap; keeps settings live."""
    s = queries.get_settings()
    client = OpenAI(
        base_url=s["llm_base_url"],
        api_key=s["llm_api_key"] or "not-needed",  # Foundry Local ignores the key
    )
    return client, s["llm_model"]


def complete(
    messages: list[Message],
    *,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> str:
    """Return the model's full reply as a single string."""
    client, model = _client_and_model()
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content or ""


def stream(
    messages: list[Message],
    *,
    temperature: float = 0.7,
) -> Iterator[str]:
    """Yield the reply token by token as the model generates it."""
    client, model = _client_and_model()
    for chunk in client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=True,
    ):
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def health() -> dict[str, object]:
    """Ping the model with a tiny prompt. Reports status; never raises."""
    s = queries.get_settings()
    info: dict[str, object] = {"model": s["llm_model"], "base_url": s["llm_base_url"]}
    try:
        reply = complete([{"role": "user", "content": "ping"}], max_tokens=5)
        return {**info, "ok": True, "detail": reply.strip()[:60] or "ok"}
    except Exception as exc:  # noqa: BLE001 — surface any connection/model error to the UI
        return {**info, "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
