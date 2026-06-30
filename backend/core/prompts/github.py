"""Prompt for analyzing a batch of GitHub repositories into useful context.

The model reads each repo (name, description, technologies, stars, README excerpt)
and produces a short, faithful summary plus a refined tech list, an involvement
rating, and an aggregated skill list — the bits we'll reuse when writing cover
letters. Strictly grounded in the provided text; no invention.
"""

from __future__ import annotations

import json

SYSTEM_PROMPT = """You analyze a developer's GitHub repositories to build concise, reusable \
context for writing their cover letters.

For EACH repo you are given (name, description, technologies, stars, README excerpt), produce:
- "summary": 1-2 sentences on what the project is and what's notable about it — its purpose, \
scale/impact, and standout tech. Factual and useful; base it ONLY on the provided text.
- "technologies": the concrete languages, frameworks, libraries, and tools the project uses, \
drawn from the description and README. Refine and deduplicate.
- "contribution": one short phrase on what the developer built or did, IF the README makes it \
clear; otherwise null.
- "involvement": an integer 1-5 for how substantial and portfolio-worthy the project looks \
(5 = significant, polished, real users/impact; 3 = solid personal project; 1 = trivial/throwaway).

Then produce "skills": a deduplicated list of the distinct technical skills and technologies \
across ALL the repos (for the developer's skill list).

Rules:
- Reply with ONE JSON object only — no prose, no markdown, no code fences.
- Use the EXACT repo_name values you were given.
- Never invent facts, features, or technologies that are not in the provided text. If a README \
is empty or unclear, keep the summary minimal and lower the involvement score.

Output shape:
{ "repos": [ { "repo_name": string, "summary": string, "technologies": [string],
              "contribution": string|null, "involvement": 1-5 } ],
  "skills": [string] }"""


def build_messages(repos: list[dict]) -> list[dict[str, str]]:
    """Build the chat messages for analyzing a chunk of repos."""
    payload = [
        {
            "repo_name": r.get("repo_name"),
            "description": r.get("description"),
            "technologies": r.get("technologies") or [],
            "stars": r.get("stars"),
            "readme": r.get("readme") or "",
        }
        for r in repos
    ]
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Repositories:\n\n" + json.dumps(payload, ensure_ascii=False)},
    ]
