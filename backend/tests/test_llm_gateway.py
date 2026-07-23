"""LLM gateway — metering + PII shield at the single boundary.

Providers are faked (no network); the DB write is captured in memory."""

from __future__ import annotations

import core.llm as llm
import db.queries as queries
from core import llm_metrics


class _Fake:
    def __init__(self, settings):
        self.settings = settings
    @property
    def model(self):
        return self.settings["llm_model"]
    def complete(self, messages, **kwargs):
        _Fake.last_sent = messages
        return "Dear team, I am excited to apply."
    def stream(self, messages, **kwargs):
        _Fake.last_sent = messages
        for tok in ["Dear ", "team", "."]:
            yield tok


def _wire(monkeypatch, provider_id, capture):
    monkeypatch.setitem(llm.PROVIDERS, provider_id, _Fake)
    monkeypatch.setattr(
        llm.queries, "get_settings",
        lambda: {"llm_provider": provider_id, "llm_model": "gpt-4o", "pii_shield_cloud": 1},
    )
    monkeypatch.setattr(queries, "record_llm_run", lambda row: capture.append(row))


def test_cloud_complete_redacts_and_meters(monkeypatch):
    rows: list[dict] = []
    _wire(monkeypatch, "openai", rows)  # openai = cloud
    reply = llm.complete([{"role": "user", "content": "Email a@b.com, call +1 415 555 0132. Skill: Python."}])
    assert reply.startswith("Dear team")
    sent = _Fake.last_sent[0]["content"]
    assert "a@b.com" not in sent and "[redacted-email]" in sent      # PII stripped for cloud
    assert "[redacted-phone]" in sent
    assert "Python" in sent                                          # substance kept
    assert llm_metrics.running() == 0                               # counter balanced
    assert rows and rows[0]["provider"] == "openai" and rows[0]["total_tokens"] > 0
    assert rows[0]["kind"] == "complete"


def test_local_complete_is_never_redacted(monkeypatch):
    rows: list[dict] = []
    _wire(monkeypatch, "foundry_local", rows)  # foundry = local
    llm.complete([{"role": "user", "content": "Email a@b.com stays on device"}])
    assert _Fake.last_sent[0]["content"] == "Email a@b.com stays on device"
    assert rows and rows[0]["cost_usd"] == 0.0  # local is free


def test_stream_passes_tokens_through_and_records(monkeypatch):
    rows: list[dict] = []
    _wire(monkeypatch, "openai", rows)
    out = list(llm.stream([{"role": "user", "content": "hi a@b.com"}]))
    assert out == ["Dear ", "team", "."]          # streaming stays real (order preserved)
    assert "[redacted-email]" in _Fake.last_sent[0]["content"]
    assert llm_metrics.running() == 0
    assert rows and rows[0]["kind"] == "stream" and rows[0]["completion_tokens"] > 0
