"""Repository provider — chooses JSON or Firestore based on settings."""
from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.repositories.base import Repository
from app.repositories.json_repository import JsonRepository


@lru_cache
def get_repository() -> Repository:
    settings = get_settings()
    if settings.persistence.lower() == "firestore":
        from app.repositories.firestore_repository import FirestoreRepository
        return FirestoreRepository()
    return JsonRepository()
