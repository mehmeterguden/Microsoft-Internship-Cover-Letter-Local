"""Groundedness check — does the letter only claim things the applicant's data backs up?

A letter that invents an employer, a title, or a metric is worse than useless. This
module extracts every checkable claim the letter makes *about the applicant* and
decides, for each, whether the local profile (CV + GitHub + profile) substantiates it.

Two signals, combined:

  1. ENTAILMENT (LLM): the model extracts each claim, quotes the exact span it comes
     from, judges support against the supplied applicant data, and cites the specific
     supporting fact. This is the primary signal.
  2. SIMILARITY (local, optional): when embeddings are available, a claim marked
     "supported" but with no cited evidence and no lexical/semantic overlap with the
     data is downgraded — a cheap guard against the model rubber-stamping a claim.

All applicant data stays local; only the claim-extraction call reaches the chosen
LLM provider (the same opt-in that applies to generation). The check never fabricates
support and never crashes on malformed model output (parse + repair via
`core.structured_output`)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from core import embeddings
from core import structured_output as so
from core.llm.base import Message
from db import queries

_MAX_LETTER_CHARS = 8000
_MAX_CORPUS_CHARS = 6000
_MAX_TOKENS = 2048
# Below this max cosine similarity to any evidence chunk, a "supported" claim that
# cites no concrete evidence is treated as unproven. Deliberately low — it only
# catches claims with essentially no basis in the data, not merely weak ones.
_SIMILARITY_FLOOR = 0.30


class Claim(BaseModel):
    """One checkable statement the letter makes about the applicant."""

    text: str
    quote: str = ""                      # verbatim excerpt from the letter this claim is drawn from
    supported: bool = False
    evidence: str | None = None          # the applicant-data fact that backs the claim, if any


class ClaimSet(BaseModel):
    claims: list[Claim] = Field(default_factory=list)


def check(text: str) -> dict[str, Any]:
    """Verify a letter against the applicant's data. Returns {claims: [...]}.

    Each claim: {text, supported, evidence?, span?:[start, end]}. `span` is included
    only when the model's quote is located verbatim in the letter."""
    chunks = _evidence_chunks()
    messages = _build_messages(text, chunks)
    result = so.structure(messages, ClaimSet, temperature=0.0, max_tokens=_MAX_TOKENS)
    if not result.ok or result.value is None:
        raise ValueError(f"The groundedness check returned an unreadable response: {result.error}")

    claims = _apply_similarity_guard(result.value.claims, chunks)
    return {"claims": [_to_out(claim, text) for claim in claims]}


# ─────────────────────────────────────────────────────────────
#  Prompt
# ─────────────────────────────────────────────────────────────

def _build_messages(text: str, chunks: list[str]) -> list[Message]:
    data_block = "\n".join(f"- {chunk}" for chunk in chunks) or "(no applicant data on file)"
    system = (
        "You verify a job-application cover letter against the applicant's real data. "
        "Extract every factual, checkable claim the letter makes ABOUT THE APPLICANT — "
        "skills, seniority, employers, roles, projects, achievements, technologies, numbers. "
        "Ignore generic pleasantries and any statement about the company or role; judge only "
        "claims about the applicant.\n\n"
        "For each claim decide, strictly, whether the APPLICANT DATA directly supports it:\n"
        "- supported = true ONLY when a specific fact in the data substantiates the claim. "
        "Cite that fact in `evidence`.\n"
        "- supported = false for anything the data does not clearly back — invented employers, "
        "titles, metrics, or skills, and vague claims with no basis. Leave `evidence` empty.\n"
        "Always copy the exact sentence or phrase from the letter the claim comes from into "
        "`quote` (verbatim, so it can be located in the text).\n\n"
        "Return ONLY a JSON object of this exact shape — no prose, no markdown, no code fences:\n"
        '{"claims": [{"text": "...", "quote": "...", "supported": true, "evidence": "..."}]}'
    )
    user = "\n".join(
        [
            "=== APPLICANT DATA (the only source of truth) ===",
            data_block[:_MAX_CORPUS_CHARS],
            "",
            "=== COVER LETTER ===",
            text.strip()[:_MAX_LETTER_CHARS],
        ]
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# ─────────────────────────────────────────────────────────────
#  Applicant-data corpus (all local)
# ─────────────────────────────────────────────────────────────

def _evidence_chunks() -> list[str]:
    """Flatten the local profile into short, self-contained evidence lines."""
    profile = queries.get_profile() or {}
    chunks: list[str] = []

    name = " ".join(p for p in (profile.get("name"), profile.get("surname")) if p)
    if name:
        chunks.append(f"Name: {name}")
    if profile.get("headline"):
        chunks.append(f"Headline: {profile['headline']}")
    if profile.get("summary"):
        chunks.append(f"Summary: {profile['summary']}")

    for skill in queries.list_all("skills"):
        if skill.get("name"):
            rating = skill.get("self_rating")
            chunks.append(f"Skill: {skill['name']}" + (f" (self-rated {rating}/5)" if rating else ""))

    for exp in queries.list_all("experiences"):
        title, company = exp.get("title"), exp.get("company")
        if title or company:
            desc = (exp.get("description") or "").strip().replace("\n", " ")[:300]
            line = f"Experience: {title or '?'} at {company or '?'}"
            chunks.append(line + (f" — {desc}" if desc else ""))

    for project in queries.list_all("projects"):
        if project.get("name"):
            desc = (project.get("description") or "").strip().replace("\n", " ")[:300]
            chunks.append(f"Project: {project['name']}" + (f" — {desc}" if desc else ""))

    for repo in queries.list_all("github_repos"):
        if repo.get("repo_name"):
            desc = (repo.get("description") or "").strip().replace("\n", " ")[:200]
            stars = repo.get("stars")
            line = f"GitHub repo: {repo['repo_name']}"
            if stars:
                line += f" ({stars} stars)"
            chunks.append(line + (f" — {desc}" if desc else ""))

    return chunks


# ─────────────────────────────────────────────────────────────
#  Similarity guard (local, optional)
# ─────────────────────────────────────────────────────────────

def _apply_similarity_guard(claims: list[Claim], chunks: list[str]) -> list[Claim]:
    """Downgrade a "supported" claim that cites no evidence and has no semantic overlap
    with the data. No-op when embeddings are unavailable or there is no data to compare."""
    suspect = [c for c in claims if c.supported and not (c.evidence or "").strip()]
    if not suspect or not chunks or not embeddings.available():
        return claims
    try:
        chunk_vecs = embeddings.embed(chunks)
        claim_vecs = embeddings.embed([c.text for c in suspect])
    except Exception:  # noqa: BLE001 — the guard is best-effort; never fail the check on it
        return claims

    for claim, vec in zip(suspect, claim_vecs):
        if _max_cosine(vec, chunk_vecs) < _SIMILARITY_FLOOR:
            claim.supported = False
    return claims


def _max_cosine(vec: list[float], others: list[list[float]]) -> float:
    """Max cosine similarity of `vec` against `others`. Vectors are pre-normalized, so
    cosine is a plain dot product."""
    return max((sum(a * b for a, b in zip(vec, other)) for other in others), default=0.0)


# ─────────────────────────────────────────────────────────────
#  Output shaping
# ─────────────────────────────────────────────────────────────

def _to_out(claim: Claim, text: str) -> dict[str, Any]:
    out: dict[str, Any] = {"text": claim.text, "supported": claim.supported}
    evidence = (claim.evidence or "").strip()
    if evidence:
        out["evidence"] = evidence
    span = _locate(text, claim.quote)
    if span is not None:
        out["span"] = list(span)
    return out


def _locate(text: str, quote: str) -> tuple[int, int] | None:
    """Find the model's quote in the letter → [start, end]. Tries an exact match, then a
    whitespace-insensitive match; returns None if the quote can't be located."""
    quote = (quote or "").strip()
    if not quote:
        return None
    start = text.find(quote)
    if start != -1:
        return start, start + len(quote)
    # Whitespace can differ (the model may re-wrap lines) — match on the first/last word.
    words = quote.split()
    if len(words) >= 2:
        first, last = text.find(words[0]), text.rfind(words[-1])
        if first != -1 and last != -1 and last >= first:
            return first, last + len(words[-1])
    return None
