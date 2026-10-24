"""Tests 1, 2, 13, 14, 15, 16, 18 — API & persistence via TestClient."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _payload(**overrides):
    base = {
        "name": "Aarav's Birthday",
        "event_type": "birthday",
        "event_date": (date.today() + timedelta(days=45)).isoformat(),
        "location": "Madurai, Tamil Nadu, India",
        "guest_count": 50,
        "budget_inr": 30000,
        "theme": "Jungle",
        "style": "Simple outdoor celebration",
        "dietary_requirements": ["Vegetarian food"],
        "preferences": [{"label": "catering", "rank": 1}],
        "hard_constraints": ["Vegetarian catering only"],
        "flexible_choices": ["decorations"],
    }
    base.update(overrides)
    return base


# Test 1: create a valid event
def test_create_valid_event():
    r = client.post("/api/events", json=_payload())
    assert r.status_code == 201
    body = r.json()
    assert body["budget_paise"] == 30000 * 100
    assert body["id"].startswith("evt-")


# Test 2: reject invalid event data
def test_reject_invalid_event():
    r = client.post("/api/events", json=_payload(budget_inr=-5))
    assert r.status_code == 422
    r = client.post("/api/events", json=_payload(guest_count=0))
    assert r.status_code == 422
    r = client.post("/api/events", json=_payload(
        event_date=(date.today() - timedelta(days=2)).isoformat()))
    assert r.status_code == 422


def _create_and_plan():
    ev = client.post("/api/events", json=_payload()).json()
    plan = client.post(f"/api/events/{ev['id']}/plans").json()
    return ev, plan


# Test 16 + 18: reload persisted event reflects saved data
def test_reload_persisted_event():
    ev, plan = _create_and_plan()
    r = client.get(f"/api/events/{ev['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["active_plan"]["id"] == plan["id"]
    assert body["active_plan"]["budget"]["within_budget"] is True
    assert len(body["plans"]) == 1


# Test 14: rejecting a proposal leaves current plan intact (we simply don't approve)
def test_reject_leaves_plan_intact():
    ev, plan = _create_and_plan()
    # Generate a proposal but never approve it.
    client.post(f"/api/events/{ev['id']}/replans",
                json={"change_type": "budget", "new_budget_inr": 24000})
    active = client.get(f"/api/events/{ev['id']}").json()["active_plan"]
    assert active["id"] == plan["id"]  # unchanged
    assert active["budget"]["budget_paise"] == 30000 * 100


# Test 13 + 15: approval required, and stale approval blocked
def test_approve_and_stale_rejection():
    ev, plan = _create_and_plan()
    replan = client.post(f"/api/events/{ev['id']}/replans",
                         json={"change_type": "budget", "new_budget_inr": 24000}).json()
    proposed = replan["proposed_plan"]
    assert proposed is not None

    # Approve against the correct base version.
    r = client.post(f"/api/events/{ev['id']}/plans/approve",
                    json={"proposed_plan": proposed, "base_version": plan["version"]})
    assert r.status_code == 200
    approved = r.json()
    assert approved["version"] == plan["version"] + 1
    assert approved["budget"]["budget_paise"] == 24000 * 100

    # Re-approving the same (now stale) proposal must fail with 409.
    r2 = client.post(f"/api/events/{ev['id']}/plans/approve",
                     json={"proposed_plan": proposed, "base_version": plan["version"]})
    assert r2.status_code == 409


# Test 18: dashboard data reflects saved plan after approval + reload
def test_dashboard_reflects_saved_after_approval():
    ev, plan = _create_and_plan()
    replan = client.post(f"/api/events/{ev['id']}/replans",
                         json={"change_type": "budget", "new_budget_inr": 24000}).json()
    client.post(f"/api/events/{ev['id']}/plans/approve",
                json={"proposed_plan": replan["proposed_plan"],
                      "base_version": plan["version"]})
    body = client.get(f"/api/events/{ev['id']}").json()
    assert body["active_plan"]["budget"]["budget_paise"] == 24000 * 100
    assert body["active_plan"]["version"] == 2
    assert len(body["plans"]) == 2  # version history preserved


# Task update persists
def test_task_update_persists():
    ev, plan = _create_and_plan()
    task_id = plan["tasks"][0]["id"]
    r = client.patch(f"/api/events/{ev['id']}/tasks/{task_id}",
                     json={"status": "done"})
    assert r.status_code == 200
    body = client.get(f"/api/events/{ev['id']}").json()
    updated = next(t for t in body["active_plan"]["tasks"] if t["id"] == task_id)
    assert updated["status"] == "done"
