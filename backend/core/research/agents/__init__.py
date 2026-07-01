"""The research agents — one per report section.

Phase 2 ships the four that turn free public data into a live report:
firmographics, overview, signals, and the job-description analysis. Each is a
small `Agent` subclass (see `agent_base`). The orchestrator runs them in parallel.
"""

from __future__ import annotations

from core.research.agents.firmographics_agent import FirmographicsAgent
from core.research.agents.jd_analyst_agent import JDAnalystAgent
from core.research.agents.overview_agent import OverviewAgent
from core.research.agents.signals_agent import SignalsAgent

# The default fleet, in a sensible display order.
FLEET = [FirmographicsAgent, OverviewAgent, SignalsAgent, JDAnalystAgent]

__all__ = ["FLEET", "FirmographicsAgent", "OverviewAgent", "SignalsAgent", "JDAnalystAgent"]
