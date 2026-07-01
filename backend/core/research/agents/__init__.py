"""The research agents — one per report section.

Each is a small `Agent` subclass (see `agent_base`) that gathers from free public
sources and reasons the result into a slice of the report. The orchestrator runs
the whole fleet in parallel; the local fit analysis (`core.research.fit`) runs
afterwards on-device.
"""

from __future__ import annotations

from core.research.agents.culture_agent import CultureAgent
from core.research.agents.firmographics_agent import FirmographicsAgent
from core.research.agents.interview_agent import InterviewAgent
from core.research.agents.jd_analyst_agent import JDAnalystAgent
from core.research.agents.overview_agent import OverviewAgent
from core.research.agents.signals_agent import SignalsAgent
from core.research.agents.tech_stack_agent import TechStackAgent
from core.research.agents.values_agent import ValuesAgent

# The default fleet, in a sensible display order.
FLEET = [
    FirmographicsAgent,
    OverviewAgent,
    ValuesAgent,
    CultureAgent,
    TechStackAgent,
    SignalsAgent,
    InterviewAgent,
    JDAnalystAgent,
]

__all__ = [
    "FLEET",
    "FirmographicsAgent", "OverviewAgent", "ValuesAgent", "CultureAgent",
    "TechStackAgent", "SignalsAgent", "InterviewAgent", "JDAnalystAgent",
]
