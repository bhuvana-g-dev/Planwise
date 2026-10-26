"""Venue discovery: model, search/filter/sort/paginate, persistence, selection, AI."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.main import app
from app.models.venue import Venue, VenueCreate, VenueQuery, VenueType
from app.services import venue_service

client = TestClient(app)


def _event(**ov):
    base = {
        "name": "Venue Wedding",
        "event_type": "wedding",
        "event_date": (date.today() + timedelta(days=60)).isoformat(),
        "location": "Madurai, Tamil Nadu, India",
        "guest_count": 200,
        "budget_inr": 200000,
    }
    base.update(ov)
    return base


def teardown_function():
    app.dependency_overrides.pop(get_current_owner, None)


# --- model validation ---
def test_venue_model_rejects_bad_coords():
    with pytest.raises(Exception):
        Venue(id="v", name="X", lat=200)  # lat out of range


def test_venue_create_defaults():
    vc = VenueCreate(name="My Hall")
    v = venue_service.venue_from_create(vc)
    assert v.source.value == "user"
    assert v.id.startswith("venue-user-")


# --- search / filter / sort / paginate ---
def test_search_returns_demo_with_disclaimer():
    page = venue_service.search(VenueQuery())
    assert page.total > 0
    assert page.source_mode == "demo"
    assert "not verified" in page.disclaimer.lower()
    assert all(v.source.value == "demo" for v in page.results)


def test_filter_by_type_and_capacity():
    page = venue_service.search(VenueQuery(
        venue_type=VenueType.outdoor_garden, min_capacity=300))
    assert all(v.venue_type == VenueType.outdoor_garden for v in page.results)
    assert all(v.capacity >= 300 for v in page.results)


def test_filter_by_keyword_and_city():
    page = venue_service.search(VenueQuery(keyword="garden", city="Madurai"))
    assert all("madurai" in v.city.lower() for v in page.results)
    assert all("garden" in (v.name + " " + " ".join(v.amenities)).lower()
               for v in page.results)


def test_filter_max_price():
    page = venue_service.search(VenueQuery(max_price_inr=20000))
    assert all(v.est_price_paise is None or v.est_price_paise <= 2000000
               for v in page.results)


def test_sort_by_price_ascending():
    page = venue_service.search(VenueQuery(sort="price", page_size=50))
    prices = [v.est_price_paise or 0 for v in page.results]
    assert prices == sorted(prices)


def test_sort_by_capacity_descending():
    page = venue_service.search(VenueQuery(sort="capacity", page_size=50))
    caps = [v.capacity for v in page.results]
    assert caps == sorted(caps, reverse=True)


def test_pagination():
    p1 = venue_service.search(VenueQuery(page=1, page_size=3))
    p2 = venue_service.search(VenueQuery(page=2, page_size=3))
    assert len(p1.results) == 3
    assert p1.results[0].id != p2.results[0].id
    assert p1.total_pages >= 2


# --- API: search is public ---
def test_api_search_public():
    r = client.post("/api/venues/search", json={"sort": "price"})
    assert r.status_code == 200
    assert r.json()["total"] > 0


# --- shortlist + selection persistence + ownership ---
def test_shortlist_select_and_budget_comparison():
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")  # creates venue allocation

    # shortlist a demo venue
    demo = client.post("/api/venues/search", json={"city": "Madurai"}).json()
    venue = demo["results"][0]
    r = client.post(f"/api/events/{ev['id']}/venues/shortlist",
                    json={"venue": venue})
    assert r.status_code == 200
    assert any(v["id"] == venue["id"] for v in r.json())

    # select it -> budget comparison present
    sel = client.post(f"/api/events/{ev['id']}/venues/select",
                      json={"venue_id": venue["id"]})
    assert sel.status_code == 200
    body = sel.json()
    assert body["venue"]["id"] == venue["id"]
    assert body["venue_budget_paise"] is not None  # from plan allocation

    # persists on event detail
    detail = client.get(f"/api/events/{ev['id']}").json()
    assert detail["selected_venue"]["id"] == venue["id"]
    assert len(detail["venue_shortlist"]) >= 1


def test_manual_venue_entry():
    ev = client.post("/api/events", json=_event()).json()
    r = client.post(f"/api/events/{ev['id']}/venues/manual", json={
        "name": "Uncle's Farmhouse", "venue_type": "outdoor_garden",
        "city": "Madurai", "est_price_inr": 20000, "capacity": 150,
    })
    assert r.status_code == 200
    assert any(v["source"] == "user" for v in r.json())


def test_venue_ownership_enforced():
    app.dependency_overrides[get_current_owner] = lambda: "userA"
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")

    app.dependency_overrides[get_current_owner] = lambda: "userB"
    assert client.get(
        f"/api/events/{ev['id']}/venues/shortlist").status_code == 403
    assert client.post(f"/api/events/{ev['id']}/venues/select",
                       json={"venue_id": "venue-demo-1"}).status_code == 403


def test_select_unknown_venue_404():
    ev = client.post("/api/events", json=_event()).json()
    r = client.post(f"/api/events/{ev['id']}/venues/select",
                    json={"venue_id": "does-not-exist"})
    assert r.status_code == 404


# --- AI recommendation fallback ---
def test_recommend_fallback_without_gemini(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "gemini_api_key", "")
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    r = client.post(f"/api/events/{ev['id']}/venues/recommend",
                    json={"indoor_pref": "outdoor",
                          "required_amenities": ["parking"]})
    assert r.status_code == 200
    body = r.json()
    assert body["generated_by"] == "deterministic"
    assert len(body["recommendations"]) > 0
    assert "not verified" in body["disclaimer"].lower()
