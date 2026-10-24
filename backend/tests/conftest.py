"""Shared test fixtures. Uses a temp JSON store so tests never touch real data."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.core.config import get_settings
from app.models.event import EventCreate, EventType, Preference
from app.repositories.json_repository import JsonRepository
from app.repositories.provider import get_repository


@pytest.fixture(autouse=True)
def temp_repo(tmp_path, monkeypatch):
    """Point the repository provider at a fresh temp JSON file per test."""
    db_file = tmp_path / "db.json"
    repo = JsonRepository(path=db_file)
    get_repository.cache_clear()
    monkeypatch.setattr(
        "app.repositories.provider.get_repository", lambda: repo
    )
    # Also patch the already-imported reference in event_service.
    import app.services.event_service as es
    monkeypatch.setattr(es, "get_repository", lambda: repo)
    yield repo
    get_repository.cache_clear()


@pytest.fixture(autouse=True)
def no_gemini(monkeypatch):
    """Default: Gemini disabled, so generation uses the deterministic path."""
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "")
    yield


@pytest.fixture
def birthday_event() -> EventCreate:
    return EventCreate(
        name="Aarav's 10th Birthday",
        event_type=EventType.birthday,
        event_date=date.today() + timedelta(days=45),
        location="Madurai, Tamil Nadu, India",
        guest_count=50,
        budget_inr=30000,
        theme="Jungle",
        style="Simple outdoor celebration",
        dietary_requirements=["Vegetarian food"],
        preferences=[
            Preference(label="catering", rank=1),
            Preference(label="decorations", rank=2),
        ],
        hard_constraints=["Vegetarian catering only"],
        flexible_choices=["decorations", "activities"],
    )
