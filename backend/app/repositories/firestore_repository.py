"""Firestore repository (activated when PERSISTENCE=firestore).

Mirrors JsonRepository semantics. Requires firebase-admin and valid
credentials via GOOGLE_APPLICATION_CREDENTIALS. Imported lazily so the app
runs without firebase-admin installed when using the JSON store.
"""
from __future__ import annotations

from typing import Optional

from app.repositories.base import Repository, StaleActivePlan


class FirestoreRepository(Repository):
    def __init__(self) -> None:
        from app.core.firebase import ensure_firebase_app
        from firebase_admin import firestore

        ensure_firebase_app()
        self.db = firestore.client()

    # ---- events ----
    def create_event(self, event: dict) -> dict:
        self.db.collection("events").document(event["id"]).set(event)
        return event

    def get_event(self, event_id: str) -> Optional[dict]:
        doc = self.db.collection("events").document(event_id).get()
        return doc.to_dict() if doc.exists else None

    def list_events(self, owner_id: Optional[str] = None) -> list[dict]:
        col = self.db.collection("events")
        if owner_id is not None:
            col = col.where("owner_id", "==", owner_id)
        return [d.to_dict() for d in col.stream()]

    def update_event(self, event_id: str, patch: dict) -> dict:
        ref = self.db.collection("events").document(event_id)
        ref.update(patch)
        return ref.get().to_dict()

    # ---- plans ----
    def add_plan(self, event_id: str, plan: dict) -> dict:
        self.db.collection("events").document(event_id) \
            .collection("plans").document(plan["id"]).set(plan)
        return plan

    def list_plans(self, event_id: str) -> list[dict]:
        docs = self.db.collection("events").document(event_id) \
            .collection("plans").stream()
        return sorted((d.to_dict() for d in docs), key=lambda p: p.get("version", 0))

    def get_active_plan(self, event_id: str) -> Optional[dict]:
        plans = [p for p in self.list_plans(event_id) if p.get("is_active")]
        return max(plans, key=lambda p: p.get("version", 0)) if plans else None

    def set_active_plan(self, event_id: str, plan_id: str) -> dict:
        col = self.db.collection("events").document(event_id).collection("plans")
        found = None
        for d in col.stream():
            data = d.to_dict()
            is_active = data["id"] == plan_id
            col.document(data["id"]).update({"is_active": is_active})
            if is_active:
                found = {**data, "is_active": True}
        if found is None:
            raise KeyError(plan_id)
        return found

    def commit_approved_plan(self, event_id: str, plan: dict,
                             expected_active_version: int) -> dict:
        from firebase_admin import firestore

        plans_col = (
            self.db.collection("events").document(event_id).collection("plans")
        )

        @firestore.transactional
        def _txn(transaction):
            # Read all plans inside the transaction for a consistent snapshot.
            docs = list(plans_col.stream(transaction=transaction))
            active = [d.to_dict() for d in docs if d.to_dict().get("is_active")]
            current_version = max(
                (p.get("version", 0) for p in active), default=0
            )
            if current_version != expected_active_version:
                raise StaleActivePlan(
                    f"active plan is version {current_version}, expected "
                    f"{expected_active_version}"
                )
            for d in docs:
                transaction.update(plans_col.document(d.id), {"is_active": False})
            new_ref = plans_col.document(plan["id"])
            plan["is_active"] = True
            transaction.set(new_ref, plan)
            return plan

        transaction = self.db.transaction()
        return _txn(transaction)

    # ---- tasks ----
    def update_task(self, event_id: str, task_id: str, patch: dict) -> dict:
        active = self.get_active_plan(event_id)
        if active is None:
            raise KeyError("no active plan")
        tasks = active["tasks"]
        task = next((t for t in tasks if t["id"] == task_id), None)
        if task is None:
            raise KeyError(task_id)
        task.update(patch)
        self.db.collection("events").document(event_id).collection("plans") \
            .document(active["id"]).update({"tasks": tasks})
        return task

    # ---- vendors ----
    def save_vendor_quotes(self, event_id: str, quotes: list[dict]) -> list[dict]:
        self.db.collection("events").document(event_id) \
            .collection("meta").document("vendors").set({"quotes": quotes})
        return quotes

    def list_vendor_quotes(self, event_id: str) -> list[dict]:
        doc = self.db.collection("events").document(event_id) \
            .collection("meta").document("vendors").get()
        return doc.to_dict().get("quotes", []) if doc.exists else []
