"""Tests for the MCP adapter — discovery, registration, and calls via a fake transport.

No real MCP server: `mcp._send` is monkeypatched to simulate one, so the JSON-RPC
handshake, tool listing, registration, and tool calls are all verified offline.
"""

from __future__ import annotations

import pytest

from core.research.tools import mcp
from core.research.tools.registry import ToolRegistry


def _fake_send(url, payload, headers):
    method = payload["method"]
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "x"}}, {"Mcp-Session-Id": "S1"}
    if method == "tools/list":
        return {"result": {"tools": [{"name": "echo", "description": "Echo text back"}]}}, {}
    if method == "tools/call":
        text = payload["params"]["arguments"].get("text", "")
        return {"result": {"content": [{"type": "text", "text": f"echoed:{text}"}]}}, {}
    raise AssertionError(f"unexpected method {method}")


@pytest.fixture(autouse=True)
def _transport(monkeypatch):
    monkeypatch.setattr(mcp, "_send", _fake_send)
    monkeypatch.setattr(mcp, "_load_servers", lambda: [{"name": "demo", "url": "http://mcp.test"}])


def test_discover_returns_tools_and_session():
    tools, session = mcp.discover("http://mcp.test")
    assert session == "S1"
    assert tools[0]["name"] == "echo"


def test_register_and_call_mcp_tool():
    registry = ToolRegistry()
    status = mcp.register_mcp_tools(registry)

    assert status[0]["ok"] and "mcp:demo:echo" in status[0]["tools"]
    assert "mcp:demo:echo" in registry.names()

    result = registry.call("mcp:demo:echo", text="hi")
    assert result.ok and result.data == {"text": "echoed:hi"}
    assert result.source == "MCP · demo"


def test_bad_server_is_reported_not_raised(monkeypatch):
    def boom(url, payload, headers):
        raise ConnectionError("refused")

    monkeypatch.setattr(mcp, "_send", boom)
    status = mcp.register_mcp_tools(ToolRegistry())
    assert status[0]["ok"] is False and "refused" in status[0]["error"]


def test_no_servers_configured_is_noop(monkeypatch):
    monkeypatch.setattr(mcp, "_load_servers", list)
    assert mcp.register_mcp_tools(ToolRegistry()) == []


def test_parse_body_handles_sse():
    assert mcp._parse_body('data: {"result": 1}\n') == {"result": 1}
