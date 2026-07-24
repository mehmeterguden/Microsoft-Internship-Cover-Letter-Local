"""The research agents — organized for maximum throughput and accuracy.

`CompanyProfileAgent` groups firmographics, overview, and values into a single LLM pass,
while specialized domain agents run in parallel for culture, tech stack, signals,
interview prep, and job description analysis.
"""

from __future__ import annotations

from core.research.agents.company_profile_agent import CompanyProfileAgent
from core.research.agents.culture_agent import CultureAgent
from core.research.agents.firmographics_agent import FirmographicsAgent
from core.research.agents.interview_agent import InterviewAgent
from core.research.agents.jd_analyst_agent import JDAnalystAgent
from core.research.agents.overview_agent import OverviewAgent
from core.research.agents.signals_agent import SignalsAgent
from core.research.agents.tech_stack_agent import TechStackAgent
from core.research.agents.values_agent import ValuesAgent

# Fleet with grouped company profile + specialized domain agents.
FLEET = [
    CompanyProfileAgent,
    CultureAgent,
    TechStackAgent,
    SignalsAgent,
    InterviewAgent,
    JDAnalystAgent,
]

__all__ = [
    "FLEET",
    "CompanyProfileAgent",
    "CultureAgent",
    "FirmographicsAgent",
    "InterviewAgent",
    "JDAnalystAgent",
    "OverviewAgent",
    "SignalsAgent",
    "TechStackAgent",
    "ValuesAgent",
]
