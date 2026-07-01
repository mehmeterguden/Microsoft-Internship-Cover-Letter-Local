"""The mini agent framework — no LangChain, deliberately small and robust.

Each research agent works in two steps:

  1. gather()  — deterministic tool calls (blocking urllib), run off the event
     loop so many agents gather in parallel.
  2. reason()  — one LLM call that turns the gathered raw text into a validated
     slice of the report schema. Invalid JSON is retried once with the error fed
     back to the model.

This two-step shape is far more reliable across providers (including small local
models like phi-4-mini) than a free-form ReAct tool-calling loop, and it streams
naturally: the base emits `agent_started` → `source` → `agent_done`/`agent_error`
events as it goes, which the orchestrator forwards to the browser as SSE.

Privacy: agents only ever send public data outward — the tools go through
`outbound_guard`, and prompts contain the company name, the employer's job text,
and gathered public web content, never the CV/profile.
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.parse
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from core import llm
from core.llm.base import Message
from core.research.schema import Source
from core.research.tools.registry import ToolResult

# An event sink — the orchestrator passes one in; the base awaits it per event.
Emit = Callable[[dict[str, Any]], Awaitable[None]]

_MAX_CONTEXT_CHARS = 4_000   # per gathered source, keeps small-model context sane
_RETRIES = 4                 # transient provider errors (Gemini "503 overloaded") are retried
# Cap concurrent LLM calls: gathering fans out fully, but hammering a free-tier
# cloud model with every agent at once triggers 503s. Reasoning is throttled.
_llm_gate = asyncio.Semaphore(2)


@dataclass(frozen=True, slots=True)
class AgentContext:
    """The public inputs shared by every agent for a single research run."""

    company_name: str
    role_title: str | None = None
    job_description: str | None = None


@dataclass(frozen=True, slots=True)
class AgentResult:
    name: str
    section: str                 # which CompanyIntelReport field this fills
    data: Any = None             # validated section (model / list), or None on failure
    sources: list[Source] = field(default_factory=list)
    ok: bool = True
    error: str | None = None


class Agent(ABC):
    """Base class — one subclass per report section.

    Subclasses declare `name`, `section`, and `output_model`, then implement
    `gather`, `build_messages`, and `section_from`.
    """

    name: str = "agent"
    section: str = ""
    output_model: type[BaseModel]

    # ── subclass hooks ──

    @abstractmethod
    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        """Call this agent's tools and return their raw results (may be empty)."""

    @abstractmethod
    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        """Build the LLM prompt from the context and gathered material."""

    def section_from(self, validated: BaseModel) -> Any:
        """Map the validated model to the report section. Identity by default."""
        return validated

    # ── engine ──

    async def run(self, ctx: AgentContext, emit: Emit) -> AgentResult:
        """Gather, reason, and emit progress. Never raises — failures are reported."""
        await emit({"type": "agent_started", "agent": self.name, "section": self.section})

        gathered = await asyncio.to_thread(self._gather_safe, ctx)
        for result in gathered:
            await emit(
                {"type": "source", "agent": self.name, "source": result.source, "ok": result.ok}
            )
        # Provenance = the actual URLs this agent consulted (deterministic, never
        # invented). Shown under the section so every fact is traceable.
        sources = provenance(gathered)

        try:
            async with _llm_gate:
                validated = await asyncio.to_thread(self._reason, ctx, gathered)
            section = self.section_from(validated)
        except Exception as exc:  # noqa: BLE001 — one bad agent must not sink the run
            await emit({"type": "agent_error", "agent": self.name, "error": str(exc)})
            return AgentResult(self.name, self.section, None, sources, ok=False, error=str(exc))

        await emit(
            {
                "type": "agent_done",
                "agent": self.name,
                "section": self.section,
                "data": _dump(section),
                "sources": [s.model_dump() for s in sources],
            }
        )
        return AgentResult(self.name, self.section, section, sources, ok=True)

    def _gather_safe(self, ctx: AgentContext) -> list[ToolResult]:
        try:
            return self.gather(ctx)
        except Exception:  # noqa: BLE001 — tools already fail soft; guard anything else
            return []

    def _reason(self, ctx: AgentContext, gathered: list[ToolResult]) -> BaseModel:
        """One LLM call → validated `output_model`, with a single repair retry."""
        messages = self.build_messages(ctx, gathered)
        raw = _complete(messages)
        try:
            return self.output_model(**json.loads(_extract_json(raw)))
        except (ValueError, json.JSONDecodeError, ValidationError) as first:
            repair = messages + [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": (
                        f"That was not valid JSON for the schema ({first}). "
                        "Reply with ONLY the corrected JSON object, nothing else."
                    ),
                },
            ]
            return self.output_model(**json.loads(_extract_json(_complete(repair))))


# ─────────────────────────────────────────────────────────────
#  Shared helpers
# ─────────────────────────────────────────────────────────────

def _complete(messages: list[Message]) -> str:
    """Call the LLM, retrying on transient overload only.

    Overload (503 / "UNAVAILABLE" / "overloaded" / timeouts) is retried with
    backoff. A quota error (429 / "RESOURCE_EXHAUSTED") is permanent for now —
    retrying just wastes time and more quota — so it fails fast.
    """
    last: Exception | None = None
    for attempt in range(_RETRIES):
        try:
            return llm.complete(messages, temperature=0.0, max_tokens=1500)
        except Exception as exc:  # noqa: BLE001 — inspect the message to decide
            last = exc
            if not _is_transient(exc):
                raise
            time.sleep(1.5 * (attempt + 1))
    raise last  # type: ignore[misc]


def _is_transient(exc: Exception) -> bool:
    """True for retryable overload/timeout errors; False for quota/auth/bad-request."""
    msg = str(exc).lower()
    if "resource_exhausted" in msg or "quota" in msg:
        return False
    return any(m in msg for m in ("503", "unavailable", "overload", "timeout", "timed out", "500"))


def _extract_json(text: str) -> str:
    """Pull the outermost JSON object from a model reply (tolerates fences/prose)."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in the model output.")
    return text[start : end + 1]


def _dump(section: Any) -> Any:
    """JSON-ready form of a section (model, list of models, or plain value)."""
    if isinstance(section, BaseModel):
        return section.model_dump(mode="json")
    if isinstance(section, list):
        return [_dump(item) for item in section]
    return section


def provenance(gathered: list[ToolResult]) -> list[Source]:
    """Extract the concrete, clickable sources an agent consulted — deduped.

    Pulls the real URLs out of each tool's payload (search hits, the fetched page,
    the Wikidata entity, the GitHub org) so a section can show exactly where its
    facts came from. News is skipped here — each signal already carries its own URL.
    """
    out: list[Source] = []
    for result in gathered:
        if not result.ok or not result.data:
            continue
        if result.tool == "web_search":
            for hit in result.data.get("results", [])[:6]:
                url = hit.get("url")
                if url:
                    out.append(Source(label=hit.get("title") or _domain(url), url=url))
        elif result.tool == "web_fetch":
            url = result.data.get("url")
            if url:
                out.append(Source(label=_domain(url), url=url))
        elif result.tool == "firmographics":
            out.append(Source(label="Wikidata", url=result.source))
        elif result.tool == "github_org":
            out.append(Source(label=f"GitHub · {result.data.get('login', '')}", url=result.source))
        elif result.tool != "news":
            out.append(
                Source(label=result.source, url=result.source if result.source.startswith("http") else None)
            )
    return _dedupe_sources(out)


def _domain(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.removeprefix("www.") or url
    except ValueError:
        return url


def _dedupe_sources(sources: list[Source]) -> list[Source]:
    seen: set[tuple[str, str | None]] = set()
    out: list[Source] = []
    for source in sources:
        key = (source.label, source.url)
        if key not in seen:
            seen.add(key)
            out.append(source)
    return out


def format_gathered(gathered: list[ToolResult]) -> str:
    """Render gathered tool results into a compact, capped context block."""
    blocks: list[str] = []
    for result in gathered:
        if not result.ok:
            continue
        body = json.dumps(result.data, ensure_ascii=False)[:_MAX_CONTEXT_CHARS]
        blocks.append(f"### Source: {result.source}\n{body}")
    return "\n\n".join(blocks) if blocks else "(no data gathered)"
