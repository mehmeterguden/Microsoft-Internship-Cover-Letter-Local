"""Prompt for the deep voice analysis — reverse-engineer how a person writes.

Given ALL of the applicant's past cover letters, the model produces a detailed,
structured "voice fingerprint" as JSON: not just tone, but how they present
themselves, what they emphasize and value, the exact phrases and words they reuse,
how they structure and argue a letter, verbatim standout sentences, and what they
never do. The generator later uses this — alongside RAG retrieval of the most
relevant past passages — so a new letter reads as if the same person wrote it.

signature_phrases, vocabulary, and example_sentences MUST be grounded in the
actual text — quoted or lightly normalized, never invented.
"""

from __future__ import annotations

from core.llm.base import Message

_SYSTEM = (
    "You are a forensic writing analyst. Given ALL of the cover letters written by ONE "
    "person, you reverse-engineer their writing voice in precise, reproducible detail so "
    "another writer could convincingly write as them. Consider every letter provided and "
    "generalize across them. You ground concrete observations in the actual text — "
    "especially signature_phrases, vocabulary, and example_sentences, which must be taken "
    "verbatim (or lightly normalized) from what they truly wrote, never invented. You return "
    "strict JSON only."
)

VOICE_JSON_SCHEMA = """{
  "summary": string,             // 3-5 sentences: how this person writes AND thinks — their voice, addressed as "You…"
  "self_presentation": string,   // how they frame themselves (humble? bold? story-led? results-led?)
  "tone": string,                // nuanced tone (e.g. "warm but precise, quietly confident, a little playful")
  "formality": string,           // where they sit on formal↔casual, and how it shifts
  "strengths": [string],         // 3-6 strengths/qualities they consistently foreground about themselves
  "themes": [string],            // 3-6 recurring topics/values they return to (e.g. "craft", "users", "impact", "learning")
  "emphasis": [string],          // 3-6 things they consistently highlight in argument (metrics, ownership, shipping…)
  "signature_phrases": [string], // 4-8 exact phrases/expressions they reuse or that are distinctly theirs (from the text)
  "vocabulary": [string],        // 8-14 characteristic words/terms they favor
  "sentence_patterns": string,   // how they build sentences (length, rhythm, punctuation habits like em-dashes)
  "rhetorical_moves": string,    // how they build an argument (open with a story? lead with impact? contrast? questions?)
  "structure": string,           // how they structure a whole letter (opening → body → close pattern)
  "opening_habits": string,      // how they tend to open a letter
  "closing_habits": string,      // how they tend to close
  "example_sentences": [string], // 2-4 verbatim standout sentences from the letters that best capture their voice
  "avoid": [string]              // clichés/phrasings they never use and the generator must also avoid
}"""


def build_analysis_messages(corpus: str, count: int = 0) -> list[Message]:
    """Build the messages that turn a corpus of past letters into a voice fingerprint."""
    header = f"Here are {count} cover letters" if count else "Here are cover letters"
    user = (
        f"{header} written by one person, separated by lines of '---'. Study ALL of them "
        "together and return the voice fingerprint that generalizes across them.\n\n"
        f"=== THEIR PAST COVER LETTERS ===\n{corpus}\n\n"
        f"Return ONLY this JSON object:\n{VOICE_JSON_SCHEMA}\n\n"
        "Rules: ground signature_phrases, vocabulary, and example_sentences strictly in the "
        "text above (verbatim or lightly normalized). Be specific and concrete — vague "
        "adjectives are useless. If something isn't evident, use an empty string or empty "
        "list rather than guessing."
    )
    return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
