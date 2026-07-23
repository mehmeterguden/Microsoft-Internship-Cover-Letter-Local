"""Local text embeddings — on-device, no data leaves the machine.

Two backends, chosen in settings (`embedding_provider`):

  • sentence_transformers (default) — loads the model named in settings
    (default `all-MiniLM-L6-v2`) once and reuses it. First load downloads weights
    from Hugging Face; after that it's fully offline.
  • foundry_local — calls a Microsoft Foundry Local embedding model over its
    OpenAI-compatible `/embeddings` API (on-device, ONNX Runtime). If Foundry is
    unreachable or errors, we **fall back** to sentence-transformers so embeddings
    keep working.

Either way vectors are L2-normalized (cosine-ready) and produced with the same
`embed`/`embed_one` signatures, so ChromaDB (`core/vector_store.py`) and every
caller are unaffected. The heavy dep (sentence-transformers / torch) stays
optional at runtime: `available()` lets callers degrade gracefully.
"""

from __future__ import annotations

import math
from functools import lru_cache

from db import queries

_DEFAULT_MODEL = "all-MiniLM-L6-v2"
_DEFAULT_FOUNDRY_BASE_URL = "http://localhost:5273/v1"


# ── settings helpers ─────────────────────────────────────────────

def _settings() -> dict:
    try:
        return queries.get_settings()
    except Exception:  # noqa: BLE001 — before init / in odd states, assume defaults
        return {}


def _provider() -> str:
    return (_settings().get("embedding_provider") or "sentence_transformers").strip()


def _model_name() -> str:
    return (_settings().get("embedding_model") or "").strip() or _DEFAULT_MODEL


def _foundry_base_url() -> str:
    return (_settings().get("embedding_base_url") or "").strip() or _DEFAULT_FOUNDRY_BASE_URL


def _st_available() -> bool:
    """True if sentence-transformers is installed and importable."""
    try:
        import sentence_transformers  # noqa: F401

        return True
    except Exception:  # noqa: BLE001 — any import/loader failure means "not available"
        return False


def available() -> bool:
    """True when we can produce embeddings: sentence-transformers is installed, or
    the user chose the Foundry Local backend (which needs only a running server)."""
    return _st_available() or _provider() == "foundry_local"


# ── sentence-transformers backend ────────────────────────────────

@lru_cache(maxsize=2)
def _load(model_name: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def _st_embed(texts: list[str]) -> list[list[float]]:
    model = _load(_model_name())
    return model.encode(texts, normalize_embeddings=True).tolist()


# ── Foundry Local backend (OpenAI-compatible /embeddings) ────────

@lru_cache(maxsize=2)
def _foundry_client(base_url: str):
    from openai import OpenAI

    return OpenAI(base_url=base_url, api_key="not-needed", timeout=120.0)


def _normalize(vec: list[float]) -> list[float]:
    """L2-normalize a vector so cosine similarity works (matches the ST backend)."""
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec] if norm else vec


def _foundry_embed(texts: list[str]) -> list[list[float]]:
    client = _foundry_client(_foundry_base_url())
    resp = client.embeddings.create(model=_model_name(), input=texts)
    return [_normalize(list(item.embedding)) for item in resp.data]


# ── public API (stable signatures) ───────────────────────────────

def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts into normalized vectors, using the configured backend.

    Foundry Local is tried first when selected; on any failure it falls back to
    sentence-transformers so retrieval keeps working."""
    if not texts:
        return []
    if _provider() == "foundry_local":
        try:
            return _foundry_embed(texts)
        except Exception:  # noqa: BLE001 — endpoint down / model missing → fall back
            if not _st_available():
                raise  # no fallback available; surface the original error
            return _st_embed(texts)
    return _st_embed(texts)


def embed_one(text: str) -> list[float]:
    """Embed a single text into a normalized vector."""
    return embed([text])[0]
