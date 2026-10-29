"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # AI
    gemini_api_key: str = ""
    # Overridden by the GEMINI_MODEL environment variable. "gemini-1.5-flash"
    # is retired (404); this default was verified live with google-genai.
    gemini_model: str = "gemini-3.5-flash"
    ai_timeout_seconds: float = 30.0

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Persistence: "json" or "firestore"
    persistence: str = "json"

    # Venue data source: "osm" (real OpenStreetMap data) or "demo" (samples).
    venue_source: str = "osm"

    # Firestore
    firebase_project_id: str = ""
    google_application_credentials: str = ""

    # Auth
    require_auth: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
