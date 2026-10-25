"""Concurrent-approval safety: atomic compare-and-swap on plan activation."""
from __future__ import annotations

import pytest

from app.models.change import ChangeType, ReplanRequest
from app.repositories.base import StaleActivePlan
from app.services import event_service
from app.services.event_service import StalePlan


def _setup(birthday_event):
    event = event_service.create_event(birthday_event, owner_id="u1")
    plan = event_service.generate_initial_plan(event.id, owner_id="u1")
    result = event_service.replan(
        event.id,
        ReplanRequest(change_type=ChangeType.budget, new_budget_inr=24000),
        owner_id="u1",
    )
    return event, plan, result


def test_two_simultaneous_approvals_only_one_wins(birthday_event):
    event, plan, result = _setup(birthday_event)
    proposed = result.proposed_plan

    # First approval against base version succeeds.
    approved = event_service.approve_plan(event.id, proposed, plan.version, "u1")
    assert approved.version == plan.version + 1

    # Second approval of the SAME proposal (same base_version) must be rejected
    # as stale — it cannot overwrite the newer active plan.
    with pytest.raises(StalePlan):
        event_service.approve_plan(event.id, proposed, plan.version, "u1")


def test_commit_approved_plan_is_atomic_cas(birthday_event, temp_repo):
    event, plan, result = _setup(birthday_event)
    proposed = dict(result.proposed_plan)
    proposed["version"] = plan.version + 1

    # Direct repo CAS: wrong expected version is rejected.
    with pytest.raises(StaleActivePlan):
        temp_repo.commit_approved_plan(event.id, proposed, plan.version + 99)

    # Correct expected version commits and flips active flags.
    temp_repo.commit_approved_plan(event.id, proposed, plan.version)
    active = temp_repo.get_active_plan(event.id)
    assert active["version"] == plan.version + 1
    assert sum(1 for p in temp_repo.list_plans(event.id) if p["is_active"]) == 1


def test_reject_leaves_active_plan_unchanged(birthday_event):
    event, plan, result = _setup(birthday_event)
    # "Reject" = never call approve. Active plan must be the original.
    active = event_service.get_active_plan(event.id, "u1")
    assert active["id"] == plan.id
    assert active["budget"]["budget_paise"] == 30000 * 100
