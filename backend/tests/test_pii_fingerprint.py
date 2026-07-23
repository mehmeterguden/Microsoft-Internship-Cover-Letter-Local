"""Tests for the private-data fingerprint — the source of the privacy firewall.

`private_fingerprint` distills the profile row into the strong identifiers that
must never leave the machine. The DB is monkeypatched; we pin which fields become
fingerprint entries, the length floor that drops over-generic values, and the
fail-safe behaviours (no profile or a DB error → empty set → nothing to protect).
"""

from __future__ import annotations

import pytest

from core.research import outbound_guard
from core.research.outbound_guard import OutboundLeakError


def _profile(monkeypatch, profile):
    monkeypatch.setattr(outbound_guard.queries, "get_profile", lambda: profile)


def test_fingerprint_collects_strong_identifiers(monkeypatch):
    _profile(monkeypatch, {
        "name": "Jane",
        "surname": "Doe",
        "email": "jane@example.com",
        "phone": "+1 555 0100",
        "linkedin": "in/janedoe",
        "github": "janedoe-dev",
        "summary": "Senior engineer with a decade of experience",
    })
    fingerprint = outbound_guard.private_fingerprint()
    assert "jane doe" in fingerprint          # name + surname, combined and lowercased
    assert "jane@example.com" in fingerprint
    assert "in/janedoe" in fingerprint
    assert "senior engineer with a decade of experience" in fingerprint


def test_fingerprint_drops_values_below_the_length_floor(monkeypatch):
    # Short values are too generic to match on safely, so they never join the set.
    _profile(monkeypatch, {"name": "Jo", "surname": "", "github": "abc"})
    assert outbound_guard.private_fingerprint() == set()


def test_fingerprint_is_empty_without_a_profile(monkeypatch):
    _profile(monkeypatch, None)
    assert outbound_guard.private_fingerprint() == set()


def test_fingerprint_is_empty_on_a_db_error(monkeypatch):
    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(outbound_guard.queries, "get_profile", boom)
    assert outbound_guard.private_fingerprint() == set()


def test_fingerprint_feeds_the_firewall(monkeypatch):
    # End-to-end: the real fingerprint blocks an outbound request leaking the name.
    _profile(monkeypatch, {"name": "Jane", "surname": "Doe"})
    with pytest.raises(OutboundLeakError):
        outbound_guard.assert_safe("cover letter by Jane Doe")
