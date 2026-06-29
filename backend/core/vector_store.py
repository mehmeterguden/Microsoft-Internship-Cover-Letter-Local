"""ChromaDB collections — the local vector store for semantic retrieval.

Three collections back the RAG features. Embeddings are produced separately by
`core/embeddings.py` (sentence-transformers, all-MiniLM-L6-v2) and passed in
explicitly, so collections are created WITHOUT an embedding function.

The metadata contracts below are part of the data model: retrieval filters on
these keys, so keep them stable.

    profile        documents: CV / experience chunks
                   metadata:  {"source": "cv"|"experience"|"skill", "section": str}

    cover_letters  documents: past (rated) and generated letters
                   metadata:  {"type": "past"|"generated", "rating": int|None,
                               "job_type": str|None, "letter_id": int|None}

    companies      documents: company research summaries (cache)
                   metadata:  {"company": str, "researched_at": str}  # ISO date
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import chromadb

if TYPE_CHECKING:
    from chromadb.api.models.Collection import Collection

CHROMA_PATH = os.getenv("CHROMA_PATH", "./data/chroma")

# Collection names — the only valid collections in the app.
PROFILE = "profile"
COVER_LETTERS = "cover_letters"
COMPANIES = "companies"

COLLECTIONS = (PROFILE, COVER_LETTERS, COMPANIES)

_client = None


def get_client() -> chromadb.ClientAPI:
    """Return the persistent ChromaDB client (created once)."""
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
    return _client


def get_collection(name: str) -> Collection:
    """Get (creating if needed) one of the app's collections by name."""
    if name not in COLLECTIONS:
        raise ValueError(f"Unknown collection {name!r}; expected one of {COLLECTIONS}")
    return get_client().get_or_create_collection(name)


def init_collections() -> None:
    """Ensure all collections exist. Idempotent — safe to call on every startup."""
    client = get_client()
    for name in COLLECTIONS:
        client.get_or_create_collection(name)
