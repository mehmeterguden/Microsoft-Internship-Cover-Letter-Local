"""Local PII scanner — flag personal / sensitive identifiers in text.

Regex-based and fully local (no network). Used to warn the user before they
send or export a cover letter that echoes sensitive data (e.g. an SSN or card
number the model may have produced). Honors the `pii_shield` setting:

    off         → never scan (returns no findings)
    risky_only  → only high-severity findings (SSN, card, IBAN)   ← default
    on          → all findings (also email, phone, IP address)

Findings are grouped by type and every sample is masked, so the scan result is
safe to show in the UI without re-exposing the raw value.
"""

from __future__ import annotations

import re

from core.llm.base import Message
from typing import Any, Literal

Mode = Literal["off", "risky_only", "on"]

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b")
_IPV4 = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
_CARD_CAND = re.compile(r"\b\d(?:[ -]?\d){12,18}\b")
_PHONE_CAND = re.compile(r"(?<![\w.])\+?\d[\d\s().-]{8,16}\d(?![\w.])")

_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _digits(raw: str) -> str:
    return re.sub(r"\D", "", raw)


def _luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def _mask_tail(raw: str, keep: int = 4) -> str:
    tail = _digits(raw)[-keep:]
    return f"•••• {tail}" if tail else "••••"


def _mask_email(raw: str) -> str:
    local, _, domain = raw.partition("@")
    tld = domain.rsplit(".", 1)[-1] if "." in domain else ""
    head = local[0] if local else ""
    return f"{head}•••@•••.{tld}" if tld else f"{head}•••@•••"


def scan(text: str, mode: Mode = "on") -> list[dict[str, Any]]:
    """Return grouped, masked PII findings in ``text`` per the shield ``mode``.

    Each finding: ``{type, label, severity, count, samples: [masked, ...]}``.
    High-severity detectors run first so their spans suppress weaker overlapping
    matches (e.g. a card number is never also counted as a phone number).
    """
    if mode == "off" or not text:
        return []

    findings: dict[str, dict[str, Any]] = {}
    covered: list[tuple[int, int]] = []

    def add(type_: str, label: str, severity: str, sample: str, span: tuple[int, int]) -> None:
        for start, end in covered:
            if not (span[1] <= start or span[0] >= end):
                return  # overlaps an already-claimed match
        covered.append(span)
        entry = findings.setdefault(
            type_, {"type": type_, "label": label, "severity": severity, "count": 0, "samples": []}
        )
        entry["count"] += 1
        if len(entry["samples"]) < 3 and sample not in entry["samples"]:
            entry["samples"].append(sample)

    # ── high severity ──
    for m in _SSN.finditer(text):
        add("ssn", "Social Security number", "high", _mask_tail(m.group()), m.span())
    for m in _CARD_CAND.finditer(text):
        digits = _digits(m.group())
        if 13 <= len(digits) <= 19 and _luhn_ok(digits):
            add("credit_card", "Payment card number", "high", _mask_tail(m.group()), m.span())
    for m in _IBAN.finditer(text):
        if len(_digits(m.group())) >= 6:  # a real IBAN has several digits, not just the checksum
            add("iban", "Bank account (IBAN)", "high", _mask_tail(m.group()), m.span())

    if mode == "risky_only":
        return _ordered(findings)

    # ── medium / low severity (mode == "on") ──
    for m in _EMAIL.finditer(text):
        add("email", "Email address", "medium", _mask_email(m.group()), m.span())
    for m in _PHONE_CAND.finditer(text):
        if 10 <= len(_digits(m.group())) <= 15:
            add("phone", "Phone number", "medium", _mask_tail(m.group()), m.span())
    for m in _IPV4.finditer(text):
        add("ip_address", "IP address", "low", _mask_tail(m.group().replace(".", ""), keep=3), m.span())

    return _ordered(findings)


def _ordered(findings: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(findings.values(), key=lambda f: (_SEVERITY_RANK[f["severity"]], f["type"]))


# ══════════════════════════════════════════════════════════════════
# Gateway redaction — strip contact-level PII before it leaves the device.
# Applied by the LLM gateway ONLY for cloud providers; local providers always
# receive the original text. Professional substance is deliberately preserved.
# ══════════════════════════════════════════════════════════════════

EMAIL = "[redacted-email]"
PHONE = "[redacted-phone]"
ADDRESS = "[redacted-address]"
ID = "[redacted-id]"

# ── Email ──
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")

# ── Street address: number + (optional street words) + a street-type suffix,
#    plus an optional unit. Case-insensitive; abbreviations allowed with a dot. ──
_STREET_RE = re.compile(
    r"\b\d{1,6}\s+(?:[A-Za-z0-9.'\-]+\s+){0,4}"
    r"(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|"
    r"Way|Terrace|Ter|Place|Pl|Square|Sq|Highway|Hwy|Parkway|Pkwy|Close|Crescent)\b\.?"
    r"(?:\s*(?:#|Apt\.?|Suite|Ste\.?|Unit|Floor|Fl\.?)\s*[\w\-]+)?",
    re.IGNORECASE,
)

# ── Long precise IDs (credit-card / passport-like: 13–19 digits, maybe grouped) ──
_LONG_ID_RE = re.compile(r"(?<![\w.])\d(?:[\d \-]{11,17})\d(?![\w.])")

# ── Phone candidate: a run of digits with common separators. Validated below. ──
_PHONE_RE = re.compile(r"(?<![\w])(\+?\(?\d[\d\s().\-]{5,}\d)(?![\w])")


def _phone_sub(match: re.Match[str]) -> str:
    raw = match.group(0)
    digits = re.sub(r"\D", "", raw)
    has_marker = raw.lstrip().startswith("+") or "(" in raw
    has_separator = bool(re.search(r"[ ().\-]", raw))
    # Real phone: 7–15 digits AND either an explicit +/area-code marker, or a
    # formatted run (>= 9 digits with separators). This keeps 8-digit year ranges
    # ("2019-2023") and bare large metrics ("1000000000 downloads") from matching.
    if 7 <= len(digits) <= 15 and (has_marker or (len(digits) >= 9 and has_separator)):
        return PHONE
    return raw


def redact_text(text: str) -> str:
    """Return `text` with contact-level PII replaced by stable placeholders."""
    if not text:
        return text
    text = _EMAIL_RE.sub(EMAIL, text)
    text = _STREET_RE.sub(ADDRESS, text)
    text = _PHONE_RE.sub(_phone_sub, text)
    text = _LONG_ID_RE.sub(ID, text)  # contiguous credit-card / passport-like IDs
    return text


def redact_messages(messages: list[Message]) -> list[Message]:
    """Return a NEW message list with each message's content redacted.

    Roles are preserved; the caller's list/messages are never mutated."""
    return [{**m, "content": redact_text(m.get("content", ""))} for m in messages]
