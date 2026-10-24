"""Tests 6, 7, 8, 9 — change-impact engine."""
from __future__ import annotations

from datetime import date, timedelta

from app.models.change import ChangeType, ReplanRequest
from app.models.event import Event
from app.models.plan import Plan, Task, TaskStatus
from app.services import change_engine, event_service
from app.services.plan_generator import build_deterministic_plan


def _event_and_plan(birthday_event):
    event = event_service.create_event(birthday_event, owner_id=None)
    plan = build_deterministic_plan(event, version=1)
    return event, plan


# Test 6: replanning after a budget decrease stays within budget & preserves constraints
def test_replan_budget_decrease(birthday_event):
    event, plan = _event_and_plan(birthday_event)
    req = ReplanRequest(change_type=ChangeType.budget, new_budget_inr=24000)
    result = change_engine.replan(event, plan, req)
    assert result.report.feasible is True
    proposed = Plan.model_validate(result.proposed_plan)
    assert proposed.budget.allocated_paise <= proposed.budget.budget_paise
    assert proposed.budget.budget_paise == 24000 * 100
    # Hard constraint preserved
    assert "Vegetarian catering only" in result.report.preserved_constraints


# Test 7: guest count increase recalculates guest-dependent expenses
def test_guest_count_increase_scales_catering(birthday_event):
    event, plan = _event_and_plan(birthday_event)
    catering_before = next(e.amount_paise for e in plan.expenses
                           if e.category == "catering")
    req = ReplanRequest(change_type=ChangeType.guest_count, new_guest_count=100)
    result = change_engine.replan(event, plan, req)
    proposed = Plan.model_validate(result.proposed_plan)
    catering_after = next(e.amount_paise for e in proposed.expenses
                          if e.category == "catering")
    assert catering_after > catering_before
    assert abs(catering_after - catering_before * 2) <= 2  # ~2x for 2x guests


# Test 8: moving the date earlier recalculates deadlines / flags overdue
def test_date_change_recalculates_deadlines(birthday_event):
    event, plan = _event_and_plan(birthday_event)
    new_date = date.today() + timedelta(days=5)  # much earlier
    req = ReplanRequest(change_type=ChangeType.event_date, new_event_date=new_date)
    result = change_engine.replan(event, plan, req)
    assert result.report.task_deltas, "deadlines should shift"
    # Some tasks should now be flagged overdue given the compressed timeline.
    kinds = {d.kind for d in result.report.task_deltas}
    assert "rescheduled" in kinds


# Test 9: dependency conflict detection
def test_dependency_conflict_detected():
    from app.services.timeline_service import detect_dependency_conflicts
    tasks = [
        Task(id="t1", name="Book venue", status=TaskStatus.not_started),
        Task(id="t2", name="Catering", depends_on=["t1"],
             status=TaskStatus.ready),  # ready but prereq not done -> conflict
    ]
    conflicts = detect_dependency_conflicts(tasks)
    assert any("prerequisite" in c for c in conflicts)


# Replanning is bounded (no infinite loop) for an impossible budget
def test_replan_impossible_budget_is_bounded(birthday_event):
    event, plan = _event_and_plan(birthday_event)
    # Lock everything so nothing can be cut, then demand a tiny budget.
    for e in plan.expenses:
        e.negotiable = False
    req = ReplanRequest(change_type=ChangeType.budget, new_budget_inr=1000)
    result = change_engine.replan(event, plan, req)
    assert result.report.feasible is False
    assert result.proposed_plan is None
    assert result.report.constraint_violations
