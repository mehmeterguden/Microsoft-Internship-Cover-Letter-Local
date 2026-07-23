"""Tests for core.structured_output — schema derivation, robust parsing, and the
validate + one-repair-retry flow. No network: the LLM `complete` is monkeypatched.
"""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from core import structured_output as so
from models import CVExtraction


class Toy(BaseModel):
    a: int
    b: str = ""


# ── schema derivation + response_format builders ─────────────────

def test_schema_for_derives_and_caches():
    s1 = so.schema_for(Toy)
    assert s1 is so.schema_for(Toy)  # cached (same object)
    assert s1["properties"]["a"]["type"] == "integer"


def test_response_format_builders():
    assert so.json_object() == {"type": "json_object"}
    rf = so.json_schema(Toy)
    assert rf["type"] == "json_schema"
    assert rf["json_schema"]["name"] == "Toy"
    assert rf["json_schema"]["schema"] == so.schema_for(Toy)


def test_cvextraction_schema_smoke():
    # the real model CV structuring constrains to must derive cleanly
    s = so.schema_for(CVExtraction)
    assert {"profile", "skills", "experiences", "links"}.issubset(s["properties"])


# ── robust extraction / parsing ──────────────────────────────────

def test_loads_tolerates_fences_prose_and_newlines():
    assert so.loads('```json\n{"a":1}\n```') == {"a": 1}
    assert so.loads('Sure!\n{"a": 2, "s": "x\ny"}\nthanks') == {"a": 2, "s": "x\ny"}
    assert so.loads('{"nested": {"x": [1, 2]}}') == {"nested": {"x": [1, 2]}}


def test_loads_raises_on_missing_or_malformed_json():
    with pytest.raises(so.StructuredError):
        so.loads("no json here at all")
    with pytest.raises(so.StructuredError):
        so.loads('{"a": }')


# ── finalize: parse + validate (+ repair) ────────────────────────

_MSGS = [{"role": "user", "content": "x"}]


def test_finalize_success_keeps_extra_keys_in_data():
    r = so.finalize(_MSGS, '{"a": 5, "extra": 9}', Toy)
    assert r.ok and r.value.a == 5           # validated model instance
    assert r.data["extra"] == 9              # extras (e.g. confidence) survive in `data`


def test_finalize_applies_normalize_before_validation():
    r = so.finalize(_MSGS, '{"a": "7"}', Toy, normalize=lambda d: {**d, "a": int(d["a"])})
    assert r.ok and r.value.a == 7


def test_finalize_no_repair_returns_error_with_raw():
    r = so.finalize(_MSGS, "garbage", Toy, repair=False)
    assert not r.ok and r.error and r.raw == "garbage" and r.value is None


def test_finalize_repairs_once(monkeypatch):
    seen = []

    def fake(messages, *, response_format=None, temperature=0.0, max_tokens=None):
        seen.append(response_format)
        return '{"a": 3}'

    monkeypatch.setattr(so, "complete", fake)
    r = so.finalize(_MSGS, "not json", Toy, response_format=so.json_object())
    assert r.ok and r.value.a == 3
    assert seen == [{"type": "json_object"}]  # exactly one repair call, carrying the format


def test_finalize_reports_last_raw_when_repair_also_fails(monkeypatch):
    monkeypatch.setattr(so, "complete", lambda *a, **k: "still not json")
    r = so.finalize(_MSGS, "not json", Toy)
    assert not r.ok and r.raw == "still not json"


def test_finalize_repair_call_failure_is_caught(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(so, "complete", boom)
    r = so.finalize(_MSGS, "not json", Toy)  # must not raise
    assert not r.ok and "network down" in r.error


# ── structure / parse: response_format selection ─────────────────

def test_structure_constrains_to_schema_by_default(monkeypatch):
    seen = {}

    def fake(messages, *, response_format=None, temperature=0.0, max_tokens=None):
        seen["rf"] = response_format
        return '{"a": 1}'

    monkeypatch.setattr(so, "complete", fake)
    r = so.structure(_MSGS, Toy)
    assert r.ok and seen["rf"]["type"] == "json_schema"


def test_structure_honours_explicit_json_object(monkeypatch):
    seen = {}

    def fake(messages, *, response_format=None, temperature=0.0, max_tokens=None):
        seen["rf"] = response_format
        return '{"a": 1}'

    monkeypatch.setattr(so, "complete", fake)
    so.structure(_MSGS, Toy, response_format=so.json_object())
    assert seen["rf"] == {"type": "json_object"}


def test_parse_without_model_defaults_to_json_object(monkeypatch):
    seen = {}

    def fake(messages, *, response_format=None, temperature=0.0, max_tokens=None):
        seen["rf"] = response_format
        return '{"x": 1, "y": [1, 2]}'

    monkeypatch.setattr(so, "complete", fake)
    r = so.parse(_MSGS)
    assert r.ok and r.value is None and r.data == {"x": 1, "y": [1, 2]}
    assert seen["rf"] == {"type": "json_object"}


def test_repair_messages_shape():
    msgs = so.repair_messages([{"role": "user", "content": "q"}], "bad output", "boom")
    assert msgs[-2] == {"role": "assistant", "content": "bad output"}
    assert msgs[-1]["role"] == "user" and "boom" in msgs[-1]["content"]


# ── provider fallback when response_format is unsupported (task 14) ──

def test_complete_retries_without_response_format_when_provider_rejects_it(monkeypatch):
    calls = []

    def fake_llm_complete(messages, *, temperature=0.0, max_tokens=None, **kwargs):
        calls.append(kwargs)
        if "response_format" in kwargs:  # a provider that doesn't accept the kwarg
            raise TypeError("complete() got an unexpected keyword argument 'response_format'")
        return '{"a": 1}'

    monkeypatch.setattr(so.llm, "complete", fake_llm_complete)
    out = so.complete(_MSGS, response_format=so.json_object())
    assert out == '{"a": 1}'
    assert calls[0].get("response_format") == {"type": "json_object"}  # tried constrained first
    assert "response_format" not in calls[1]                            # then fell back without it


def test_complete_does_not_swallow_unrelated_type_errors(monkeypatch):
    def boom(messages, *, temperature=0.0, max_tokens=None, **kwargs):
        raise TypeError("something else entirely")

    monkeypatch.setattr(so.llm, "complete", boom)
    with pytest.raises(TypeError, match="something else"):
        so.complete(_MSGS, response_format=so.json_object())


def test_complete_omits_response_format_when_none(monkeypatch):
    seen = {}

    def fake(messages, *, temperature=0.0, max_tokens=None, **kwargs):
        seen["kwargs"] = kwargs
        return "ok"

    monkeypatch.setattr(so.llm, "complete", fake)
    so.complete(_MSGS)  # response_format defaults to None
    assert "response_format" not in seen["kwargs"]  # never passed downstream when absent
