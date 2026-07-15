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


def reset() -> None:
    """Drop and recreate every collection — wipes all indexed embeddings."""
    client = get_client()
    for name in COLLECTIONS:
        try:
            client.delete_collection(name)
        except Exception:  # noqa: BLE001 — absent collection is fine
            pass
    init_collections()


# ── Low-level ops (embeddings are produced elsewhere and passed in) ──

def delete_where(name: str, where: dict) -> None:
    """Remove documents matching a metadata filter (idempotent)."""
    collection = get_collection(name)
    try:
        collection.delete(where=where)
    except Exception:  # noqa: BLE001 — deleting from an empty/absent set is a no-op
        pass


def add(
    name: str,
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict],
) -> None:
    """Upsert documents with their precomputed embeddings and metadata."""
    if not ids:
        return
    get_collection(name).upsert(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)


def all_documents(name: str, where: dict | None = None) -> list[dict]:
    """Return every stored document (no vector query) as [{id, document, metadata}].

    Used by hybrid retrieval to run lexical BM25 over the full corpus alongside
    the dense query. []-safe on an empty collection.
    """
    collection = get_collection(name)
    if collection.count() == 0:
        return []
    result = collection.get(where=where or None)
    ids = result.get("ids") or []
    docs = result.get("documents") or []
    metas = result.get("metadatas") or []
    return [
        {"id": i, "document": d, "metadata": m}
        for i, d, m in zip(ids, docs, metas)
    ]


def query(
    name: str, query_embedding: list[float], *, n_results: int = 3, where: dict | None = None
) -> list[dict]:
    """Return the nearest documents to an embedding as [{document, metadata, distance}]."""
    collection = get_collection(name)
    if collection.count() == 0:
        return []
    result = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),
        where=where or None,
    )
    docs = (result.get("documents") or [[]])[0]
    metas = (result.get("metadatas") or [[]])[0]
    dists = (result.get("distances") or [[]])[0]
    return [
        {"document": d, "metadata": m, "distance": dist}
        for d, m, dist in zip(docs, metas, dists)
    ]
