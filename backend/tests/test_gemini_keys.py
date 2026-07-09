"""Gemini key-pool routing: round-robin load spreading + per-key cooldown.

The provider integration tests fake `genai.Client` so no network/quota is used —
a designated "good" key returns text, every other key raises a 429.
"""

from __future__ import annotations

import pytest
from google.genai import errors

from core.llm import gemini
from core.llm.gemini import GeminiProvider, _KeyHealth

GOOD = "key-good"
BAD = "key-bad"


def _entries(*ids: str) -> list[tuple[str, str]]:
    return [(i, f"secret-{i}") for i in ids]


# ── _KeyHealth unit tests ────────────────────────────────────────

def test_round_robin_spreads_starting_key():
    h = _KeyHealth()
    ents = _entries("a", "b", "c")
    firsts = [h.order(ents, "", "auto")[0][0] for _ in range(3)]
    assert firsts == ["a", "b", "c"]  # each call starts on a different key


def test_penalized_key_moves_to_the_back():
    h = _KeyHealth()
    ents = _entries("a", "b", "c")
    h.penalize("a", "limit")  # a is now cooling
    order = [k for k, _ in h.order(ents, "", "auto")]
    assert order[-1] == "a"          # cooling key is last
    assert set(order) == {"a", "b", "c"}  # but still available as last resort


def test_all_cooling_still_returns_keys_soonest_first():
    h = _KeyHealth()
    ents = _entries("a", "b")
    h.penalize("a", "limit")       # 60s
    h.penalize("b", "unavailable")  # 15s → recovers sooner
    order = [k for k, _ in h.order(ents, "", "auto")]
    assert order == ["b", "a"]     # never empty; try the one recovering first


def test_reward_clears_cooldown():
    h = _KeyHealth()
    ents = _entries("a", "b")
    h.penalize("a", "limit")
    h.reward("a")
    assert h.order(ents, "", "auto")[0][0] == "a"  # healthy again, back in rotation


def test_manual_mode_uses_only_active_key():
    h = _KeyHealth()
    ents = _entries("a", "b", "c")
    order = h.order(ents, "b", "manual")
    assert order == [("b", "secret-b")]


def test_quota_cooldown_escalates_but_busy_does_not():
    h = _KeyHealth()
    h.penalize("a", "limit")
    first = h._until["a"]
    h.reward("a")
    h.penalize("a", "limit")
    h.penalize("a", "limit")  # 2 consecutive → longer than a single one
    assert h._until["a"] - first > 0


# ── provider integration (faked genai.Client) ───────────────────

class _Resp:
    text = "OK"


def _fake_client_factory(calls: dict[str, int]):
    def make(api_key: str, http_options=None):
        secret = api_key

        class Models:
            def generate_content(self, model, contents, config):
                calls[secret] = calls.get(secret, 0) + 1
                if secret == f"secret-{GOOD}":
                    return _Resp()
                raise errors.ClientError(429, {"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}})

            def generate_content_stream(self, model, contents, config):
                calls[secret] = calls.get(secret, 0) + 1
                if secret == f"secret-{GOOD}":
                    yield _Resp()
                else:
                    raise errors.ClientError(429, {"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}})

        class Client:
            def __init__(self):
                self.models = Models()

        return Client()

    return make


@pytest.fixture
def fresh_health(monkeypatch):
    """Isolate each test from shared cooldown state."""
    monkeypatch.setattr(gemini, "_HEALTH", _KeyHealth())


def _settings(*ids: str, mode: str = "auto") -> dict:
    return {
        "llm_model": "gemini-2.5-flash",
        "gemini_api_keys": [{"id": i, "key": f"secret-{i}", "label": i} for i in ids],
        "gemini_active_key_id": ids[0],
        "key_switch_mode": mode,
        "gemini_api_key": "",
    }


def test_rotates_past_dead_key_and_cools_it(monkeypatch, fresh_health):
    calls: dict[str, int] = {}
    monkeypatch.setattr(gemini.genai, "Client", _fake_client_factory(calls))

    p = GeminiProvider(_settings(BAD, GOOD))
    assert p.complete([{"role": "user", "content": "hi"}]) == "OK"
    assert calls[f"secret-{BAD}"] == 1 and calls[f"secret-{GOOD}"] == 1

    # Second call must SKIP the cooling bad key and hit good directly.
    calls.clear()
    p2 = GeminiProvider(_settings(BAD, GOOD))
    assert p2.complete([{"role": "user", "content": "hi"}]) == "OK"
    assert f"secret-{BAD}" not in calls          # dead key was routed around
    assert calls[f"secret-{GOOD}"] == 1


def test_stream_rotates_and_cools(monkeypatch, fresh_health):
    calls: dict[str, int] = {}
    monkeypatch.setattr(gemini.genai, "Client", _fake_client_factory(calls))

    p = GeminiProvider(_settings(BAD, GOOD))
    assert "".join(p.stream([{"role": "user", "content": "hi"}])) == "OK"
    # bad key cooled → a fresh stream skips it
    calls.clear()
    assert "".join(GeminiProvider(_settings(BAD, GOOD)).stream([{"role": "user", "content": "hi"}])) == "OK"
    assert f"secret-{BAD}" not in calls


def test_all_keys_dead_raises_unavailable(monkeypatch, fresh_health):
    calls: dict[str, int] = {}
    monkeypatch.setattr(gemini.genai, "Client", _fake_client_factory(calls))
    p = GeminiProvider(_settings(BAD, "key-bad2"))
    with pytest.raises(gemini.GeminiUnavailable) as ei:
        p.complete([{"role": "user", "content": "hi"}])
    assert "limit" in ei.value.reasons
