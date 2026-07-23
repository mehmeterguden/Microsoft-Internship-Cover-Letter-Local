"""Azure OpenAI — Microsoft's managed, cloud OpenAI service. Self-contained.

Uses the same `openai` SDK as the OpenAI provider, but through `AzureOpenAI`,
which targets the user's Azure resource. Three settings drive it:
  • azure_openai_endpoint     e.g. https://my-resource.openai.azure.com
  • azure_openai_api_key      the resource key
  • azure_openai_api_version  the REST API version (e.g. 2024-10-21)
and `llm_model` is the **deployment name** you created in the Azure portal (not
the base model id).

Cloud provider — prompts leave the user's machine — but it's the Microsoft-managed
path, offered beside Foundry Local as a first-class option. See the project brief.
"""

from __future__ import annotations

from collections.abc import Iterator

from openai import AzureOpenAI

from core.llm.base import LLMProvider, Message, ResponseFormat

DEFAULT_API_VERSION = "2024-10-21"


class AzureOpenAIProvider(LLMProvider):
    provider_id = "azure_openai"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]  # the Azure *deployment* name
        self._client = AzureOpenAI(
            api_key=settings.get("azure_openai_api_key") or "not-set",
            azure_endpoint=settings.get("azure_openai_endpoint") or "",
            api_version=settings.get("azure_openai_api_version") or DEFAULT_API_VERSION,
        )

    @property
    def model(self) -> str:
        return self._model

    def complete(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_format: ResponseFormat = None,
    ) -> str:
        kwargs: dict[str, object] = {}
        if response_format:  # OpenAI-compatible shape, passed through when opted in
            kwargs["response_format"] = response_format
        response = self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature, max_tokens=max_tokens, **kwargs
        )
        return response.choices[0].message.content or ""

    def stream(
        self, messages: list[Message], *, temperature: float = 0.7, response_format: ResponseFormat = None
    ) -> Iterator[str]:
        kwargs: dict[str, object] = {}
        if response_format:
            kwargs["response_format"] = response_format
        for chunk in self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature, stream=True, **kwargs
        ):
            if chunk.choices and (delta := chunk.choices[0].delta.content):
                yield delta
