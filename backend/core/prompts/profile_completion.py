"""Prompts for AI profile completion.

Three jobs, three prompts:
  • `build_suggestions_messages` — one JSON call that proposes values for every
    short/factual/enumerated gap at once (identity fields, spoken languages, skill
    categories & ratings, per-item enums/dates). Fixed shape → reliable to parse.
  • `build_draft_messages` — stream a single free-text field (summary, a role or
    project description) as grounded prose.
  • `build_refine_messages` — revise an existing draft following the user's
    instruction (e.g. "shorter", "more technical", or a custom note).

The golden rule everywhere: ground every suggestion in the supplied CV text,
GitHub repos, and existing profile. Never invent employers, dates, credentials,
or facts that aren't supported. A weak guess should be left empty, not fabricated.
"""

from __future__ import annotations

# ── Shared context block ─────────────────────────────────────────

def _context_block(context: str) -> str:
    """Wrap the assembled source material for a prompt."""
    return (
        "Here is everything known about the user — their current profile, the text "
        "of their CV, and their GitHub repositories. Base every answer strictly on "
        "this.\n\n"
        f"{context}"
    )


# ── 1. Structured suggestions (one JSON call) ────────────────────

_SUGGESTIONS_SCHEMA = """{
  "identity":  { "<field>": string, ... },   // only the identity fields listed below; omit any you can't ground
  "languages": [ { "name": string, "proficiency": "native"|"fluent"|"professional"|"intermediate"|"basic" } ],
  "skills_categories": { "<skill name>": string, ... },   // a tidy group for each listed skill
  "skills_ratings":    { "<skill name>": 1-5, ... },      // honest self-rating estimate for each listed skill
  "skills_new":        [ { "name": string, "category": string, "self_rating": 1-5 } ],
  "items":  { "<step id>": string, ... },      // one value per listed step id (enums use the allowed value; dates "YYYY-MM")
  "drafts": { "<step id>": string, ... }       // grounded first-person prose for each free-text field listed
}"""

_SUGGESTIONS_SYSTEM = f"""You help a developer finish their professional profile. You are given their \
current profile, CV text, and GitHub repositories. Propose sensible values for the gaps described \
in the user message.

Output rules — follow exactly:
- Reply with ONE JSON object only. No prose, no markdown, no code fences.
- Use exactly this shape. Include every top-level key (use {{}} or [] when you have nothing):
{_SUGGESTIONS_SCHEMA}
- Ground everything in the supplied material. NEVER invent employers, schools, dates, credential \
ids, or facts that aren't supported. If you cannot ground a value, omit it (for maps) or leave it \
out (for lists) rather than guessing.
- identity: only include the fields explicitly listed as needed. Copy contact details / URLs \
verbatim from the CV; do not fabricate an email or phone.
- languages: SPOKEN/natural languages only (English, Turkish, German, …) — NOT programming \
languages. Infer from the CV (languages section, the language the CV is written in, education \
location) and default to English for a developer when reasonable. Give an honest proficiency.
- skills_categories / skills_ratings: for each skill name listed, give a concise category \
("Languages", "Frameworks", "Databases", "Tools", "Cloud & DevOps", "Soft skills", …) and an \
honest 1-5 rating estimated from how much the CV/repos actually use it (5 = deep, repeated, \
recent use; 1 = mentioned once).
- skills_new: only when asked — propose skills clearly evidenced in the CV/repos that aren't \
already listed. Deduplicate against existing skills.
- items: for each step id listed, return the single best value. Enum steps must use one of their \
allowed values exactly; date steps use "YYYY-MM" (or "YYYY"); short-text steps a concise string. \
Omit any id you cannot ground.
- drafts: for each step id listed, write polished first-person prose for that field, grounded in \
the material — a professional summary is 2-4 sentences; a role/project description is 1-3 sentences. \
No labels, no quotes, no markdown; just the text. Never invent facts. Omit an id only if there is \
truly nothing to ground it in.
- Match the language of the user's CV where you write prose."""


def build_suggestions_messages(context: str, request: str) -> list[dict[str, str]]:
    """Messages for the one-shot structured-suggestions call.

    `request` describes exactly which identity fields, skills, languages, and
    per-item steps need a value (built by core.profile_completion).
    """
    return [
        {"role": "system", "content": _SUGGESTIONS_SYSTEM},
        {"role": "user", "content": f"{_context_block(context)}\n\n---\n\nFill these gaps:\n{request}"},
    ]


# ── 2. Generative draft (streamed) ───────────────────────────────

_DRAFT_SYSTEM = """You write one short, polished section of a developer's professional profile, in \
their own voice, grounded strictly in the material provided.

Rules:
- Write ONLY the text for the requested field. No preamble, no labels, no quotes, no markdown.
- Use only facts supported by the CV, GitHub repos, and existing profile. Never invent employers, \
metrics, dates, or achievements.
- First person, natural and confident but not boastful. No clichés or buzzword soup.
- Keep it tight and appropriate to the field (a summary is 2-4 sentences; a role/project \
description is 1-3 sentences).
- Match the language of the user's CV."""


def build_draft_messages(context: str, field_label: str, target: str) -> list[dict[str, str]]:
    """Messages to draft one free-text field.

    `field_label` names the field (e.g. "Professional summary"); `target`
    describes what it belongs to (e.g. "the role: Backend Engineer at Acme").
    """
    ask = f"Write the {field_label}"
    if target:
        ask += f" for {target}"
    return [
        {"role": "system", "content": _DRAFT_SYSTEM},
        {"role": "user", "content": f"{_context_block(context)}\n\n---\n\n{ask}."},
    ]


# ── 3. Refine an existing draft (streamed) ───────────────────────

_REFINE_SYSTEM = """You revise one section of a developer's professional profile. You are given the \
current text and an instruction for how to change it.

Rules:
- Apply the instruction while keeping the text truthful and grounded in the supplied material — \
never add facts that aren't supported.
- Reply with ONLY the revised text. No preamble, no labels, no quotes, no markdown.
- Keep the same first-person voice and the field's natural length.
- Match the language of the current text."""


def build_refine_messages(
    context: str, field_label: str, current: str, instruction: str
) -> list[dict[str, str]]:
    """Messages to revise `current` text following `instruction`."""
    return [
        {"role": "system", "content": _REFINE_SYSTEM},
        {
            "role": "user",
            "content": (
                f"{_context_block(context)}\n\n---\n\n"
                f"Field: {field_label}\n\n"
                f"Current text:\n{current}\n\n"
                f"Instruction: {instruction}\n\n"
                "Return the revised text only."
            ),
        },
    ]
