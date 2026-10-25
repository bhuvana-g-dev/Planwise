"""Guest management: RSVP rollups, persistence, ownership, catering sync."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.main import app
from app.models.guest import Guest, RsvpStatus
from app.services import guest_service

client = TestClient(app)


def _event_payload(**ov):
    base = {
        "name": "Guests Birthday",
        "event_type": "birthday",
        "event_date": (date.today() + timedelta(days=30)).isoformat(),
        "location": "Madurai",
        "guest_count": 50,
        "budget_inr": 30000,
    }
    base.update(ov)
    return base


def teardown_function():
    app.dependency_overrides.pop(get_current_owner, None)


# --- deterministic summary unit test ---
def test_guest_summary_counts_heads_and_plus_ones():
    guests = [
        Guest(id="1", name="A", group="family", rsvp=RsvpStatus.confirmed,
              plus_ones=2, dietary=["veg"]),
        Guest(id="2", name="B", group="friends", rsvp=RsvpStatus.tentative,
              plus_ones=1),
        Guest(id="3", name="C", group="family", rsvp=RsvpStatus.declined),
        Guest(id="4", name="D", group="friends", rsvp=RsvpStatus.confirmed,
              dietary=["veg", "nut-allergy"]),
    ]
    s = guest_service.summarize(guests)
    # confirmed heads: A(3) + D(1) = 4
    assert s.confirmed_headcount == 4
    # attending (confirmed+tentative): A(3)+D(1)+B(2) = 6
    assert s.total_headcount == 6
    assert s.total_guests == 4
    assert s.by_group["family"] == 4  # A(3) + C(1)
    assert s.dietary_counts["veg"] == 4  # A(3) + D(1)
    assert s.dietary_counts["nut-allergy"] == 1


# --- API: save + reload persists ---
def test_save_and_reload_guests_persists():
    ev = client.post("/api/events", json=_event_payload()).json()
    body = {
        "guests": [
            {"name": "Priya", "group": "family", "rsvp": "confirmed",
             "plus_ones": 1, "dietary": ["veg"]},
            {"name": "Arjun", "group": "friends", "rsvp": "invited"},
        ]
    }
    r = client.put(f"/api/events/{ev['id']}/guests", json=body)
    assert r.status_code == 200
    out = r.json()
    assert len(out["guests"]) == 2
    assert all(g["id"] for g in out["guests"])  # ids assigned
    assert out["summary"]["confirmed_headcount"] == 2  # Priya + 1

    # reload via event detail
    detail = client.get(f"/api/events/{ev['id']}").json()
    assert len(detail["guests"]) == 2
    assert detail["guest_summary"]["total_guests"] == 2


# --- API: invalid guest rejected ---
def test_invalid_guest_rejected():
    ev = client.post("/api/events", json=_event_payload()).json()
    r = client.put(f"/api/events/{ev['id']}/guests",
                   json={"guests": [{"name": "", "rsvp": "confirmed"}]})
    assert r.status_code == 422


# --- ownership enforced on guests ---
def test_guest_ownership_enforced():
    app.dependency_overrides[get_current_owner] = lambda: "userA"
    ev = client.post("/api/events", json=_event_payload()).json()
    client.put(f"/api/events/{ev['id']}/guests",
               json={"guests": [{"name": "Priya"}]})

    app.dependency_overrides[get_current_owner] = lambda: "userB"
    assert client.get(f"/api/events/{ev['id']}/guests").status_code == 403
    assert client.put(f"/api/events/{ev['id']}/guests",
                      json={"guests": [{"name": "Hacker"}]}).status_code == 403
