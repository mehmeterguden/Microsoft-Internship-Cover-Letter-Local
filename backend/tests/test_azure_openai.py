"""Azure OpenAI provider helpers — endpoint normalization, reasoning detection,
and the parameter mapping for reasoning vs classic models. No network."""

from __future__ import annotations

import pytest

from core.llm.azure_openai import AzureOpenAIProvider, _is_reasoning, v1_base_url


@pytest.mark.parametrize(
    "endpoint, expected",
    [
        ("https://r.openai.azure.com", "https://r.openai.azure.com/openai/v1"),
        ("https://r.openai.azure.com/", "https://r.openai.azure.com/openai/v1"),
        ("https://r.openai.azure.com/openai", "https://r.openai.azure.com/openai/v1"),
        ("https://r.openai.azure.com/openai/v1", "https://r.openai.azure.com/openai/v1"),
        ("https://r.openai.azure.com/openai/v1/", "https://r.openai.azure.com/openai/v1"),
        ("", ""),
    ],
)
def test_v1_base_url_normalizes(endpoint, expected):
    assert v1_base_url(endpoint) == expected


@pytest.mark.parametrize("model", ["gpt-5-mini", "gpt-5", "o1", "o1-mini", "o3-mini", "o4-mini", "GPT-5-Nano"])
def test_reasoning_models_detected(model):
    assert _is_reasoning(model) is True


@pytest.mark.parametrize("model", ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "phi-4", "llama3.1:8b", ""])
def test_classic_models_not_reasoning(model):
    assert _is_reasoning(model) is False


def _provider(model: str) -> AzureOpenAIProvider:
    return AzureOpenAIProvider(
        {"llm_model": model, "azure_openai_endpoint": "https://r.openai.azure.com", "azure_openai_api_key": "k"}
    )


def test_reasoning_kwargs_drop_temperature_and_use_completion_budget():
    kw = _provider("gpt-5-mini")._kwargs(True, temperature=0.7, max_tokens=1500, response_format=None)
    assert "temperature" not in kw and "max_tokens" not in kw
    assert kw["max_completion_tokens"] > 1500  # padded so reasoning tokens leave room for output


def test_classic_kwargs_pass_temperature_and_max_tokens():
    kw = _provider("gpt-4o")._kwargs(False, temperature=0.2, max_tokens=1000, response_format=None)
    assert kw == {"temperature": 0.2, "max_tokens": 1000}


def test_response_format_passed_through_in_both_modes():
    rf = {"type": "json_object"}
    assert _provider("gpt-5-mini")._kwargs(True, temperature=0.7, max_tokens=None, response_format=rf)["response_format"] == rf
    assert _provider("gpt-4o")._kwargs(False, temperature=0.7, max_tokens=None, response_format=rf)["response_format"] == rf
