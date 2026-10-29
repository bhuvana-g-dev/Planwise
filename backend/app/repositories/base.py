"""Repository interface for persistence.

Two implementations are provided:
- JsonRepository  (default, zero-config, file-backed)
- FirestoreRepository (activated when PERSISTENCE=firestore)

Both store events, plan versions, tasks, vendor quotes and change summaries,
and both support restoring full event state after a refresh/reopen.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional


class StaleActivePlan(Exception):
    """Raised by commit_approved_plan when the active version has advanced."""


class Repository(ABC):
    # --- events ---
    @abstractmethod
    def create_event(self, event: dict) -> dict: ...

    @abstractmethod
    def get_event(self, event_id: str) -> Optional[dict]: ...

    @abstractmethod
    def list_events(self, owner_id: Optional[str] = None) -> list[dict]: ...

    @abstractmethod
    def update_event(self, event_id: str, patch: dict) -> dict: ...

    # --- plans (versioned) ---
    @abstractmethod
    def add_plan(self, event_id: str, plan: dict) -> dict: ...

    @abstractmethod
    def list_plans(self, event_id: str) -> list[dict]: ...

    @abstractmethod
    def get_active_plan(self, event_id: str) -> Optional[dict]: ...

    @abstractmethod
    def set_active_plan(self, event_id: str, plan_id: str) -> dict: ...

    @abstractmethod
    def commit_approved_plan(
        self, event_id: str, plan: dict, expected_active_version: int
    ) -> dict:
        """Atomically activate a new plan iff the current active version matches.

        Adds `plan`, marks it active and deactivates others — but only if the
        currently active plan's version equals `expected_active_version`. This
        is an atomic compare-and-swap that prevents two simultaneous approvals
        from both succeeding. Raises `StaleActivePlan` if the version no longer
        matches (someone else approved first).
        """
        ...

    # --- tasks ---
    @abstractmethod
    def update_task(self, event_id: str, task_id: str, patch: dict) -> dict: ...

    # --- vendors ---
    @abstractmethod
    def save_vendor_quotes(self, event_id: str, quotes: list[dict]) -> list[dict]: ...

    @abstractmethod
    def list_vendor_quotes(self, event_id: str) -> list[dict]: ...

    # --- guests ---
    @abstractmethod
    def list_guests(self, event_id: str) -> list[dict]: ...

    @abstractmethod
    def save_guests(self, event_id: str, guests: list[dict]) -> list[dict]: ...

    # --- catering ---
    @abstractmethod
    def get_catering(self, event_id: str) -> Optional[dict]: ...

    @abstractmethod
    def save_catering(self, event_id: str, plan: dict) -> dict: ...

    # --- venues (per-event shortlist + selection) ---
    @abstractmethod
    def list_shortlisted_venues(self, event_id: str) -> list[dict]: ...

    @abstractmethod
    def save_shortlisted_venues(self, event_id: str,
                                venues: list[dict]) -> list[dict]: ...

    # --- caterers (discovery picks, manual arrangements, booking state) ---
    @abstractmethod
    def get_caterers(self, event_id: str) -> Optional[dict]:
        """Return {"food_preference": str, "records": [...]} or None."""
        ...

    @abstractmethod
    def save_caterers(self, event_id: str, store: dict) -> dict: ...
