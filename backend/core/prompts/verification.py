"""Prompts for the groundedness verification pass and its grounded revision.

Two jobs:
  • `build_verify_messages` — audit a generated cover letter against the ONLY
    things we actually know about the applicant (their profile + the company
    research). Return a structured, per-claim verdict so the UI can show exactly
    what is and isn't backed by real data. This is a faithfulness/groundedness
    check, not a style critique.
  • `build_revise_messages` — rewrite the letter to remove or soften ONLY the
    claims the audit flagged as unsupported, touching nothing else.

The golden rule in both: the applicant's profile + the company research are the
sole source of truth. Anything the letter asserts that isn't backed by them is,
by definition, not grounded — no matter how plausible it sounds.
"""

from __future__ import annotations

# Exact JSON we want back from the audit. Kept compact and explicit for reliability.
_VERIFY_SCHEMA = """{
  "verdict": "grounded" | "review",          // "review" if ANY claim is unsupported (or several are partly)
  "summary": string,                          // one short sentence for the user, e.g. "Everything checks out against your profile."
  "claims": [
    {
      "text": string,                         // the specific claim, quoted or closely paraphrased from the letter
      "status": "supported" | "partly" | "unsupported",
      "note": string,                         // the evidence that backs it, OR what's missing/exaggerated
      "suggestion": string                    // proposed fix/rewording to accurately align this claim with the profile
    }
  ]
}"""

_VERIFY_SYSTEM = f"""You are a strict groundedness auditor for a job-application assistant. A cover letter \
was generated for the applicant; your job is to check every concrete claim in it against the ONLY \
information we actually have about them — their profile and the company research provided below. You \
are checking truthfulness/support, NOT writing quality or tone.

Analyze step by step, then output the result:
1. Extract every CONCRETE, checkable claim the letter makes — specifically: the applicant's skills, \
technologies, experience, roles, employers, education, projects, achievements, metrics/numbers, and \
any factual statement about the company. IGNORE generic filler that asserts nothing checkable (e.g. \
"I am excited to apply", "I am a strong communicator" with no specifics, greetings, closings).
2. For each claim, decide how well the provided profile/research supports it:
   - "supported": clearly backed by the profile or research.
   - "partly": related to something in the profile but overstated, generalized, or only loosely implied.
   - "unsupported": not present in the profile or research at all — i.e. invented.
3. For each "partly" or "unsupported" claim, provide a "suggestion" with the exact reworded sentence or correction that aligns with the profile.
4. Set "verdict" to "review" if ANY claim is "unsupported" (or several are "partly"), otherwise "grounded".

Output rules — follow exactly:
- Reply with ONE JSON object only. No prose, no markdown, no code fences.
- Use exactly this shape:
{_VERIFY_SCHEMA}
- Judge ONLY against the provided profile + research. Do NOT use outside knowledge and do NOT give the \
letter the benefit of the doubt — if the support isn't in the context, the claim is "unsupported".
- Keep "note" short and concrete: name the profile item that backs a claim, or say exactly what is \
missing/exaggerated.
- If the letter makes no checkable claims, return "verdict": "grounded" with an empty "claims" list.
- Write "summary", "note", and "suggestion" in the language of the letter."""


def build_verify_messages(
    letter: str, profile_context: str, research_context: str | None
) -> list[dict[str, str]]:
    """Messages for auditing a letter's groundedness against the applicant's data."""
    known = f"== APPLICANT PROFILE (the source of truth) ==\n{profile_context or '(empty profile)'}"
    if research_context:
        known += f"\n\n== COMPANY RESEARCH (also trusted) ==\n{research_context}"
    return [
        {"role": "system", "content": _VERIFY_SYSTEM},
        {
            "role": "user",
            "content": f"{known}\n\n== COVER LETTER TO AUDIT ==\n{letter}\n\nAudit it now.",
        },
    ]


_REVISE_SYSTEM = """You revise a cover letter to make it fully truthful. You are given the letter, the \
applicant's real profile + company research, and a list of claims an audit flagged as unsupported or \
exaggerated.

Rules:
- Rewrite ONLY to fix the flagged claims: delete an invented claim, or soften an exaggerated one down \
to what the profile actually supports. Leave every well-grounded sentence, the structure, and the \
voice untouched.
- Never introduce NEW claims and never add facts that aren't in the profile/research.
- Keep it a natural, complete cover letter — don't leave dangling references to something you removed.
- Reply with ONLY the revised letter text. No preamble, no labels, no quotes, no markdown.
- Keep the language of the original letter."""


def build_revise_messages(
    letter: str, profile_context: str, research_context: str | None, flagged: list[dict]
) -> list[dict[str, str]]:
    """Messages to rewrite a letter, fixing only the flagged (ungrounded) claims."""
    known = f"== APPLICANT PROFILE (the source of truth) ==\n{profile_context or '(empty profile)'}"
    if research_context:
        known += f"\n\n== COMPANY RESEARCH (also trusted) ==\n{research_context}"
    flag_lines = "\n".join(
        f"- [{c.get('status', 'unsupported')}] {c.get('text', '')}"
        + (f" — {c.get('note')}" if c.get("note") else "")
        for c in flagged
    ) or "(none)"
    return [
        {"role": "system", "content": _REVISE_SYSTEM},
        {
            "role": "user",
            "content": (
                f"{known}\n\n== CLAIMS TO FIX ==\n{flag_lines}\n\n"
                f"== CURRENT LETTER ==\n{letter}\n\nReturn the corrected letter only."
            ),
        },
    ]
