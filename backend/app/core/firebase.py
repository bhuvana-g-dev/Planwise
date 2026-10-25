"""Firebase Admin initialization (shared by auth + Firestore).

Initializing the Admin SDK once, lazily, lets both token verification and the
Firestore repository work regardless of persistence mode. If credentials are
unavailable, initialization raises and callers surface a clear error.
"""
from __future__ import annotations

import threading

from app.core.config import get_settings

_lock = threading.Lock()
_initialized = False


def ensure_firebase_app() -> None:
    """Initialize the default firebase_admin app exactly once (thread-safe)."""
    global _initialized
    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            settings = get_settings()
            if settings.google_application_credentials:
                cred = credentials.Certificate(
                    settings.google_application_credentials
                )
                options = {}
                if settings.firebase_project_id:
                    options["projectId"] = settings.firebase_project_id
                firebase_admin.initialize_app(cred, options or None)
            else:
                # Uses GOOGLE_APPLICATION_CREDENTIALS env or workload identity.
                firebase_admin.initialize_app()
        _initialized = True
