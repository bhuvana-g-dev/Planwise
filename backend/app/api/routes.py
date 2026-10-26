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
from app.models.venue import VenueCreate, VenueQuery
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
