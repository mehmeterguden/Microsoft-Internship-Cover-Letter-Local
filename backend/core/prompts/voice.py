"""Prompt for the deep voice analysis — reverse-engineer how a person writes.

Given ALL of the applicant's past cover letters, the model produces a detailed,
grounded "voice fingerprint" as JSON. It is strict about EVIDENCE: if the text
isn't genuinely a cover letter (gibberish, placeholder, or too short to reveal a
voice), it must report `enough_signal=false` and leave the analysis empty instead
of inventing a personality. The generator later uses this — alongside RAG
retrieval of the most relevant past passages — so a new letter reads like them.
"""

from __future__ import annotations

from core.llm.base import Message

_SYSTEM = (
    "You are a forensic writing analyst. Given ALL of the cover letters written by ONE "
    "person, you reverse-engineer their writing voice in precise, reproducible detail so "
    "another writer could convincingly write as them.\n\n"
    "EVIDENCE IS EVERYTHING. Only state what the text actually supports:\n"
    "- If the input is NOT a real cover letter — random characters/keyboard mash, "
    "placeholder text, a few disconnected words, or simply too little to reveal a voice — "
    "set \"enough_signal\": false, put a one-sentence summary explaining there isn't enough "
    "to learn from, and leave EVERY other field empty (\"\" or []). Do NOT invent a tone, "
    "traits, phrases, or things they 'avoid'. Never place gibberish into any list.\n"
    "- signature_phrases, vocabulary, and example_sentences must be taken verbatim (or "
    "lightly normalized) from the real text — never fabricated.\n"
    "You return strict JSON only."
)

VOICE_JSON_SCHEMA = """{
  "enough_signal": boolean,      // false if the text isn't a real/large-enough letter to analyze
  "tagline": string,             // 3-6 words capturing the voice (e.g. "warm, craft-obsessed, ownership-driven")
  "summary": string,             // 3-5 sentences: how this person writes AND thinks — addressed as "You…"
  "self_presentation": string,   // how they frame themselves (humble? bold? story-led? results-led?)
  "tone": string,                // nuanced tone (e.g. "warm but precise, quietly confident")
  "formality": string,           // where they sit on formal↔casual, and how it shifts across letters
  "strengths": [string],         // 3-6 qualities they consistently foreground about themselves
  "themes": [string],            // 3-6 recurring topics/values they return to (e.g. "craft", "users", "impact")
  "emphasis": [string],          // 3-6 things they push in argument (metrics, ownership, shipping…)
  "signature_phrases": [string], // 4-8 SHORT (2-6 word) recurring expressions distinctly theirs — NOT whole sentences
  "vocabulary": [string],        // 8-14 single characteristic words/terms they favor (one or two words each)
  "sentence_patterns": string,   // how they build sentences (length, rhythm, punctuation like em-dashes)
  "rhetorical_moves": string,    // how they build an argument (open with a story? lead with impact? contrast?)
  "structure": string,           // how they structure a whole letter (opening → body → close pattern)
  "opening_habits": string,      // how they tend to open
  "closing_habits": string,      // how they tend to close
  "example_sentences": [string], // 2-4 verbatim FULL standout sentences that best capture their voice
  "avoid": [string]              // real clichés/buzzwords a writer like this would never use (e.g. "synergy",
                                 //   "rockstar", "game-changer") — NOT meta-comments about punctuation/formatting
}"""


def build_analysis_messages(corpus: str, count: int = 0) -> list[Message]:
    """Build the messages that turn a corpus of past letters into a voice fingerprint."""
    header = f"Here are {count} texts" if count else "Here is the text"
    user = (
        f"{header} the applicant pasted as their past cover letters, separated by lines of "
        "'---'. Study ALL of them together and return the voice fingerprint that generalizes "
        "across them.\n\n"
        f"=== PASTED TEXT ===\n{corpus}\n\n"
        f"Return ONLY this JSON object:\n{VOICE_JSON_SCHEMA}\n\n"
        "Rules: If this text is not genuinely cover-letter writing (gibberish, placeholder, or "
        "too short), set enough_signal=false and leave every other field empty — do not invent "
        "anything. Otherwise ground signature_phrases, vocabulary, and example_sentences strictly "
        "in the text (verbatim or lightly normalized), keep signature_phrases short and vocabulary "
        "to single terms, and be specific — vague adjectives are useless. Any field not clearly "
        "evident stays an empty string or empty list rather than a guess."
    )
    return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
