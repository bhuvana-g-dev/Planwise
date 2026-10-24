"""HTTP API routes."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_owner
from app.models.change import ReplanRequest
from app.models.event import EventCreate
from app.models.plan import VendorQuote
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
        return {"event": event, "active_plan": active, "plans": plans,
                "vendors": vendors}
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
