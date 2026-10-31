"""Caterer management module: calculations, validation, linking, booking,
budget integration (no double-counting) and real-discovery honesty.

OSM network calls are faked — no test touches the internet.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.caterer import CatererInput, CatererPatch
from app.models.guest import GuestCreate
from app.services import caterer_search, caterer_service, event_service
from app.services.event_service import InvalidProposal, NotFound, StalePlan

client = TestClient(app)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _event(birthday_event, owner=None, with_plan=True):
    ev = event_service.create_event(birthday_event, owner_id=owner)
    if with_plan:
        event_service.generate_initial_plan(ev.id, owner_id=owner)
    return ev


def _add(event_id, owner=None, **kw):
    data = {"name": "Annapoorna Caterers", "food_type": "veg",
            "price_per_guest_inr": 250, "price_source": "quoted"}
    data.update(kw)
    out = caterer_service.create(event_id, CatererInput.model_validate(data),
                                 owner)
    return out["record_id"], out["overview"]


def _rec(ov, rid):
    return next(r for r in ov["records"] if r["id"] == rid)


# --------------------------------------------------------------------------
# Calculations
# --------------------------------------------------------------------------
def test_total_is_guests_times_price(birthday_event):
    ev = _event(birthday_event)
    rid, ov = _add(ev.id, guest_count=200)
    r = _rec(ov, rid)
    assert r["total_paise"] == 200 * 250 * 100       # ₹50,000
    assert r["balance_paise"] == r["total_paise"]
    assert r["payment_status"] == "unpaid"


def test_extras_and_advance_balance(birthday_event):
    ev = _event(birthday_event)
    rid, ov = _add(ev.id, guest_count=200, extras_inr=5000,
                   advance_paid_inr=10000)
    r = _rec(ov, rid)
    assert r["total_paise"] == (200 * 250 + 5000) * 100
    assert r["balance_paise"] == (55000 - 10000) * 100
    assert r["payment_status"] == "partially_paid"


def test_follows_event_headcount_and_recalculates(birthday_event):
    """200 -> 250 confirmed guests recalculates the estimate live."""
    ev = _event(birthday_event)
    rid, ov = _add(ev.id)                       # guest_count None => follow
    r = _rec(ov, rid)
    assert r["guests_follow_event"] is True
    assert r["guests_used"] == ev.guest_count   # planned (50)

    guests = [GuestCreate(name=f"G{i}", rsvp="confirmed") for i in range(250)]
    event_service.save_guests(ev.id, guests, None)
    r = _rec(caterer_service.overview(ev.id, None), rid)
    assert r["guests_used"] == 250
    assert r["total_paise"] == 250 * 250 * 100  # ₹62,500


def test_fixed_package_overrides_per_guest(birthday_event):
    ev = _event(birthday_event)
    rid, ov = _add(ev.id, guest_count=200, fixed_total_inr=45000,
                   fixed_total_reason="Negotiated all-inclusive rate")
    r = _rec(ov, rid)
    assert r["is_fixed_price"] is True
    assert r["total_paise"] == 45000 * 100
    assert r["computed_total_paise"] == 50000 * 100


def test_paid_in_full_status(birthday_event):
    ev = _event(birthday_event)
    rid, ov = _add(ev.id, guest_count=100, advance_paid_inr=25000)
    assert _rec(ov, rid)["payment_status"] == "paid"


# --------------------------------------------------------------------------
# Validation rules
# --------------------------------------------------------------------------
def test_name_required():
    with pytest.raises(ValueError):
        CatererInput.model_validate({"name": "   "})


@pytest.mark.parametrize("field,value", [
    ("price_per_guest_inr", -1),
    ("advance_paid_inr", -5),
    ("extras_inr", -10),
    ("guest_count", 0),
])
def test_negative_or_invalid_amounts_rejected(field, value):
    with pytest.raises(ValueError):
        CatererInput.model_validate({"name": "X", field: value})


def test_advance_cannot_exceed_total(birthday_event):
    ev = _event(birthday_event)
    with pytest.raises(InvalidProposal):
        _add(ev.id, guest_count=10, price_per_guest_inr=100,
             advance_paid_inr=5000)


def test_advance_without_price_rejected(birthday_event):
    ev = _event(birthday_event)
    with pytest.raises(InvalidProposal):
        _add(ev.id, price_per_guest_inr=0, advance_paid_inr=100)


def test_fixed_price_requires_reason(birthday_event):
    ev = _event(birthday_event)
    with pytest.raises(InvalidProposal):
        _add(ev.id, fixed_total_inr=40000, fixed_total_reason="")


def test_min_greater_than_max_rejected(birthday_event):
    ev = _event(birthday_event)
    with pytest.raises(InvalidProposal):
        _add(ev.id, min_guests=300, max_guests=100)


def test_contact_is_optional(birthday_event):
    ev = _event(birthday_event)
    rid, ov = _add(ev.id, phone="", email="", website="")
    assert _rec(ov, rid)["source"] == "manual"


def test_patch_updates_and_clears_fixed_price(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, guest_count=200, fixed_total_inr=45000,
                  fixed_total_reason="deal")
    ov = caterer_service.update(
        ev.id, rid, CatererPatch.model_validate({"fixed_total_inr": None}), None)
    r = _rec(ov, rid)
    assert r["is_fixed_price"] is False
    assert r["total_paise"] == 50000 * 100


# --------------------------------------------------------------------------
# Comparison / requirements / best fit
# --------------------------------------------------------------------------
def test_best_fit_is_cheapest_that_meets_requirements(birthday_event):
    ev = _event(birthday_event)
    # Cheapest, but non-veg only — fails a veg requirement.
    cheap, _ = _add(ev.id, name="Cheap NonVeg", food_type="nonveg",
                    price_per_guest_inr=150, guest_count=200)
    # Cheap veg but needs 500 guests minimum — fails.
    minimum, _ = _add(ev.id, name="Big Only", price_per_guest_inr=180,
                      guest_count=200, min_guests=500)
    good, ov = _add(ev.id, name="Good Veg", price_per_guest_inr=250,
                    guest_count=200)
    assert ov["food_preference"] == "veg"
    assert ov["best_fit_id"] == good
    assert _rec(ov, cheap)["meets_requirements"] is False
    assert _rec(ov, minimum)["meets_requirements"] is False


def test_unpriced_option_never_best_fit(birthday_event):
    ev = _event(birthday_event)
    _, ov = _add(ev.id, name="Quote pending", price_per_guest_inr=0)
    assert ov["best_fit_id"] is None


def test_food_preference_changes_requirements(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, food_type="nonveg")
    ov = caterer_service.set_preference(ev.id, "nonveg", None)
    assert _rec(ov, rid)["meets_requirements"] is True
    with pytest.raises(InvalidProposal):
        caterer_service.set_preference(ev.id, "vegan", None)


# --------------------------------------------------------------------------
# Selection + linking (double-counting prevention)
# --------------------------------------------------------------------------
def test_only_one_selected(birthday_event):
    ev = _event(birthday_event)
    a, _ = _add(ev.id, name="A")
    b, _ = _add(ev.id, name="B")
    caterer_service.select(ev.id, a, True, None)
    ov = caterer_service.select(ev.id, b, True, None)
    assert ov["selected_id"] == b
    assert sum(1 for r in ov["records"] if r["selected"]) == 1


def test_cancelled_cannot_be_selected(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, booking_status="cancelled")
    with pytest.raises(InvalidProposal):
        caterer_service.select(ev.id, rid, True, None)


def test_link_search_result_to_manual_record(birthday_event):
    ev = _event(birthday_event)
    manual, _ = _add(ev.id, name="Uncle's caterer", guest_count=200,
                     advance_paid_inr=10000, booking_status="confirmed")
    found = CatererInput.model_validate({
        "name": "Sri Annapoorna Catering", "source": "osm",
        "provider_id": "cat-osm-abc", "phone": "+91 00000 00000",
        "address": "Main Road",
    })
    out = caterer_service.create(ev.id, found, None, link_to_id=manual)
    ov = out["overview"]
    assert out["linked"] is True
    assert len(ov["records"]) == 1                     # not duplicated
    r = _rec(ov, manual)
    assert r["provider_id"] == "cat-osm-abc"
    assert r["phone"] == "+91 00000 00000"             # filled in
    assert r["name"] == "Uncle's caterer"              # user data kept
    assert r["advance_paid_paise"] == 10000 * 100      # payments kept
    assert r["booking_status"] == "confirmed"


def test_same_provider_cannot_be_added_twice(birthday_event):
    ev = _event(birthday_event)
    _add(ev.id, source="osm", provider_id="cat-osm-1", name="X")
    with pytest.raises(InvalidProposal):
        _add(ev.id, source="osm", provider_id="cat-osm-1", name="X again")


def test_delete_record(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id)
    ov = caterer_service.delete(ev.id, rid, None)
    assert ov["records"] == []
    with pytest.raises(NotFound):
        caterer_service.delete(ev.id, rid, None)


# --------------------------------------------------------------------------
# Budget integration
# --------------------------------------------------------------------------
def _catering_expenses(event_id):
    active = event_service.get_active_plan(event_id, None)
    return [e for e in active["expenses"] if e["category"] == "catering"]


def test_budget_preview_before_after(birthday_event):
    ev = _event(birthday_event)                        # ₹30,000 budget
    rid, _ = _add(ev.id, guest_count=50, price_per_guest_inr=200)
    p = caterer_service.budget_preview(ev.id, rid, None)
    assert p["total_paise"] == 50 * 200 * 100
    assert p["after"]["catering_paise"] == 10000 * 100
    delta = p["after"]["catering_paise"] - p["before"]["catering_paise"]
    assert p["after"]["allocated_paise"] == p["before"]["allocated_paise"] + delta
    assert p["after"]["remaining_paise"] == (
        p["after"]["budget_paise"] - p["after"]["allocated_paise"])
    # Preview never writes.
    assert event_service.get_active_plan(ev.id, None)["version"] == 1


def test_apply_replaces_catering_never_double_counts(birthday_event):
    ev = _event(birthday_event)
    a, _ = _add(ev.id, name="A", guest_count=50, price_per_guest_inr=200)
    b, _ = _add(ev.id, name="B", guest_count=50, price_per_guest_inr=300)

    pa = caterer_service.budget_preview(ev.id, a, None)
    caterer_service.apply_budget(ev.id, a, pa["base_version"],
                                 pa["total_paise"], None)
    cats = _catering_expenses(ev.id)
    assert len(cats) == 1 and cats[0]["amount_paise"] == 10000 * 100

    # Switching caterer replaces, not adds.
    pb = caterer_service.budget_preview(ev.id, b, None)
    out = caterer_service.apply_budget(ev.id, b, pb["base_version"],
                                       pb["total_paise"], None)
    cats = _catering_expenses(ev.id)
    assert len(cats) == 1 and cats[0]["amount_paise"] == 15000 * 100
    assert out["plan_version"] == 3
    ov = out["overview"]
    assert ov["selected_id"] == b
    assert _rec(ov, b)["budget_sync"] == "in_sync"
    assert ov["budget"]["catering_paise"] == 15000 * 100
    # Arithmetic stayed consistent.
    active = event_service.get_active_plan(ev.id, None)
    assert active["budget"]["allocated_paise"] == sum(
        e["amount_paise"] for e in active["expenses"])


def test_apply_confirmed_booking_is_committed(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, guest_count=50, price_per_guest_inr=200,
                  booking_status="confirmed")
    p = caterer_service.budget_preview(ev.id, rid, None)
    caterer_service.apply_budget(ev.id, rid, p["base_version"],
                                 p["total_paise"], None)
    exp = _catering_expenses(ev.id)[0]
    assert exp["committed"] is True and exp["negotiable"] is False
    assert exp["source"] == "user_quote"
    assert "does not make bookings" in exp["assumptions"]


def test_guest_change_marks_budget_out_of_date(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, price_per_guest_inr=200)      # follows headcount
    p = caterer_service.budget_preview(ev.id, rid, None)
    caterer_service.apply_budget(ev.id, rid, p["base_version"],
                                 p["total_paise"], None)
    event_service.save_guests(
        ev.id, [GuestCreate(name=f"G{i}", rsvp="confirmed") for i in range(80)],
        None)
    r = _rec(caterer_service.overview(ev.id, None), rid)
    assert r["budget_sync"] == "out_of_date"


def test_apply_with_stale_plan_version_rejected(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, guest_count=50, price_per_guest_inr=200)
    p = caterer_service.budget_preview(ev.id, rid, None)
    caterer_service.apply_budget(ev.id, rid, p["base_version"],
                                 p["total_paise"], None)
    with pytest.raises(StalePlan):                     # version 1 is stale now
        caterer_service.apply_budget(ev.id, rid, p["base_version"],
                                     p["total_paise"], None)


def test_apply_with_changed_total_rejected(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, guest_count=50, price_per_guest_inr=200)
    p = caterer_service.budget_preview(ev.id, rid, None)
    caterer_service.update(ev.id, rid, CatererPatch(price_per_guest_inr=260),
                           None)
    with pytest.raises(StalePlan):
        caterer_service.apply_budget(ev.id, rid, p["base_version"],
                                     p["total_paise"], None)


def test_apply_requires_price_and_plan(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, price_per_guest_inr=0)
    with pytest.raises(InvalidProposal):
        caterer_service.budget_preview(ev.id, rid, None)
    ev2 = _event(birthday_event, with_plan=False)
    rid2, _ = _add(ev2.id)
    with pytest.raises(NotFound):
        caterer_service.budget_preview(ev2.id, rid2, None)


def test_delete_does_not_change_budget(birthday_event):
    ev = _event(birthday_event)
    rid, _ = _add(ev.id, guest_count=50, price_per_guest_inr=200)
    p = caterer_service.budget_preview(ev.id, rid, None)
    caterer_service.apply_budget(ev.id, rid, p["base_version"],
                                 p["total_paise"], None)
    caterer_service.delete(ev.id, rid, None)
    assert _catering_expenses(ev.id)[0]["amount_paise"] == 10000 * 100


# --------------------------------------------------------------------------
# Ownership + HTTP layer
# --------------------------------------------------------------------------
def test_ownership_enforced(birthday_event):
    ev = _event(birthday_event, owner="owner-a")
    with pytest.raises(event_service.Forbidden):
        caterer_service.overview(ev.id, "owner-b")
    with pytest.raises(event_service.Forbidden):
        caterer_service.create(
            ev.id, CatererInput.model_validate({"name": "X"}), "owner-b")


def test_http_flow(birthday_event):
    ev = _event(birthday_event)
    r = client.post(f"/api/events/{ev.id}/caterers", json={"record": {
        "name": "HTTP Caterer", "guest_count": 50, "price_per_guest_inr": 200,
        "price_source": "quoted"}})
    assert r.status_code == 201, r.text
    rid = r.json()["record_id"]

    bad = client.post(f"/api/events/{ev.id}/caterers",
                      json={"record": {"name": "", "price_per_guest_inr": 1}})
    assert bad.status_code == 422

    over = client.patch(f"/api/events/{ev.id}/caterers/{rid}",
                        json={"advance_paid_inr": 999999})
    assert over.status_code == 422

    prev = client.get(f"/api/events/{ev.id}/caterers/{rid}/budget-preview")
    assert prev.status_code == 200
    body = prev.json()
    ok = client.post(f"/api/events/{ev.id}/caterers/{rid}/apply-budget",
                     json={"base_version": body["base_version"],
                           "expected_total_paise": body["total_paise"]})
    assert ok.status_code == 200
    stale = client.post(f"/api/events/{ev.id}/caterers/{rid}/apply-budget",
                        json={"base_version": body["base_version"],
                              "expected_total_paise": body["total_paise"]})
    assert stale.status_code == 409


# --------------------------------------------------------------------------
# Real discovery (faked network) — honesty guarantees
# --------------------------------------------------------------------------
class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _reset_search_state(monkeypatch):
    caterer_search._GEOCODE_CACHE.clear()
    caterer_search._SEARCH_CACHE.clear()
    monkeypatch.setattr(caterer_search, "_overpass_down_until", 0.0)
    monkeypatch.setattr(caterer_search, "NOMINATIM_MIN_INTERVAL_S", 0.0)


@pytest.fixture
def fake_osm(monkeypatch):
    _reset_search_state(monkeypatch)

    def _get(url, **kw):
        return _Resp([{"lat": "9.9252", "lon": "78.1198",
                       "display_name": "Madurai, Tamil Nadu, India"}])

    elements = [
        {"type": "node", "id": 1, "lat": 9.93, "lon": 78.12,
         "tags": {"name": "Sri Meenakshi Caterers", "craft": "caterer",
                  "diet:vegetarian": "only", "phone": "+91 452 000 0000",
                  "cuisine": "indian;south_indian"}},
        {"type": "node", "id": 2, "lat": 9.95, "lon": 78.15,
         "tags": {"name": "Meat Feast Catering", "craft": "caterer",
                  "diet:vegetarian": "no"}},
        {"type": "way", "id": 3, "center": {"lat": 9.92, "lon": 78.11},
         "tags": {"name": "Temple View Restaurant", "amenity": "restaurant"}},
        {"type": "node", "id": 4, "lat": 9.94, "lon": 78.13,
         "tags": {"craft": "caterer"}},                  # unnamed: dropped
        {"type": "node", "id": 5, "lat": 11.0, "lon": 79.5,
         "tags": {"name": "Far Away Caterers", "craft": "caterer"}},
    ]

    def _post(url, **kw):
        return _Resp({"elements": elements})

    monkeypatch.setattr(caterer_search.httpx, "get", _get)
    monkeypatch.setattr(caterer_search.httpx, "post", _post)
    yield


def test_search_maps_real_fields_and_never_invents(fake_osm):
    out = caterer_search.search("Madurai", 25, "both", include_restaurants=True)
    assert out["status"] == "ok"
    names = [r["name"] for r in out["results"]]
    assert "Sri Meenakshi Caterers" in names
    assert "Far Away Caterers" not in names        # outside 25 km
    assert len(names) == 3                         # unnamed dropped
    first = out["results"][0]
    assert first["kind"] == "caterer"              # caterers before restaurants
    r = next(x for x in out["results"] if x["name"] == "Sri Meenakshi Caterers")
    assert r["diet"] == "pure_veg"
    assert r["cuisines"] == ["indian", "south indian"]
    assert r["distance_km"] is not None
    # No price or availability fields exist on search results at all.
    assert "price" not in r and "availability" not in r
    assert "OpenStreetMap" in out["attribution"]
    assert out["search_mode"] == "full" and out["notice"] == ""


def test_search_veg_filter_drops_explicit_non_veg(fake_osm):
    out = caterer_search.search("Madurai", 25, "veg")
    names = [r["name"] for r in out["results"]]
    assert "Meat Feast Catering" not in names
    assert "Temple View Restaurant" not in names   # restaurants opt-in only


# --- Fallback when every Overpass mirror is down -------------------------
_GEO = [{"lat": "9.9252", "lon": "78.1198",
         "display_name": "Madurai, Tamil Nadu, India"}]
_NOMINATIM_ITEMS = [
    {"osm_type": "node", "osm_id": 101, "lat": "9.93", "lon": "78.12",
     "category": "craft", "type": "caterer", "name": "Chettinad Catering Services",
     "extratags": {"phone": "+91 452 111 1111", "diet:vegetarian": "only"},
     "address": {"road": "West Masi Street", "city": "Madurai",
                 "postcode": "625001"}},
    {"osm_type": "way", "osm_id": 102, "lat": "9.94", "lon": "78.10",
     "category": "amenity", "type": "restaurant", "name": "Nanban Catering",
     "extratags": {}, "address": {}},
    {"osm_type": "way", "osm_id": 103, "lat": "9.92", "lon": "78.11",
     "category": "highway", "type": "residential", "name": "Catering Road",
     "extratags": {}, "address": {}},                       # not a business
    {"osm_type": "node", "osm_id": 104, "lat": "9.95", "lon": "78.14",
     "category": "amenity", "type": "restaurant", "name": "Temple View Restaurant",
     "extratags": {}, "address": {}},                       # restaurant, opt-in
    {"osm_type": "node", "osm_id": 105, "lat": "11.0", "lon": "79.5",
     "category": "craft", "type": "caterer", "name": "Far Away Caterers",
     "extratags": {}, "address": {}},                       # outside radius
]


def _fallback_get(calls):
    def _get(url, params=None, **kw):
        params = params or {}
        calls.append(params.get("q"))
        if params.get("bounded") == 1:          # fallback name search
            return _Resp(_NOMINATIM_ITEMS)
        return _Resp(_GEO)                      # geocode
    return _get


def _down(*a, **k):
    raise RuntimeError("overpass 502")


def test_fallback_finds_real_caterers_when_overpass_is_down(monkeypatch):
    _reset_search_state(monkeypatch)
    calls: list = []
    monkeypatch.setattr(caterer_search.httpx, "get", _fallback_get(calls))
    monkeypatch.setattr(caterer_search.httpx, "post", _down)

    out = caterer_search.search("Madurai", 25, "both")
    assert out["status"] == "ok"
    assert out["search_mode"] == "name_search"
    assert "may miss some caterers" in out["notice"]
    names = [r["name"] for r in out["results"]]
    # Real (fixture) businesses only; road, far-away and plain restaurant out.
    assert names == ["Chettinad Catering Services", "Nanban Catering"]
    r = out["results"][0]
    assert r["kind"] == "caterer" and r["diet"] == "pure_veg"
    assert r["phone"] == "+91 452 111 1111"
    assert r["address"] == "West Masi Street, Madurai, 625001"
    assert r["provider_id"] == caterer_search._stable_id("node", 101)
    assert r["osm_url"] == "https://www.openstreetmap.org/node/101"
    assert "price" not in r and "availability" not in r
    # Restaurants still require opt-in in fallback mode.
    caterer_search._SEARCH_CACHE.clear()
    with_rest = caterer_search.search("Madurai", 25, "both",
                                      include_restaurants=True)
    assert "Temple View Restaurant" in [x["name"] for x in with_rest["results"]]
    assert "restaurant" in calls


def test_fallback_and_overpass_both_down_is_unavailable(monkeypatch):
    _reset_search_state(monkeypatch)

    def _get(url, params=None, **kw):
        if (params or {}).get("bounded") == 1:
            raise RuntimeError("nominatim down")
        return _Resp(_GEO)

    monkeypatch.setattr(caterer_search.httpx, "get", _get)
    monkeypatch.setattr(caterer_search.httpx, "post", _down)
    out = caterer_search.search("Madurai", 25, "both")
    assert out["status"] == "unavailable" and out["results"] == []


def test_overpass_cooldown_skips_dead_mirrors(monkeypatch):
    _reset_search_state(monkeypatch)
    posts: list = []

    def _post(*a, **k):
        posts.append(1)
        raise RuntimeError("down")

    monkeypatch.setattr(caterer_search.httpx, "get", _fallback_get([]))
    monkeypatch.setattr(caterer_search.httpx, "post", _post)
    caterer_search.search("Madurai", 25, "both")
    tried = len(posts)
    assert tried == len(caterer_search.OVERPASS_URLS)
    caterer_search.search("Madurai", 50, "both")    # different cache key
    assert len(posts) == tried                      # cooled down: not retried


def test_slow_overpass_is_cut_off_by_budget(monkeypatch):
    import time as _time
    _reset_search_state(monkeypatch)
    monkeypatch.setattr(caterer_search, "OVERPASS_BUDGET_S", 0.4)
    monkeypatch.setattr(caterer_search, "OVERPASS_HEDGE_S", 0.1)

    def _slow(*a, **k):
        _time.sleep(1.5)
        raise RuntimeError("timeout")

    monkeypatch.setattr(caterer_search.httpx, "get", _fallback_get([]))
    monkeypatch.setattr(caterer_search.httpx, "post", _slow)
    t = _time.monotonic()
    out = caterer_search.search("Madurai", 25, "both")
    assert _time.monotonic() - t < 1.2               # didn't wait 3 x 1.5 s
    assert out["search_mode"] == "name_search" and out["results"]


def test_hedged_overpass_uses_first_good_mirror(monkeypatch):
    _reset_search_state(monkeypatch)
    monkeypatch.setattr(caterer_search, "OVERPASS_HEDGE_S", 0.05)
    good = {"elements": [{"type": "node", "id": 7, "lat": 9.93, "lon": 78.12,
                          "tags": {"name": "Mirror Two Caterers",
                                   "craft": "caterer"}}]}

    def _post(url, **k):
        if url == caterer_search.OVERPASS_URLS[0]:
            raise RuntimeError("502")
        return _Resp(good)

    monkeypatch.setattr(caterer_search.httpx, "get", _fallback_get([]))
    monkeypatch.setattr(caterer_search.httpx, "post", _post)
    out = caterer_search.search("Madurai", 25, "both")
    assert out["search_mode"] == "full"
    assert [r["name"] for r in out["results"]] == ["Mirror Two Caterers"]


def test_search_unavailable_returns_empty_not_fake(monkeypatch):
    _reset_search_state(monkeypatch)

    def _boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(caterer_search.httpx, "get", _boom)
    out = caterer_search.search("Madurai", 25, "both")
    assert out["status"] == "unavailable"
    assert out["results"] == []


def test_search_http_endpoint(fake_osm):
    r = client.get("/api/caterers/search",
                   params={"location": "Madurai", "radius_km": 10})
    assert r.status_code == 200
    pid = r.json()["results"][0]["provider_id"]
    d = client.get(f"/api/caterers/{pid}")
    assert d.status_code == 200
    assert client.get("/api/caterers/search",
                      params={"location": "X", "food": "vegan"}).status_code == 422
