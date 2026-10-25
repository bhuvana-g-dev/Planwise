"""Tests 17 + auth: ownership enforcement and token handling.

Firebase is never contacted — we override the FastAPI auth dependency (and
monkeypatch verify_token) so these run with no credentials.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.core.config import get_settings
from app.main import app
from app.services import event_service
from app.services.event_service import Forbidden

client = TestClient(app)


def _payload(**overrides):
    base = {
        "name": "Owned Birthday",
        "event_type": "birthday",
        "event_date": (date.today() + timedelta(days=45)).isoformat(),
        "location": "Madurai",
        "guest_count": 50,
        "budget_inr": 30000,
        "hard_constraints": ["Vegetarian catering only"],
    }
    base.update(overrides)
    return base


def _as_user(uid: str | None):
    """Context manager-ish helper: override the owner dependency with a uid."""
    app.dependency_overrides[get_current_owner] = lambda: uid


def teardown_function():
    app.dependency_overrides.pop(get_current_owner, None)


# Test 17: ownership — a different authenticated user cannot read your event
def test_ownership_blocks_other_user():
    _as_user("userA")
    created = client.post("/api/events", json=_payload()).json()
    assert created["owner_id"] == "userA"

    _as_user("userB")
    r = client.get(f"/api/events/{created['id']}")
    assert r.status_code == 403


def test_owner_can_access_own_event():
    _as_user("userA")
    created = client.post("/api/events", json=_payload()).json()
    r = client.get(f"/api/events/{created['id']}")
    assert r.status_code == 200
    assert r.json()["event"]["owner_id"] == "userA"


def test_list_events_scoped_to_owner():
    _as_user("userA")
    client.post("/api/events", json=_payload(name="A1"))
    _as_user("userB")
    client.post("/api/events", json=_payload(name="B1"))
    listed = client.get("/api/events").json()
    assert all(e["owner_id"] == "userB" for e in listed)
    assert any(e["name"] == "B1" for e in listed)


# Ownership enforced on replan/approve/tasks/vendors too
def test_ownership_enforced_on_private_ops():
    _as_user("userA")
    ev = client.post("/api/events", json=_payload()).json()
    plan = client.post(f"/api/events/{ev['id']}/plans").json()

    _as_user("userB")
    assert client.post(f"/api/events/{ev['id']}/plans").status_code == 403
    assert client.post(f"/api/events/{ev['id']}/replans",
                       json={"change_type": "budget", "new_budget_inr": 24000}
                       ).status_code == 403
    assert client.patch(f"/api/events/{ev['id']}/tasks/{plan['tasks'][0]['id']}",
                        json={"status": "done"}).status_code == 403
    assert client.post(f"/api/events/{ev['id']}/vendors/compare",
                       json={"quotes": []}).status_code == 403


# Token handling at the dependency level (no Firebase needed)
def test_missing_token_returns_401(monkeypatch):
    app.dependency_overrides.pop(get_current_owner, None)
    settings = get_settings()
    monkeypatch.setattr(settings, "require_auth", True)
    r = client.get("/api/events")
    assert r.status_code == 401


def test_invalid_token_returns_401(monkeypatch):
    app.dependency_overrides.pop(get_current_owner, None)
    settings = get_settings()
    monkeypatch.setattr(settings, "require_auth", True)

    import app.api.deps as deps

    def _bad(token):
        raise ValueError("expired")

    monkeypatch.setattr(deps, "verify_token", _bad)
    r = client.get("/api/events", headers={"Authorization": "Bearer faketoken"})
    assert r.status_code == 401
    assert "stack" not in r.text.lower()  # no internal leakage


def test_valid_token_sets_owner(monkeypatch):
    app.dependency_overrides.pop(get_current_owner, None)
    settings = get_settings()
    monkeypatch.setattr(settings, "require_auth", True)

    import app.api.deps as deps
    monkeypatch.setattr(deps, "verify_token", lambda token: "verified-uid")

    r = client.post("/api/events", json=_payload(),
                    headers={"Authorization": "Bearer good"})
    assert r.status_code == 201
    assert r.json()["owner_id"] == "verified-uid"


# Service-level ownership guard unit test
def test_check_owner_raises_for_mismatch():
    with pytest.raises(Forbidden):
        event_service._check_owner({"owner_id": "a"}, "b")
    # ownerless legacy event is accessible
    event_service._check_owner({"owner_id": None}, "b")
