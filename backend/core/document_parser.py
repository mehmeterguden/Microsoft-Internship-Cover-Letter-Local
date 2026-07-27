"""Turn an uploaded document (PDF, image, Word, or plain text) into plain text.

Each source type is read differently:
  • PDF   — pdfplumber or pypdf reconstructs page text.
  • image — Tesseract OCR reads the pixels (screenshots, photos).
  • Word  — python-docx reads the .docx body.
  • text  — plain text / markdown file decoded directly.

All become a list of page texts, which `extract` shapes uniformly.
"""

from __future__ import annotations

import io
import shutil
from typing import Any

def ocr_available() -> bool:
    """True if the Tesseract OCR binary is installed and on PATH."""
    return shutil.which("tesseract") is not None

PDF_EXT = (".pdf",)
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".heic")
WORD_EXT = (".docx", ".doc")
TEXT_EXT = (".txt", ".md", ".text", ".rst", ".log", ".csv", ".json")
WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def detect_type(filename: str | None, content_type: str | None) -> str | None:
    """Classify an upload as 'pdf' | 'image' | 'word' | 'text', or None if unsupported."""
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if name.endswith(PDF_EXT) or ct == "application/pdf":
        return "pdf"
    if name.endswith(IMAGE_EXT) or ct.startswith("image/"):
        return "image"
    if name.endswith(WORD_EXT) or "wordprocessingml" in ct or "msword" in ct:
        return "word"
    if name.endswith(TEXT_EXT) or ct.startswith("text/"):
        return "text"
    return None


def _pdf_pages(data: bytes) -> list[str]:
    # Try pdfplumber first
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [(page.extract_text() or "") for page in pdf.pages]
            if any(p.strip() for p in pages):
                return pages
    except Exception:
        pass

    # Fallback to pypdf
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return [(page.extract_text() or "") for page in reader.pages]
    except Exception as exc:
        raise ValueError(f"Could not read PDF file: {exc}") from exc


def _image_text(data: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image
        text = pytesseract.image_to_string(Image.open(io.BytesIO(data)))
        if text and text.strip():
            return text.strip()
    except Exception:
        pass
    return ""


def _word_text(data: bytes) -> str:
    import docx
    document = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs)


def _plain_text(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="ignore")


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
        "text": "\n\n".join(pages),
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
    elif source_type == "text":
        pages = [_plain_text(data)]
    else:
        raise ValueError("Unsupported file type — upload a PDF, Word, image, or text file.")
    return _shape(source_type, pages)
