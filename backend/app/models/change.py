"""Change-impact models for the adaptive replanning engine."""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ChangeType(str, Enum):
    budget = "budget"
    guest_count = "guest_count"
    event_date = "event_date"
    preferences = "preferences"
    hard_constraints = "hard_constraints"


class ReplanRequest(BaseModel):
    """What the user wants to change. Any subset may be provided."""

    change_type: ChangeType
    new_budget_inr: Optional[float] = Field(default=None, gt=0)
    new_guest_count: Optional[int] = Field(default=None, ge=1, le=100000)
    new_event_date: Optional[date] = None
    new_preferences: Optional[list[dict[str, Any]]] = None
    new_hard_constraints: Optional[list[str]] = None


class ExpenseDelta(BaseModel):
    kind: str  # "added" | "modified" | "removed" | "unchanged"
    category: str
    label: str
    previous_paise: Optional[int] = None
    new_paise: Optional[int] = None
    reason: str = ""


class TaskDelta(BaseModel):
    kind: str  # "added" | "modified" | "removed" | "rescheduled" | "overdue"
    task_id: str
    name: str
    previous_due: Optional[date] = None
    new_due: Optional[date] = None
    reason: str = ""


class ChangeReport(BaseModel):
    change_type: ChangeType
    previous_value: Any
    new_value: Any
    feasible: bool
    affected_categories: list[str] = Field(default_factory=list)
    expense_deltas: list[ExpenseDelta] = Field(default_factory=list)
    task_deltas: list[TaskDelta] = Field(default_factory=list)
    preserved_constraints: list[str] = Field(default_factory=list)
    constraint_violations: list[str] = Field(default_factory=list)
    trade_offs: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    # Budget before/after for quick display
    previous_budget_paise: int = 0
    proposed_allocated_paise: int = 0
    proposed_remaining_paise: int = 0


class ReplanResult(BaseModel):
    report: ChangeReport
    # The proposed plan (not yet active). None when infeasible with no proposal.
    proposed_plan: Optional[dict] = None
