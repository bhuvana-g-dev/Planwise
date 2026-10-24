"""API dependencies: optional Firebase auth.

When REQUIRE_AUTH is false (default), requests are anonymous (owner_id=None) and
ownership checks are relaxed. When true, a Firebase ID token is required in the
Authorization header and the uid becomes owner_id.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def get_current_owner(
    authorization: Optional[str] = Header(default=None),
) -> Optional[str]:
    settings = get_settings()
    if not settings.require_auth:
        # Anonymous mode: allow an optional dev header to simulate a user.
        return None

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        import firebase_admin  # noqa: F401
        from firebase_admin import auth as fb_auth

        decoded = fb_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as exc:  # pragma: no cover - requires live firebase
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc
