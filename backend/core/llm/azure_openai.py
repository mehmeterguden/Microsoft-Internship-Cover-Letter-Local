"""Azure OpenAI — Microsoft's managed cloud service. Self-contained.

Talks to the resource's **OpenAI-compatible v1 surface** (`…/openai/v1`) with the
standard `openai` SDK, rather than the older deployment-path API. That surface is
what current Azure resources expose, accepts the key as a Bearer token, and takes
the **deployment name** as the `model` (set in `llm_model`). Three settings drive it:
  • azure_openai_endpoint     the resource root, or a URL ending in /openai[/v1]
  • azure_openai_api_key      the resource key
  • azure_openai_api_version  kept for compatibility; the v1 surface ignores it

Reasoning models (gpt-5*, o-series) reject `max_tokens` and any non-default
`temperature`; for those we send `max_completion_tokens` and omit `temperature`.
Because reasoning tokens count against that budget, small caps are padded so there
is room left for the visible answer. If a deployment is misdetected, a first
`400 unsupported_parameter/value` transparently retries in the other mode.

Cloud provider — prompts leave the user's machine — but it's the Microsoft-managed
path, offered beside Foundry Local as a first-class option. See the project brief.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from openai import BadRequestError, OpenAI

from core.llm.base import LLMProvider, Message, ResponseFormat

DEFAULT_API_VERSION = "2024-10-21"  # retained for the settings default; v1 ignores it

# Deployment names usually mirror the base model. These families are "reasoning"
# models with the parameter constraints described above.
_REASONING_RE = re.compile(r"^(gpt-5|o[134])(-|$)", re.IGNORECASE)

# Headroom added to a reasoning model's completion budget so hidden reasoning
# tokens don't consume the whole cap and leave the visible answer empty.
_REASONING_HEADROOM = 4096
_REASONING_MIN_BUDGET = 4096


def v1_base_url(endpoint: str) -> str:
    """Normalize an Azure resource endpoint to its OpenAI-compatible `/openai/v1` base.

    Accepts the resource root (`https://res.openai.azure.com`) or a URL that already
    ends in `/openai` or `/openai/v1`. Returns "" for an empty endpoint."""
    e = (endpoint or "").rstrip("/")
    if not e:
        return ""
    if e.endswith("/openai/v1"):
        return e
    if e.endswith("/openai"):
        return f"{e}/v1"
    return f"{e}/openai/v1"


def _is_reasoning(model: str) -> bool:
    return bool(_REASONING_RE.match(model or ""))


def _is_param_error(exc: BadRequestError) -> bool:
    """True when a 400 complains about temperature/max_tokens — i.e. we guessed the
    wrong model family and should retry in the other mode."""
    msg = str(getattr(exc, "message", "") or exc).lower()
    return "max_tokens" in msg or "max_completion_tokens" in msg or "temperature" in msg


class AzureOpenAIProvider(LLMProvider):
    provider_id = "azure_openai"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]  # the Azure *deployment* name
        self._reasoning = _is_reasoning(self._model)
        # Bearer auth works on the Azure v1 surface, so the plain OpenAI client fits.
        self._client = OpenAI(
            base_url=v1_base_url(settings.get("azure_openai_endpoint") or ""),
            api_key=settings.get("azure_openai_api_key") or "not-set",
        )

    @property
    def model(self) -> str:
        return self._model

    def _kwargs(
        self,
        reasoning: bool,
        *,
        temperature: float,
        max_tokens: int | None,
        response_format: ResponseFormat,
    ) -> dict[str, object]:
        kwargs: dict[str, object] = {}
        if response_format:  # OpenAI-compatible shape, passed through
            kwargs["response_format"] = response_format
        if reasoning:
            # temperature must stay at the default (1) -> omit it entirely.
            if max_tokens is not None:
                kwargs["max_completion_tokens"] = max(max_tokens, _REASONING_MIN_BUDGET) + _REASONING_HEADROOM
        else:
            kwargs["temperature"] = temperature
            if max_tokens is not None:
                kwargs["max_tokens"] = max_tokens
        return kwargs

    def complete(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_format: ResponseFormat = None,
    ) -> str:
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                **self._kwargs(self._reasoning, temperature=temperature, max_tokens=max_tokens, response_format=response_format),
            )
        except BadRequestError as exc:
            if self._reasoning or not _is_param_error(exc):
                raise
            self._reasoning = True  # misdetected — this deployment is a reasoning model
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                **self._kwargs(True, temperature=temperature, max_tokens=max_tokens, response_format=response_format),
            )
        return response.choices[0].message.content or ""

    def stream(
        self, messages: list[Message], *, temperature: float = 0.7, response_format: ResponseFormat = None
    ) -> Iterator[str]:
        def _open(reasoning: bool):
            return self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                stream=True,
                **self._kwargs(reasoning, temperature=temperature, max_tokens=None, response_format=response_format),
            )

        try:
            stream = _open(self._reasoning)
        except BadRequestError as exc:
            if self._reasoning or not _is_param_error(exc):
                raise
            self._reasoning = True
            stream = _open(True)

        for chunk in stream:
            if chunk.choices and (delta := chunk.choices[0].delta.content):
                yield delta
