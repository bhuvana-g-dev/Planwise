"""Live end-to-end smoke test against a running server on :8000.

Mirrors the hackathon demo: create -> plan -> reduce budget -> approve -> reload.
Run:  .venv\\Scripts\\python.exe scripts\\e2e_check.py
"""
from __future__ import annotations

import datetime as dt
import sys

import httpx

BASE = "http://127.0.0.1:8000"


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=30)

    health = c.get("/health").json()
    print("health:", health)

    event_date = (dt.date.today() + dt.timedelta(days=45)).isoformat()
    payload = {
        "name": "Aarav's 10th Birthday",
        "event_type": "birthday",
        "event_date": event_date,
        "location": "Madurai, Tamil Nadu, India",
        "guest_count": 50,
        "budget_inr": 30000,
        "style": "Simple outdoor celebration",
        "dietary_requirements": ["Vegetarian food"],
        "preferences": [{"label": "catering", "rank": 1},
                        {"label": "decorations", "rank": 2}],
        "hard_constraints": ["Vegetarian catering only"],
        "flexible_choices": ["decorations"],
    }
    ev = c.post("/api/events", json=payload)
    assert ev.status_code == 201, ev.text
    event_id = ev.json()["id"]
    print("created event:", event_id)

    plan = c.post(f"/api/events/{event_id}/plans").json()
    print("plan v{} within_budget={} allocated={}paise generated_by={}".format(
        plan["version"], plan["budget"]["within_budget"],
        plan["budget"]["allocated_paise"], plan["generated_by"]))
    assert plan["budget"]["within_budget"]

    # Reduce the budget 30000 -> 24000
    rr = c.post(f"/api/events/{event_id}/replans",
                json={"change_type": "budget", "new_budget_inr": 24000}).json()
    rep = rr["report"]
    print("replan feasible:", rep["feasible"],
          "preserved:", rep["preserved_constraints"],
          "trade_offs:", rep["trade_offs"])
    assert rep["feasible"] and rr["proposed_plan"] is not None
    assert "Vegetarian catering only" in rep["preserved_constraints"]

    # Approve against the correct base version
    approved = c.post(f"/api/events/{event_id}/plans/approve",
                      json={"proposed_plan": rr["proposed_plan"],
                            "base_version": plan["version"]})
    assert approved.status_code == 200, approved.text
    ap = approved.json()
    print("approved v{} budget={}paise within={}".format(
        ap["version"], ap["budget"]["budget_paise"], ap["budget"]["within_budget"]))
    assert ap["budget"]["budget_paise"] == 24000 * 100
    assert ap["budget"]["within_budget"]

    # Stale re-approval must fail with 409
    stale = c.post(f"/api/events/{event_id}/plans/approve",
                   json={"proposed_plan": rr["proposed_plan"],
                         "base_version": plan["version"]})
    print("stale approval status:", stale.status_code)
    assert stale.status_code == 409

    # Reload reflects the saved revision
    detail = c.get(f"/api/events/{event_id}").json()
    print("reloaded active v{}, versions saved: {}".format(
        detail["active_plan"]["version"], len(detail["plans"])))
    assert detail["active_plan"]["budget"]["budget_paise"] == 24000 * 100
    assert len(detail["plans"]) == 2

    print("\nALL E2E CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
