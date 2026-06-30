"""ChromaDB collections — the local vector store for semantic retrieval.

Three collections back the RAG features. Embeddings are produced separately by
`core/embeddings.py` (sentence-transformers, all-MiniLM-L6-v2) and passed in
explicitly, so collections are created WITHOUT an embedding function.

The metadata contracts below are part of the data model: retrieval filters on
these keys, so keep them stable.

    profile        documents: profile text chunks (CV, experience, projects,
                              education, certificates, skill notes)
                   metadata:  {"source": "cv"|"experience"|"project"|"education"
                                          |"certificate"|"skill", "ref_id": int|None}

    cover_letters  documents: past (rated) and generated letters
                   metadata:  {"type": "past"|"generated", "ai_rating": int|None,
                               "user_rating": int|None, "letter_id": int|None}

    companies      documents: company research summaries (cache)  [Phase B]
                   metadata:  {"company": str, "researched_at": str}  # ISO date
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import chromadb

import config

if TYPE_CHECKING:
    from chromadb.api.models.Collection import Collection

CHROMA_PATH = config.CHROMA_PATH

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
