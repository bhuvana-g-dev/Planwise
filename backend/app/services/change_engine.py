"""Adaptive change-impact engine (the core differentiator).

Given a current plan and a requested change, produces a *proposed* plan plus a
structured ChangeReport describing exactly what changed and why. All numeric
decisions are deterministic; feasibility is proven by the budget service.

Replanning never loops indefinitely: budget rebalancing takes at most a bounded
number of passes, after which an explicit infeasibility report is returned.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from app.core.money import rupees_to_paise
from app.models.change import (
    ChangeReport,
    ChangeType,
    ExpenseDelta,
    ReplanRequest,
    ReplanResult,
    TaskDelta,
)
from app.models.event import Event
from app.models.plan import Expense, Plan, TaskStatus
from app.services import budget_service
from app.services.plan_generator import preference_rank_by_category
from app.services.timeline_service import (
    find_overdue_tasks,
    recalc_deadlines,
)

MAX_REBALANCE_PASSES = 20
MIN_EXPENSE_PAISE = 0  # expenses may be driven to zero (removed) but not negative


def _clone_expenses(expenses: list[Expense]) -> list[Expense]:
    return [e.model_copy(deep=True) for e in expenses]


def _new_plan_from(current: Plan, expenses: list[Expense], budget_paise: int,
                   tasks, change_summary: str) -> Plan:
    summary = budget_service.summarize(budget_paise, expenses)
    return Plan(
        id=f"plan-{uuid.uuid4().hex[:10]}",
        event_id=current.event_id,
        version=current.version + 1,
        overview=current.overview,
        expenses=expenses,
        allocations=current.allocations,
        tasks=tasks,
        recommendations=current.recommendations,
        vendor_questions=current.vendor_questions,
        risks=current.risks,
        open_decisions=current.open_decisions,
        budget=summary,
        generated_by=current.generated_by,
        change_summary=change_summary,
        created_at=datetime.now(timezone.utc),
        is_active=False,
    )


def _expense_deltas(old: list[Expense], new: list[Expense]) -> list[ExpenseDelta]:
    old_by_id = {e.id: e for e in old}
    new_by_id = {e.id: e for e in new}
    deltas: list[ExpenseDelta] = []
    for eid, ne in new_by_id.items():
        oe = old_by_id.get(eid)
        if oe is None:
            deltas.append(ExpenseDelta(kind="added", category=ne.category,
                                       label=ne.label, new_paise=ne.amount_paise,
                                       reason="New expense introduced by change"))
        elif oe.amount_paise != ne.amount_paise:
            direction = "reduced" if ne.amount_paise < oe.amount_paise else "increased"
            deltas.append(ExpenseDelta(kind="modified", category=ne.category,
                                       label=ne.label, previous_paise=oe.amount_paise,
                                       new_paise=ne.amount_paise,
                                       reason=f"{ne.category.capitalize()} {direction}"))
        else:
            deltas.append(ExpenseDelta(kind="unchanged", category=ne.category,
                                       label=ne.label, previous_paise=oe.amount_paise,
                                       new_paise=ne.amount_paise))
    for eid, oe in old_by_id.items():
        if eid not in new_by_id:
            deltas.append(ExpenseDelta(kind="removed", category=oe.category,
                                       label=oe.label, previous_paise=oe.amount_paise,
                                       reason="Removed to meet the new budget"))
    return deltas


# --------------------------------------------------------------------------
# Budget change
# --------------------------------------------------------------------------
def _rebalance_to_budget(expenses: list[Expense], budget_paise: int,
                         prefs_by_cat: dict[str, int]) -> tuple[list[Expense], list[str]]:
    """Reduce negotiable expenses to fit a (lower) budget using preference ranks.

    Returns (adjusted_expenses, trade_off_messages). Bounded passes guarantee
    termination.
    """
    expenses = _clone_expenses(expenses)
    trade_offs: list[str] = []
    passes = 0
    while passes < MAX_REBALANCE_PASSES:
        summary = budget_service.summarize(budget_paise, expenses)
        if summary.within_budget:
            break
        overrun = summary.allocated_paise - budget_paise
        candidates = budget_service.rank_savings_candidates(expenses, prefs_by_cat)
        if not candidates:
            break  # nothing left to cut
        target = candidates[0].expense
        # Cut this candidate by up to the overrun, but keep it >= 0.
        cut = min(target.amount_paise, overrun)
        if cut <= 0:
            # candidate already at zero; drop it and continue
            expenses = [e for e in expenses if e.id != target.id]
            passes += 1
            continue
        for e in expenses:
            if e.id == target.id:
                e.amount_paise -= cut
                trade_offs.append(
                    f"Reduced {e.category} to help meet the lower budget."
                )
                break
        passes += 1
    return expenses, trade_offs


def _handle_budget(event: Event, current: Plan, req: ReplanRequest) -> ReplanResult:
    new_budget = rupees_to_paise(req.new_budget_inr)
    prefs = preference_rank_by_category(event)
    expenses = _clone_expenses(current.expenses)

    trade_offs: list[str] = []
    violations: list[str] = []
    reasons: list[str] = []

    if new_budget >= current.budget.allocated_paise:
        reasons.append("New budget covers the current plan; no cuts required.")
    else:
        expenses, trade_offs = _rebalance_to_budget(expenses, new_budget, prefs)
        reasons.append("Reduced the lowest-priority negotiable categories first, "
                       "based on your stated preferences.")

    summary = budget_service.summarize(new_budget, expenses)

    # Validate hard constraints: any expense that satisfies a hard constraint
    # must survive (amount > 0 and present).
    preserved = []
    for hc in event.hard_constraints:
        satisfied = any(
            e.satisfies_constraint == hc and e.amount_paise > 0 for e in expenses
        ) or not any(e.satisfies_constraint == hc for e in current.expenses)
        if satisfied:
            preserved.append(hc)
        else:
            violations.append(f"Hard constraint not preserved: {hc}")

    feasible = summary.within_budget and not violations
    if not feasible and not summary.within_budget:
        violations.append(
            "Cannot fit the plan within the new budget without violating "
            "non-negotiable items. Consider reducing guests, changing venue, "
            "or raising the budget."
        )

    deltas = _expense_deltas(current.expenses, expenses)
    affected = sorted({d.category for d in deltas if d.kind != "unchanged"})

    proposed = _new_plan_from(
        current, expenses, new_budget, current.tasks,
        change_summary=f"Budget changed to {req.new_budget_inr} INR",
    ) if feasible else None

    report = ChangeReport(
        change_type=ChangeType.budget,
        previous_value=current.budget.budget_paise,
        new_value=new_budget,
        feasible=feasible,
        affected_categories=affected,
        expense_deltas=deltas,
        preserved_constraints=preserved,
        constraint_violations=violations,
        trade_offs=list(dict.fromkeys(trade_offs)),
        reasons=reasons,
        previous_budget_paise=current.budget.budget_paise,
        proposed_allocated_paise=summary.allocated_paise,
        proposed_remaining_paise=summary.remaining_paise,
    )
    return ReplanResult(report=report,
                        proposed_plan=proposed.model_dump(mode="json") if proposed else None)


# --------------------------------------------------------------------------
# Guest count change
# --------------------------------------------------------------------------
def _handle_guest_count(event: Event, current: Plan, req: ReplanRequest) -> ReplanResult:
    old_guests = event.guest_count
    new_guests = req.new_guest_count
    if old_guests <= 0:
        old_guests = 1
    factor = new_guests / old_guests

    expenses = _clone_expenses(current.expenses)
    reasons = [f"Guest count changed from {old_guests} to {new_guests}; "
               f"recalculated guest-dependent costs."]
    for e in expenses:
        if e.per_guest:
            e.amount_paise = int(round(e.amount_paise * factor))
            e.assumptions = (f"Scaled for {new_guests} guests. "
                             f"Illustrative estimate, not a quote.")

    summary = budget_service.summarize(current.budget.budget_paise, expenses)
    trade_offs: list[str] = []
    violations: list[str] = []
    if not summary.within_budget:
        trade_offs.append("More guests pushed the plan over budget; rebalance or "
                          "raise the budget.")
    deltas = _expense_deltas(current.expenses, expenses)
    affected = sorted({d.category for d in deltas if d.kind != "unchanged"})

    feasible = summary.within_budget
    proposed = _new_plan_from(
        current, expenses, current.budget.budget_paise, current.tasks,
        change_summary=f"Guest count changed to {new_guests}",
    ) if feasible else _new_plan_from(
        current, expenses, current.budget.budget_paise, current.tasks,
        change_summary=f"Guest count changed to {new_guests} (over budget)",
    )

    report = ChangeReport(
        change_type=ChangeType.guest_count,
        previous_value=old_guests,
        new_value=new_guests,
        feasible=feasible,
        affected_categories=affected,
        expense_deltas=deltas,
        preserved_constraints=event.hard_constraints,
        constraint_violations=violations,
        trade_offs=trade_offs,
        reasons=reasons,
        previous_budget_paise=current.budget.budget_paise,
        proposed_allocated_paise=summary.allocated_paise,
        proposed_remaining_paise=summary.remaining_paise,
    )
    return ReplanResult(report=report, proposed_plan=proposed.model_dump(mode="json"))


# --------------------------------------------------------------------------
# Event date change
# --------------------------------------------------------------------------
def _handle_date(event: Event, current: Plan, req: ReplanRequest) -> ReplanResult:
    old_date = event.event_date
    new_date = req.new_event_date
    new_tasks = recalc_deadlines(current.tasks, old_date, new_date)
    overdue = find_overdue_tasks(new_tasks, date.today())

    task_deltas: list[TaskDelta] = []
    old_by_id = {t.id: t for t in current.tasks}
    for t in new_tasks:
        ot = old_by_id.get(t.id)
        if ot and ot.due_date != t.due_date:
            task_deltas.append(TaskDelta(kind="rescheduled", task_id=t.id,
                                         name=t.name, previous_due=ot.due_date,
                                         new_due=t.due_date,
                                         reason="Deadline shifted with the event date"))
    for t in overdue:
        task_deltas.append(TaskDelta(kind="overdue", task_id=t.id, name=t.name,
                                     new_due=t.due_date,
                                     reason="Now overdue after moving the date earlier"))

    reasons = [f"Event date changed from {old_date.isoformat()} to "
               f"{new_date.isoformat()}; deadlines recalculated."]
    trade_offs = []
    if overdue:
        trade_offs.append(f"{len(overdue)} task(s) are now overdue and need urgent "
                          f"attention or rescheduling.")

    summary = budget_service.summarize(current.budget.budget_paise, current.expenses)
    proposed = _new_plan_from(
        current, _clone_expenses(current.expenses), current.budget.budget_paise,
        new_tasks, change_summary=f"Event date changed to {new_date.isoformat()}",
    )
    report = ChangeReport(
        change_type=ChangeType.event_date,
        previous_value=old_date.isoformat(),
        new_value=new_date.isoformat(),
        feasible=True,
        affected_categories=[],
        task_deltas=task_deltas,
        preserved_constraints=event.hard_constraints,
        trade_offs=trade_offs,
        reasons=reasons,
        unresolved_questions=(["Reconfirm vendor availability for the new date."]
                              if task_deltas else []),
        previous_budget_paise=current.budget.budget_paise,
        proposed_allocated_paise=summary.allocated_paise,
        proposed_remaining_paise=summary.remaining_paise,
    )
    return ReplanResult(report=report, proposed_plan=proposed.model_dump(mode="json"))


# --------------------------------------------------------------------------
# Preference change
# --------------------------------------------------------------------------
def _handle_preferences(event: Event, current: Plan, req: ReplanRequest) -> ReplanResult:
    # Reweight negotiable categories toward new top priorities without changing
    # the total budget: move a modest share from the lowest to the highest prio.
    new_prefs = {p["label"].lower(): int(p["rank"]) for p in (req.new_preferences or [])}
    expenses = _clone_expenses(current.expenses)
    reasons = ["Adjusted category emphasis to match your updated preferences; "
               "total budget unchanged."]

    if new_prefs:
        top = min(new_prefs, key=new_prefs.get)
        candidates = budget_service.rank_savings_candidates(expenses, new_prefs)
        # take 10% from the least-important negotiable category and give to top
        if candidates:
            donor = candidates[0].expense
            shift = donor.amount_paise // 10
            for e in expenses:
                if e.id == donor.id:
                    e.amount_paise -= shift
                if e.category.lower() == top:
                    e.amount_paise += shift

    summary = budget_service.summarize(current.budget.budget_paise, expenses)
    deltas = _expense_deltas(current.expenses, expenses)
    affected = sorted({d.category for d in deltas if d.kind != "unchanged"})
    proposed = _new_plan_from(
        current, expenses, current.budget.budget_paise, current.tasks,
        change_summary="Preferences updated",
    )
    report = ChangeReport(
        change_type=ChangeType.preferences,
        previous_value=[p.model_dump() for p in event.preferences],
        new_value=req.new_preferences,
        feasible=summary.within_budget,
        affected_categories=affected,
        expense_deltas=deltas,
        preserved_constraints=event.hard_constraints,
        trade_offs=["Shifted a small share toward your higher-priority category."]
                   if affected else [],
        reasons=reasons,
        previous_budget_paise=current.budget.budget_paise,
        proposed_allocated_paise=summary.allocated_paise,
        proposed_remaining_paise=summary.remaining_paise,
    )
    return ReplanResult(report=report, proposed_plan=proposed.model_dump(mode="json"))


# --------------------------------------------------------------------------
# Hard-constraints change
# --------------------------------------------------------------------------
def _handle_hard_constraints(event: Event, current: Plan,
                             req: ReplanRequest) -> ReplanResult:
    """Apply a new set of hard constraints to the current plan.

    Hard constraints never change money by themselves. We map each constraint
    to the expense category it references (by keyword) and mark that expense
    non-negotiable + tag it with the constraint, so future budget replans will
    protect it. The total budget is unchanged; feasibility is re-proven by the
    budget service (a constraint that references a zero/absent category is
    reported as a violation rather than silently ignored).
    """
    new_constraints = [c.strip() for c in (req.new_hard_constraints or [])
                       if isinstance(c, str) and c.strip()]
    expenses = _clone_expenses(current.expenses)
    reasons = ["Updated hard constraints; tagged matching categories as "
               "non-negotiable. Total budget unchanged."]
    preserved: list[str] = []
    violations: list[str] = []

    # Reset constraint tags that are no longer declared, so stale protections
    # don't linger.
    for e in expenses:
        if e.satisfies_constraint and e.satisfies_constraint not in new_constraints:
            e.satisfies_constraint = None
            e.negotiable = True

    for hc in new_constraints:
        low = hc.lower()
        matched = False
        for e in expenses:
            if e.category.lower() in low:
                e.negotiable = False
                e.satisfies_constraint = hc
                matched = True
        if matched:
            preserved.append(hc)
        else:
            # Keep the constraint on record but flag that no expense maps to it.
            violations.append(
                f"No budget category maps to the constraint '{hc}'. It will be "
                "tracked but cannot protect a specific expense yet."
            )

    summary = budget_service.summarize(current.budget.budget_paise, expenses)
    deltas = _expense_deltas(current.expenses, expenses)
    affected = sorted({d.category for d in deltas if d.kind != "unchanged"})

    # Feasible as long as the arithmetic holds; unmapped constraints are
    # surfaced as soft violations (warnings), not hard infeasibility.
    feasible = summary.within_budget
    proposed = _new_plan_from(
        current, expenses, current.budget.budget_paise, current.tasks,
        change_summary="Hard constraints updated",
    ) if feasible else None

    report = ChangeReport(
        change_type=ChangeType.hard_constraints,
        previous_value=list(event.hard_constraints),
        new_value=new_constraints,
        feasible=feasible,
        affected_categories=affected,
        expense_deltas=deltas,
        preserved_constraints=preserved,
        constraint_violations=violations,
        trade_offs=[],
        reasons=reasons,
        previous_budget_paise=current.budget.budget_paise,
        proposed_allocated_paise=summary.allocated_paise,
        proposed_remaining_paise=summary.remaining_paise,
    )
    return ReplanResult(
        report=report,
        proposed_plan=proposed.model_dump(mode="json") if proposed else None,
    )


def replan(event: Event, current: Plan, req: ReplanRequest) -> ReplanResult:
    """Entry point: dispatch to the right handler by change type."""
    if req.change_type == ChangeType.budget:
        if req.new_budget_inr is None:
            raise ValueError("new_budget_inr required for budget change")
        return _handle_budget(event, current, req)
    if req.change_type == ChangeType.guest_count:
        if req.new_guest_count is None:
            raise ValueError("new_guest_count required for guest_count change")
        return _handle_guest_count(event, current, req)
    if req.change_type == ChangeType.event_date:
        if req.new_event_date is None:
            raise ValueError("new_event_date required for event_date change")
        return _handle_date(event, current, req)
    if req.change_type == ChangeType.preferences:
        return _handle_preferences(event, current, req)
    if req.change_type == ChangeType.hard_constraints:
        return _handle_hard_constraints(event, current, req)
    raise ValueError(f"Unsupported change type: {req.change_type}")
