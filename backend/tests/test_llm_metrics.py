"""Usage metering — token/cost estimation, in-flight counter, DB round-trip."""

from __future__ import annotations

import db.queries as queries
import db.schema as schema
from core import llm_metrics


def test_estimate_tokens():
    assert llm_metrics.estimate_tokens("") == 0
    assert llm_metrics.estimate_tokens("abcd") == 1        # ~4 chars/token
    assert llm_metrics.estimate_tokens("a" * 400) == 100


def test_cost_local_is_free_cloud_is_billed():
    assert llm_metrics.estimate_cost("foundry_local", "phi-4", 1000, 1000) == 0.0
    assert llm_metrics.estimate_cost("ollama", "llama3.1", 1000, 1000) == 0.0
    cloud = llm_metrics.estimate_cost("openai", "gpt-4o", 1000, 1000)
    assert cloud > 0.0
    # mini is cheaper than the full model
    assert llm_metrics.estimate_cost("openai", "gpt-4o-mini", 1000, 1000) < cloud


def test_inflight_counter():
    base = llm_metrics.running()
    llm_metrics.begin()
    llm_metrics.begin()
    assert llm_metrics.running() == base + 2
    llm_metrics.end()
    llm_metrics.end()
    assert llm_metrics.running() == base
    # never goes negative
    llm_metrics.end()
    assert llm_metrics.running() == base


def test_usage_roundtrip_real_db(tmp_path, monkeypatch):
    monkeypatch.setattr(schema, "DATABASE_PATH", str(tmp_path / "usage.db"))
    schema.init_db()
    llm_metrics.record("openai", "gpt-4o", [{"role": "user", "content": "a" * 400}], "b" * 200, 123, "complete")
    runs = queries.recent_llm_runs(10)
    assert len(runs) == 1
    r = runs[0]
    assert r["provider"] == "openai" and r["kind"] == "complete"
    assert r["prompt_tokens"] == 100 and r["completion_tokens"] == 50
    assert r["total_tokens"] == 150 and r["cost_usd"] > 0
    today = queries.llm_usage_today()
    assert today["calls"] == 1 and today["tokens"] == 150 and today["cost_usd"] > 0
