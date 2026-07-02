"""Local text embeddings — sentence-transformers, on-device, no network.

Loads the model named in settings (default `all-MiniLM-L6-v2`) once and reuses it.
The first load downloads the model weights from Hugging Face; after that it runs
entirely offline. Everything here stays on the machine — embeddings are never
sent anywhere.

The heavy dependency (sentence-transformers / torch) is optional at runtime:
`available()` lets callers degrade gracefully (style metrics still work without
embeddings; only exemplar retrieval needs them).
"""

from __future__ import annotations

from functools import lru_cache

from db import queries

_DEFAULT_MODEL = "all-MiniLM-L6-v2"


def available() -> bool:
    """True if sentence-transformers is installed and importable."""
    try:
        import sentence_transformers  # noqa: F401
        return True
    except Exception:  # noqa: BLE001 — any import/loader failure means "not available"
        return False


@lru_cache(maxsize=2)
def _load(model_name: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def _model_name() -> str:
    return (queries.get_settings().get("embedding_model") or "").strip() or _DEFAULT_MODEL


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts into normalized vectors (cosine-ready)."""
    if not texts:
        return []
    model = _load(_model_name())
    return model.encode(texts, normalize_embeddings=True).tolist()


def embed_one(text: str) -> list[float]:
    """Embed a single text into a normalized vector."""
    return embed([text])[0]
