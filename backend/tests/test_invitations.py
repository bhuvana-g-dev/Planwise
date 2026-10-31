"""Invitations: save/load per event, validation, ownership, and AI wording
that never puts dates/times on the card and falls back when Gemini fails."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.main import app
from app.services import gemini_client, invitation_service
from app.services.gemini_client import GeminiQuotaExceeded, GeminiTimeout

client = TestClient(app)

DESIGN = {
    "template_id": "wedding-royal-mandala",
    "eyebrow": "Together with their families",
    "headline": "Priya & Arjun",
    "hosts": "The Sharma and Iyer families",
    "message": "We invite you to celebrate our wedding with us.",
    "date_text": "Friday, 25 December 2026",
    "time_text": "7 PM onwards",
    "venue_text": "CR Mahal, Madurai",
    "dress_code": "Traditional",
    "rsvp_text": "RSVP to Meena",
}


def teardown_function():
    app.dependency_overrides.pop(get_current_owner, None)


def _event(event_type="wedding"):
    return client.post("/api/events", json={
        "name": "Invite Test", "event_type": event_type,
        "event_date": (date.today() + timedelta(days=40)).isoformat(),
        "location": "Madurai", "guest_count": 120, "budget_inr": 300000,
    }).json()


def _gemini(monkeypatch, payload=None, exc=None):
    def fake(*a, **k):
        if exc:
            raise exc
        return payload
    monkeypatch.setattr(gemini_client, "generate_json", fake)


# --------------------------------------------------------------------------
# Save / load
# --------------------------------------------------------------------------
def test_no_design_until_saved():
    eid = _event()["id"]
    r = client.get(f"/api/events/{eid}/invitation")
    assert r.status_code == 200 and r.json() == {"design": None}


def test_save_then_load_round_trip_and_trims():
    eid = _event()["id"]
    r = client.put(f"/api/events/{eid}/invitation",
                   json={**DESIGN, "headline": "  Priya & Arjun  "})
    assert r.status_code == 200
    assert r.json()["design"]["headline"] == "Priya & Arjun"
    got = client.get(f"/api/events/{eid}/invitation").json()["design"]
    assert got == DESIGN


def test_designs_are_per_event():
    a, b = _event()["id"], _event("birthday")["id"]
    client.put(f"/api/events/{a}/invitation", json=DESIGN)
    assert client.get(f"/api/events/{b}/invitation").json()["design"] is None


def test_resave_replaces_previous_design():
    eid = _event()["id"]
    client.put(f"/api/events/{eid}/invitation", json=DESIGN)
    client.put(f"/api/events/{eid}/invitation",
               json={**DESIGN, "template_id": "wedding-minimal", "dress_code": ""})
    got = client.get(f"/api/events/{eid}/invitation").json()["design"]
    assert got["template_id"] == "wedding-minimal" and got["dress_code"] == ""


@pytest.mark.parametrize("field,limit", [
    ("headline", 90), ("message", 400), ("venue_text", 160), ("template_id", 60),
])
def test_overlong_fields_rejected(field, limit):
    eid = _event()["id"]
    r = client.put(f"/api/events/{eid}/invitation",
                   json={**DESIGN, field: "x" * (limit + 1)})
    assert r.status_code == 422


def test_unknown_event_is_404():
    assert client.get("/api/events/evt-missing/invitation").status_code == 404
    assert client.put("/api/events/evt-missing/invitation",
                      json=DESIGN).status_code == 404
    assert client.post("/api/events/evt-missing/invitation/wording",
                       json={}).status_code == 404


def test_other_owner_cannot_read_or_write():
    app.dependency_overrides[get_current_owner] = lambda: "owner-a"
    eid = _event()["id"]
    client.put(f"/api/events/{eid}/invitation", json=DESIGN)
    app.dependency_overrides[get_current_owner] = lambda: "owner-b"
    assert client.get(f"/api/events/{eid}/invitation").status_code == 403
    assert client.put(f"/api/events/{eid}/invitation",
                      json=DESIGN).status_code == 403
    assert client.post(f"/api/events/{eid}/invitation/wording",
                       json={}).status_code == 403


# --------------------------------------------------------------------------
# AI wording
# --------------------------------------------------------------------------
def test_wording_without_gemini_uses_curated_text():
    # conftest disables Gemini by default.
    eid = _event("birthday")["id"]
    r = client.post(f"/api/events/{eid}/invitation/wording", json={"tone": "fun"})
    assert r.status_code == 200
    body = r.json()
    assert body["generated_by"] == "deterministic" and body["tone"] == "fun"
    assert (body["headline"], body["message"]) == \
        invitation_service.fallback_wording("birthday", "fun")


@pytest.mark.parametrize("etype", ["wedding", "birthday", "community"])
@pytest.mark.parametrize("tone", ["warm", "formal", "fun", "traditional"])
def test_every_type_and_tone_has_fallback(etype, tone):
    h, m = invitation_service.fallback_wording(etype, tone)
    assert h and m and len(h) <= 90 and len(m) <= 400


def test_gemini_wording_is_used_and_cleaned(monkeypatch):
    _gemini(monkeypatch, {"headline": ' "Two hearts, one journey" ',
                          "message": "Join us   as we\nbegin forever."})
    eid = _event()["id"]
    body = client.post(f"/api/events/{eid}/invitation/wording",
                       json={"tone": "warm", "details": "beach theme"}).json()
    assert body == {"headline": "Two hearts, one journey",
                    "message": "Join us as we begin forever.",
                    "tone": "warm", "generated_by": "gemini"}


@pytest.mark.parametrize("bad", [
    {"headline": "Party!", "message": "See you on 25 Dec at the hall."},
    {"headline": "Party!", "message": "Starts at 7 pm sharp."},
    {"headline": "Party on 12/05/2026", "message": "Come along."},
    {"headline": "", "message": "Come along."},
    {"headline": "Party", "message": 42},
    ["not", "a", "dict"],
])
def test_gemini_output_with_dates_or_bad_shape_falls_back(monkeypatch, bad):
    _gemini(monkeypatch, bad)
    eid = _event("community")["id"]
    body = client.post(f"/api/events/{eid}/invitation/wording",
                       json={"tone": "formal"}).json()
    assert body["generated_by"] == "deterministic"
    assert (body["headline"], body["message"]) == \
        invitation_service.fallback_wording("community", "formal")


@pytest.mark.parametrize("exc", [GeminiQuotaExceeded("q"), GeminiTimeout("t")])
def test_gemini_errors_fall_back(monkeypatch, exc):
    _gemini(monkeypatch, exc=exc)
    eid = _event()["id"]
    body = client.post(f"/api/events/{eid}/invitation/wording",
                       json={"tone": "traditional"}).json()
    assert body["generated_by"] == "deterministic"


def test_long_gemini_text_is_truncated_on_a_word(monkeypatch):
    _gemini(monkeypatch, {"headline": "word " * 40, "message": "lovely " * 120})
    eid = _event()["id"]
    body = client.post(f"/api/events/{eid}/invitation/wording", json={}).json()
    assert body["generated_by"] == "gemini"
    assert len(body["headline"]) <= 91 and body["headline"].endswith("…")
    assert len(body["message"]) <= 401 and "lovel…" not in body["message"]


def test_wording_is_not_saved():
    eid = _event()["id"]
    client.post(f"/api/events/{eid}/invitation/wording", json={})
    assert client.get(f"/api/events/{eid}/invitation").json()["design"] is None


def test_invalid_tone_rejected():
    eid = _event()["id"]
    r = client.post(f"/api/events/{eid}/invitation/wording", json={"tone": "angry"})
    assert r.status_code == 422
