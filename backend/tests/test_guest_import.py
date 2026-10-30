"""Bulk contact import: phone normalisation, server-side dedupe, persistence,
field preservation, ownership and error handling."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.main import app
from app.services import phone

client = TestClient(app)


def teardown_function():
    app.dependency_overrides.pop(get_current_owner, None)


def _event():
    return client.post("/api/events", json={
        "name": "Import Test", "event_type": "birthday",
        "event_date": (date.today() + timedelta(days=30)).isoformat(),
        "location": "Madurai", "guest_count": 50, "budget_inr": 30000,
    }).json()


def _import(eid, contacts, **extra):
    return client.post(f"/api/events/{eid}/guests/import",
                       json={"contacts": contacts, **extra})


# --------------------------------------------------------------------------
# Phone normalisation
# --------------------------------------------------------------------------
@pytest.mark.parametrize("raw,expected", [
    ("9876543210", "+919876543210"),
    ("98765 43210", "+919876543210"),
    ("098765-43210", "+919876543210"),          # trunk 0
    ("919876543210", "+919876543210"),          # 91 without +
    ("+91 98765 43210", "+919876543210"),
    ("0091 9876543210", "+919876543210"),       # 00 international prefix
    ("(+91) 98765-43210", "+919876543210"),
    ("0452 2345678", "+914522345678"),          # landline with STD code
    ("+1 415 555 2671", "+14155552671"),        # US kept, not turned +91
    ("+44 20 7946 0958", "+442079460958"),      # UK kept
    ("+971 50 123 4567", "+971501234567"),      # UAE kept
])
def test_valid_numbers_normalise(raw, expected):
    r = phone.normalize(raw)
    assert r.valid, r.reason
    assert r.e164 == expected


@pytest.mark.parametrize("raw", [
    "", "   ", "12345", "2345678",          # too short / local landline
    "5876543210",                           # 10 digits not starting 6-9
    "+91 98765 4321",                       # +91 with 9 digits
    "+91 0876543210",                       # national part starts 0
    "+1234567",                             # international too short
    "98765abc10", "9876543210123",          # letters / too long
])
def test_invalid_numbers_rejected_with_reason(raw):
    r = phone.normalize(raw)
    assert not r.valid and r.e164 is None
    assert r.reason


def test_mobile_flag():
    assert phone.normalize("9876543210").is_mobile is True
    assert phone.normalize("0452 2345678").is_mobile is False


def test_best_of_prefers_valid_mobile_in_multi_number_cell():
    r = phone.best_of("0452 2345678 / 98765 43210")
    assert r.e164 == "+919876543210"
    r2 = phone.best_of("12345, +1 415 555 2671")
    assert r2.e164 == "+14155552671"


def test_extension_dropped():
    assert phone.normalize("+91 98765 43210 x22").e164 == "+919876543210"


# --------------------------------------------------------------------------
# Import endpoint
# --------------------------------------------------------------------------
def test_import_adds_contacts_with_normalised_phones():
    ev = _event()
    r = _import(ev["id"], [
        {"name": "Priya Sharma", "phone": "98765 43210"},
        {"name": "Uncle (UK)", "phone": "+44 20 7946 0958"},
    ], group="Family", source="vcf")
    assert r.status_code == 200
    body = r.json()
    assert body["added"] == 2 and body["skipped"] == []
    by = {g["name"]: g for g in body["guests"]}
    assert by["Priya Sharma"]["contact"] == "+919876543210"
    assert by["Uncle (UK)"]["contact"] == "+442079460958"
    assert by["Priya Sharma"]["group"] == "Family"
    assert by["Priya Sharma"]["rsvp"] == "invited"
    assert body["summary"]["total_guests"] == 2


def test_import_preserves_existing_guests_and_fields():
    ev = _event()
    client.put(f"/api/events/{ev['id']}/guests", json={"guests": [{
        "name": "Arjun", "group": "friends", "rsvp": "confirmed",
        "plus_ones": 2, "dietary": ["veg"], "contact": "+91 91234 56789",
        "notes": "best friend"}]})
    body = _import(ev["id"], [{"name": "Meena", "phone": "9000000001"}]).json()
    arjun = next(g for g in body["guests"] if g["name"] == "Arjun")
    assert arjun["rsvp"] == "confirmed" and arjun["plus_ones"] == 2
    assert arjun["dietary"] == ["veg"] and arjun["notes"] == "best friend"
    assert arjun["contact"] == "+91 91234 56789"     # existing data untouched
    # Persisted: reload shows both.
    names = {g["name"] for g in
             client.get(f"/api/events/{ev['id']}/guests").json()["guests"]}
    assert names == {"Arjun", "Meena"}


def test_import_skips_duplicate_against_existing_phone_any_format():
    ev = _event()
    client.put(f"/api/events/{ev['id']}/guests", json={"guests": [
        {"name": "Arjun", "contact": "+91 91234-56789"}]})
    body = _import(ev["id"], [
        {"name": "Arjun K", "phone": "091234 56789"},     # same number
    ]).json()
    assert body["added"] == 0
    assert body["skipped"][0]["reason"] == "Already a guest (same phone)"


def test_import_skips_duplicates_within_batch():
    ev = _event()
    body = _import(ev["id"], [
        {"name": "Ravi", "phone": "9876543210"},
        {"name": "Ravi Kumar", "phone": "+919876543210"},  # same phone
        {"name": "Lakshmi", "phone": ""},
        {"name": "  lakshmi ", "phone": ""},               # same name, no phone
    ]).json()
    assert body["added"] == 2
    assert [s["reason"] for s in body["skipped"]] == [
        "Duplicate in this import", "Duplicate in this import"]


def test_import_name_only_duplicate_of_existing_skipped():
    ev = _event()
    client.put(f"/api/events/{ev['id']}/guests",
               json={"guests": [{"name": "Kavya"}]})
    body = _import(ev["id"], [{"name": "KAVYA", "phone": ""}]).json()
    assert body["added"] == 0
    assert body["skipped"][0]["reason"] == "Already a guest (same name)"


def test_repeat_import_is_idempotent():
    ev = _event()
    contacts = [{"name": "A", "phone": "9876500001"},
                {"name": "B", "phone": "9876500002"}]
    assert _import(ev["id"], contacts).json()["added"] == 2
    again = _import(ev["id"], contacts).json()
    assert again["added"] == 0 and len(again["skipped"]) == 2
    assert len(again["guests"]) == 2


def test_invalid_phone_kept_out_of_contact_and_noted():
    ev = _event()
    body = _import(ev["id"], [{"name": "Old Landline", "phone": "2345678"}]).json()
    g = body["guests"][0]
    assert g["contact"] == ""
    assert "2345678" in g["notes"] and "could not be verified" in g["notes"]


def test_missing_name_skipped():
    ev = _event()
    body = _import(ev["id"], [{"name": "  ", "phone": "9876543210"},
                              {"name": "Real", "phone": "9876543211"}]).json()
    assert body["added"] == 1
    assert body["skipped"][0]["reason"] == "Missing name"


def test_import_rejects_empty_and_oversized_requests():
    ev = _event()
    assert _import(ev["id"], []).status_code == 422
    too_many = [{"name": f"G{i}", "phone": ""} for i in range(2001)]
    assert _import(ev["id"], too_many).status_code == 422


def test_import_unknown_event_404():
    r = _import("evt-missing", [{"name": "A", "phone": ""}])
    assert r.status_code == 404


def test_import_ownership_enforced():
    app.dependency_overrides[get_current_owner] = lambda: "userA"
    ev = _event()
    app.dependency_overrides[get_current_owner] = lambda: "userB"
    r = _import(ev["id"], [{"name": "Intruder", "phone": "9876543210"}])
    assert r.status_code == 403
