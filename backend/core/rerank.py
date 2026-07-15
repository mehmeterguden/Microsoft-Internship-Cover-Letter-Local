"""Hybrid-retrieval helpers: BM25 lexical scoring, Reciprocal Rank Fusion, and an
optional cross-encoder reranker.

Dense (embedding) retrieval alone misses exact-term matches; lexical BM25 alone
misses paraphrases. Fusing both rankings with RRF gets the strengths of each,
and an optional cross-encoder can re-order the shortlist for precision.

Everything is local. BM25 and RRF are dependency-free; the cross-encoder is
loaded lazily via sentence-transformers and degrades to a no-op (returns
``None``) if the library or model isn't available — so retrieval never breaks.
"""

from __future__ import annotations

import math
import re
from collections import Counter

_TOKEN = re.compile(r"[a-z0-9']+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def bm25_rank(query: str, docs: list[str], *, k1: float = 1.5, b: float = 0.75) -> list[str]:
    """Rank ``docs`` by Okapi BM25 relevance to ``query`` (best first).

    Only documents with a positive score are returned, so a query whose terms
    appear nowhere contributes an empty lexical ranking (dense then dominates).
    """
    if not docs:
        return []
    tokenized = [_tokenize(d) for d in docs]
    n = len(docs)
    avgdl = (sum(len(t) for t in tokenized) / n) or 1.0

    df: Counter[str] = Counter()
    for tokens in tokenized:
        for term in set(tokens):
            df[term] += 1

    query_terms = _tokenize(query)
    scored: list[tuple[int, float]] = []
    for i, tokens in enumerate(tokenized):
        tf = Counter(tokens)
        dl = len(tokens) or 1
        score = 0.0
        for term in query_terms:
            freq = tf.get(term, 0)
            if not freq:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * dl / avgdl))
        scored.append((i, score))

    scored.sort(key=lambda pair: -pair[1])
    return [docs[i] for i, score in scored if score > 0]


def rrf_fuse(rankings: list[list[str]], *, k: int = 60) -> list[str]:
    """Reciprocal Rank Fusion of several ranked lists into one order.

    Each item scores ``sum(1 / (k + rank))`` across the lists it appears in, so
    an item ranked highly by multiple retrievers rises to the top. ``k`` damps
    the influence of any single list's top positions (60 is the common default).
    """
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda item: -scores[item])


# ── optional cross-encoder ───────────────────────────────────────────

_CROSS_ENCODER = None
_CROSS_ENCODER_TRIED = False
_CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


def _load_cross_encoder():
    global _CROSS_ENCODER, _CROSS_ENCODER_TRIED
    if _CROSS_ENCODER_TRIED:
        return _CROSS_ENCODER
    _CROSS_ENCODER_TRIED = True
    try:
        from sentence_transformers import CrossEncoder

        _CROSS_ENCODER = CrossEncoder(_CROSS_ENCODER_MODEL)
    except Exception:  # noqa: BLE001 — library/model missing or offline → skip reranking
        _CROSS_ENCODER = None
    return _CROSS_ENCODER


def cross_encode(query: str, docs: list[str]) -> list[float] | None:
    """Relevance scores for each (query, doc) pair, or ``None`` if unavailable.

    Higher is more relevant. The caller sorts by these; ``None`` means "couldn't
    rerank" and the caller keeps the fused order.
    """
    if not docs:
        return None
    encoder = _load_cross_encoder()
    if encoder is None:
        return None
    try:
        scores = encoder.predict([(query, doc) for doc in docs])
        return [float(s) for s in scores]
    except Exception:  # noqa: BLE001 — never break retrieval on a scoring failure
        return None
