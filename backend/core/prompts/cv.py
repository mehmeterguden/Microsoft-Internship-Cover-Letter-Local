"""Prompt for turning raw CV text into structured JSON that matches our DB models.

The schema below mirrors the Pydantic models in `models.py` (Profile, Skill,
Experience, Education, Project, Certificate, Language, Link) — only the fields we
can reasonably read from a CV. The model fills the rest with null/[] and we
validate the result on our side.
"""

from __future__ import annotations

# The exact JSON shape we want back. Kept compact and explicit for reliability.
CV_JSON_SCHEMA = """{
  "profile": {
    "name": string|null, "surname": string|null, "email": string|null,
    "phone": string|null, "linkedin": string|null, "github": string|null,
    "summary": string|null
  },
  "skills":      [{ "name": string, "category": string|null }],
  "experiences": [{ "company": string, "title": string,
                    "employment_type": "full_time"|"part_time"|"internship"|"freelance"|"volunteer"|"other"|null,
                    "location": string|null, "start_date": string|null, "end_date": string|null,
                    "is_current": boolean, "description": string|null }],
  "education":   [{ "institution": string, "degree": string|null, "field": string|null,
                    "location": string|null, "start_date": string|null, "end_date": string|null,
                    "is_current": boolean, "gpa": string|null }],
  "projects":    [{ "name": string, "description": string|null, "role": string|null,
                    "technologies": [string], "url": string|null,
                    "start_date": string|null, "end_date": string|null }],
  "certificates":[{ "name": string, "issuer": string|null,
                    "cert_type": "professional"|"course"|"exam"|"language"|"award"|"bootcamp"|"other"|null,
                    "issue_date": string|null, "expiry_date": string|null,
                    "credential_id": string|null, "url": string|null }],
  "languages":   [{ "name": string,
                    "proficiency": "native"|"fluent"|"professional"|"intermediate"|"basic"|null }],
  "links":       [{ "label": string, "url": string, "description": string|null }]
}"""

SYSTEM_PROMPT = f"""You are a meticulous CV/resume parser. You convert the raw text of a CV into a \
single structured JSON object for a database.

Output rules — follow exactly:
- Reply with ONE JSON object only. No prose, no explanations, no markdown, no code fences.
- Use exactly the keys and shape shown in the schema. Include every top-level key.
- Extract only information that is actually present in the CV. NEVER invent, guess, or \
add facts that are not written. Accuracy matters far more than completeness.
- For a missing single value use null. For a missing list use [].
- Dates: normalize to "YYYY-MM-DD" or "YYYY-MM" when the parts are known; if only a year \
is given use "YYYY"; if a date is absent use null. For an ongoing role/study set \
"is_current": true and "end_date": null.
- Enum fields must use one of the allowed values exactly, or null if unclear.
- Keep text faithful to the source — light cleanup only (whitespace, obvious line-break \
splits). Do not rewrite or embellish. Preserve the CV's original language.
- Split distinct roles, schools, projects, and certificates into separate list items.
- links: capture EVERY personal URL in the CV — portfolio/personal website, LinkedIn, \
GitHub, blog, etc. (often in the header). Give each a short label ("Website", "LinkedIn", \
"GitHub"). Add "https://" if the scheme is missing.
- skills: if the CV has a dedicated skills section, list those. Otherwise, populate skills \
from the distinct technologies, programming languages, frameworks, and tools that are \
EXPLICITLY named in the experience and project descriptions (e.g. Python, React, Node.js, \
TypeScript). Use only items literally written in the CV — never add related or implied ones. \
Deduplicate.

Schema:
{CV_JSON_SCHEMA}"""


def build_messages(cv_text: str) -> list[dict[str, str]]:
    """Build the chat messages for structuring a CV."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"CV text:\n\n{cv_text}"},
    ]
