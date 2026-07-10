"""Turn a job posting URL into {company, role, job_description}.

Fetches the page's readable text (public web content, via the guarded `web_fetch`
tool) and asks the configured LLM to pull out the three fields the research and
cover-letter forms need. Local by default; a cloud model is used only if the user
opted into one. Only the public posting text is sent to the model — never the CV.
"""

from __future__ import annotations

import json

from core import llm
from core.research.tools import web_fetch

_MAX_CHARS = 12_000  # cap the page text we send to the model


class JobPostingError(RuntimeError):
    """The page couldn't be fetched/read, or the model returned unusable output."""


_SYSTEM = (
    "You read the plain text of a job posting web page and extract exactly three "
    "fields. Reply with ONLY a JSON object, no prose, with these keys:\n"
    '  "company": the hiring company\'s name (not the job board or ATS vendor).\n'
    '  "role": the job title.\n'
    '  "job_description": a clean, readable plain-text version of the posting — '
    "responsibilities, requirements, and relevant details. Strip nav, cookie "
    "banners, and boilerplate. Keep line breaks between paragraphs.\n"
    "If a field is genuinely absent, use an empty string. Output JSON only."
)


def _extract_json(text: str) -> str:
    """Pull the outermost JSON object from a model reply (tolerates fences/prose)."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in the model output.")
    return text[start : end + 1]


def extract_from_url(url: str) -> dict[str, str]:
    """Fetch `url` and return {company, role, job_description}. Raises JobPostingError."""
    result = web_fetch.fetch(url)
    if not result.ok or not result.data:
        raise JobPostingError(result.error or "Could not read that page.")

    text = (result.data.get("text") or "")[:_MAX_CHARS]
    if not text.strip():
        raise JobPostingError("No readable job posting found on that page.")

    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"Job posting page ({url}):\n\n{text}"},
    ]
    raw = llm.complete(messages, temperature=0.0, max_tokens=1800)
    try:
        data = json.loads(_extract_json(raw))
    except (ValueError, json.JSONDecodeError) as exc:
        raise JobPostingError(f"The model returned unparseable output ({exc}).") from exc

    return {
        "company": str(data.get("company") or "").strip(),
        "role": str(data.get("role") or "").strip(),
        "job_description": str(data.get("job_description") or "").strip(),
    }
