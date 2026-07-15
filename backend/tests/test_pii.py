"""Local PII scanner — detection, severity gating by mode, and masking."""

from __future__ import annotations

from core import pii


def test_ssn_is_high_severity_and_masked():
    out = pii.scan("My SSN is 123-45-6789 for the form.", "risky_only")
    ssn = next(f for f in out if f["type"] == "ssn")
    assert ssn["severity"] == "high"
    assert "123-45-6789" not in ssn["samples"][0]
    assert "6789" in ssn["samples"][0]


def test_valid_card_detected_via_luhn():
    out = pii.scan("Card 4111 1111 1111 1111 on file.", "risky_only")
    assert any(f["type"] == "credit_card" for f in out)


def test_invalid_card_number_ignored():
    # 4111…1112 fails the Luhn check → not a card (and 16 digits ≠ a phone).
    out = pii.scan("Ref 4111 1111 1111 1112 shipped.", "on")
    assert not any(f["type"] == "credit_card" for f in out)


def test_email_and_phone_only_in_on_mode():
    text = "Reach me at jane@example.com or +1 (555) 123-4567 anytime."
    assert pii.scan(text, "risky_only") == []  # medium severity is hidden
    kinds = {f["type"] for f in pii.scan(text, "on")}
    assert "email" in kinds and "phone" in kinds


def test_off_mode_returns_nothing():
    assert pii.scan("SSN 123-45-6789", "off") == []


def test_email_sample_is_masked():
    out = pii.scan("jane.doe@example.com", "on")
    email = next(f for f in out if f["type"] == "email")
    assert "jane.doe@example.com" not in email["samples"][0]
    assert email["samples"][0].endswith("com")


def test_card_is_not_double_counted_as_phone():
    kinds = [f["type"] for f in pii.scan("4111 1111 1111 1111", "on")]
    assert "credit_card" in kinds and "phone" not in kinds


def test_count_and_sample_cap():
    text = " ".join(f"a{i}@ex{i}.com" for i in range(6))
    email = next(f for f in pii.scan(text, "on") if f["type"] == "email")
    assert email["count"] == 6
    assert len(email["samples"]) <= 3  # samples are capped
