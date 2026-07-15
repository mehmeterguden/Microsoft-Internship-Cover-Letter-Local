"""Hybrid-retrieval helpers — BM25 ranking, RRF fusion, graceful cross-encoder."""

from __future__ import annotations

from core import rerank


def test_bm25_ranks_term_matches_and_drops_non_matches():
    docs = [
        "I love hiking in the mountains",
        "Backend systems and relational databases",
        "I love databases and query tuning",
    ]
    ranked = rerank.bm25_rank("databases", docs)
    assert ranked  # at least the matching docs
    assert all("database" in d.lower() for d in ranked)  # only positive-score docs
    assert docs[0] not in ranked  # no query term → excluded


def test_bm25_empty_when_no_term_matches():
    assert rerank.bm25_rank("xylophone", ["cats and dogs", "birds"]) == []


def test_rrf_fuse_rewards_agreement_across_lists():
    a = ["y", "x", "z"]
    b = ["y", "x", "w"]
    fused = rerank.rrf_fuse([a, b])
    assert fused[0] == "y"  # top of both lists
    assert fused[1] == "x"  # second in both
    assert set(fused) == {"x", "y", "z", "w"}


def test_cross_encode_none_when_model_unavailable(monkeypatch):
    monkeypatch.setattr(rerank, "_load_cross_encoder", lambda: None)
    assert rerank.cross_encode("query", ["a doc"]) is None


def test_cross_encode_none_for_empty_docs():
    assert rerank.cross_encode("query", []) is None


def test_cross_encode_uses_encoder_scores(monkeypatch):
    class _FakeEncoder:
        def predict(self, pairs):
            return [0.1, 0.9]  # second pair scores higher

    monkeypatch.setattr(rerank, "_load_cross_encoder", lambda: _FakeEncoder())
    scores = rerank.cross_encode("q", ["d1", "d2"])
    assert scores == [0.1, 0.9]
