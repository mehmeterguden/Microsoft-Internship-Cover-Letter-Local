"""MCP adapter — plug external Model Context Protocol servers into the tool belt.

A minimal MCP client over the Streamable-HTTP (JSON-RPC 2.0) transport. It reads
the servers a user configures in settings (`mcp_servers`, a JSON list of
`{"name": ..., "url": ...}`), discovers each server's tools, and registers them
into our `ToolRegistry` as `mcp:<server>:<tool>` so agents can call them exactly
like a native tool. If nothing is configured — the default — this is a no-op.

Every request goes through `outbound_guard`, so the privacy firewall still applies
to MCP traffic. The network layer is isolated in `_send`, which tests replace with
a fake transport to verify discovery/registration/calls without a live server.
"""

from __future__ import annotations

import json
from typing import Any

from core.research import outbound_guard
from core.research.tools.registry import ToolRegistry, ToolResult
from db import queries

_PROTOCOL = "2025-06-18"
_CLIENT = {"name": "cover-letter-local", "version": "0.1.0"}


class MCPError(RuntimeError):
    """An MCP server returned an error or an unusable response."""


# ─────────────────────────────────────────────────────────────
#  Transport (isolated so tests can swap it out)
# ─────────────────────────────────────────────────────────────

def _send(url: str, payload: dict[str, Any], headers: dict[str, str]) -> tuple[Any, dict[str, str]]:
    """POST a JSON-RPC message; return (parsed body, response headers). Guarded."""
    body = json.dumps(payload)
    outbound_guard.assert_safe(url, body)
    import urllib.request

    req = urllib.request.Request(
        url,
        data=body.encode("utf-8"),
        headers={
            "User-Agent": "cover-letter-local",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **headers,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", "ignore")
        return _parse_body(raw), {k: v for k, v in resp.headers.items()}


def _parse_body(raw: str) -> Any:
    """Accept a plain JSON body or an SSE stream; return the JSON-RPC message."""
    text = raw.strip()
    if text.startswith("{") or text.startswith("["):
        return json.loads(text)
    # SSE: take the last non-empty `data:` line.
    last = None
    for line in text.splitlines():
        if line.startswith("data:"):
            last = line[5:].strip()
    if last is None:
        raise MCPError("Empty MCP response.")
    return json.loads(last)


def _rpc(url: str, method: str, params: dict[str, Any], session_id: str | None) -> tuple[Any, str | None]:
    """One JSON-RPC request; return (result, session_id). Raises MCPError on error."""
    headers = {"Mcp-Session-Id": session_id} if session_id else {}
    message, resp_headers = _send(url, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, headers)
    session_id = resp_headers.get("Mcp-Session-Id") or resp_headers.get("mcp-session-id") or session_id
    if isinstance(message, dict) and message.get("error"):
        raise MCPError(str(message["error"]))
    return (message.get("result") if isinstance(message, dict) else message), session_id


# ─────────────────────────────────────────────────────────────
#  Discovery + registration
# ─────────────────────────────────────────────────────────────

def discover(url: str) -> tuple[list[dict[str, Any]], str | None]:
    """Handshake with a server and return (its tools, session id)."""
    _result, session = _rpc(
        url, "initialize",
        {"protocolVersion": _PROTOCOL, "capabilities": {}, "clientInfo": _CLIENT},
        None,
    )
    listing, session = _rpc(url, "tools/list", {}, session)
    tools = listing.get("tools", []) if isinstance(listing, dict) else []
    return tools, session


def _make_runner(server_name: str, url: str, tool_name: str, session_id: str | None):
    """Build a registry callable that invokes one MCP tool."""

    def run(**arguments: Any) -> ToolResult:
        try:
            result, _ = _rpc(url, "tools/call", {"name": tool_name, "arguments": arguments}, session_id)
        except Exception as exc:  # noqa: BLE001 — surface as a failed ToolResult, don't crash the run
            return ToolResult.fail(f"mcp:{server_name}:{tool_name}", url, str(exc))
        return ToolResult(
            tool=f"mcp:{server_name}:{tool_name}",
            source=f"MCP · {server_name}",
            data=_flatten_content(result),
        )

    return run


def _flatten_content(result: Any) -> Any:
    """MCP tool results wrap output in a content list; pull text/data out."""
    if not isinstance(result, dict):
        return result
    content = result.get("content")
    if isinstance(content, list):
        texts = [c.get("text") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        if texts:
            return {"text": "\n".join(texts)}
    return result


def _load_servers() -> list[dict[str, str]]:
    """Read configured MCP servers from settings; tolerate a missing/blank field."""
    raw = (queries.get_settings().get("mcp_servers") or "").strip()
    if not raw:
        return []
    try:
        servers = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [s for s in servers if isinstance(s, dict) and s.get("url") and s.get("name")]


def register_mcp_tools(registry: ToolRegistry) -> list[dict[str, Any]]:
    """Discover every configured server and register its tools. Returns a status list."""
    status: list[dict[str, Any]] = []
    for server in _load_servers():
        name, url = server["name"], server["url"]
        try:
            tools, session = discover(url)
        except Exception as exc:  # noqa: BLE001 — one bad server must not break the others
            status.append({"server": name, "url": url, "ok": False, "error": str(exc), "tools": []})
            continue
        registered = []
        for tool in tools:
            tool_name = tool.get("name")
            if not tool_name:
                continue
            qualified = f"mcp:{name}:{tool_name}"
            if qualified in registry.names():
                continue  # already registered on a previous refresh
            registry.register(
                qualified,
                tool.get("description") or f"MCP tool {tool_name} on {name}",
                _make_runner(name, url, tool_name, session),
            )
            registered.append(qualified)
        status.append({"server": name, "url": url, "ok": True, "error": None, "tools": registered})
    return status
