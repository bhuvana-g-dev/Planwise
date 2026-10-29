"""Gemini client with strict JSON handling and graceful fallback.

The backend is the ONLY place Gemini is called. If no API key is configured,
`generate_json` raises `GeminiUnavailable` so callers can fall back to the
deterministic generator. Malformed responses raise `GeminiBadResponse`.

Uses the Google GenAI SDK (`google-genai`), which replaced the deprecated
`google-generativeai` package. The public interface (`generate_json` and the
`GeminiError` hierarchy) is unchanged, so callers need no modification.

Safety:
- Prompts, responses and API keys are never logged. Failures log only a short
  error category (e.g. "quota", "timeout").
- Exactly one attempt per call (no SDK-level retries); the configured timeout
  bounds the call.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class GeminiError(Exception):
    """Base class for Gemini failures.

    `category` is a short, non-sensitive label safe for logs/diagnostics.
    """

    category = "error"


class GeminiUnavailable(GeminiError):
    """No API key configured, or SDK/library missing."""

    category = "unavailable"


class GeminiTimeout(GeminiError):
    """The request exceeded the configured timeout."""

    category = "timeout"


class GeminiBadResponse(GeminiError):
    """The response could not be parsed as the expected JSON."""

    category = "bad_response"


class GeminiQuotaExceeded(GeminiError):
    """Rate limit or quota exhausted (HTTP 429 / RESOURCE_EXHAUSTED)."""

    category = "quota"


class GeminiModelUnavailable(GeminiError):
    """The configured model is not found or not available (HTTP 404)."""

    category = "model_unavailable"


class GeminiAuthError(GeminiError):
    """The API key was rejected (HTTP 401/403)."""

    category = "auth"


class GeminiServiceBusy(GeminiError):
    """The model is temporarily overloaded (HTTP 503 / UNAVAILABLE)."""

    category = "service_busy"


def _extract_json(text: str) -> Any:
    """Pull the first JSON object/array out of a model response."""
    text = text.strip()
    # Strip markdown code fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find the outermost {...} or [...].
        start = min(
            (i for i in (text.find("{"), text.find("[")) if i != -1),
            default=-1,
        )
        if start == -1:
            raise GeminiBadResponse("No JSON found in Gemini response")
        for end in range(len(text), start, -1):
            chunk = text[start:end]
            try:
                return json.loads(chunk)
            except json.JSONDecodeError:
                continue
        raise GeminiBadResponse("Could not parse JSON from Gemini response")


def _make_client(api_key: str, timeout_ms: int):
    """Build a GenAI client. Separated so tests can inject a fake client."""
    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=timeout_ms,
            # Single attempt: no hidden retries that could multiply latency
            # or quota use. Callers already have a deterministic fallback.
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )


def _map_api_error(exc: Exception) -> GeminiError:
    """Translate a google-genai APIError into our typed errors (no secrets)."""
    code = getattr(exc, "code", None)
    status = str(getattr(exc, "status", "") or "").upper()
    message = str(getattr(exc, "message", "") or "")[:200]
    detail = f"{code} {status}: {message}".strip()

    if code == 429 or status == "RESOURCE_EXHAUSTED":
        return GeminiQuotaExceeded(detail)
    if code == 404 or status == "NOT_FOUND":
        return GeminiModelUnavailable(detail)
    if code in (401, 403) or status in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return GeminiAuthError(detail)
    if code == 504 or status == "DEADLINE_EXCEEDED":
        return GeminiTimeout(detail)
    if code == 503 or status == "UNAVAILABLE":
        return GeminiServiceBusy(detail)
    return GeminiError(detail)


def generate_json(prompt: str, *, system: str = "") -> Any:
    """Call Gemini and return parsed JSON. Raises a GeminiError subclass on failure.

    This is a thin, testable wrapper: tests monkeypatch this function (or
    `_make_client`) to inject deterministic or faulty responses.
    """
    settings = get_settings()
    if not settings.gemini_enabled:
        raise GeminiUnavailable("GEMINI_API_KEY not configured")

    try:
        from google.genai import errors as genai_errors
        from google.genai import types
    except ImportError as exc:  # pragma: no cover - import guard
        raise GeminiUnavailable("google-genai not installed") from exc

    timeout_ms = int(settings.ai_timeout_seconds * 1000)

    try:
        client = _make_client(settings.gemini_api_key, timeout_ms)
        resp = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system or None,
                response_mime_type="application/json",
            ),
        )
        text = getattr(resp, "text", None)
        if not text:
            raise GeminiBadResponse("Empty Gemini response")
        return _extract_json(text)
    except GeminiError as exc:
        _log_failure(exc)
        raise
    except genai_errors.APIError as exc:
        mapped = _map_api_error(exc)
        _log_failure(mapped)
        raise mapped from exc
    except Exception as exc:  # network/transport/SDK errors
        msg = str(exc).lower()
        name = type(exc).__name__.lower()
        if "timeout" in name or "timeout" in msg or "deadline" in msg:
            mapped: GeminiError = GeminiTimeout(type(exc).__name__)
        else:
            mapped = GeminiError(type(exc).__name__)
        _log_failure(mapped)
        raise mapped from exc


def _log_failure(exc: GeminiError) -> None:
    """Log only the error category. Never the prompt, response or key."""
    logger.warning("Gemini call failed: category=%s", exc.category)
