"""Orchestration layer: events, plans, approvals, tasks, vendors.

Enforces:
- backend-recomputed budgets (never trust client totals)
- optimistic concurrency on plan approval (stale proposals rejected)
- ownership checks when auth is enabled
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.money import rupees_to_paise
from app.models.change import ReplanRequest, ReplanResult
from app.models.event import Event, EventCreate
from app.models.plan import Plan, VendorQuote
from app.repositories.base import StaleActivePlan
from app.repositories.provider import get_repository
from app.services import budget_service, change_engine, plan_generator, vendor_service


class NotFound(Exception):
    pass


class Forbidden(Exception):
    pass


class StalePlan(Exception):
    """Raised when approving a proposal built against an outdated active plan."""


class InvalidProposal(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_owner(event: dict, owner_id: Optional[str]) -> None:
    if owner_id is not None and event.get("owner_id") not in (None, owner_id):
        raise Forbidden("You do not own this event")


# --------------------------------------------------------------------------
# Events
# --------------------------------------------------------------------------
def create_event(data: EventCreate, owner_id: Optional[str]) -> Event:
    repo = get_repository()
    event_id = f"evt-{uuid.uuid4().hex[:10]}"
    budget_paise = rupees_to_paise(data.budget_inr)
    event = Event.from_create(event_id, data, owner_id, budget_paise, _now())
    repo.create_event(event.model_dump(mode="json"))
    return event


def get_event(event_id: str, owner_id: Optional[str]) -> dict:
    repo = get_repository()
    event = repo.get_event(event_id)
    if event is None:
        raise NotFound(event_id)
    _check_owner(event, owner_id)
    return event


def list_events(owner_id: Optional[str]) -> list[dict]:
    return get_repository().list_events(owner_id)


# --------------------------------------------------------------------------
# Plans
# --------------------------------------------------------------------------
def generate_initial_plan(event_id: str, owner_id: Optional[str]) -> Plan:
    repo = get_repository()
    event_dict = get_event(event_id, owner_id)
    event = Event.model_validate(event_dict)
    existing = repo.list_plans(event_id)
    version = (max((p["version"] for p in existing), default=0)) + 1

    plan = plan_generator.generate_plan(event, version=version)

    # Backend re-validates arithmetic before persisting.
    errors = budget_service.validate_arithmetic(plan.budget, plan.expenses)
    if errors:
        raise InvalidProposal("; ".join(errors))

    plan.is_active = True
    stored = plan.model_dump(mode="json")
    repo.add_plan(event_id, stored)
    repo.set_active_plan(event_id, plan.id)
    return plan


def list_plans(event_id: str, owner_id: Optional[str]) -> list[dict]:
    get_event(event_id, owner_id)  # ownership check
    return get_repository().list_plans(event_id)


def get_active_plan(event_id: str, owner_id: Optional[str]) -> Optional[dict]:
    get_event(event_id, owner_id)
    return get_repository().get_active_plan(event_id)


# --------------------------------------------------------------------------
# Replanning (proposal only — not persisted until approved)
# --------------------------------------------------------------------------
def replan(event_id: str, req: ReplanRequest, owner_id: Optional[str]) -> ReplanResult:
    repo = get_repository()
    event_dict = get_event(event_id, owner_id)
    event = Event.model_validate(event_dict)
    active = repo.get_active_plan(event_id)
    if active is None:
        raise NotFound("no active plan to replan")
    current = Plan.model_validate(active)

    result = change_engine.replan(event, current, req)

    # Re-validate the proposed plan's arithmetic defensively.
    if result.proposed_plan is not None:
        proposed = Plan.model_validate(result.proposed_plan)
        errors = budget_service.validate_arithmetic(proposed.budget, proposed.expenses)
        if errors:
            raise InvalidProposal("; ".join(errors))
    return result


def approve_plan(event_id: str, proposed_plan: dict, base_version: int,
                 owner_id: Optional[str]) -> Plan:
    """Approve a proposal, applying optimistic concurrency.

    `base_version` is the version the proposal was built against. If the active
    plan has advanced past it, the proposal is stale and rejected.
    """
    repo = get_repository()
    event_dict = get_event(event_id, owner_id)
    event = Event.model_validate(event_dict)

    active = repo.get_active_plan(event_id)
    if active is None:
        raise NotFound("no active plan")
    if active["version"] != base_version:
        raise StalePlan(
            f"active plan is version {active['version']}, proposal was built "
            f"against version {base_version}"
        )

    plan = Plan.model_validate(proposed_plan)
    # Server recomputes the budget from the proposal's expenses — client numbers
    # are not trusted.
    plan.budget = budget_service.summarize(plan.budget.budget_paise, plan.expenses)
    errors = budget_service.validate_arithmetic(plan.budget, plan.expenses)
    if errors:
        raise InvalidProposal("; ".join(errors))

    plan.version = active["version"] + 1
    plan.is_active = True
    plan.created_at = _now()
    stored = plan.model_dump(mode="json")

    # Atomic compare-and-swap: only activates if the active version is still
    # `base_version`. Two simultaneous approvals cannot both succeed; the loser
    # gets StaleActivePlan -> surfaced as StalePlan (HTTP 409).
    try:
        repo.commit_approved_plan(event_id, stored, base_version)
    except StaleActivePlan as exc:
        raise StalePlan(str(exc)) from exc

    # Keep event budget in sync if this was a budget change.
    if plan.budget.budget_paise != event.budget_paise:
        repo.update_event(event_id, {
            "budget_paise": plan.budget.budget_paise,
            "budget_inr": plan.budget.budget_paise / 100,
            "updated_at": _now().isoformat(),
        })
    return plan


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------
def update_task(event_id: str, task_id: str, patch: dict,
                owner_id: Optional[str]) -> dict:
    get_event(event_id, owner_id)
    allowed = {k: v for k, v in patch.items() if k in ("status", "due_date")}
    return get_repository().update_task(event_id, task_id, allowed)


# --------------------------------------------------------------------------
# Vendors
# --------------------------------------------------------------------------
def compare_vendors(event_id: str, quotes: list[VendorQuote],
                    owner_id: Optional[str]):
    get_event(event_id, owner_id)
    comparison = vendor_service.compare_quotes(quotes)
    get_repository().save_vendor_quotes(
        event_id, [q.model_dump(mode="json") for q in comparison.quotes]
    )
    return comparison


def list_vendors(event_id: str, owner_id: Optional[str]) -> list[dict]:
    get_event(event_id, owner_id)
    return get_repository().list_vendor_quotes(event_id)


# --------------------------------------------------------------------------
# Guests
# --------------------------------------------------------------------------
def list_guests(event_id: str, owner_id: Optional[str]) -> list[dict]:
    get_event(event_id, owner_id)
    return get_repository().list_guests(event_id)


def save_guests(event_id: str, guests: list, owner_id: Optional[str]):
    """Replace the guest list (full-list upsert). Assigns ids where missing and
    returns the stored guests plus a deterministic summary."""
    from app.models.guest import Guest, GuestCreate
    from app.services import guest_service

    get_event(event_id, owner_id)
    normalized: list[Guest] = []
    for g in guests:
        if isinstance(g, Guest):
            guest = g
        elif isinstance(g, GuestCreate):
            guest = Guest(id=f"g-{uuid.uuid4().hex[:8]}", **g.model_dump())
        else:  # dict
            gid = g.get("id") or f"g-{uuid.uuid4().hex[:8]}"
            guest = Guest(id=gid, **{k: v for k, v in g.items() if k != "id"})
        normalized.append(guest)

    stored = [g.model_dump(mode="json") for g in normalized]
    get_repository().save_guests(event_id, stored)
    summary = guest_service.summarize(normalized)
    return {"guests": stored, "summary": summary.model_dump(mode="json")}


def guest_summary(event_id: str, owner_id: Optional[str]):
    from app.models.guest import Guest
    from app.services import guest_service

    get_event(event_id, owner_id)
    rows = get_repository().list_guests(event_id)
    guests = [Guest.model_validate(r) for r in rows]
    return guest_service.summarize(guests)


# --------------------------------------------------------------------------
# Catering
# --------------------------------------------------------------------------
def _catering_budget_paise(event_id: str) -> Optional[int]:
    """Authoritative catering allocation = the active plan's 'catering' category."""
    active = get_repository().get_active_plan(event_id)
    if not active:
        return None
    totals = active.get("budget", {}).get("category_totals", {})
    return totals.get("catering")


def _load_catering_plan(event_id: str):
    from app.models.catering import CateringPlan
    raw = get_repository().get_catering(event_id)
    return CateringPlan.model_validate(raw) if raw else CateringPlan()


def _catering_state(event_id: str, plan, owner_id: Optional[str]):
    """Compute the full catering state (plan with computed items + summary)."""
    from app.models.catering import CateringState, ComputedCateringPlan
    from app.services import catering_service

    event = Event.model_validate(get_event(event_id, owner_id))
    gsummary = guest_summary(event_id, owner_id)
    budget = _catering_budget_paise(event_id)
    items, summary = catering_service.compute(
        plan, event.guest_count, gsummary, budget
    )
    computed_plan = ComputedCateringPlan(
        items=items, preferences=plan.preferences,
        headcount_override=plan.headcount_override,
    )
    return CateringState(plan=computed_plan, summary=summary)


def get_catering(event_id: str, owner_id: Optional[str]):
    get_event(event_id, owner_id)
    plan = _load_catering_plan(event_id)
    return _catering_state(event_id, plan, owner_id)


def save_catering(event_id: str, plan, owner_id: Optional[str]):
    from app.services import catering_service

    get_event(event_id, owner_id)
    plan = catering_service.assign_ids(plan)
    errors = catering_service.validate_plan(plan)
    if errors:
        raise InvalidProposal("; ".join(errors))
    # Persist the raw plan (quantities/totals are always recomputed on read).
    get_repository().save_catering(event_id, plan.model_dump(mode="json"))
    return _catering_state(event_id, plan, owner_id)


def generate_catering_menu(event_id: str, prefs, owner_id: Optional[str]):
    """Generate menu items (not persisted until the user saves). Returns a
    proposed catering state plus metadata about how it was generated."""
    from app.models.catering import CateringPlan
    from app.services import catering_service, menu_ai

    event = Event.model_validate(get_event(event_id, owner_id))
    gsummary = guest_summary(event_id, owner_id)
    budget = _catering_budget_paise(event_id)
    hc = catering_service.resolve_headcount(event.guest_count, gsummary, None)

    items, generated_by = menu_ai.generate_menu(
        event.event_type, hc.catering_headcount, prefs,
        prefs.budget_per_guest_inr,
    )
    proposed = CateringPlan(items=items, preferences=prefs)
    proposed = catering_service.assign_ids(proposed)
    state = _catering_state_from_plan(event, gsummary, budget, proposed)
    return {
        "generated_by": generated_by,
        "state": state.model_dump(mode="json"),
        "allergy_notice": catering_service.allergy_notice(proposed),
    }


def _catering_state_from_plan(event, gsummary, budget, plan):
    from app.models.catering import CateringState, ComputedCateringPlan
    from app.services import catering_service
    items, summary = catering_service.compute(
        plan, event.guest_count, gsummary, budget
    )
    computed_plan = ComputedCateringPlan(
        items=items, preferences=plan.preferences,
        headcount_override=plan.headcount_override,
    )
    return CateringState(plan=computed_plan, summary=summary)


def optimize_catering(event_id: str, goal: str, owner_id: Optional[str]):
    from app.services import menu_ai

    event = Event.model_validate(get_event(event_id, owner_id))
    gsummary = guest_summary(event_id, owner_id)
    budget = _catering_budget_paise(event_id)
    if budget is None:
        raise InvalidProposal(
            "No catering budget allocation found. Generate an event plan first."
        )
    plan = _load_catering_plan(event_id)
    return menu_ai.optimize_for_budget(
        plan, event.guest_count, gsummary, budget, goal
    )
