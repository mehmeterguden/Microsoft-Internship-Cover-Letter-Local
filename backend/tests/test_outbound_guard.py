"""Tests for the privacy firewall — the security-critical core of research.

These never touch the network. They pin down the one behaviour that must never
regress: private profile data cannot leave the machine in an outbound request.
The DB-backed fingerprint is monkeypatched so the tests are hermetic.
"""

from __future__ import annotations

import pytest

from core.research import outbound_guard
from core.research.outbound_guard import OutboundLeakError

FINGERPRINT = {"jane doe", "jane@example.com", "+1 555 0100", "in/janedoe"}


@pytest.fixture(autouse=True)
def _fixed_fingerprint(monkeypatch):
    monkeypatch.setattr(outbound_guard, "private_fingerprint", lambda: FINGERPRINT)


def test_public_query_is_allowed():
    # A normal company-research query carries no private data.
    outbound_guard.assert_safe("Microsoft company values and culture")


def test_email_leak_is_blocked():
    with pytest.raises(OutboundLeakError):
        outbound_guard.assert_safe("resume of jane@example.com for the role")


def test_name_leak_is_blocked():
    with pytest.raises(OutboundLeakError):
        outbound_guard.assert_safe("cover letter by Jane Doe")


def test_leak_is_case_insensitive():
    with pytest.raises(OutboundLeakError):
        outbound_guard.assert_safe("JANE@EXAMPLE.COM")


def test_leak_detected_across_multiple_args():
    # The URL is clean but the body leaks — still blocked.
    with pytest.raises(OutboundLeakError):
        outbound_guard.assert_safe("https://api.example.com/search", '{"q": "in/janedoe"}')


def test_empty_fingerprint_allows_everything(monkeypatch):
    # No profile imported yet → nothing to protect → never blocks.
    monkeypatch.setattr(outbound_guard, "private_fingerprint", set)
    outbound_guard.assert_safe("jane@example.com", "Jane Doe")


def test_generic_skill_words_are_not_flagged():
    # Skills like "python" legitimately appear in public job posts; they must not
    # be in the fingerprint and so must not block a query.
    outbound_guard.assert_safe("Senior Python engineer at Microsoft")
