"""LinkedIn import — export parsing plus the non-destructive, idempotent save.

The parser tests are pure (no DB). The save tests run against a throwaway SQLite
file so they exercise the real schema migration and query layer without touching
the developer database.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from api.routers import linkedin as router
from core import linkedin
from db import queries, schema
from models import LanguageLevel, Skill, Source


# ── Synthetic export ZIP ─────────────────────────────────────────

def _export_zip(**overrides: str) -> bytes:
    files = {
        "Profile.csv": (
            "First Name,Last Name,Headline,Summary,Websites\n"
            "Ada,Lovelace,Pioneer,\"First programmer.\",\"[PORTFOLIO:https://ada.dev]\"\n"
        ),
        "Email Addresses.csv": "Email Address,Confirmed,Primary,Updated On\nada@example.com,Yes,Yes,2023-01-01\n",
        "Positions.csv": (
            "Company Name,Title,Description,Location,Started On,Finished On\n"
            "Engines Ltd,Lead Programmer,Wrote algorithms.,London,Jan 2020,Aug 2021\n"
            "Royal Society,Researcher,Ongoing.,London,Sep 2021,\n"
        ),
        "Education.csv": "School Name,Start Date,End Date,Degree Name\nUni of London,2016,2019,BSc Mathematics\n",
        "Skills.csv": "Name\nPython\nMathematics\n",
        "Languages.csv": "Name,Proficiency\nEnglish,Native or bilingual proficiency\nFrench,Elementary proficiency\n",
        "Certifications.csv": "Name,Url,Authority,Started On,Finished On,License Number\nCert A,https://c.dev,Board,Mar 2020,,ABC-1\n",
        "Projects.csv": "Title,Description,Url,Started On,Finished On\nNote G,First algorithm,https://g.dev,1843,1843\n",
    }
    files.update(overrides)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


# ── Parser (no DB) ───────────────────────────────────────────────

def test_parse_export_maps_every_section():
    cv = linkedin.parse_export(_export_zip())

    assert cv.profile.name == "Ada" and cv.profile.surname == "Lovelace"
    assert cv.profile.email == "ada@example.com"
    assert cv.profile.summary == "First programmer."
    assert [s.name for s in cv.skills] == ["Python", "Mathematics"]

    # Dates normalize ("Jan 2020" -> "2020-01") and an empty "Finished On" -> current.
    lead = cv.experiences[0]
    assert (lead.company, lead.title, lead.start_date, lead.end_date) == (
        "Engines Ltd", "Lead Programmer", "2020-01", "2021-08",
    )
    assert lead.is_current is False
    assert cv.experiences[1].is_current is True

    assert cv.education[0].institution == "Uni of London"
    assert cv.languages[0].proficiency == LanguageLevel.native
    assert cv.languages[1].proficiency == LanguageLevel.basic
    assert cv.certificates[0].credential_id == "ABC-1"
    assert cv.projects[0].name == "Note G"
    assert cv.links[0].url == "https://ada.dev"


def test_parse_export_rejects_non_zip():
    with pytest.raises(ValueError):
        linkedin.parse_export(b"definitely not a zip")


def test_parse_export_rejects_zip_without_csvs():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "hello")
    with pytest.raises(ValueError):
        linkedin.parse_export(buf.getvalue())


# ── Save (throwaway DB) ──────────────────────────────────────────

@pytest.fixture
def db(tmp_path, monkeypatch):
    """Point the query layer at a fresh SQLite file and create the schema."""
    path = str(tmp_path / "test.db")
    monkeypatch.setattr(schema, "DATABASE_PATH", path)
    monkeypatch.setattr(queries, "DATABASE_PATH", path, raising=False)
    schema.init_db()  # exercises the linkedin_* column migration too
    return path


def _save(cv, url="https://linkedin.com/in/ada"):
    return router.save_import(router.SaveRequest(**cv.model_dump(), profile_url=url))


def test_save_persists_and_records_profile_url(db):
    result = _save(linkedin.parse_export(_export_zip()))
    assert result["ok"]
    assert result["saved"]["skills"] == 2 and result["saved"]["experiences"] == 2

    profile = queries.get_profile()
    assert profile["linkedin"] == "https://linkedin.com/in/ada"
    assert profile["field_sources"]["linkedin"]["source"] == "linkedin"

    skills = queries.list_all("skills")
    assert {s["name"] for s in skills} == {"Python", "Mathematics"}
    assert all(s["source"] == "linkedin" for s in skills)


def test_save_is_idempotent(db):
    cv = linkedin.parse_export(_export_zip())
    _save(cv)
    _save(cv)  # re-import must refresh, not duplicate
    assert len(queries.list_all("skills")) == 2
    assert len(queries.list_all("experiences")) == 2


def test_save_never_overwrites_cv_data(db):
    # A skill and an identity field already present from a CV import.
    queries.insert("skills", {**Skill(name="Python").model_dump(exclude={"id"}), "source": Source.cv.value})
    queries.save_profile({"name": "Existing Name", "email": None, "field_sources": {}})

    _save(linkedin.parse_export(_export_zip()))

    pythons = [s for s in queries.list_all("skills") if s["name"] == "Python"]
    assert len(pythons) == 1 and pythons[0]["source"] == "cv"  # CV skill kept, not duplicated

    profile = queries.get_profile()
    assert profile["name"] == "Existing Name"          # blank-only: never overwritten
    assert profile["email"] == "ada@example.com"        # was blank -> filled from LinkedIn
