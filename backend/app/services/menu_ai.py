"""Gemini-backed menu generation & optimization.

Gemini suggests dishes, categories, variety, and alternatives. It never decides
authoritative totals — all costs are recomputed by catering_service. When
Gemini is unavailable, a deterministic fallback produces a sensible menu and
the result is clearly labelled generated_by="deterministic".
"""
from __future__ import annotations

from typing import Optional

from app.models.catering import (
    CateringPlan,
    CateringPreferences,
    CostSource,
    DietaryClass,
    ItemStatus,
    MenuCategory,
    MenuItemBase,
)
from app.models.event import EventType
from app.services import catering_service, gemini_client
from app.services.gemini_client import GeminiError

# Deterministic fallback menus per event type (illustrative estimates only).
# unit_cost_paise are per-serving illustrative estimates, NOT quotes.
_FALLBACK = {
    EventType.birthday: [
        ("Veg Spring Rolls", MenuCategory.starters, 8000),
        ("Paneer Butter Masala", MenuCategory.main_course, 12000),
        ("Veg Fried Rice", MenuCategory.rice_breads, 9000),
        ("Birthday Cake (slice)", MenuCategory.desserts, 6000),
        ("Soft Drinks", MenuCategory.beverages, 3000),
    ],
    EventType.wedding: [
        ("Assorted Starters Platter", MenuCategory.starters, 15000),
        ("Paneer Tikka Masala", MenuCategory.main_course, 14000),
        ("Veg Biryani", MenuCategory.rice_breads, 12000),
        ("Assorted Indian Sweets", MenuCategory.desserts, 9000),
        ("Welcome Drinks", MenuCategory.beverages, 4000),
    ],
    EventType.community: [
        ("Samosa & Chutney", MenuCategory.snacks, 5000),
        ("Mixed Veg Curry", MenuCategory.main_course, 9000),
        ("Jeera Rice", MenuCategory.rice_breads, 7000),
        ("Gulab Jamun", MenuCategory.desserts, 4000),
        ("Masala Chai", MenuCategory.beverages, 2000),
    ],
}


def _fallback_items(event_type: EventType,
                     prefs: CateringPreferences) -> list[MenuItemBase]:
    diet = DietaryClass.vegetarian if prefs.vegetarian_only else DietaryClass.vegetarian
    items: list[MenuItemBase] = []
    for name, cat, cost in _FALLBACK.get(event_type, _FALLBACK[EventType.birthday]):
        items.append(MenuItemBase(
            name=name, category=cat, dietary=diet,
            cuisine=(prefs.cuisines[0] if prefs.cuisines else "Indian"),
            servings_per_guest=1.0, unit="serving",
            unit_cost_paise=cost, cost_source=CostSource.estimate,
            status=ItemStatus.suggested,
            notes="Illustrative estimate, not a caterer quote.",
        ))
    # Honor required dishes by appending them.
    for req in prefs.required_dishes:
        items.append(MenuItemBase(
            name=req, category=MenuCategory.main_course, dietary=diet,
            servings_per_guest=1.0, unit="serving", unit_cost_paise=0,
            cost_source=CostSource.estimate, required=True,
            status=ItemStatus.selected,
            notes="Required dish — enter cost from caterer.",
        ))
    return items


def _coerce_items(raw: object) -> list[MenuItemBase]:
    """Validate Gemini's item list into MenuItemBase (drops bad entries)."""
    out: list[MenuItemBase] = []
    if not isinstance(raw, list):
        return out
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        category = entry.get("category")
        if not isinstance(name, str) or not name.strip():
            continue
        try:
            cat = MenuCategory(category) if category in MenuCategory._value2member_map_ \
                else MenuCategory.main_course
        except Exception:
            cat = MenuCategory.main_course
        diet_raw = entry.get("dietary")
        diet = (DietaryClass(diet_raw)
                if diet_raw in DietaryClass._value2member_map_
                else DietaryClass.vegetarian)
        # Cost from AI is treated as an illustrative estimate only.
        cost = entry.get("estimated_unit_cost_inr")
        unit_cost_paise = int(round(float(cost) * 100)) if isinstance(
            cost, (int, float)) and cost >= 0 else 0
        out.append(MenuItemBase(
            name=name.strip()[:160],
            category=cat,
            description=str(entry.get("description", ""))[:400],
            dietary=diet,
            cuisine=str(entry.get("cuisine", ""))[:80],
            allergen_notes=str(entry.get("allergen_notes", ""))[:300],
            servings_per_guest=1.0,
            unit="serving",
            unit_cost_paise=unit_cost_paise,
            cost_source=CostSource.estimate,
            status=ItemStatus.suggested,
            notes="Illustrative estimate, not a caterer quote.",
        ))
    return out


def generate_menu(event_type: EventType, headcount: int,
                  prefs: CateringPreferences,
                  budget_per_guest_inr: Optional[float]) -> tuple[list[MenuItemBase], str]:
    """Return (items, generated_by). generated_by is 'gemini' or 'deterministic'."""
    try:
        data = _ask_gemini(event_type, headcount, prefs, budget_per_guest_inr)
        items = _coerce_items(data.get("items") if isinstance(data, dict) else data)
        if items:
            return items, "gemini"
        # Gemini returned nothing usable -> fallback.
        return _fallback_items(event_type, prefs), "deterministic"
    except GeminiError:
        return _fallback_items(event_type, prefs), "deterministic"


def _ask_gemini(event_type: EventType, headcount: int,
                prefs: CateringPreferences,
                budget_per_guest_inr: Optional[float]):
    system = (
        "You are an expert catering planner. Return STRICT JSON only. Suggest "
        "dishes appropriate to the event, cuisine and dietary needs. You may "
        "give rough per-serving cost estimates in INR but these are illustrative "
        "only; never claim they are quotes. Respect vegetarian-only and "
        "prohibited ingredients. Never claim a dish is allergen-free."
    )
    prompt = (
        "Produce JSON: {\"items\": [{name, category, description, dietary, "
        "cuisine, allergen_notes, estimated_unit_cost_inr}]}. "
        "category in [breakfast,lunch,dinner,snacks,starters,main_course,"
        "rice_breads,desserts,beverages,custom]. dietary in [vegetarian,"
        "non_vegetarian,vegan,mixed].\n\n"
        f"Event type: {event_type.value}. Headcount: {headcount}. "
        f"Cuisines: {prefs.cuisines}. Vegetarian only: {prefs.vegetarian_only}. "
        f"Dietary restrictions: {prefs.dietary_restrictions}. "
        f"Allergies (avoid): {prefs.allergies}. "
        f"Prohibited ingredients: {prefs.prohibited_ingredients}. "
        f"Required dishes: {prefs.required_dishes}. "
        f"Serving style: {prefs.serving_style}. "
        f"Budget per guest (INR): {budget_per_guest_inr}."
    )
    return gemini_client.generate_json(prompt, system=system)


# --------------------------------------------------------------------------
# Optimization — deterministic cut + optional Gemini narrative
# --------------------------------------------------------------------------
def optimize_for_budget(plan: CateringPlan, planned_guests: int,
                        guest_summary, catering_budget_paise: int,
                        goal: str) -> dict:
    """Propose a budget-fitting menu WITHOUT mutating the stored plan.

    Deterministic: reduce/remove negotiable, non-required items (cheapest-impact
    first for 'lower_cost'; keep required + vegetarian constraints). Returns a
    structured proposal with before/after and trade-offs.
    """
    items, before = catering_service.compute(
        plan, planned_guests, guest_summary, catering_budget_paise
    )
    trade_offs: list[str] = []
    reasons: list[str] = []

    # Work on a mutable copy of non-rejected items.
    proposed = [i.model_copy(deep=True) for i in items]

    if before.overrun_paise and before.overrun_paise > 0:
        overrun = before.overrun_paise
        # Candidates: not required, not user_quote-committed, highest cost first.
        candidates = sorted(
            [i for i in proposed
             if not i.required and i.status != ItemStatus.rejected],
            key=lambda i: -i.total_cost_paise,
        )
        for cand in candidates:
            if overrun <= 0:
                break
            # Reject the item entirely (simplest, explainable cut).
            for p in proposed:
                if p.id == cand.id:
                    p.status = ItemStatus.rejected
                    overrun -= cand.total_cost_paise
                    trade_offs.append(f"Removed '{cand.name}' to reduce cost.")
                    break
        reasons.append(
            "Removed the most expensive non-required dishes first to fit the "
            "catering budget, preserving required dishes and dietary constraints."
        )
    else:
        reasons.append("Menu already within the catering budget; no cuts needed.")

    proposed_plan = plan.model_copy(update={"items": proposed})
    after_items, after = catering_service.compute(
        proposed_plan, planned_guests, guest_summary, catering_budget_paise
    )

    feasible = (after.within_budget is True) or not trade_offs
    violations = catering_service.check_dietary_constraints(proposed_plan)
    if violations:
        feasible = False

    if not feasible and after.within_budget is False:
        reasons.append(
            "Could not fit within budget without touching required dishes. "
            "Consider raising the catering budget, reducing guests, or marking "
            "fewer dishes as required."
        )

    return {
        "goal": goal,
        "feasible": feasible,
        "before": before.model_dump(mode="json"),
        "after": after.model_dump(mode="json"),
        "proposed_plan": {
            "items": [i.model_dump(mode="json") for i in after_items],
            "preferences": proposed_plan.preferences.model_dump(mode="json"),
            "headcount_override": proposed_plan.headcount_override,
        },
        "trade_offs": trade_offs,
        "reasons": reasons,
        "constraint_violations": violations,
    }
