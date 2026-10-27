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


@pytest.fixture(autouse=True)
def _demo_mode(monkeypatch):
    """Keep existing search/filter/sort tests deterministic and offline by
    forcing the demo catalogue. OSM behaviour is covered separately with the
    network mocked."""
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "venue_source", "demo")
    yield


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


def test_recommend_respects_indoor_pref_and_amenities():
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    r = client.post(f"/api/events/{ev['id']}/venues/recommend",
                    json={"indoor_pref": "outdoor",
                          "required_amenities": ["parking"]})
    assert r.status_code == 200
    recs = r.json()["recommendations"]
    assert recs, "should return at least one suggestion"
    # Top suggestion should prefer an outdoor venue with the required amenity.
    top = recs[0]
    assert top["outdoor"] is True
    assert "parking" in [a.lower() for a in top["amenities"]]


# --- P1 regression: selected venue restored after "reload" ---
def test_selected_venue_restored_on_reload():
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    venue = client.post("/api/venues/search",
                        json={"city": "Madurai"}).json()["results"][0]
    client.post(f"/api/events/{ev['id']}/venues/shortlist",
                json={"venue": venue})
    client.post(f"/api/events/{ev['id']}/venues/select",
                json={"venue_id": venue["id"]})

    # Simulate a page reload: a brand-new GET of the event detail must still
    # carry the selection + shortlist (this is what the frontend restores from).
    detail = client.get(f"/api/events/{ev['id']}").json()
    assert detail["selected_venue"] is not None
    assert detail["selected_venue"]["id"] == venue["id"]
    assert any(v["id"] == venue["id"] for v in detail["venue_shortlist"])

    # And re-selecting by id (what the UI does to refresh the budget compare)
    # returns the authoritative comparison again.
    again = client.post(f"/api/events/{ev['id']}/venues/select",
                        json={"venue_id": venue["id"]})
    assert again.status_code == 200
    assert again.json()["venue_budget_paise"] is not None


# --- P5: max_capacity + amenity filters ---
def test_filter_max_capacity():
    page = venue_service.search(VenueQuery(max_capacity=200, page_size=50))
    # demo venues with a known capacity must all be <= 200; unknown (0) allowed
    assert all(v.capacity == 0 or v.capacity <= 200 for v in page.results)
    # a 600-capacity demo venue must be excluded
    assert all(v.capacity != 600 for v in page.results)


def test_filter_min_and_max_capacity_window():
    page = venue_service.search(
        VenueQuery(min_capacity=200, max_capacity=400, page_size=50))
    for v in page.results:
        if v.capacity:
            assert 200 <= v.capacity <= 400


def test_filter_by_amenity_subset():
    page = venue_service.search(VenueQuery(amenities=["ac"], page_size=50))
    assert page.results
    assert all("ac" in [a.lower() for a in v.amenities] for v in page.results)


# --------------------------------------------------------------------------
# OpenStreetMap (real data) — network mocked, deterministic
# --------------------------------------------------------------------------
_FAKE_OVERPASS = {
    "elements": [
        {"type": "node", "id": 1, "lat": 9.93, "lon": 78.12,
         "tags": {"name": "Meenakshi Banquet Hall", "amenity": "events_venue",
                  "addr:city": "Madurai", "contact:phone": "+91-000"}},
        {"type": "way", "id": 2, "center": {"lat": 9.94, "lon": 78.13},
         "tags": {"name": "City Community Centre",
                  "amenity": "community_centre", "wheelchair": "yes"}},
        {"type": "node", "id": 3, "lat": 9.95, "lon": 78.14,
         "tags": {"tourism": "hotel", "name": "Grand Hotel",
                  "internet_access": "wlan"}},
        {"type": "node", "id": 4, "lat": 9.96, "lon": 78.15,
         "tags": {"amenity": "events_venue"}},  # no name -> skipped
    ]
}


def _patch_osm(monkeypatch, elements=None, fail=False):
    import app.services.osm_venues as osm
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "venue_source", "osm")
    # clear cache between tests
    import app.services.venue_service as vs
    vs._OSM_CACHE.clear()

    if fail:
        def _boom(city):
            raise osm.OsmUnavailable("mocked outage")
        monkeypatch.setattr(vs, "_osm_for_city", _boom)
        return

    monkeypatch.setattr(osm, "_geocode_city",
                        lambda city: (9.9, 78.1, 10.0, 78.2))

    class _Resp:
        def raise_for_status(self): ...
        def json(self): return elements or _FAKE_OVERPASS

    monkeypatch.setattr(osm.httpx, "post", lambda *a, **k: _Resp())


def test_osm_search_returns_real_mapped_venues(monkeypatch):
    _patch_osm(monkeypatch)
    page = venue_service.search(VenueQuery(city="Madurai", page_size=50))
    assert page.source_mode == "osm"
    assert "openstreetmap" in page.disclaimer.lower()
    names = {v.name for v in page.results}
    assert "Meenakshi Banquet Hall" in names
    assert "Grand Hotel" in names
    # Unnamed element skipped.
    assert len(page.results) == 3
    # OSM venues carry no invented price/capacity.
    for v in page.results:
        assert v.source.value == "osm"
        assert v.est_price_paise is None
        assert v.capacity == 0


def test_osm_classification_and_amenities(monkeypatch):
    _patch_osm(monkeypatch)
    page = venue_service.search(VenueQuery(city="Madurai", page_size=50))
    by_name = {v.name: v for v in page.results}
    assert by_name["City Community Centre"].venue_type == VenueType.community_hall
    assert "wheelchair" in by_name["City Community Centre"].amenities
    assert by_name["Grand Hotel"].venue_type == VenueType.hotel
    assert "wifi" in by_name["Grand Hotel"].amenities


def test_osm_unavailable_falls_back_to_demo(monkeypatch):
    _patch_osm(monkeypatch, fail=True)
    page = venue_service.search(VenueQuery(city="Madurai", page_size=50))
    assert page.source_mode == "demo_fallback"
    assert all(v.source.value == "demo" for v in page.results)
    assert "unavailable" in page.disclaimer.lower()


def test_osm_no_city_shows_demo_prompt(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "venue_source", "osm")
    page = venue_service.search(VenueQuery(page_size=50))  # no city
    assert page.source_mode == "demo"
    assert "enter a city" in page.disclaimer.lower()


def test_osm_venue_selectable_after_search(monkeypatch):
    _patch_osm(monkeypatch)
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    # populate the OSM cache via a search
    page = venue_service.search(VenueQuery(city="Madurai"))
    osm_venue = next(v for v in page.results if v.source.value == "osm")
    # shortlist then select the real OSM venue
    client.post(f"/api/events/{ev['id']}/venues/shortlist",
                json={"venue": osm_venue.model_dump(mode="json")})
    sel = client.post(f"/api/events/{ev['id']}/venues/select",
                      json={"venue_id": osm_venue.id})
    assert sel.status_code == 200
    assert sel.json()["venue"]["source"] == "osm"
    # OSM venue has no price -> budget comparison fields are None
    assert sel.json()["est_price_paise"] is None
