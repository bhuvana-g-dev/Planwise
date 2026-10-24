"""Deterministic budget engine.

This module is the source of truth for *all* financial arithmetic. The AI is
never trusted for numbers: it may *propose* adjustments, but every figure that
reaches a user is recomputed here from integer-paise expense amounts.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from app.models.plan import BudgetSummary, Expense


def compute_category_totals(expenses: list[Expense]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for e in expenses:
        totals[e.category] += e.amount_paise
    return dict(totals)


def summarize(budget_paise: int, expenses: list[Expense]) -> BudgetSummary:
    """Compute a full, authoritative budget summary from expenses."""
    allocated = sum(e.amount_paise for e in expenses)
    committed = sum(e.amount_paise for e in expenses if e.committed)
    remaining = budget_paise - allocated
    overrun = max(0, allocated - budget_paise)
    utilization = round((allocated / budget_paise * 100), 2) if budget_paise > 0 else 0.0
    return BudgetSummary(
        budget_paise=budget_paise,
        allocated_paise=allocated,
        committed_paise=committed,
        remaining_paise=remaining,
        overrun_paise=overrun,
        within_budget=allocated <= budget_paise,
        utilization_pct=utilization,
        category_totals=compute_category_totals(expenses),
    )


def validate_arithmetic(summary: BudgetSummary, expenses: list[Expense]) -> list[str]:
    """Return a list of arithmetic inconsistencies (empty => valid).

    Used to reject AI/client proposals whose numbers don't add up.
    """
    errors: list[str] = []
    recomputed = sum(e.amount_paise for e in expenses)
    if recomputed != summary.allocated_paise:
        errors.append(
            f"allocated mismatch: stated {summary.allocated_paise}, "
            f"actual {recomputed}"
        )
    if summary.remaining_paise != summary.budget_paise - summary.allocated_paise:
        errors.append("remaining does not equal budget - allocated")
    expected_overrun = max(0, summary.allocated_paise - summary.budget_paise)
    if summary.overrun_paise != expected_overrun:
        errors.append("overrun inconsistent with budget and allocated")
    if any(e.amount_paise < 0 for e in expenses):
        errors.append("negative expense amount")
    return errors


@dataclass
class SavingsCandidate:
    expense: Expense
    rank: int           # lower = cut later (more important to the user)
    reducible_paise: int


def rank_savings_candidates(
    expenses: list[Expense],
    preference_rank_by_category: dict[str, int],
) -> list[SavingsCandidate]:
    """Rank negotiable, non-committed expenses by how freely they can be cut.

    Expenses tied to higher-priority (lower rank number) preferences are cut
    *last*. We do NOT assume any fixed category ordering — we use the user's
    declared priorities. Unranked categories are treated as least important
    (cut first).
    """
    candidates: list[SavingsCandidate] = []
    # A large sentinel so unranked categories sort as "least important".
    LOW_PRIORITY = 10_000
    for e in expenses:
        if not e.negotiable or e.committed:
            continue
        rank = preference_rank_by_category.get(e.category.lower(), LOW_PRIORITY)
        candidates.append(
            SavingsCandidate(expense=e, rank=rank, reducible_paise=e.amount_paise)
        )
    # Cut least-important (highest rank number) first; within a tie cut the
    # largest expense first to reach the target quickly.
    candidates.sort(key=lambda c: (-c.rank, -c.reducible_paise))
    return candidates
