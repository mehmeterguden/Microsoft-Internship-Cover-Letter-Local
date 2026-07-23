"""Google Gemini — cloud, native GenAI API, with a rotating key pool.

Gemini's API differs from the OpenAI shape: roles are "user"/"model", the system
prompt goes in the request config, and content is a list of typed parts. This
module adapts our uniform interface to it.

Gemini's free tier is rate-limited *per key*, so the user can register several
keys (see the `gemini_api_keys` pool in settings). When the active key hits its
limit this provider either:
  • auto  — transparently rotates to the next key and remembers the working one, or
  • manual — stops and raises a clear error so the user picks a key themselves.

Note: this is a cloud provider — prompts leave the user's machine. See the LLM
provider note in the project brief.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterator

from google import genai
from google.genai import errors, types

from core.llm.base import LLMProvider, Message, ResponseFormat, json_schema_of

# Bound every request so a stalled connection can't hang the app indefinitely.
_HTTP = types.HttpOptions(timeout=120_000)  # milliseconds


class GeminiUnavailable(RuntimeError):
    """No key in the pool could serve the request.

    `reasons` (a subset of {"limit", "invalid", "unavailable"}) says *why*, so the UI
    can propose the right fix — most importantly, offer to switch model when the model
    itself is unavailable ("unavailable"), rather than when it's a quota/key problem."""

    def __init__(self, message: str, *, reasons: set[str] | None = None) -> None:
        super().__init__(message)
        self.reasons: set[str] = reasons or set()


def _json_config(response_format: ResponseFormat) -> dict[str, object]:
    """Map our OpenAI-style response_format to Gemini's config keys: request JSON
    output, plus a response_schema when a JSON schema is supplied. Empty when off."""
    if not response_format:
        return {}
    cfg: dict[str, object] = {"response_mime_type": "application/json"}
    schema = json_schema_of(response_format)
    if schema is not None:
        cfg["response_schema"] = schema
    return cfg


def _to_gemini(messages: list[Message]) -> tuple[str | None, list[types.Content]]:
    """Adapt our messages to Gemini's (system_instruction, contents) shape."""
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    contents = [
        types.Content(
            role="model" if m["role"] == "assistant" else "user",
            parts=[types.Part(text=m["content"])],
        )
        for m in messages
        if m["role"] != "system"
    ]
    system = "\n\n".join(system_parts) if system_parts else None
    return system, contents


def _key_failure_reason(exc: Exception) -> str | None:
    """Classify a key-related failure, or return None if the error isn't the key's
    fault (a real error we must surface, not rotate past).

        "limit"   → rate/quota exhausted        (429 RESOURCE_EXHAUSTED)
        "invalid" → key rejected / unauthorized (401, 403, or 400 API_KEY_INVALID)
    """
    if not isinstance(exc, errors.APIError):
        return None
    code = getattr(exc, "code", None)
    status = getattr(exc, "status", None) or ""
    message = getattr(exc, "message", None) or ""
    if code == 429 or status == "RESOURCE_EXHAUSTED":
        return "limit"
    if code in (401, 403) or status in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return "invalid"
    if code == 400 and ("API_KEY_INVALID" in message or "api key not valid" in message.lower()):
        return "invalid"
    if code in (500, 503) or status in ("UNAVAILABLE", "INTERNAL"):
        return "unavailable"  # transient server overload — a different key may route elsewhere
    if code == 404 or status == "NOT_FOUND":
        return "unavailable"  # model missing/unsupported — switching model is the fix
    return None


def _pool(settings: dict) -> list[tuple[str, str]]:
    """Ordered (id, key) pairs with a non-empty key. Falls back to the legacy
    single `gemini_api_key` when the pool is empty, so nothing breaks mid-upgrade."""
    entries = [
        (e.get("id") or "", (e.get("key") or "").strip())
        for e in (settings.get("gemini_api_keys") or [])
    ]
    entries = [(i, k) for i, k in entries if k]
    if not entries:
        legacy = (settings.get("gemini_api_key") or "").strip()
        if legacy:
            entries = [("legacy", legacy)]
    return entries


def effective_key(settings: dict) -> str:
    """The single Gemini key to use for one-off calls (e.g. model discovery):
    the active key if set, else the first key in the pool, else empty."""
    entries = _pool(settings)
    if not entries:
        return ""
    active = settings.get("gemini_active_key_id") or ""
    for key_id, key in entries:
        if key_id == active:
            return key
    return entries[0][1]


class _KeyHealth:
    """Process-wide, thread-safe routing for the Gemini key pool.

    Two jobs that matter when many requests run at once (e.g. the research fleet):

      1. **Spread load** — hand successive calls a *different* starting key
         (round-robin) instead of all hammering the same one.
      2. **Circuit-break** — when a key fails, put it in a short cooldown and route
         around it, so we don't waste every following call re-trying a dead key.
         429 (quota) escalates on repeats; 503 (busy) cools briefly; a rejected key
         cools for longer.

    In-memory only (one uvicorn process): all worker threads share this instance.
    """

    _BASE_COOLDOWN = {"unavailable": 15.0, "limit": 60.0, "invalid": 600.0}
    _MAX_COOLDOWN = 900.0

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._until: dict[str, float] = {}   # key_id → monotonic time its cooldown ends
        self._fails: dict[str, int] = {}     # consecutive failures (429 backoff escalation)
        self._cursor = 0                     # round-robin position

    def order(self, entries: list[tuple[str, str]], active_id: str, mode: str) -> list[tuple[str, str]]:
        """Return the keys to try, best-first, for one request."""
        now = time.monotonic()
        with self._lock:
            if mode == "manual":
                ids = [i for i, _ in entries]
                idx = ids.index(active_id) if active_id in ids else 0
                return entries[idx : idx + 1] or entries[:1]

            healthy = [e for e in entries if self._until.get(e[0], 0.0) <= now]
            cooling = [e for e in entries if self._until.get(e[0], 0.0) > now]
            if healthy:
                start = self._cursor % len(healthy)
                self._cursor += 1
                ordered = healthy[start:] + healthy[:start]
                # keep cooling keys as a last resort, soonest-to-recover first
                cooling.sort(key=lambda e: self._until.get(e[0], 0.0))
                return ordered + cooling
            # everything is cooling — try whichever recovers first rather than give up
            return sorted(entries, key=lambda e: self._until.get(e[0], 0.0))

    def penalize(self, key_id: str, reason: str) -> None:
        with self._lock:
            n = self._fails.get(key_id, 0) + 1
            self._fails[key_id] = n
            base = self._BASE_COOLDOWN.get(reason, 30.0)
            # only quota escalates (a genuinely spent key shouldn't be poked every minute)
            cooldown = min(base * (2 ** (n - 1)), self._MAX_COOLDOWN) if reason == "limit" else base
            self._until[key_id] = time.monotonic() + cooldown

    def reward(self, key_id: str) -> None:
        """A key just worked — clear its cooldown and failure streak."""
        with self._lock:
            self._fails.pop(key_id, None)
            self._until.pop(key_id, None)


# Shared across every GeminiProvider instance / worker thread in this process.
_HEALTH = _KeyHealth()


class GeminiProvider(LLMProvider):
    provider_id = "gemini"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]
        self._entries = _pool(settings)
        self._labels = {
            (e.get("id") or ""): (e.get("label") or "")
            for e in (settings.get("gemini_api_keys") or [])
        }
        self._active_id = settings.get("gemini_active_key_id") or ""
        self._mode = "manual" if settings.get("key_switch_mode") == "manual" else "auto"

    @property
    def model(self) -> str:
        return self._model

    # ── key selection ────────────────────────────────────────────
    def _candidates(self) -> list[tuple[str, str]]:
        """Keys to try, best-first. Auto mode load-balances across healthy keys and
        routes around ones in cooldown; manual mode uses only the selected key."""
        if not self._entries:
            return []
        return _HEALTH.order(self._entries, self._active_id, self._mode)

    def _label_for(self, key_id: str) -> str:
        return self._labels.get(key_id) or "this key"

    def _manual_error(self, reason: str, key_id: str) -> RuntimeError:
        if reason == "unavailable":
            return RuntimeError("Gemini is temporarily unavailable (high demand). Please try again shortly.")
        what = "hit its rate/quota limit" if reason == "limit" else "was rejected (invalid or unauthorized)"
        return RuntimeError(
            f"Gemini key “{self._label_for(key_id)}” {what}. "
            "Select another key in Settings, or switch key handling to “Automatic”."
        )

    @staticmethod
    def _no_key_error() -> RuntimeError:
        return RuntimeError("No Gemini API key configured. Add one in Settings.")

    @staticmethod
    def _exhausted_error(reasons: set[str]) -> GeminiUnavailable:
        if reasons == {"unavailable"}:
            detail = "the model is temporarily busy"
        elif reasons == {"limit"}:
            detail = "every key has hit its rate/quota limit"
        elif reasons == {"invalid"}:
            detail = "every key was rejected"
        else:
            detail = "keys are rate-limited, rejected, or the model is temporarily busy"
        return GeminiUnavailable(
            f"All Gemini API keys are unavailable right now ({detail}). "
            "Switch model or add another key in Settings, or try again shortly.",
            reasons=reasons,
        )

    # ── generation ───────────────────────────────────────────────
    def complete(self, messages, *, temperature=0.7, max_tokens=None, response_format: ResponseFormat = None) -> str:
        system, contents = _to_gemini(messages)
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction=system,
            thinking_config=types.ThinkingConfig(thinking_budget=0),  # skip reasoning → full budget to the answer
            **_json_config(response_format),
        )

        candidates = self._candidates()
        if not candidates:
            raise self._no_key_error()

        last_exc: Exception | None = None
        reasons: set[str] = set()
        for key_id, api_key in candidates:
            client = genai.Client(api_key=api_key, http_options=_HTTP)
            try:
                response = client.models.generate_content(
                    model=self._model, contents=contents, config=config
                )
            except Exception as exc:  # noqa: BLE001 — inspect, then rotate or re-raise
                reason = _key_failure_reason(exc)
                if reason is None:
                    raise  # a genuine error (bad model, network) — surface it
                last_exc = exc
                reasons.add(reason)
                _HEALTH.penalize(key_id, reason)
                if self._mode == "manual":
                    raise self._manual_error(reason, key_id) from exc
                continue  # auto: this key is spent, try the next one
            _HEALTH.reward(key_id)
            return response.text or ""

        raise self._exhausted_error(reasons) from last_exc

    def stream(self, messages, *, temperature=0.7, response_format: ResponseFormat = None) -> Iterator[str]:
        system, contents = _to_gemini(messages)
        config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=system,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            **_json_config(response_format),
        )

        candidates = self._candidates()
        if not candidates:
            raise self._no_key_error()

        last_exc: Exception | None = None
        reasons: set[str] = set()
        for key_id, api_key in candidates:
            client = genai.Client(api_key=api_key, http_options=_HTTP)
            produced = False
            try:
                for chunk in client.models.generate_content_stream(
                    model=self._model, contents=contents, config=config
                ):
                    if chunk.text:
                        produced = True
                        yield chunk.text
            except Exception as exc:  # noqa: BLE001 — inspect, then rotate or re-raise
                reason = _key_failure_reason(exc)
                # A key problem always cools the key (so a mid-stream failure still
                # routes the outer retry to a healthy key). But if we already emitted
                # tokens we can't safely restart here — surface the error.
                if reason is not None:
                    _HEALTH.penalize(key_id, reason)
                if reason is None or produced:
                    raise
                last_exc = exc
                reasons.add(reason)
                if self._mode == "manual":
                    raise self._manual_error(reason, key_id) from exc
                continue  # auto: nothing emitted yet — retry cleanly on the next key
            _HEALTH.reward(key_id)
            return

        raise self._exhausted_error(reasons) from last_exc
