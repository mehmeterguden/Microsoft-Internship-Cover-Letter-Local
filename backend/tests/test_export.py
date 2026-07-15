"""Cover-letter export — valid .docx / .pdf bytes and paragraph splitting."""

from __future__ import annotations

import pytest

from core import export

SENDER = {
    "name": "Jane", "surname": "Doe", "email": "jane@example.com",
    "phone": None, "linkedin": "linkedin.com/in/jane", "github": None,
}
LETTER = "Dear hiring team,\n\nI would love to join.\nI build things.\n\nRegards,\nJane"


def test_docx_is_a_valid_zip_package():
    data, media = export.render("docx", LETTER, company="Acme", role="Engineer", sender=SENDER)
    assert media.endswith("wordprocessingml.document")
    assert data[:2] == b"PK"  # .docx is a zip container
    assert len(data) > 500


def test_pdf_has_pdf_magic():
    data, media = export.render("pdf", LETTER, company="Acme", role=None, sender=SENDER)
    assert media == "application/pdf"
    assert data[:5] == b"%PDF-"
    assert len(data) > 500


def test_unsupported_format_raises():
    with pytest.raises(ValueError):
        export.render("rtf", "x", company=None, role=None, sender={})


def test_paragraph_split_collapses_blank_runs():
    assert export._paragraphs("a\n\nb\n\n\nc") == ["a", "b", "c"]


def test_export_tolerates_missing_sender_fields():
    # Empty sender + no recipient must still produce a document, not crash.
    data, _ = export.render("pdf", "Body only.", company=None, role=None, sender={})
    assert data[:5] == b"%PDF-"
