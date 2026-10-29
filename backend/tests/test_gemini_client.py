"""google-genai client migration — mocked SDK tests (no network, no real key).

A fake client is injected via `gemini_client._make_client`, so these tests
exercise the REAL request construction, error mapping and JSON parsing of
`generate_json` without contacting Google. Real `google.genai.errors` objects
are raised so the mapping is tested against the actual SDK error types.
"""
from __future__ import annotations

import logging

import httpx
import pytest
from google.genai import errors as genai_errors

from app.core.config import get_settings
from app.services import gemini_client
from app.services.gemini_client import (
    GeminiAuthError,
    GeminiBadResponse,
    GeminiError,
    GeminiModelUnavailable,
    GeminiQuotaExceeded,
    GeminiServiceBusy,
    GeminiTimeout,
    GeminiUnavailable,
)

FAKE_KEY = "test-key-not-real"


class _FakeResponse:
    def __init__(self, text):
        self.text = text


class _FakeModels:
    def __init__(self, behaviour):
        self._behaviour = behaviour
        self.calls: list[dict] = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self._behaviour, BaseException):
            raise self._behaviour
        return _FakeResponse(self._behaviour)


class _FakeClient:
    def __init__(self, behaviour):
        self.models = _FakeModels(behaviour)


@pytest.fixture
def with_key(monkeypatch):
    """Pretend a key + model are configured (values are fake)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", FAKE_KEY)
    monkeypatch.setattr(settings, "gemini_model", "test-model")
    monkeypatch.setattr(settings, "ai_timeout_seconds", 12.5)
    yield settings


def _install(monkeypatch, behaviour):
    """Inject a fake client; return it plus the args _make_client received."""
    holder: dict = {}

    def _factory(api_key, timeout_ms):
        holder["api_key"] = api_key
        holder["timeout_ms"] = timeout_ms
        holder["client"] = _FakeClient(behaviour)
        return holder["client"]

    monkeypatch.setattr(gemini_client, "_make_client", _factory)
    return holder


def _api_error(cls, code, status, message="boom"):
    return cls(code, {"error": {"code": code, "status": status,
                                "message": message}})


# --------------------------------------------------------------------------
# Success path + request construction
# --------------------------------------------------------------------------
def test_success_returns_parsed_json(monkeypatch, with_key):
    holder = _install(monkeypatch, '{"ok": true, "n": 3}')
    data = gemini_client.generate_json("prompt text", system="be strict")
    assert data == {"ok": True, "n": 3}

    call = holder["client"].models.calls[0]
    # Model comes from configuration, not hardcoded.
    assert call["model"] == "test-model"
    assert call["contents"] == "prompt text"
    cfg = call["config"]
    assert cfg.system_instruction == "be strict"
    assert cfg.response_mime_type == "application/json"
    # Seconds -> milliseconds conversion for the new SDK.
    assert holder["timeout_ms"] == 12500
    assert holder["api_key"] == FAKE_KEY


def test_success_fenced_json(monkeypatch, with_key):
    _install(monkeypatch, '```json\n{"a": 1}\n```')
    assert gemini_client.generate_json("p") == {"a": 1}


def test_empty_system_instruction_is_none(monkeypatch, with_key):
    holder = _install(monkeypatch, '{"a": 1}')
    gemini_client.generate_json("p")
    assert holder["client"].models.calls[0]["config"].system_instruction is None


def test_real_client_factory_disables_retries():
    """_make_client builds a real SDK client with a single attempt."""
    client = gemini_client._make_client(FAKE_KEY, 5000)
    opts = client._api_client._http_options
    assert opts.timeout == 5000
    assert opts.retry_options.attempts == 1


# --------------------------------------------------------------------------
# Malformed / empty output
# --------------------------------------------------------------------------
def test_malformed_json_raises_bad_response(monkeypatch, with_key):
    _install(monkeypatch, "this is not json at all")
    with pytest.raises(GeminiBadResponse):
        gemini_client.generate_json("p")


def test_empty_text_raises_bad_response(monkeypatch, with_key):
    _install(monkeypatch, None)
    with pytest.raises(GeminiBadResponse):
        gemini_client.generate_json("p")


# --------------------------------------------------------------------------
# Missing credentials
# --------------------------------------------------------------------------
def test_missing_key_raises_unavailable_without_calling_sdk(monkeypatch):
    called = {"n": 0}

    def _factory(*a, **k):
        called["n"] += 1
        raise AssertionError("SDK must not be called without a key")

    monkeypatch.setattr(gemini_client, "_make_client", _factory)
    with pytest.raises(GeminiUnavailable):
        gemini_client.generate_json("p")
    assert called["n"] == 0


# --------------------------------------------------------------------------
# Timeouts
# --------------------------------------------------------------------------
def test_transport_timeout_maps_to_timeout(monkeypatch, with_key):
    _install(monkeypatch, httpx.ReadTimeout("read timed out"))
    with pytest.raises(GeminiTimeout):
        gemini_client.generate_json("p")


def test_server_deadline_504_maps_to_timeout(monkeypatch, with_key):
    _install(monkeypatch, _api_error(genai_errors.ServerError, 504,
                                     "DEADLINE_EXCEEDED"))
    with pytest.raises(GeminiTimeout):
        gemini_client.generate_json("p")


# --------------------------------------------------------------------------
# API errors: quota, unavailable model, auth, generic
# --------------------------------------------------------------------------
def test_quota_429_maps_to_quota(monkeypatch, with_key):
    _install(monkeypatch, _api_error(genai_errors.ClientError, 429,
                                     "RESOURCE_EXHAUSTED"))
    with pytest.raises(GeminiQuotaExceeded):
        gemini_client.generate_json("p")


def test_model_404_maps_to_model_unavailable(monkeypatch, with_key):
    _install(monkeypatch, _api_error(genai_errors.ClientError, 404,
                                     "NOT_FOUND", "model not available"))
    with pytest.raises(GeminiModelUnavailable) as info:
        gemini_client.generate_json("p")
    assert "404" in str(info.value)


def test_auth_403_maps_to_auth(monkeypatch, with_key):
    _install(monkeypatch, _api_error(genai_errors.ClientError, 403,
                                     "PERMISSION_DENIED"))
    with pytest.raises(GeminiAuthError):
        gemini_client.generate_json("p")


def test_overloaded_503_maps_to_service_busy(monkeypatch, with_key):
    _install(monkeypatch, _api_error(genai_errors.ServerError, 503,
                                     "UNAVAILABLE", "high demand"))
    with pytest.raises(GeminiServiceBusy):
        gemini_client.generate_json("p")


def test_other_server_error_maps_to_generic(monkeypatch, with_key):
    _install(monkeypatch, _api_error(genai_errors.ServerError, 500,
                                     "INTERNAL"))
    with pytest.raises(GeminiError) as info:
        gemini_client.generate_json("p")
    assert type(info.value) is GeminiError


def test_unexpected_exception_maps_to_generic(monkeypatch, with_key):
    _install(monkeypatch, RuntimeError("socket exploded"))
    with pytest.raises(GeminiError):
        gemini_client.generate_json("p")


def test_all_new_errors_are_gemini_errors():
    """Existing callers catch GeminiError, so every new type must subclass it."""
    for cls in (GeminiQuotaExceeded, GeminiModelUnavailable, GeminiAuthError,
                GeminiServiceBusy, GeminiTimeout, GeminiBadResponse,
                GeminiUnavailable):
        assert issubclass(cls, GeminiError)


# --------------------------------------------------------------------------
# Logging never contains the prompt or the key
# --------------------------------------------------------------------------
def test_failure_log_excludes_prompt_and_key(monkeypatch, with_key, caplog):
    _install(monkeypatch, _api_error(genai_errors.ClientError, 429,
                                     "RESOURCE_EXHAUSTED"))
    secret_prompt = "GUEST_NAME_PLACEHOLDER phone 000-000-0000 budget 75000"
    with caplog.at_level(logging.WARNING, logger="app.services.gemini_client"):
        with pytest.raises(GeminiQuotaExceeded):
            gemini_client.generate_json(secret_prompt)
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "category=quota" in logged
    assert secret_prompt not in logged
    assert FAKE_KEY not in logged


# --------------------------------------------------------------------------
# Graceful fallback for every existing caller, driven through the REAL
# generate_json with SDK failures (not by mocking generate_json itself).
# --------------------------------------------------------------------------
SDK_FAILURES = [
    pytest.param(lambda: _api_error(genai_errors.ClientError, 429,
                                    "RESOURCE_EXHAUSTED"), id="quota"),
    pytest.param(lambda: _api_error(genai_errors.ClientError, 404,
                                    "NOT_FOUND"), id="model404"),
    pytest.param(lambda: _api_error(genai_errors.ServerError, 503,
                                    "UNAVAILABLE"), id="busy503"),
    pytest.param(lambda: httpx.ReadTimeout("t"), id="timeout"),
    pytest.param(lambda: "not json", id="malformed"),
]


@pytest.mark.parametrize("make_failure", SDK_FAILURES)
def test_plan_generator_falls_back(monkeypatch, with_key, birthday_event,
                                   make_failure):
    from app.services import event_service, plan_generator

    _install(monkeypatch, make_failure())
    event = event_service.create_event(birthday_event, owner_id=None)
    plan = plan_generator.generate_plan(event, version=1)
    assert plan.generated_by == "deterministic"
    assert plan.budget.within_budget


@pytest.mark.parametrize("make_failure", SDK_FAILURES)
def test_menu_ai_falls_back(monkeypatch, with_key, make_failure):
    from app.models.catering import CateringPreferences
    from app.models.event import EventType
    from app.services import menu_ai

    _install(monkeypatch, make_failure())
    items, gen = menu_ai.generate_menu(
        EventType.birthday, 50, CateringPreferences(), 300
    )
    assert gen == "deterministic"
    assert items


@pytest.mark.parametrize("make_failure", SDK_FAILURES)
def test_venue_reasoning_falls_back(monkeypatch, with_key, make_failure):
    from app.services import venue_service

    _install(monkeypatch, make_failure())
    out = venue_service._ai_reasoning(
        "birthday", "Madurai", 50, None, "any", [], []
    )
    assert out["generated_by"] == "deterministic"
    assert out["text"]


@pytest.mark.parametrize("make_failure", SDK_FAILURES)
def test_nl_replan_degrades_without_guessing(monkeypatch, with_key,
                                             birthday_event, make_failure):
    from app.services import event_service

    _install(monkeypatch, make_failure())
    event = event_service.create_event(birthday_event, owner_id=None)
    event_service.generate_initial_plan(event.id, owner_id=None)
    out = event_service.interpret_replan(event.id, "cut budget to 20000", None)
    # Never a guessed change: no proposal when the AI could not interpret.
    assert out["status"] in ("unavailable", "needs_clarification")
    assert out["result"] is None
