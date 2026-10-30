"""Firebase Admin initialization (shared by auth + Firestore).

Initializing the Admin SDK once, lazily, lets both token verification and the
Firestore repository work regardless of persistence mode. If credentials are
unavailable, initialization raises and callers surface a clear error.
"""
from __future__ import annotations

import json
import os
import threading

from app.core.config import get_settings

_lock = threading.Lock()
_initialized = False


class FirebaseCredentialsError(RuntimeError):
    """Credentials are misconfigured. Messages never include the secret."""


def _credential_source(value: str):
    """Return a path or a parsed dict for credentials.Certificate.

    GOOGLE_APPLICATION_CREDENTIALS should be a file path, but hosts make it
    easy to paste the key JSON itself. Accept both, and never echo the value
    in an error: the underlying open() error would print the private key.
    """
    raw = value.strip()
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise FirebaseCredentialsError(
                "GOOGLE_APPLICATION_CREDENTIALS looks like JSON but is not "
                "valid JSON. Set it to the key file path instead."
            ) from None
        if not isinstance(data, dict) or data.get("type") != "service_account":
            raise FirebaseCredentialsError(
                "GOOGLE_APPLICATION_CREDENTIALS JSON is not a service-account key."
            )
        return data
    if not os.path.isfile(raw):
        raise FirebaseCredentialsError(
            "GOOGLE_APPLICATION_CREDENTIALS points to a file that does not "
            "exist. On Render, add a Secret File named serviceAccount.json and "
            "set the variable to /etc/secrets/serviceAccount.json."
        )
    return raw


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
                    _credential_source(settings.google_application_credentials)
                )
                options = {}
                if settings.firebase_project_id:
                    options["projectId"] = settings.firebase_project_id
                firebase_admin.initialize_app(cred, options or None)
            else:
                # Uses GOOGLE_APPLICATION_CREDENTIALS env or workload identity.
                firebase_admin.initialize_app()
        _initialized = True
