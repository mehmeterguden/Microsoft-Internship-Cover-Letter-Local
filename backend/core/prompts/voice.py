"""Prompt for the deep voice analysis — reverse-engineer how a person writes.

Given the applicant's own past cover letters, the model produces a detailed,
structured "voice fingerprint" as JSON: not just tone, but how they present
themselves, the exact phrases and words they reuse, how they build an argument,
what they emphasize, and what they never do. The generator later uses this so a
new letter reads as if the same person wrote it.

Signature phrases and vocabulary must be grounded in the actual text — quoted or
lightly normalized, never invented.
"""

from __future__ import annotations

from core.llm.base import Message

_SYSTEM = (
    "You are a forensic writing analyst. Given several cover letters written by ONE "
    "person, you reverse-engineer their writing voice in precise detail so another "
    "writer could reproduce it convincingly. You ground every observation in the "
    "actual text — especially signature_phrases and vocabulary, which must be taken "
    "from what they truly wrote, never invented. You return strict JSON only."
)

VOICE_JSON_SCHEMA = """{
  "summary": string,             // 2-4 sentences: how this person writes AND thinks — their voice, addressed as "You…"
  "self_presentation": string,   // how they frame themselves and their experience (humble? bold? story-led? results-led?)
  "tone": string,                // nuanced tone (e.g. "warm but precise, quietly confident, a little playful")
  "signature_phrases": [string], // 4-8 exact phrases/expressions they reuse or that are distinctly theirs (from the text)
  "vocabulary": [string],        // 6-12 characteristic words/terms they favor
  "sentence_patterns": string,   // how they construct sentences (length, rhythm, punctuation habits like em-dashes)
  "rhetorical_moves": string,    // how they build an argument (open with a story? lead with impact? contrast? questions?)
  "emphasis": [string],          // what they consistently highlight (e.g. "craft", "shipping", "users", "metrics", "ownership")
  "opening_habits": string,      // how they tend to open a letter
  "closing_habits": string,      // how they tend to close
  "avoid": [string]              // clichés/phrasings they never use and the generator must also avoid
}"""


def build_analysis_messages(corpus: str) -> list[Message]:
    """Build the messages that turn a corpus of past letters into a voice fingerprint."""
    user = (
        "Here are cover letters written by one person. Study them and return the voice "
        "fingerprint.\n\n"
        f"=== THEIR PAST COVER LETTERS ===\n{corpus}\n\n"
        f"Return ONLY this JSON object:\n{VOICE_JSON_SCHEMA}\n\n"
        "Rules: ground signature_phrases and vocabulary strictly in the text above. "
        "Be specific and concrete — vague adjectives are useless. If something is not "
        "evident, use an empty string or empty list rather than guessing."
    )
    return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
