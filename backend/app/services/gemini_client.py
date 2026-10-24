"""Gemini client with strict JSON handling and graceful fallback.

The backend is the ONLY place Gemini is called. If no API key is configured,
`generate_json` raises `GeminiUnavailable` so callers can fall back to the
deterministic generator. Malformed responses raise `GeminiBadResponse`.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import get_settings


class GeminiError(Exception):
    """Base class for Gemini failures."""


class GeminiUnavailable(GeminiError):
    """No API key configured, or SDK/library missing."""


class GeminiTimeout(GeminiError):
    """The request exceeded the configured timeout."""


class GeminiBadResponse(GeminiError):
    """The response could not be parsed as the expected JSON."""


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


def generate_json(prompt: str, *, system: str = "") -> Any:
    """Call Gemini and return parsed JSON. Raises a GeminiError subclass on failure.

    This is a thin, testable wrapper: tests monkeypatch this function to inject
    deterministic or faulty responses.
    """
    settings = get_settings()
    if not settings.gemini_enabled:
        raise GeminiUnavailable("GEMINI_API_KEY not configured")

    try:
        import google.generativeai as genai
    except ImportError as exc:  # pragma: no cover - import guard
        raise GeminiUnavailable("google-generativeai not installed") from exc

    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(
            settings.gemini_model,
            system_instruction=system or None,
            generation_config={"response_mime_type": "application/json"},
        )
        resp = model.generate_content(
            prompt,
            request_options={"timeout": settings.ai_timeout_seconds},
        )
        text = getattr(resp, "text", None)
        if not text:
            raise GeminiBadResponse("Empty Gemini response")
        return _extract_json(text)
    except (GeminiBadResponse, GeminiUnavailable):
        raise
    except Exception as exc:  # pragma: no cover - network/SDK errors
        msg = str(exc).lower()
        if "timeout" in msg or "deadline" in msg:
            raise GeminiTimeout(str(exc)) from exc
        raise GeminiError(str(exc)) from exc
