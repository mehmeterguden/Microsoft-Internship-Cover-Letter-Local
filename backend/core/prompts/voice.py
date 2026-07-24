"""Prompt for the deep voice analysis — reverse-engineer how a person writes.

Given the applicant's past cover letters (each tagged with the rating they gave it,
best first) and — when re-learning — their existing fingerprint, the model produces
a detailed, grounded "voice fingerprint" as JSON: not just adjectives, but a
reproducible PLAYBOOK — the ordered moves of their openings and closings, how they
build the middle, and the phrases and words that are unmistakably theirs.

It is strict about EVIDENCE: if the text isn't genuinely a cover letter (gibberish,
placeholder, or too short to reveal a voice), it reports `enough_signal=false` and
leaves the analysis empty instead of inventing a personality.

Ratings steer it: letters the writer rated highly are the GOLD STANDARD to reproduce;
poorly-rated ones show what they do NOT want. When a prior fingerprint is supplied it
UPDATES that fingerprint with the new evidence rather than starting from scratch. The
generator later uses this — alongside RAG retrieval of the most relevant past passages
— so a new letter reads unmistakably like them.
"""

from __future__ import annotations

import json

from core.llm.base import Message

_CORPUS_CAP = 18000  # keep the highest-rated letters within the model's context budget

_SYSTEM = (
    "You are a forensic writing analyst. Given the cover letters written by ONE person, you "
    "reverse-engineer their writing voice into a precise, reproducible PLAYBOOK — so another "
    "writer could convincingly draft a brand-new letter as them.\n\n"
    "EVIDENCE IS EVERYTHING. Only state what the text actually supports:\n"
    "- If the input is NOT a real cover letter — random characters, placeholder/lorem text, a few "
    "disconnected words, or too little to reveal a voice — set \"enough_signal\": false, write a "
    "one-sentence summary saying there isn't enough to learn from, and leave EVERY other field "
    "empty (\"\" or []). Never invent a tone, traits, phrases, structure, or an avoid-list. Never "
    "place gibberish into any list.\n"
    "- signature_phrases, vocabulary, and example_sentences must be taken verbatim (or lightly "
    "normalized) from the real text — never fabricated.\n\n"
    "RATINGS ARE THE COMPASS. Each letter is tagged with the rating the writer gave it:\n"
    "- Rated 4-5 = the GOLD STANDARD. Weight these most; the voice you describe is THEIR voice.\n"
    "- Rated 1-2 = NEGATIVE examples. Infer what the writer dislikes and fold it into \"avoid\"; "
    "never let their weaknesses shape the positive fingerprint.\n"
    "- Unrated = supporting evidence.\n\n"
    "STRUCTURE IS MEMORIZED, NOT DESCRIBED. For the opening, the body, and the closing, extract the "
    "ordered MOVES — what each step DOES, in sequence — as a reusable skeleton a new letter can "
    "follow with entirely different content. Steps are imperatives ('Open with a concrete detail "
    "about the company'), not a paraphrase of any single letter.\n\n"
    "UPDATING. If a PRIOR FINGERPRINT is provided, treat it as your current best understanding and "
    "REVISE it: keep what still holds, sharpen what the new (especially highly-rated) letters "
    "clarify, and drop anything they contradict. Always return the full updated object.\n\n"
    "You return strict JSON only — no prose, no markdown fences."
)

VOICE_JSON_SCHEMA = """{
  "enough_signal": boolean,        // false if the text isn't a real/large-enough letter to analyze
  "tagline": string,               // 3-6 words capturing the voice (e.g. "warm, craft-obsessed, ownership-driven")
  "summary": string,               // 4-6 sentences: how this person writes AND thinks — addressed as "You…"
  "self_presentation": string,     // how they frame themselves (humble? bold? story-led? results-led?)
  "tone": string,                  // nuanced tone (e.g. "warm but precise, quietly confident")
  "formality": string,             // where they sit on formal↔casual, and how it shifts across letters
  "strengths": [string],           // 3-6 qualities they consistently foreground about themselves
  "themes": [string],              // 3-6 recurring topics/values they return to (e.g. "craft", "users", "impact")
  "emphasis": [string],            // 3-6 things they push in an argument (metrics, ownership, shipping…)
  "opening_structure": [string],   // 2-5 ordered MOVES of their opening, reusable as a skeleton, e.g.
                                   //   ["Hook with a concrete, specific detail about the company or role",
                                   //    "Name the exact role and where they found it",
                                   //    "One line on why THIS company, not a generic one"]
  "body_structure": [string],      // 2-5 ordered MOVES of the middle — how they build the case, e.g.
                                   //   ["Lead with the single most relevant story",
                                   //    "Back each claim with a concrete metric or outcome",
                                   //    "Tie the experience explicitly to the company's needs"]
  "closing_structure": [string],   // 2-4 ordered MOVES of their close — the reusable ending skeleton, e.g.
                                   //   ["Restate fit as a concrete contribution", "Forward-looking line", "Warm, confident sign-off"]
  "opening_habits": string,        // prose note: how they open (first words, what they never open with)
  "closing_habits": string,        // prose note: how they close (sign-off wording, call to action)
  "signature_phrases": [string],   // 4-8 SHORT (2-6 word) recurring expressions distinctly theirs — NOT whole sentences
  "vocabulary": [string],          // 8-14 single characteristic words/terms they favor (one or two words each)
  "sentence_patterns": string,     // how they build sentences (length, rhythm, punctuation like em-dashes)
  "rhetorical_moves": string,      // how they persuade (story-first? lead with impact? contrast? concede-then-pivot?)
  "structure": string,             // one-line summary of the whole-letter shape (opening → body → close)
  "example_sentences": [string],   // 2-4 verbatim FULL standout sentences that best capture their voice (prefer high-rated letters)
  "avoid": [string]                // real clichés/buzzwords a writer like this would never use, PLUS anything the
                                   //   low-rated letters reveal they dislike — NOT meta-comments about punctuation
}"""

# fields carried over from a prior fingerprint when priming an update (metrics/flags excluded)
_PRIOR_SKIP = {"llm_analyzed", "word_count", "length", "sentence_style", "pronoun_style", "enough_signal"}


def _format_corpus(letters: list[dict]) -> tuple[str, int]:
    """Render letters (best-rated first) into a rating-tagged, budget-capped corpus.

    Returns ``(text, count)``. Each block is headed with the writer's rating so the
    model can weight gold-standard letters and mine low-rated ones for the avoid-list."""
    blocks: list[str] = []
    n, used = 0, 0
    for row in letters:
        content = (row.get("content") or "").strip()
        if not content:
            continue
        remaining = _CORPUS_CAP - used
        if remaining <= 0:
            break
        if len(content) > remaining:
            content = content[:remaining].rstrip()
        ur, ar = row.get("user_rating"), row.get("ai_rating")
        if ur:
            tag = f"writer rated {ur}/5 {'★' * int(ur)}{'☆' * (5 - int(ur))}"
        elif ar:
            tag = f"unrated by writer · AI quality estimate {ar}/5"
        else:
            tag = "unrated"
        n += 1
        block = f"=== LETTER {n} · {tag} ===\n{content}"
        blocks.append(block)
        used += len(block) + 2
    return "\n\n".join(blocks), n


def build_analysis_messages(letters: list[dict], prior: dict | None = None) -> list[Message]:
    """Turn rating-tagged past letters into the voice-fingerprint analysis messages.

    `letters` are dict rows with ``content`` and optional ``user_rating``/``ai_rating``,
    best-rated first. `prior` is the existing fingerprint (as a dict) to UPDATE rather
    than rebuild from scratch."""
    corpus, count = _format_corpus(letters)
    header = "Here is 1 letter" if count == 1 else f"Here are {count} letters"

    prior_block = ""
    if prior:
        slim = {k: v for k, v in prior.items() if v and k not in _PRIOR_SKIP}
        if slim:
            prior_block = (
                "\n=== PRIOR FINGERPRINT — your current understanding; UPDATE it, don't restart ===\n"
                f"{json.dumps(slim, ensure_ascii=False, indent=2)}\n"
            )

    user = (
        f"{header} written by this one applicant, best-rated first and separated by '===' headers. "
        "Each header shows the rating the writer gave that letter — weight the high-rated ones most and "
        "treat low-rated ones as what they want to AVOID. Study them together and return the voice "
        "fingerprint that generalizes across them.\n"
        f"{prior_block}\n"
        f"=== LETTERS ===\n{corpus}\n\n"
        f"Return ONLY this JSON object:\n{VOICE_JSON_SCHEMA}\n\n"
        "Rules: If this text is not genuinely cover-letter writing (gibberish, placeholder, or too short), "
        "set enough_signal=false and leave every other field empty — invent nothing. Otherwise: ground "
        "signature_phrases, vocabulary, and example_sentences strictly in the text (verbatim or lightly "
        "normalized); make opening_structure / body_structure / closing_structure reusable step-by-step "
        "skeletons (what each move DOES, not a paraphrase of one letter); prefer high-rated letters for "
        "example_sentences; be concrete — vague adjectives are useless. Any field not clearly evident stays "
        "an empty string or empty list rather than a guess."
    )
    return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
