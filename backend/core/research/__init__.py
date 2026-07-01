"""Company Intelligence Engine.

Given a company name (and optionally a role title + a pasted job description),
this package researches the company from free, public sources and — later phases —
scores how well the local profile fits the role.

Two worlds, kept strictly apart (see `outbound_guard`):
  • RESEARCH is public: only the company name, role title, and the employer's job
    text ever leave the machine.
  • JUDGEMENT is private: the fit analysis runs locally; the CV/profile never goes out.

Phase 1 (this commit) lays the foundation: the report schema (`schema`), the
privacy firewall (`outbound_guard`), and a registry of free data-gathering
tools (`tools`). Agents that orchestrate these arrive in a later phase.
"""

from __future__ import annotations
