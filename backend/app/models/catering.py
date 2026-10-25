"""Catering & menu planning models.

All money is integer paise. The backend is the sole authority for quantities
and totals; client-supplied totals are never trusted.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MenuCategory(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snacks = "snacks"
    starters = "starters"
    main_course = "main_course"
    rice_breads = "rice_breads"
    desserts = "desserts"
    beverages = "beverages"
    custom = "custom"


class DietaryClass(str, Enum):
    vegetarian = "vegetarian"
    non_vegetarian = "non_vegetarian"
    vegan = "vegan"
    mixed = "mixed"


class PricingUnit(str, Enum):
    per_serving = "per_serving"   # cost applies per served portion (scales w/ headcount)
    per_unit = "per_unit"         # cost applies per planned_quantity (explicit)
    per_package = "per_package"   # flat package cost (does NOT scale w/ headcount)


class CostSource(str, Enum):
    estimate = "estimate"         # illustrative; NOT a verified quote
    user_quote = "user_quote"     # user-entered caterer quotation


class ItemStatus(str, Enum):
    suggested = "suggested"
    selected = "selected"
    rejected = "rejected"


class MenuItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    category: MenuCategory
    description: str = Field(default="", max_length=400)
    dietary: DietaryClass = DietaryClass.vegetarian
    cuisine: str = Field(default="", max_length=80)
    allergen_notes: str = Field(default="", max_length=300)
    # Portions of this dish per guest (e.g. 0.5 = shared between 2 guests).
    servings_per_guest: float = Field(default=1.0, ge=0, le=20)
    # Explicit planned quantity (used for per_unit / per_package pricing).
    planned_quantity: int = Field(default=0, ge=0)
    unit: str = Field(default="serving", max_length=40)
    unit_cost_paise: int = Field(default=0, ge=0)
    pricing_unit: PricingUnit = PricingUnit.per_serving
    cost_source: CostSource = CostSource.estimate
    caterer: str = Field(default="", max_length=160)
    status: ItemStatus = ItemStatus.suggested
    # Dishes the user marked required cannot be cut during optimization.
    required: bool = False
    notes: str = Field(default="", max_length=400)


class MenuItem(MenuItemBase):
    id: str
    # Computed server-side; never trusted from the client.
    computed_quantity: int = 0
    total_cost_paise: int = 0

    model_config = {"extra": "ignore"}


class CateringPreferences(BaseModel):
    cuisines: list[str] = Field(default_factory=list)
    dietary_restrictions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)   # hard constraints
    serving_style: str = Field(default="", max_length=80)  # buffet, plated…
    meal_times: list[MenuCategory] = Field(default_factory=list)
    required_dishes: list[str] = Field(default_factory=list)
    prohibited_ingredients: list[str] = Field(default_factory=list)
    budget_per_guest_inr: Optional[float] = Field(default=None, ge=0)
    vegetarian_only: bool = False


class CateringPlan(BaseModel):
    """Stored/working catering plan for an event.

    Items are typed as the common MenuItemBase so the backend can accept client
    input (id omitted), generator output (MenuItemBase), and full MenuItem
    instances alike. Ids are assigned and quantities/totals recomputed on the
    server — client-supplied computed fields are ignored.
    """

    items: list[MenuItemBase] = Field(default_factory=list)
    preferences: CateringPreferences = Field(default_factory=CateringPreferences)
    # Optional explicit headcount override; None => derive from event/RSVP.
    headcount_override: Optional[int] = Field(default=None, ge=0)


class CateringHeadcount(BaseModel):
    planned_guests: int
    confirmed_headcount: int
    attending_headcount: int   # confirmed + tentative
    pending_responses: int
    plus_ones: int
    catering_headcount: int    # the number actually used in calculations
    source: str                # "override" | "confirmed" | "planned"
    override_differs: bool = False


class CategoryTotal(BaseModel):
    category: str
    total_paise: int
    item_count: int


class CateringSummary(BaseModel):
    """Deterministically computed catering financials."""

    headcount: CateringHeadcount
    total_paise: int
    cost_per_guest_paise: int
    category_totals: list[CategoryTotal]
    # Budget comparison against the event plan's catering allocation (if any).
    catering_budget_paise: Optional[int] = None
    remaining_paise: Optional[int] = None
    overrun_paise: Optional[int] = None
    within_budget: Optional[bool] = None


class ComputedCateringPlan(BaseModel):
    """Response plan whose items are fully computed (id + quantities + totals)."""

    items: list[MenuItem] = Field(default_factory=list)
    preferences: CateringPreferences = Field(default_factory=CateringPreferences)
    headcount_override: Optional[int] = Field(default=None, ge=0)


class CateringState(BaseModel):
    plan: ComputedCateringPlan
    summary: CateringSummary
