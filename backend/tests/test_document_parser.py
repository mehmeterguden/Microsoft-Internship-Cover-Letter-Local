"""Tests for document extraction — file-type detection and output shaping.

`detect_type` and `_shape` are pure functions. `extract` is exercised end-to-end
for Word by building a real .docx in memory (python-docx is a project dependency),
and its unsupported-type guard is checked. No network and no OCR binary required.
"""

from __future__ import annotations

import io

import docx
import pytest

from core import document_parser as dp


# ── detect_type ──

@pytest.mark.parametrize(
    "filename,content_type,expected",
    [
        ("resume.pdf", None, "pdf"),
        ("scan.PNG", None, "image"),           # extension match is case-insensitive
        ("cv.docx", None, "word"),
        (None, "application/pdf", "pdf"),
        (None, "image/jpeg", "image"),
        (None, dp.WORD_MIME, "word"),
        ("notes.txt", "text/plain", None),     # unsupported
        (None, None, None),                    # nothing to go on
    ],
)
def test_detect_type(filename, content_type, expected):
    assert dp.detect_type(filename, content_type) == expected


# ── _shape: single page → flat text; many pages → a pages list ──

def test_shape_single_page_is_flat_text():
    out = dp._shape("word", ["Hello world"])
    assert out["num_pages"] == 1
    assert out["text"] == "Hello world"
    assert out["char_count"] == 11 and out["word_count"] == 2
    assert "pages" not in out


def test_shape_no_pages_is_one_empty_page():
    out = dp._shape("image", [])
    assert out["num_pages"] == 1 and out["text"] == "" and out["char_count"] == 0


def test_shape_multi_page_lists_pages_without_joined_text():
    out = dp._shape("pdf", ["page one", "page two"])
    assert out["num_pages"] == 2
    assert "text" not in out                       # never both a joined text and pages
    assert [p["page"] for p in out["pages"]] == [1, 2]
    assert out["pages"][0]["text"] == "page one"
    assert out["pages"][1]["word_count"] == 2


# ── extract ──

def _docx_bytes(paragraphs: list[str]) -> bytes:
    document = docx.Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_extract_reads_word_paragraphs():
    data = _docx_bytes(["First line", "Second line"])
    out = dp.extract("cv.docx", None, data)
    assert out["source_type"] == "word"
    assert "First line" in out["text"] and "Second line" in out["text"]


def test_extract_rejects_an_unsupported_type():
    with pytest.raises(ValueError):
        dp.extract("data.csv", "text/csv", b"a,b,c")
