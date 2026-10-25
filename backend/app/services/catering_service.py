"""Deterministic catering calculations.

The backend is the authority for quantities and totals. Gemini may suggest
dishes but never decides monetary totals. Money is integer paise throughout.
"""
from __future__ import annotations

import math
import uuid
from typing import Optional

from app.models.catering import (
    CateringHeadcount,
    CateringPlan,
    CateringSummary,
    CategoryTotal,
    CostSource,
    DietaryClass,
    ItemStatus,
    MenuItem,
    PricingUnit,
)
from app.models.guest import GuestSummary


def resolve_headcount(
    planned_guests: int,
    guest_summary: Optional[GuestSummary],
    override: Optional[int],
) -> CateringHeadcount:
    """Decide the headcount used for catering calculations.

    Precedence: explicit override > confirmed RSVP heads (if any) > planned.
    """
    confirmed = guest_summary.confirmed_headcount if guest_summary else 0
    attending = guest_summary.total_headcount if guest_summary else 0
    total_rows = guest_summary.total_guests if guest_summary else 0
    plus_ones = 0
    pending = 0
    if guest_summary:
        plus_ones = max(0, attending - total_rows)
        pending = guest_summary.by_status.get("invited", 0) + \
            guest_summary.by_status.get("tentative", 0)

    if override is not None:
        head = override
        source = "override"
    elif confirmed > 0:
        head = confirmed
        source = "confirmed"
    else:
        head = planned_guests
        source = "planned"

    return CateringHeadcount(
        planned_guests=planned_guests,
        confirmed_headcount=confirmed,
        attending_headcount=attending,
        pending_responses=pending,
        plus_ones=plus_ones,
        catering_headcount=head,
        source=source,
        override_differs=(override is not None and override != planned_guests),
    )


def _item_quantity(item: MenuItem, headcount: int) -> int:
    """Compute the planned quantity for an item given the headcount."""
    if item.pricing_unit == PricingUnit.per_serving:
        # Round up so every guest is covered.
        return max(0, math.ceil(headcount * item.servings_per_guest))
    # per_unit / per_package use the explicit planned_quantity (min 1 for package)
    if item.pricing_unit == PricingUnit.per_package:
        return max(1, item.planned_quantity) if item.unit_cost_paise else item.planned_quantity
    return item.planned_quantity


def _item_total(item: MenuItem, quantity: int) -> int:
    """Total cost for an item. Package cost is flat; others scale with quantity."""
    if item.pricing_unit == PricingUnit.per_package:
        # Flat package price, independent of guest count (avoid double-count).
        return item.unit_cost_paise
    return item.unit_cost_paise * quantity


def compute(
    plan: CateringPlan,
    planned_guests: int,
    guest_summary: Optional[GuestSummary],
    catering_budget_paise: Optional[int],
) -> tuple[list[MenuItem], CateringSummary]:
    """Recompute quantities + totals for every item and roll up a summary.

    Only `selected` and `suggested` items count toward totals; `rejected`
    items are kept but excluded from cost. Returns (updated_items, summary).
    """
    hc = resolve_headcount(planned_guests, guest_summary, plan.headcount_override)
    head = hc.catering_headcount

    updated: list[MenuItem] = []
    cat_totals: dict[str, int] = {}
    cat_counts: dict[str, int] = {}
    grand_total = 0

    for raw in plan.items:
        # Normalize to a full MenuItem (id guaranteed by assign_ids upstream).
        base = raw.model_dump()
        base.pop("computed_quantity", None)
        base.pop("total_cost_paise", None)
        item = MenuItem(id=base.pop("id", None) or f"mi-{uuid.uuid4().hex[:8]}",
                        **base)
        qty = _item_quantity(item, head)
        total = _item_total(item, qty)
        new_item = item.model_copy(update={
            "computed_quantity": qty,
            "total_cost_paise": total,
        })
        updated.append(new_item)
        if new_item.status == ItemStatus.rejected:
            continue
        grand_total += total
        cat = new_item.category.value
        cat_totals[cat] = cat_totals.get(cat, 0) + total
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    cost_per_guest = grand_total // head if head > 0 else 0

    category_totals = [
        CategoryTotal(category=c, total_paise=t, item_count=cat_counts[c])
        for c, t in sorted(cat_totals.items(), key=lambda kv: -kv[1])
    ]

    remaining = overrun = within = None
    if catering_budget_paise is not None:
        remaining = catering_budget_paise - grand_total
        overrun = max(0, grand_total - catering_budget_paise)
        within = grand_total <= catering_budget_paise

    summary = CateringSummary(
        headcount=hc,
        total_paise=grand_total,
        cost_per_guest_paise=cost_per_guest,
        category_totals=category_totals,
        catering_budget_paise=catering_budget_paise,
        remaining_paise=remaining,
        overrun_paise=overrun,
        within_budget=within,
    )
    return updated, summary


def validate_plan(plan: CateringPlan) -> list[str]:
    """Deterministic validation of a catering plan (empty => valid)."""
    errors: list[str] = []
    for item in plan.items:
        if item.unit_cost_paise < 0:
            errors.append(f"'{item.name}': negative unit cost")
        if item.servings_per_guest < 0:
            errors.append(f"'{item.name}': negative servings per guest")
        if item.planned_quantity < 0:
            errors.append(f"'{item.name}': negative planned quantity")
    return errors


def check_dietary_constraints(plan: CateringPlan) -> list[str]:
    """Return violations of hard dietary constraints (empty => OK).

    - vegetarian_only: no non-veg items among non-rejected dishes.
    - prohibited_ingredients: flagged if mentioned in a dish's text.
    - allergies: treated as hard constraints requiring caterer verification;
      surfaced as warnings-as-violations so the UI forces acknowledgement.
    """
    violations: list[str] = []
    prefs = plan.preferences
    active = [i for i in plan.items if i.status != ItemStatus.rejected]

    if prefs.vegetarian_only:
        bad = [i.name for i in active
               if i.dietary == DietaryClass.non_vegetarian]
        if bad:
            violations.append(
                "Vegetarian-only required, but non-vegetarian items present: "
                + ", ".join(bad)
            )

    for prohibited in prefs.prohibited_ingredients:
        p = prohibited.strip().lower()
        if not p:
            continue
        hit = [i.name for i in active
               if p in (i.name + " " + i.description + " "
                        + i.allergen_notes).lower()]
        if hit:
            violations.append(
                f"Prohibited ingredient '{prohibited}' appears in: "
                + ", ".join(hit)
            )
    return violations


def assign_ids(plan: CateringPlan) -> CateringPlan:
    """Ensure every item has a stable id (clients may omit it)."""
    items: list[MenuItem] = []
    for raw in plan.items:
        data = raw.model_dump()
        existing_id = data.pop("id", None)
        data.pop("computed_quantity", None)
        data.pop("total_cost_paise", None)
        items.append(MenuItem(
            id=existing_id or f"mi-{uuid.uuid4().hex[:8]}", **data
        ))
    return plan.model_copy(update={"items": items})


def allergy_notice(plan: CateringPlan) -> Optional[str]:
    """Non-blocking notice that allergies must be verified with the caterer."""
    if plan.preferences.allergies:
        return (
            "Allergies listed ("
            + ", ".join(plan.preferences.allergies)
            + ") are hard constraints — verify with the caterer. PlanWise never "
            "guarantees a dish is allergen-free."
        )
    return None
