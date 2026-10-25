"""API dependencies: optional Firebase auth.

When REQUIRE_AUTH is false (default), requests are anonymous (owner_id=None) and
ownership checks are relaxed. When true, a Firebase ID token is required in the
Authorization header and the verified uid becomes the owner_id used for
ownership checks on every private resource.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def verify_token(token: str) -> str:
    """Verify a Firebase ID token and return the uid.

    Separated out so tests can monkeypatch it without a live Firebase project.
    Raises ValueError for any invalid/expired token.
    """
    from app.core.firebase import ensure_firebase_app

    ensure_firebase_app()
    from firebase_admin import auth as fb_auth

    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception as exc:  # expired, revoked, malformed, wrong project, etc.
        raise ValueError(str(exc)) from exc
    uid = decoded.get("uid")
    if not uid:
        raise ValueError("token missing uid")
    return uid


def get_current_owner(
    authorization: Optional[str] = Header(default=None),
) -> Optional[str]:
    settings = get_settings()
    if not settings.require_auth:
        # Anonymous mode: ownership checks are relaxed (owner_id=None).
        return None

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_token(token)
    except ValueError:
        # Do not leak internal details of why verification failed.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
