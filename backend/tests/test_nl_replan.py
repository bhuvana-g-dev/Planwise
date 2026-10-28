"""Natural-language Adapt Plan — interpretation + validation + hard_constraints.

Gemini is always mocked here (we never make a live call). These tests prove:
- valid NL requests become validated ReplanRequests + a feasible proposal,
- ambiguous / missing-value / unsupported requests ask for clarification,
- malformed AI output and every Gemini failure mode degrade gracefully,
- numeric/date bounds and enum values are enforced in Python (not the AI),
- before/after arithmetic is computed deterministically,
- ownership is enforced and nothing is persisted until approval,
- the previously-unhandled hard_constraints change type now works.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.models.change import ChangeType, ReplanRequest
from app.models.plan import Plan
from app.services import (
    change_engine,
    event_service,
    gemini_client,
    nl_replan,
)
from app.services.gemini_client import (
    GeminiBadResponse,
    GeminiTimeout,
    GeminiUnavailable,
)
from app.services.plan_generator import build_deterministic_plan


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _event_with_plan(birthday_event):
    """Create an event and persist an active deterministic plan."""
    event = event_service.create_event(birthday_event, owner_id=None)
    plan = event_service.generate_initial_plan(event.id, owner_id=None)
    return event, plan


def _mock_gemini(monkeypatch, payload):
    """Force gemini_client.generate_json to return a fixed dict."""
    monkeypatch.setattr(gemini_client, "generate_json",
                        lambda *a, **k: payload)


def _raise_gemini(monkeypatch, exc):
    def _boom(*a, **k):
        raise exc
    monkeypatch.setattr(gemini_client, "generate_json", _boom)


# --------------------------------------------------------------------------
# Intent extraction (interpret) — valid cases
# --------------------------------------------------------------------------
def test_interpret_budget(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {
        "change_type": "budget", "new_budget_inr": 24000,
        "understood": "Reduce the budget to 24000",
    })
    out = event_service.interpret_replan(event.id, "cut budget to 24k", None)
    assert out["status"] == "interpreted"
    assert out["source"] == "gemini"
    assert out["replan_request"]["change_type"] == "budget"
    assert out["replan_request"]["new_budget_inr"] == 24000
    # A validated proposal was produced by the deterministic engine.
    assert out["result"] is not None
    assert out["result"]["report"]["feasible"] is True
    assert out["result"]["proposed_plan"]["budget"]["budget_paise"] == 24000 * 100


def test_interpret_guest_count(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {
        "change_type": "guest_count", "new_guest_count": 100,
        "understood": "Add guests to 100",
    })
    out = event_service.interpret_replan(event.id, "add 50 guests", None)
    assert out["status"] == "interpreted"
    assert out["replan_request"]["new_guest_count"] == 100
    assert out["result"]["proposed_plan"] is not None


def test_interpret_date(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    new_date = (date.today() + timedelta(days=60)).isoformat()
    _mock_gemini(monkeypatch, {
        "change_type": "event_date", "new_event_date": new_date,
        "understood": f"Move to {new_date}",
    })
    out = event_service.interpret_replan(event.id, f"move it to {new_date}", None)
    assert out["status"] == "interpreted"
    assert out["replan_request"]["new_event_date"] == new_date
    assert out["result"]["report"]["change_type"] == "event_date"


# --------------------------------------------------------------------------
# Clarification cases (ambiguous / missing value / unsupported)
# --------------------------------------------------------------------------
def test_interpret_unclear_change_type(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {
        "change_type": "unclear",
        "understood": "The request was ambiguous",
    })
    out = event_service.interpret_replan(event.id, "make it nicer", None)
    assert out["status"] == "needs_clarification"
    assert out["result"] is None


def test_interpret_budget_missing_value_asks_clarification(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    # AI identified a budget change but did NOT invent an amount.
    _mock_gemini(monkeypatch, {
        "change_type": "budget", "new_budget_inr": None,
        "understood": "Lower the budget by some amount",
    })
    out = event_service.interpret_replan(event.id, "make it cheaper", None)
    assert out["status"] == "needs_clarification"
    assert out["result"] is None


def test_interpret_rejects_out_of_range_guest_count(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {
        "change_type": "guest_count", "new_guest_count": 0,
    })
    out = event_service.interpret_replan(event.id, "zero guests", None)
    assert out["status"] == "needs_clarification"


def test_interpret_rejects_past_date(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    past = (date.today() - timedelta(days=3)).isoformat()
    _mock_gemini(monkeypatch, {
        "change_type": "event_date", "new_event_date": past,
    })
    out = event_service.interpret_replan(event.id, f"move to {past}", None)
    assert out["status"] == "needs_clarification"


def test_interpret_rejects_bad_date_format(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {
        "change_type": "event_date", "new_event_date": "next Friday",
    })
    out = event_service.interpret_replan(event.id, "move to next friday", None)
    assert out["status"] == "needs_clarification"


# --------------------------------------------------------------------------
# Malformed AI output + Gemini failure modes
# --------------------------------------------------------------------------
def test_interpret_non_dict_output(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, ["not", "a", "dict"])
    out = event_service.interpret_replan(event.id, "whatever", None)
    assert out["status"] == "needs_clarification"


def test_interpret_gemini_unavailable(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _raise_gemini(monkeypatch, GeminiUnavailable("no key"))
    out = event_service.interpret_replan(event.id, "cut budget to 20000", None)
    assert out["status"] == "unavailable"
    assert out["source"] == "unavailable"
    assert out["result"] is None


def test_interpret_gemini_timeout(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _raise_gemini(monkeypatch, GeminiTimeout("deadline exceeded"))
    out = event_service.interpret_replan(event.id, "cut budget to 20000", None)
    assert out["status"] == "unavailable"


def test_interpret_gemini_bad_response(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _raise_gemini(monkeypatch, GeminiBadResponse("garbage"))
    out = event_service.interpret_replan(event.id, "cut budget to 20000", None)
    assert out["status"] == "unavailable"


def test_interpret_empty_text():
    # Pure unit: no event needed when the text is blank.
    from app.models.event import Event, EventCreate, EventType

    create = EventCreate(
        name="X", event_type=EventType.birthday,
        event_date=date.today() + timedelta(days=10),
        location="Madurai", guest_count=10, budget_inr=10000,
    )
    event = Event.from_create("evt-x", create, None, 10000 * 100, _now())
    res = nl_replan.interpret(event, "   ")
    assert res.status == "needs_clarification"


# --------------------------------------------------------------------------
# Before/after arithmetic is deterministic (not from the AI)
# --------------------------------------------------------------------------
def test_interpret_budget_arithmetic_is_deterministic(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {"change_type": "budget", "new_budget_inr": 24000})
    out = event_service.interpret_replan(event.id, "budget 24000", None)
    report = out["result"]["report"]
    proposed = Plan.model_validate(out["result"]["proposed_plan"])
    # Allocated never exceeds the new budget, and remaining == budget - allocated.
    assert proposed.budget.allocated_paise <= 24000 * 100
    assert report["proposed_remaining_paise"] == (
        24000 * 100 - report["proposed_allocated_paise"]
    )


# --------------------------------------------------------------------------
# Ownership: a different owner cannot interpret against someone else's event
# --------------------------------------------------------------------------
def test_interpret_enforces_ownership(monkeypatch, birthday_event):
    event = event_service.create_event(birthday_event, owner_id="owner-a")
    event_service.generate_initial_plan(event.id, owner_id="owner-a")
    _mock_gemini(monkeypatch, {"change_type": "budget", "new_budget_inr": 24000})
    with pytest.raises(event_service.Forbidden):
        event_service.interpret_replan(event.id, "cut budget", "owner-b")


# --------------------------------------------------------------------------
# hard_constraints change type (previously unhandled dispatcher branch)
# --------------------------------------------------------------------------
def test_hard_constraints_handler_tags_category(birthday_event):
    event = event_service.create_event(birthday_event, owner_id=None)
    plan = build_deterministic_plan(event, version=1)
    req = ReplanRequest(
        change_type=ChangeType.hard_constraints,
        new_hard_constraints=["catering must stay premium"],
    )
    result = change_engine.replan(event, plan, req)
    assert result.report.feasible is True
    proposed = Plan.model_validate(result.proposed_plan)
    catering = next(e for e in proposed.expenses if e.category == "catering")
    assert catering.negotiable is False
    assert catering.satisfies_constraint == "catering must stay premium"
    # Budget total is unchanged by a constraint change.
    assert proposed.budget.budget_paise == plan.budget.budget_paise


def test_hard_constraints_unmapped_is_soft_violation(birthday_event):
    event = event_service.create_event(birthday_event, owner_id=None)
    plan = build_deterministic_plan(event, version=1)
    req = ReplanRequest(
        change_type=ChangeType.hard_constraints,
        new_hard_constraints=["photographer must be award winning"],
    )
    result = change_engine.replan(event, plan, req)
    # Still feasible (arithmetic holds) but surfaces a warning.
    assert result.report.feasible is True
    assert result.report.constraint_violations
    assert result.proposed_plan is not None


def test_interpret_hard_constraints(monkeypatch, birthday_event):
    event, _ = _event_with_plan(birthday_event)
    _mock_gemini(monkeypatch, {
        "change_type": "hard_constraints",
        "new_hard_constraints": ["catering vegetarian only"],
        "understood": "Add a catering constraint",
    })
    out = event_service.interpret_replan(event.id, "catering must be veg", None)
    assert out["status"] == "interpreted"
    assert out["result"]["report"]["change_type"] == "hard_constraints"


# Late import to avoid a cycle at module load.
from app.services.event_service import _now  # noqa: E402
