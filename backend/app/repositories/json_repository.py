"""File-backed JSON repository (default, zero-config).

Data is stored under backend/.data/db.json. Thread-safe via a simple lock.
Optimistic concurrency for plan activation is enforced in the service layer via
plan versions.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional

from app.repositories.base import Repository

_DATA_DIR = Path(__file__).resolve().parents[2] / ".data"
_DB_FILE = _DATA_DIR / "db.json"


class JsonRepository(Repository):
    def __init__(self, path: Optional[Path] = None) -> None:
        self._path = path or _DB_FILE
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._write({"events": {}, "plans": {}, "vendors": {},
                         "guests": {}, "catering": {}})

    # ---- low level ----
    def _read(self) -> dict:
        with self._path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _write(self, data: dict) -> None:
        tmp = self._path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        tmp.replace(self._path)

    # ---- events ----
    def create_event(self, event: dict) -> dict:
        with self._lock:
            db = self._read()
            db["events"][event["id"]] = event
            db["plans"].setdefault(event["id"], [])
            db["vendors"].setdefault(event["id"], [])
            db.setdefault("guests", {}).setdefault(event["id"], [])
            self._write(db)
            return event

    def get_event(self, event_id: str) -> Optional[dict]:
        with self._lock:
            return self._read()["events"].get(event_id)

    def list_events(self, owner_id: Optional[str] = None) -> list[dict]:
        with self._lock:
            events = list(self._read()["events"].values())
        if owner_id is not None:
            events = [e for e in events if e.get("owner_id") == owner_id]
        return sorted(events, key=lambda e: e.get("created_at", ""), reverse=True)

    def update_event(self, event_id: str, patch: dict) -> dict:
        with self._lock:
            db = self._read()
            event = db["events"].get(event_id)
            if event is None:
                raise KeyError(event_id)
            event.update(patch)
            db["events"][event_id] = event
            self._write(db)
            return event

    # ---- plans ----
    def add_plan(self, event_id: str, plan: dict) -> dict:
        with self._lock:
            db = self._read()
            db["plans"].setdefault(event_id, []).append(plan)
            self._write(db)
            return plan

    def list_plans(self, event_id: str) -> list[dict]:
        with self._lock:
            plans = list(self._read()["plans"].get(event_id, []))
        return sorted(plans, key=lambda p: p.get("version", 0))

    def get_active_plan(self, event_id: str) -> Optional[dict]:
        with self._lock:
            plans = self._read()["plans"].get(event_id, [])
        active = [p for p in plans if p.get("is_active")]
        if active:
            return max(active, key=lambda p: p.get("version", 0))
        return None

    def set_active_plan(self, event_id: str, plan_id: str) -> dict:
        with self._lock:
            db = self._read()
            plans = db["plans"].get(event_id, [])
            found = None
            for p in plans:
                if p["id"] == plan_id:
                    p["is_active"] = True
                    found = p
                else:
                    p["is_active"] = False
            if found is None:
                raise KeyError(plan_id)
            self._write(db)
            return found

    def commit_approved_plan(self, event_id: str, plan: dict,
                             expected_active_version: int) -> dict:
        from app.repositories.base import StaleActivePlan
        with self._lock:
            db = self._read()
            plans = db["plans"].setdefault(event_id, [])
            active = [p for p in plans if p.get("is_active")]
            current_version = (
                max((p.get("version", 0) for p in active), default=0)
            )
            if current_version != expected_active_version:
                raise StaleActivePlan(
                    f"active plan is version {current_version}, expected "
                    f"{expected_active_version}"
                )
            for p in plans:
                p["is_active"] = False
            plan["is_active"] = True
            plans.append(plan)
            self._write(db)
            return plan

    # ---- tasks ----
    def update_task(self, event_id: str, task_id: str, patch: dict) -> dict:
        with self._lock:
            db = self._read()
            plans = db["plans"].get(event_id, [])
            active = [p for p in plans if p.get("is_active")]
            if not active:
                raise KeyError("no active plan")
            plan = max(active, key=lambda p: p.get("version", 0))
            task = next((t for t in plan["tasks"] if t["id"] == task_id), None)
            if task is None:
                raise KeyError(task_id)
            task.update(patch)
            self._write(db)
            return task

    # ---- vendors ----
    def save_vendor_quotes(self, event_id: str, quotes: list[dict]) -> list[dict]:
        with self._lock:
            db = self._read()
            db["vendors"][event_id] = quotes
            self._write(db)
            return quotes

    def list_vendor_quotes(self, event_id: str) -> list[dict]:
        with self._lock:
            return list(self._read()["vendors"].get(event_id, []))

    # ---- guests ----
    def list_guests(self, event_id: str) -> list[dict]:
        with self._lock:
            return list(self._read().get("guests", {}).get(event_id, []))

    def save_guests(self, event_id: str, guests: list[dict]) -> list[dict]:
        with self._lock:
            db = self._read()
            db.setdefault("guests", {})[event_id] = guests
            self._write(db)
            return guests

    # ---- catering ----
    def get_catering(self, event_id: str) -> Optional[dict]:
        with self._lock:
            return self._read().get("catering", {}).get(event_id)

    def save_catering(self, event_id: str, plan: dict) -> dict:
        with self._lock:
            db = self._read()
            db.setdefault("catering", {})[event_id] = plan
            self._write(db)
            return plan

    # ---- venues ----
    def list_shortlisted_venues(self, event_id: str) -> list[dict]:
        with self._lock:
            return list(self._read().get("venues", {}).get(event_id, []))

    def save_shortlisted_venues(self, event_id: str,
                                venues: list[dict]) -> list[dict]:
        with self._lock:
            db = self._read()
            db.setdefault("venues", {})[event_id] = venues
            self._write(db)
            return venues

    # ---- caterers ----
    def get_caterers(self, event_id: str) -> Optional[dict]:
        with self._lock:
            return self._read().get("caterers", {}).get(event_id)

    def save_caterers(self, event_id: str, store: dict) -> dict:
        with self._lock:
            db = self._read()
            db.setdefault("caterers", {})[event_id] = store
            self._write(db)
            return store
