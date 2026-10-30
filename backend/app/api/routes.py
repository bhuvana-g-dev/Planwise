"""HTTP API routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_owner
from app.models.catering import CateringPlan, CateringPreferences
from app.models.change import ReplanRequest
from app.models.event import EventCreate
from app.models.guest import GuestCreate
from app.models.plan import VendorQuote
from app.models.venue import VenueCreate, VenueQuery, VenueQuoteInput
from app.services import event_service
from app.services.event_service import (
    Forbidden,
    InvalidProposal,
    NotFound,
    StalePlan,
)

router = APIRouter(prefix="/api")


def _handle(exc: Exception):
    if isinstance(exc, NotFound):
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    if isinstance(exc, Forbidden):
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc))
    if isinstance(exc, StalePlan):
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    if isinstance(exc, (InvalidProposal, ValueError)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    raise exc


# --------------------------------------------------------------------------
# Events
# --------------------------------------------------------------------------
@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, owner=Depends(get_current_owner)):
    event = event_service.create_event(payload, owner)
    return event.model_dump(mode="json")


@router.get("/events")
def list_events(owner=Depends(get_current_owner)):
    return event_service.list_events(owner)


@router.get("/events/{event_id}")
def get_event(event_id: str, owner=Depends(get_current_owner)):
    try:
        event = event_service.get_event(event_id, owner)
        active = event_service.get_active_plan(event_id, owner)
        plans = event_service.list_plans(event_id, owner)
        vendors = event_service.list_vendors(event_id, owner)
        guests = event_service.list_guests(event_id, owner)
        guest_summary = event_service.guest_summary(event_id, owner)
        shortlist = event_service.list_shortlist(event_id, owner)
        return {"event": event, "active_plan": active, "plans": plans,
                "vendors": vendors, "guests": guests,
                "guest_summary": guest_summary.model_dump(mode="json"),
                "venue_shortlist": shortlist,
                "selected_venue": event.get("selected_venue")}
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Plans
# --------------------------------------------------------------------------
@router.post("/events/{event_id}/plans", status_code=status.HTTP_201_CREATED)
def generate_plan(event_id: str, owner=Depends(get_current_owner)):
    try:
        plan = event_service.generate_initial_plan(event_id, owner)
        return plan.model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


@router.get("/events/{event_id}/plans")
def list_plans(event_id: str, owner=Depends(get_current_owner)):
    try:
        return event_service.list_plans(event_id, owner)
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Replanning + approval
# --------------------------------------------------------------------------
@router.post("/events/{event_id}/replans")
def replan(event_id: str, req: ReplanRequest, owner=Depends(get_current_owner)):
    try:
        result = event_service.replan(event_id, req, owner)
        return result.model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


class InterpretReplanPayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


@router.post("/events/{event_id}/replans/interpret")
def interpret_replan(event_id: str, payload: InterpretReplanPayload,
                     owner=Depends(get_current_owner)):
    """Interpret a natural-language change request into a validated proposal.

    Gemini extracts intent; the deterministic engine computes and validates.
    Nothing is persisted — the caller approves via the existing approve route.
    """
    try:
        return event_service.interpret_replan(event_id, payload.text, owner)
    except Exception as exc:
        _handle(exc)


class ApprovePayload(BaseModel):
    proposed_plan: dict
    base_version: int = Field(..., ge=1)


@router.post("/events/{event_id}/plans/approve")
def approve_plan(event_id: str, payload: ApprovePayload,
                 owner=Depends(get_current_owner)):
    try:
        plan = event_service.approve_plan(
            event_id, payload.proposed_plan, payload.base_version, owner
        )
        return plan.model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------
class TaskPatch(BaseModel):
    status: Optional[str] = None
    due_date: Optional[str] = None


@router.patch("/events/{event_id}/tasks/{task_id}")
def update_task(event_id: str, task_id: str, patch: TaskPatch,
                owner=Depends(get_current_owner)):
    try:
        return event_service.update_task(
            event_id, task_id, patch.model_dump(exclude_none=True), owner
        )
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Vendors
# --------------------------------------------------------------------------
class VendorComparePayload(BaseModel):
    quotes: list[VendorQuote]


@router.post("/events/{event_id}/vendors/compare")
def compare_vendors(event_id: str, payload: VendorComparePayload,
                    owner=Depends(get_current_owner)):
    try:
        comparison = event_service.compare_vendors(event_id, payload.quotes, owner)
        return comparison.model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


@router.get("/events/{event_id}/vendors")
def list_vendors(event_id: str, owner=Depends(get_current_owner)):
    try:
        return event_service.list_vendors(event_id, owner)
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Guests
# --------------------------------------------------------------------------
class GuestListPayload(BaseModel):
    guests: list[GuestCreate]


@router.get("/events/{event_id}/guests")
def list_guests(event_id: str, owner=Depends(get_current_owner)):
    try:
        return {
            "guests": event_service.list_guests(event_id, owner),
            "summary": event_service.guest_summary(event_id, owner).model_dump(
                mode="json"
            ),
        }
    except Exception as exc:
        _handle(exc)


@router.put("/events/{event_id}/guests")
def save_guests(event_id: str, payload: GuestListPayload,
                owner=Depends(get_current_owner)):
    try:
        return event_service.save_guests(event_id, list(payload.guests), owner)
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Catering & menu
# --------------------------------------------------------------------------
class GenerateMenuPayload(BaseModel):
    preferences: CateringPreferences = CateringPreferences()


class OptimizePayload(BaseModel):
    goal: str = Field(default="lower_cost")


@router.get("/events/{event_id}/catering")
def get_catering(event_id: str, owner=Depends(get_current_owner)):
    try:
        return event_service.get_catering(event_id, owner).model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


@router.put("/events/{event_id}/catering")
def save_catering(event_id: str, plan: CateringPlan,
                  owner=Depends(get_current_owner)):
    try:
        return event_service.save_catering(event_id, plan, owner).model_dump(
            mode="json"
        )
    except Exception as exc:
        _handle(exc)


@router.post("/events/{event_id}/catering/generate")
def generate_catering(event_id: str, payload: GenerateMenuPayload,
                      owner=Depends(get_current_owner)):
    try:
        return event_service.generate_catering_menu(
            event_id, payload.preferences, owner
        )
    except Exception as exc:
        _handle(exc)


@router.post("/events/{event_id}/catering/optimize")
def optimize_catering(event_id: str, payload: OptimizePayload,
                      owner=Depends(get_current_owner)):
    try:
        return event_service.optimize_catering(event_id, payload.goal, owner)
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Venues
# --------------------------------------------------------------------------
@router.post("/venues/search")
def search_venues(query: VenueQuery):
    # Public demo search — no event scope, no auth needed.
    return event_service.search_venues(query).model_dump(mode="json")


@router.get("/venues/price-bands")
def venue_price_bands():
    """The DRAFT estimated price bands by venue type (unverified).

    Registered before /venues/{venue_id} so "price-bands" isn't read as an id.
    """
    from app.core.venue_price_bands import (
        BANDS_NOTE,
        BANDS_STATUS,
        ESTIMATE_LABEL,
        bands_table,
    )
    return {"status": BANDS_STATUS, "note": BANDS_NOTE,
            "estimate_label": ESTIMATE_LABEL, "bands": bands_table()}


@router.get("/venues/{venue_id}")
def get_venue(venue_id: str, event_id: Optional[str] = None,
              owner=Depends(get_current_owner)):
    try:
        return event_service.get_venue_detail(
            venue_id, event_id, owner
        ).model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


@router.get("/events/{event_id}/venues/shortlist")
def list_shortlist(event_id: str, owner=Depends(get_current_owner)):
    try:
        return event_service.list_shortlist(event_id, owner)
    except Exception as exc:
        _handle(exc)


class ShortlistPayload(BaseModel):
    venue: dict  # a Venue dict (demo) or user-entered venue already normalized


@router.post("/events/{event_id}/venues/shortlist")
def add_shortlist(event_id: str, payload: ShortlistPayload,
                  owner=Depends(get_current_owner)):
    try:
        from app.models.venue import Venue as VenueModel
        venue = VenueModel.model_validate(payload.venue)
        return event_service.shortlist_venue(event_id, venue, owner)
    except Exception as exc:
        _handle(exc)


@router.post("/events/{event_id}/venues/manual")
def add_manual_venue(event_id: str, payload: VenueCreate,
                     owner=Depends(get_current_owner)):
    try:
        from app.services import venue_service
        venue = venue_service.venue_from_create(payload)
        return event_service.shortlist_venue(event_id, venue, owner)
    except Exception as exc:
        _handle(exc)


@router.delete("/events/{event_id}/venues/shortlist/{venue_id}")
def remove_shortlist(event_id: str, venue_id: str,
                     owner=Depends(get_current_owner)):
    try:
        return event_service.remove_shortlist(event_id, venue_id, owner)
    except Exception as exc:
        _handle(exc)


class SelectVenuePayload(BaseModel):
    venue_id: str


@router.post("/events/{event_id}/venues/select")
def select_venue(event_id: str, payload: SelectVenuePayload,
                 owner=Depends(get_current_owner)):
    try:
        return event_service.select_venue(
            event_id, payload.venue_id, owner
        ).model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


class VenueRecommendPayload(BaseModel):
    indoor_pref: str = "any"
    required_amenities: list[str] = []


@router.post("/events/{event_id}/venues/recommend")
def recommend_venues(event_id: str, payload: VenueRecommendPayload,
                     owner=Depends(get_current_owner)):
    try:
        return event_service.recommend_venues(
            event_id, payload.indoor_pref, payload.required_amenities, owner
        )
    except Exception as exc:
        _handle(exc)


# --- Venue pricing: user-entered quotes (price bands route is above) ---
@router.post("/events/{event_id}/venues/search")
def search_event_venues(event_id: str, query: VenueQuery,
                        owner=Depends(get_current_owner)):
    """Event-scoped search: applies this event's quotes over estimates."""
    try:
        return event_service.search_event_venues(
            event_id, query, owner).model_dump(mode="json")
    except Exception as exc:
        _handle(exc)


@router.get("/events/{event_id}/venues/quotes")
def list_venue_quotes(event_id: str, owner=Depends(get_current_owner)):
    try:
        return event_service.list_venue_quotes(event_id, owner)
    except Exception as exc:
        _handle(exc)


@router.put("/events/{event_id}/venues/{venue_id}/quote")
def save_venue_quote(event_id: str, venue_id: str, payload: VenueQuoteInput,
                     owner=Depends(get_current_owner)):
    try:
        return event_service.save_venue_quote(event_id, venue_id, payload, owner)
    except Exception as exc:
        _handle(exc)


@router.delete("/events/{event_id}/venues/{venue_id}/quote")
def delete_venue_quote(event_id: str, venue_id: str,
                       owner=Depends(get_current_owner)):
    try:
        return event_service.delete_venue_quote(event_id, venue_id, owner)
    except Exception as exc:
        _handle(exc)


# --------------------------------------------------------------------------
# Caterers: real discovery, comparison, manual arrangements, booking, budget
# --------------------------------------------------------------------------
@router.get("/caterers/search")
def search_caterers(location: str, radius_km: int = 25, food: str = "both",
                    include_restaurants: bool = False):
    """Real providers from OpenStreetMap. Never returns invented data."""
    from app.services import caterer_search
    if food not in ("veg", "nonveg", "both"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "food must be veg, nonveg or both")
    return caterer_search.search(location, radius_km, food, include_restaurants)


@router.get("/caterers/{provider_id}")
def get_caterer_provider(provider_id: str):
    from app.services import caterer_search
    provider = caterer_search.get_provider(provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Provider not found — search again to refresh.")
    return provider.model_dump(mode="json")


class CatererCreatePayload(BaseModel):
    record: dict
    # Link provider details to this existing record instead of adding a new
    # one (prevents double-counting the same caterer).
    link_to_id: Optional[str] = None


class FoodPreferencePayload(BaseModel):
    food_preference: str


class SelectCatererPayload(BaseModel):
    selected: bool = True


class ApplyBudgetPayload(BaseModel):
    base_version: int = Field(..., ge=1)
    expected_total_paise: Optional[int] = Field(default=None, ge=0)


@router.get("/events/{event_id}/caterers")
def list_caterers(event_id: str, owner=Depends(get_current_owner)):
    from app.services import caterer_service
    try:
        return caterer_service.overview(event_id, owner)
    except Exception as exc:
        _handle(exc)


@router.put("/events/{event_id}/caterers/preferences")
def set_caterer_preferences(event_id: str, payload: FoodPreferencePayload,
                            owner=Depends(get_current_owner)):
    from app.services import caterer_service
    try:
        return caterer_service.set_preference(
            event_id, payload.food_preference, owner)
    except Exception as exc:
        _handle(exc)


@router.post("/events/{event_id}/caterers", status_code=status.HTTP_201_CREATED)
def create_caterer(event_id: str, payload: CatererCreatePayload,
                   owner=Depends(get_current_owner)):
    from pydantic import ValidationError

    from app.models.caterer import CatererInput
    from app.services import caterer_service
    try:
        data = CatererInput.model_validate(payload.record)
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            _first_error(exc))
    try:
        return caterer_service.create(event_id, data, owner, payload.link_to_id)
    except Exception as exc:
        _handle(exc)


@router.patch("/events/{event_id}/caterers/{caterer_id}")
def update_caterer(event_id: str, caterer_id: str, patch: dict,
                   owner=Depends(get_current_owner)):
    from pydantic import ValidationError

    from app.models.caterer import CatererPatch
    from app.services import caterer_service
    try:
        data = CatererPatch.model_validate(patch)
        return caterer_service.update(event_id, caterer_id, data, owner)
    except ValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            _first_error(exc))
    except Exception as exc:
        _handle(exc)


@router.delete("/events/{event_id}/caterers/{caterer_id}")
def delete_caterer(event_id: str, caterer_id: str,
                   owner=Depends(get_current_owner)):
    from app.services import caterer_service
    try:
        return caterer_service.delete(event_id, caterer_id, owner)
    except Exception as exc:
        _handle(exc)


@router.post("/events/{event_id}/caterers/{caterer_id}/select")
def select_caterer(event_id: str, caterer_id: str,
                   payload: SelectCatererPayload,
                   owner=Depends(get_current_owner)):
    from app.services import caterer_service
    try:
        return caterer_service.select(event_id, caterer_id, payload.selected,
                                      owner)
    except Exception as exc:
        _handle(exc)


@router.get("/events/{event_id}/caterers/{caterer_id}/budget-preview")
def caterer_budget_preview(event_id: str, caterer_id: str,
                           owner=Depends(get_current_owner)):
    from app.services import caterer_service
    try:
        return caterer_service.budget_preview(event_id, caterer_id, owner)
    except Exception as exc:
        _handle(exc)


@router.post("/events/{event_id}/caterers/{caterer_id}/apply-budget")
def caterer_apply_budget(event_id: str, caterer_id: str,
                         payload: ApplyBudgetPayload,
                         owner=Depends(get_current_owner)):
    from app.services import caterer_service
    try:
        return caterer_service.apply_budget(
            event_id, caterer_id, payload.base_version,
            payload.expected_total_paise, owner)
    except Exception as exc:
        _handle(exc)


def _first_error(exc) -> str:
    """Readable message for the first Pydantic validation error."""
    errs = exc.errors()
    if not errs:
        return "Invalid input"
    e = errs[0]
    field = ".".join(str(p) for p in e.get("loc", []) if p != "body")
    msg = str(e.get("msg", "Invalid value")).removeprefix("Value error, ")
    return f"{field}: {msg}" if field else msg
