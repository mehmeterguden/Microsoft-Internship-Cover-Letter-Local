"""GitHub analysis streaming — real progress events + drain wrapper.

The LLM call (`_complete_with_retry`) is monkeypatched, so no network/model.
"""

from __future__ import annotations

import json

import pytest

from core import github_analysis

_PAYLOAD = json.dumps({
    "repos": [{"repo_name": "cli", "summary": "A CLI", "technologies": ["Go"], "involvement": 4}],
    "skills": [{"name": "Go", "score": 5}],
})


def test_analyze_stream_emits_progress_then_result(monkeypatch):
    monkeypatch.setattr(github_analysis, "_complete_with_retry", lambda messages: _PAYLOAD)
    events = list(github_analysis.analyze_stream([{"repo_name": "cli", "readme": "hi"}]))

    kinds = [e["type"] for e in events]
    assert "progress" in kinds
    assert kinds[-1] == "result"
    percents = [e["percent"] for e in events if e["type"] == "progress"]
    assert percents == sorted(percents)            # monotonic
    assert all(0 <= p <= 100 for p in percents)

    result = events[-1]["result"]
    assert result["repos"][0]["repo_name"] == "cli"
    assert any(s["name"] == "Go" for s in result["skills"])


def test_analyze_drain_wrapper_returns_result(monkeypatch):
    monkeypatch.setattr(github_analysis, "_complete_with_retry", lambda messages: json.dumps({"repos": [], "skills": []}))
    out = github_analysis.analyze([{"repo_name": "x"}])
    assert out["repos"][0]["repo_name"] == "x"     # repo kept even without analysis
    assert out["skills"] == []


def test_analyze_stream_raises_when_every_batch_fails(monkeypatch):
    def boom(messages):
        raise RuntimeError("quota exhausted")

    monkeypatch.setattr(github_analysis, "_complete_with_retry", boom)
    with pytest.raises(RuntimeError):
        list(github_analysis.analyze_stream([{"repo_name": "x"}]))
