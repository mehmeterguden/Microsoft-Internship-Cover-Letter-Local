"""Manual smoke check for the Phase 1 tools — run against live free sources.

    python -m core.research.smoke "Microsoft"

Calls every registered tool once and prints a short summary of what came back.
This is a developer aid (it hits the network), not an automated test — the
hermetic tests live in `tests/`.
"""

from __future__ import annotations

import sys

from core.research.tools import registry


def _preview(value: object, limit: int = 200) -> str:
    text = str(value).replace("\n", " ")
    return text[:limit] + ("…" if len(text) > limit else "")


def main(company: str) -> None:
    calls = [
        ("firmographics", {"company_name": company}),
        ("news", {"company_name": company}),
        ("github_org", {"company_name": company}),
        ("web_search", {"query": f"{company} engineering culture and values"}),
    ]
    print(f"── Company research smoke: {company!r} ──\n")
    for name, kwargs in calls:
        result = registry.call(name, **kwargs)
        status = "OK " if result.ok else "ERR"
        print(f"[{status}] {name}  (source: {result.source})")
        print(f"        {_preview(result.data if result.ok else result.error)}\n")

    # web_fetch needs a real URL — reuse the company's official website if Wikidata gave one.
    firmo = registry.call("firmographics", company_name=company)
    website = (firmo.data or {}).get("website") if firmo.ok else None
    if website:
        fetched = registry.call("web_fetch", url=website)
        status = "OK " if fetched.ok else "ERR"
        print(f"[{status}] web_fetch  (source: {fetched.source})")
        print(f"        {_preview((fetched.data or {}).get('text') if fetched.ok else fetched.error)}\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Microsoft")
