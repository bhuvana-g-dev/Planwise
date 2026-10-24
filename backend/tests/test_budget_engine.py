"""Tests 3, 4, 5, 6, 12 — deterministic budget engine."""
from __future__ import annotations

from app.core.money import format_inr, paise_to_rupees, rupees_to_paise
from app.models.plan import Expense, ExpenseSource
from app.services import budget_service


def _expenses():
    return [
        Expense(id="a", category="catering", label="Catering",
                amount_paise=rupees_to_paise(12000), per_guest=True),
        Expense(id="b", category="venue", label="Venue",
                amount_paise=rupees_to_paise(6000)),
        Expense(id="c", category="decorations", label="Decor",
                amount_paise=rupees_to_paise(5000)),
    ]


# Test 3: budget totals computed correctly
def test_budget_totals_correct():
    s = budget_service.summarize(rupees_to_paise(30000), _expenses())
    assert s.allocated_paise == rupees_to_paise(23000)
    assert s.remaining_paise == rupees_to_paise(7000)
    assert s.within_budget is True
    assert s.category_totals["catering"] == rupees_to_paise(12000)


# Test 4: detect an over-budget plan
def test_detect_over_budget():
    expenses = _expenses()
    expenses.append(Expense(id="d", category="extras", label="Extras",
                            amount_paise=rupees_to_paise(20000)))
    s = budget_service.summarize(rupees_to_paise(30000), expenses)
    assert s.within_budget is False
    assert s.overrun_paise == rupees_to_paise(13000)


# Test 12: reject invalid arithmetic in a proposal
def test_reject_invalid_arithmetic():
    expenses = _expenses()
    s = budget_service.summarize(rupees_to_paise(30000), expenses)
    # Tamper with the stated total.
    s.allocated_paise += 100
    errors = budget_service.validate_arithmetic(s, expenses)
    assert errors, "tampered total should be rejected"


def test_money_formatting_indian_grouping():
    assert format_inr(rupees_to_paise(30000)) == "₹30,000.00"
    assert format_inr(rupees_to_paise(100000)) == "₹1,00,000.00"
    assert paise_to_rupees(3000000) == 30000.0


# Test 5: preserve non-negotiable requirements during savings ranking
def test_savings_ranking_respects_priority_and_skips_non_negotiable():
    expenses = _expenses()
    expenses[0].negotiable = False  # catering locked
    prefs = {"venue": 1, "decorations": 3}
    ranked = budget_service.rank_savings_candidates(expenses, prefs)
    ids = [c.expense.id for c in ranked]
    assert "a" not in ids  # non-negotiable excluded
    # decorations (rank 3, lower priority) should be cut before venue (rank 1)
    assert ids.index("c") < ids.index("b")
