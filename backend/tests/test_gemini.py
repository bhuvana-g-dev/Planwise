"""Tests 10, 11 — malformed & failing Gemini responses."""
from __future__ import annotations

import pytest

from app.services import gemini_client, plan_generator
from app.services.gemini_client import (
    GeminiBadResponse,
    GeminiTimeout,
    GeminiUnavailable,
)


# Test 10: reject malformed Gemini responses (fall back to deterministic plan)
def test_malformed_gemini_falls_back(birthday_event, monkeypatch):
    from app.services import event_service
    event = event_service.create_event(birthday_event, owner_id=None)

    def _bad(prompt, system=""):
        return gemini_client._extract_json("this is not json at all")

    monkeypatch.setattr(gemini_client, "generate_json",
                        lambda *a, **k: (_ for _ in ()).throw(GeminiBadResponse("bad")))
    plan = plan_generator.generate_plan(event, version=1)
    assert plan.generated_by == "deterministic"
    assert plan.budget.within_budget


# Test 11: Gemini timeout handled gracefully
def test_gemini_timeout_falls_back(birthday_event, monkeypatch):
    from app.services import event_service
    event = event_service.create_event(birthday_event, owner_id=None)
    monkeypatch.setattr(
        gemini_client, "generate_json",
        lambda *a, **k: (_ for _ in ()).throw(GeminiTimeout("deadline exceeded")),
    )
    plan = plan_generator.generate_plan(event, version=1)
    assert plan.generated_by == "deterministic"


def test_extract_json_from_fenced_block():
    data = gemini_client._extract_json('```json\n{"a": 1}\n```')
    assert data == {"a": 1}


def test_extract_json_embedded():
    data = gemini_client._extract_json('blah blah {"x": [1,2]} trailing')
    assert data == {"x": [1, 2]}


def test_extract_json_raises_when_absent():
    with pytest.raises(GeminiBadResponse):
        gemini_client._extract_json("absolutely no json")


def test_gemini_unavailable_without_key():
    with pytest.raises(GeminiUnavailable):
        gemini_client.generate_json("hi")
