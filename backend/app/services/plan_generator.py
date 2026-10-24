"""Plan generation.

Produces a structured, budget-valid plan for an event. The deterministic
generator is always correct by construction (it sizes expenses to the budget)
and doubles as the fallback when Gemini is unavailable or returns bad data.

When Gemini is available we ask it only for *contextual* content
(recommendations, risks, vendor questions, assumptions) — never for the
authoritative numbers, which the budget service always recomputes.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.core.money import rupees_to_paise
from app.models.event import Event, EventType
from app.models.plan import (
    CategoryAllocation,
    Expense,
    ExpenseSource,
    Plan,
    Risk,
    Task,
    TaskPriority,
    TaskStatus,
)
from app.services import budget_service
from app.services.timeline_service import default_task_offsets
from app.services import gemini_client
from app.services.gemini_client import GeminiError

# Default category weightings per event type. These are *starting points*;
# they get re-weighted by the user's declared preference priorities.
BASE_WEIGHTS: dict[EventType, dict[str, float]] = {
    EventType.birthday: {
        "catering": 0.42, "venue": 0.20, "decorations": 0.18,
        "activities": 0.12, "logistics": 0.08,
    },
    EventType.wedding: {
        "catering": 0.38, "venue": 0.28, "decorations": 0.16,
        "activities": 0.10, "logistics": 0.08,
    },
    EventType.community: {
        "catering": 0.35, "venue": 0.22, "decorations": 0.13,
        "activities": 0.20, "logistics": 0.10,
    },
}

PER_GUEST_CATEGORIES = {"catering"}


def _apply_preferences(weights: dict[str, float],
                       preference_rank_by_category: dict[str, int]) -> dict[str, float]:
    """Boost weight for categories the user ranked highly (lower rank number)."""
    adjusted = dict(weights)
    for cat, rank in preference_rank_by_category.items():
        if cat in adjusted:
            boost = 1.0 + max(0.0, (4 - rank)) * 0.12  # rank 1 -> +36%, rank 3 -> +12%
            adjusted[cat] *= boost
    total = sum(adjusted.values())
    if total > 0:
        adjusted = {k: v / total for k, v in adjusted.items()}
    return adjusted


def preference_rank_by_category(event: Event) -> dict[str, int]:
    out: dict[str, int] = {}
    for p in event.preferences:
        out[p.label.strip().lower()] = p.rank
    return out


def _allocate(budget_paise: int, weights: dict[str, float]) -> dict[str, int]:
    """Split a budget across categories, assigning rounding remainder to largest."""
    raw = {c: int(budget_paise * w) for c, w in weights.items()}
    assigned = sum(raw.values())
    remainder = budget_paise - assigned
    if remainder and raw:
        biggest = max(raw, key=raw.get)
        raw[biggest] += remainder
    return raw


def _diet_label(event: Event) -> str:
    if event.dietary_requirements:
        return " / ".join(event.dietary_requirements)
    return "standard menu"


def build_deterministic_plan(event: Event, *, version: int,
                             generated_by: str = "deterministic") -> Plan:
    prefs = preference_rank_by_category(event)
    weights = _apply_preferences(BASE_WEIGHTS[event.event_type], prefs)
    per_cat = _allocate(event.budget_paise, weights)

    expenses: list[Expense] = []
    diet = _diet_label(event)
    for cat, amount in per_cat.items():
        per_guest = cat in PER_GUEST_CATEGORIES
        if per_guest and event.guest_count:
            pp = amount // event.guest_count
            assumption = (
                f"Estimate for {event.guest_count} guests ({diet}), "
                f"~{pp // 100} INR/guest. Illustrative estimate, not a quote."
            )
        else:
            assumption = "Illustrative estimate based on budget share, not a quote."
        expenses.append(
            Expense(
                id=f"exp-{cat}",
                category=cat,
                label=f"{cat.capitalize()} ({diet})" if cat == "catering"
                      else cat.capitalize(),
                amount_paise=amount,
                source=ExpenseSource.estimate,
                assumptions=assumption,
                per_guest=per_guest,
                negotiable=True,
            )
        )

    # Mark expenses tied to hard constraints as non-negotiable where we can map
    # a constraint keyword to a category.
    for hc in event.hard_constraints:
        low = hc.lower()
        for e in expenses:
            if e.category in low or any(k in low for k in (e.category,)):
                e.negotiable = False
                e.satisfies_constraint = hc

    summary = budget_service.summarize(event.budget_paise, expenses)
    allocations = [CategoryAllocation(category=c, allocated_paise=a)
                   for c, a in per_cat.items()]

    tasks = _build_tasks(event)

    risks = [
        Risk(description="Estimates are illustrative, not verified vendor quotes.",
             severity="medium"),
    ]
    if not summary.within_budget:
        risks.append(Risk(description="Plan exceeds budget.", severity="high"))

    plan = Plan(
        id=f"plan-{uuid.uuid4().hex[:10]}",
        event_id=event.id,
        version=version,
        overview=(
            f"{event.event_type.value.capitalize()} for {event.guest_count} guests "
            f"in {event.location} on {event.event_date.isoformat()}. "
            f"{event.style or 'Celebration'} style. All costs are illustrative "
            f"estimates, not verified vendor quotations."
        ),
        expenses=expenses,
        allocations=allocations,
        tasks=tasks,
        recommendations=_default_recommendations(event, prefs),
        vendor_questions=_default_vendor_questions(event),
        risks=risks,
        open_decisions=["Confirm final guest count", "Shortlist and contact vendors"],
        budget=summary,
        generated_by=generated_by,
        created_at=datetime.now(timezone.utc),
    )
    return plan


def _build_tasks(event: Event) -> list[Task]:
    offsets = default_task_offsets(event.event_date)
    t_venue = Task(id="t-venue", name="Confirm venue", related_category="venue",
                   priority=TaskPriority.critical, due_date=offsets["venue"],
                   status=TaskStatus.ready,
                   description="Shortlist and book the event venue.")
    t_catering = Task(id="t-catering", name="Finalize catering",
                      related_category="catering", priority=TaskPriority.high,
                      due_date=offsets["catering"], depends_on=["t-venue"],
                      status=TaskStatus.blocked,
                      description="Confirm menu and headcount with caterer.")
    t_invites = Task(id="t-invites", name="Send invitations",
                     related_category="logistics", priority=TaskPriority.high,
                     due_date=offsets["invitations"],
                     status=TaskStatus.ready,
                     description="Share invites and collect RSVPs.")
    t_decor = Task(id="t-decor", name="Arrange decorations",
                   related_category="decorations", priority=TaskPriority.medium,
                   due_date=offsets["decorations"], depends_on=["t-venue"],
                   status=TaskStatus.blocked,
                   description="Plan and order decorations.")
    t_activities = Task(id="t-activities", name="Plan activities",
                        related_category="activities", priority=TaskPriority.medium,
                        due_date=offsets["activities"],
                        status=TaskStatus.ready,
                        description="Organize entertainment and activities.")
    t_logistics = Task(id="t-logistics", name="Confirm day-of logistics",
                       related_category="logistics", priority=TaskPriority.high,
                       due_date=offsets["logistics"],
                       depends_on=["t-venue", "t-catering"],
                       status=TaskStatus.blocked,
                       description="Transport, setup, timing and cleanup.")
    return [t_venue, t_catering, t_invites, t_decor, t_activities, t_logistics]


def _default_recommendations(event: Event, prefs: dict[str, int]) -> list[str]:
    recs = [
        f"Prioritize spend on {min(prefs, key=prefs.get)} based on your stated "
        f"preferences." if prefs else "Confirm your top priority to guide spend.",
        "Book the venue first — several other tasks depend on it.",
    ]
    if event.dietary_requirements:
        recs.append(
            f"Confirm the caterer can reliably serve: "
            f"{', '.join(event.dietary_requirements)}."
        )
    return recs


def _default_vendor_questions(event: Event) -> list[str]:
    qs = [
        "Is the quoted price inclusive of taxes and service charges?",
        "What is included and explicitly excluded from the package?",
        "What is your cancellation and rescheduling policy?",
        f"Can you confirm availability on {event.event_date.isoformat()}?",
    ]
    if event.dietary_requirements:
        qs.append("Can you guarantee the dietary requirements with no cross-contamination?")
    return qs


def generate_plan(event: Event, *, version: int = 1) -> Plan:
    """Generate a plan, enriching with Gemini content when available.

    All numbers remain deterministic; Gemini only supplies narrative content.
    """
    plan = build_deterministic_plan(event, version=version)

    try:
        enrichment = _ask_gemini_for_content(event, plan)
    except GeminiError:
        return plan  # fallback: deterministic plan already valid

    if isinstance(enrichment, dict):
        recs = enrichment.get("recommendations")
        if isinstance(recs, list) and all(isinstance(x, str) for x in recs):
            plan.recommendations = recs[:8] or plan.recommendations
        risks = enrichment.get("risks")
        if isinstance(risks, list):
            parsed = []
            for r in risks:
                if isinstance(r, dict) and isinstance(r.get("description"), str):
                    parsed.append(Risk(description=r["description"],
                                       severity=str(r.get("severity", "medium"))))
            if parsed:
                plan.risks = parsed[:8]
        vqs = enrichment.get("vendor_questions")
        if isinstance(vqs, list) and all(isinstance(x, str) for x in vqs):
            plan.vendor_questions = vqs[:10] or plan.vendor_questions
        ov = enrichment.get("overview")
        if isinstance(ov, str) and ov.strip():
            plan.overview = ov.strip()[:1000]
        plan.generated_by = "gemini"
    return plan


def _ask_gemini_for_content(event: Event, plan: Plan) -> dict:
    system = (
        "You are an expert event planner. Return STRICT JSON only. "
        "Never invent real vendor names, prices, or availability. Costs are the "
        "user's responsibility; you only give qualitative guidance."
    )
    prompt = (
        "Given this event, produce JSON with keys: overview (string), "
        "recommendations (string[]), risks ({description,severity}[]), "
        "vendor_questions (string[]). Do NOT include any monetary figures.\n\n"
        f"Event: {event.event_type.value}, {event.guest_count} guests, "
        f"{event.location}, date {event.event_date.isoformat()}, "
        f"style {event.style}, diet {event.dietary_requirements}, "
        f"accessibility {event.accessibility_requirements}, "
        f"hard constraints {event.hard_constraints}, "
        f"preferences {[p.model_dump() for p in event.preferences]}."
    )
    return gemini_client.generate_json(prompt, system=system)
