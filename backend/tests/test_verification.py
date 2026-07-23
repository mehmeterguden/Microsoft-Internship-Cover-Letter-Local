"""Tests for the groundedness verification module's pure logic (no LLM calls)."""

from __future__ import annotations

import pytest

from core.verification import _extract_json, _normalize


def test_extract_json_tolerates_prose_and_fences():
    raw = 'Here is the audit:\n```json\n{"verdict": "grounded", "claims": []}\n```\nDone.'
    assert _extract_json(raw) == '{"verdict": "grounded", "claims": []}'


def test_extract_json_raises_without_object():
    with pytest.raises(ValueError):
        _extract_json("no json here")


def test_normalize_flags_unsupported_as_review():
    out = _normalize({
        "claims": [
            {"text": "Knows Python", "status": "supported", "note": "listed in skills"},
            {"text": "Led a team of 12", "status": "unsupported", "note": "not in profile"},
        ]
    })
    assert out["verdict"] == "review"
    assert len(out["claims"]) == 2
    assert out["summary"]  # non-empty user-facing sentence


def test_normalize_all_supported_is_grounded():
    out = _normalize({"claims": [{"text": "Knows Python", "status": "supported", "note": "listed"}]})
    assert out["verdict"] == "grounded"


def test_normalize_two_partly_triggers_review():
    out = _normalize({
        "claims": [
            {"text": "a", "status": "partly", "note": ""},
            {"text": "b", "status": "partly", "note": ""},
        ]
    })
    assert out["verdict"] == "review"


def test_normalize_coerces_bad_status_and_drops_empty_claims():
    out = _normalize({
        "claims": [
            {"text": "valid", "status": "not-a-real-status"},
            {"text": "   ", "status": "supported"},   # empty text → dropped
            "garbage",                                   # non-dict → dropped
        ]
    })
    assert len(out["claims"]) == 1
    assert out["claims"][0]["status"] == "partly"  # unknown status coerced


def test_normalize_empty_is_grounded():
    out = _normalize({"claims": []})
    assert out["verdict"] == "grounded"
    assert out["claims"] == []
