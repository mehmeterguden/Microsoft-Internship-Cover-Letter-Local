"""Turn an uploaded document (PDF, image, or Word) into plain text.

Each source type is read differently:
  • PDF   — positioned glyphs; pdfplumber reconstructs reading-order text per page.
  • image — no text at all; Tesseract OCR reads the pixels (screenshots, photos).
  • Word  — flowed paragraphs; python-docx reads the .docx body.

All three become a list of page texts, which `extract` shapes uniformly:
  • one page (images, Word, single-page PDFs):  {"text": "...", ...}      — no pages list
  • many pages (multi-page PDFs):               {"pages": [{...}, ...], ...} — no joined text

No LLM structuring here — this only shows what was read.
"""

from __future__ import annotations

import io
import shutil
from typing import Any

import docx
import pdfplumber
import pytesseract
from PIL import Image


def ocr_available() -> bool:
    """True if the Tesseract OCR binary is installed and on PATH."""
    return shutil.which("tesseract") is not None

PDF_EXT = (".pdf",)
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".heic")
WORD_EXT = (".docx",)
WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def detect_type(filename: str | None, content_type: str | None) -> str | None:
    """Classify an upload as 'pdf' | 'image' | 'word', or None if unsupported."""
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if name.endswith(PDF_EXT) or ct == "application/pdf":
        return "pdf"
    if name.endswith(IMAGE_EXT) or ct.startswith("image/"):
        return "image"
    if name.endswith(WORD_EXT) or ct == WORD_MIME:
        return "word"
    return None


def _pdf_pages(data: bytes) -> list[str]:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return [(page.extract_text() or "") for page in pdf.pages]


def _image_text(data: bytes) -> str:
    return pytesseract.image_to_string(Image.open(io.BytesIO(data)))


def _word_text(data: bytes) -> str:
    document = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs)


def _page(number: int, text: str) -> dict[str, Any]:
    return {"page": number, "text": text, "char_count": len(text), "word_count": len(text.split())}


def _shape(source_type: str, pages: list[str]) -> dict[str, Any]:
    """One page → flat text; many pages → each page separately. Never both."""
    if len(pages) <= 1:
        text = pages[0] if pages else ""
        return {
            "source_type": source_type,
            "num_pages": 1,
            "text": text,
            "char_count": len(text),
            "word_count": len(text.split()),
        }
    return {
        "source_type": source_type,
        "num_pages": len(pages),
        "pages": [_page(i, t) for i, t in enumerate(pages, start=1)],
    }


def extract(filename: str | None, content_type: str | None, data: bytes) -> dict[str, Any]:
    """Extract text from a supported document. Raises ValueError if unsupported."""
    source_type = detect_type(filename, content_type)
    if source_type == "pdf":
        pages = _pdf_pages(data)
    elif source_type == "image":
        pages = [_image_text(data)]
    elif source_type == "word":
        pages = [_word_text(data)]
    else:
        raise ValueError("Unsupported file type — upload a PDF, image, or Word (.docx) file.")
    return _shape(source_type, pages)
