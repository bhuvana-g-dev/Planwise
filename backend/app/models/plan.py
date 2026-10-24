"""Plan, budget, task and vendor models."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ExpenseSource(str, Enum):
    estimate = "estimate"          # AI/deterministic estimate — NOT a real quote
    user_quote = "user_quote"      # user-entered vendor quotation


class Expense(BaseModel):
    id: str
    category: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=160)
    # Integer paise. Never trust a client-supplied total — backend recomputes.
    amount_paise: int = Field(..., ge=0)
    source: ExpenseSource = ExpenseSource.estimate
    assumptions: str = Field(default="", max_length=500)
    # Whether this expense scales with guest count (catering, seating, etc.)
    per_guest: bool = False
    # Whether this expense may be reduced/removed during replanning.
    negotiable: bool = True
    # Optional link to a hard constraint this expense satisfies.
    satisfies_constraint: Optional[str] = None
    committed: bool = False  # committed = user locked this spend


class CategoryAllocation(BaseModel):
    category: str
    allocated_paise: int = Field(..., ge=0)


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TaskStatus(str, Enum):
    not_started = "not_started"
    blocked = "blocked"
    ready = "ready"
    in_progress = "in_progress"
    done = "done"


class Task(BaseModel):
    id: str
    name: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[date] = None
    status: TaskStatus = TaskStatus.not_started
    depends_on: list[str] = Field(default_factory=list)
    related_category: Optional[str] = None


class BudgetSummary(BaseModel):
    """Deterministically computed by the backend budget service."""

    budget_paise: int
    allocated_paise: int        # sum of all expenses
    committed_paise: int        # sum of committed expenses
    remaining_paise: int        # budget - allocated
    overrun_paise: int          # max(0, allocated - budget)
    within_budget: bool
    utilization_pct: float      # allocated / budget * 100
    category_totals: dict[str, int] = Field(default_factory=dict)


class Risk(BaseModel):
    description: str
    severity: str = "medium"  # low | medium | high


class Plan(BaseModel):
    id: str
    event_id: str
    version: int = Field(..., ge=1)
    overview: str = ""
    expenses: list[Expense] = Field(default_factory=list)
    allocations: list[CategoryAllocation] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    vendor_questions: list[str] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    open_decisions: list[str] = Field(default_factory=list)
    budget: BudgetSummary
    generated_by: str = "deterministic"  # "gemini" | "deterministic"
    change_summary: str = ""
    created_at: datetime
    is_active: bool = False


# --------------------------------------------------------------------------
# Vendor quotations
# --------------------------------------------------------------------------
class VendorQuote(BaseModel):
    id: str = ""
    vendor_name: str = Field(..., min_length=1, max_length=160)
    category: str = Field(..., min_length=1, max_length=80)
    amount_inr: float = Field(..., ge=0)
    inclusions: list[str] = Field(default_factory=list)
    exclusions: list[str] = Field(default_factory=list)
    contact: str = ""
    quote_date: Optional[date] = None
    availability_verified: bool = False
    notes: str = ""


class VendorComparison(BaseModel):
    quotes: list[VendorQuote]
    cheapest_vendor: Optional[str]
    best_value_vendor: Optional[str]
    missing_info: dict[str, list[str]] = Field(default_factory=dict)
    questions: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
