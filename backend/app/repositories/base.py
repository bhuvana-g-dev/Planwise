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

    # --- tasks ---
    @abstractmethod
    def update_task(self, event_id: str, task_id: str, patch: dict) -> dict: ...

    # --- vendors ---
    @abstractmethod
    def save_vendor_quotes(self, event_id: str, quotes: list[dict]) -> list[dict]: ...

    @abstractmethod
    def list_vendor_quotes(self, event_id: str) -> list[dict]: ...
