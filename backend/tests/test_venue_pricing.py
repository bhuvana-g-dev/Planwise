"""Venue pricing: draft estimate bands, user quotes (override + persistence),
budget fit statuses, filtering, sorting, missing values and boundaries."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.core import venue_price_bands as bands
from app.core.venue_price_bands import ESTIMATE_LABEL, PriceBand
from app.main import app
from app.models.venue import (
    Venue,
    VenueQuery,
    VenueQuote,
    VenueQuoteInput,
    VenueSource,
    VenueType,
)
from app.services import event_service, venue_pricing, venue_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def _demo_mode(monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "venue_source", "demo")
    yield
    app.dependency_overrides.pop(get_current_owner, None)


def _v(vid="v1", vtype=VenueType.community_hall, price=None,
       source=VenueSource.osm, name="Hall"):
    return Venue(id=vid, name=name, venue_type=vtype, city="Madurai",
                 est_price_paise=price, source=source)


def _q(vid, inr, scope="rental_only", includes=None):
    return VenueQuote(venue_id=vid, amount_paise=int(inr * 100), scope=scope,
                      package_includes=includes or [],
                      updated_at=datetime.now(timezone.utc))


def _event_payload():
    return {"name": "Price Test", "event_type": "wedding",
            "event_date": (date.today() + timedelta(days=60)).isoformat(),
            "location": "Madurai, Tamil Nadu, India",
            "guest_count": 200, "budget_inr": 200000}


# --------------------------------------------------------------------------
# Resolution precedence + labels
# --------------------------------------------------------------------------
def test_estimate_used_for_unpriced_venue_and_labelled():
    p = venue_pricing.resolve(_v(), None, None)
    assert p.kind == "estimated"
    assert p.label == ESTIMATE_LABEL == "Estimated — confirm with venue"
    assert (p.min_paise, p.max_paise) == (3_500_00, 25_000_00)
    assert p.verified is False
    assert p.scope == "rental_only" and p.scope_label == "Venue rental only"


def test_quote_overrides_estimate():
    p = venue_pricing.resolve(_v(), _q("v1", 12000), None)
    assert p.kind == "quoted" and p.label == "Quoted"
    assert p.min_paise == p.max_paise == 12_000_00
    assert p.verified is True


def test_quote_overrides_listed_price():
    p = venue_pricing.resolve(_v(price=60_000_00, source=VenueSource.demo),
                              _q("v1", 45000), None)
    assert p.kind == "quoted" and p.min_paise == 45_000_00


def test_listed_demo_price_is_labelled_as_sample():
    p = venue_pricing.resolve(_v(price=60_000_00, source=VenueSource.demo),
                              None, None)
    assert p.kind == "listed"
    assert "demo" in p.label.lower()
    assert p.verified is False


def test_package_quote_states_scope_and_inclusions():
    p = venue_pricing.resolve(_v(), _q("v1", 150000, "package",
                                       ["catering", "decor"]), None)
    assert p.scope == "package" and p.scope_label == "Event package"
    assert p.package_includes == ["catering", "decor"]
    assert "catering" in p.note


@pytest.mark.parametrize("vtype", [VenueType.beach, VenueType.other])
def test_types_without_band_show_price_unavailable(vtype):
    p = venue_pricing.resolve(_v(vtype=vtype), None, 50_000_00)
    assert p.kind == "unavailable"
    assert p.label == "Price unavailable"
    assert p.min_paise is None and p.budget_status == "unknown"


def test_invalid_band_is_ignored_not_shown(monkeypatch):
    monkeypatch.setitem(bands.PRICE_BANDS, VenueType.community_hall,
                        PriceBand(50_000, 10_000))  # min > max: mis-edit
    assert venue_pricing.resolve(_v(), None, None).kind == "unavailable"


def test_zero_listed_price_falls_back_to_estimate():
    p = venue_pricing.resolve(_v(price=0, source=VenueSource.user), None, None)
    assert p.kind == "estimated"


def test_every_band_is_valid_and_ordered():
    for row in bands.bands_table():
        if row["min_inr"] is not None:
            assert 0 <= row["min_inr"] <= row["max_inr"]
            assert row["scope"] in ("rental_only", "package")


# --------------------------------------------------------------------------
# Budget status + boundaries (inclusive)
# --------------------------------------------------------------------------
@pytest.mark.parametrize("lo,hi,budget,expected", [
    (100, 200, 200, "within"),           # top of range == budget
    (100, 200, 250, "within"),
    (100, 200, 199, "possibly_within"),
    (100, 200, 100, "possibly_within"),  # bottom of range == budget
    (100, 200, 99, "outside"),
    (150, 150, 150, "within"),           # single price == budget
    (150, 150, 149, "outside"),
    (None, None, 100, "unknown"),        # no price
    (100, 200, None, "unknown"),         # no budget
])
def test_budget_status_boundaries(lo, hi, budget, expected):
    assert venue_pricing.budget_status(lo, hi, budget) == expected


def test_quote_exactly_at_budget_is_within():
    p = venue_pricing.resolve(_v(), _q("v1", 20000), 20_000_00)
    assert p.budget_status == "within"


# --------------------------------------------------------------------------
# Search filtering + sorting with resolved prices
# --------------------------------------------------------------------------
def _ids(page):
    return [v.id for v in page.results]


def _mix():
    return [
        _v("ch", VenueType.community_hall, name="Community"),   # 3.5k–25k
        _v("bh", VenueType.banquet_hall, name="Banquet"),       # 25k–2L
        _v("wh", VenueType.wedding_hall, name="Wedding"),       # 40k–5L
        _v("bc", VenueType.beach, name="Beach"),                # unavailable
    ]


def _search(extra, quotes=None, **q):
    # Search over only the given venues (no city -> demo catalogue is added;
    # restrict with a keyword that the demo set doesn't contain).
    q.setdefault("page_size", 50)
    return venue_service.search(VenueQuery(keyword="", **q), extra=extra,
                                quotes=quotes)


def test_budget_filter_hides_only_outside_by_default(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), max_price_inr=30000)
    ids = set(_ids(page))
    assert ids == {"ch", "bh", "bc"}        # wedding (40k+) is outside
    assert page.prices["ch"].budget_status == "within"
    assert page.prices["bh"].budget_status == "possibly_within"
    assert page.prices["bc"].budget_status == "unknown"


def test_budget_match_fits_excludes_unknown(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), max_price_inr=30000, budget_match="fits")
    assert set(_ids(page)) == {"ch", "bh"}


def test_budget_match_within_only(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), max_price_inr=30000, budget_match="within")
    assert _ids(page) == ["ch"]


def test_quote_changes_filter_result(monkeypatch):
    """A cheap real quote brings an estimate-'outside' venue back in."""
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    quotes = {"wh": _q("wh", 28000)}
    page = _search(_mix(), quotes=quotes, max_price_inr=30000,
                   budget_match="within")
    assert set(_ids(page)) == {"ch", "wh"}
    assert page.prices["wh"].kind == "quoted"


def test_min_price_window(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), min_price_inr=30000)
    # Community hall tops out at 25k -> below the window; unavailable kept.
    assert "ch" not in _ids(page)
    assert {"bh", "wh", "bc"} <= set(_ids(page))


def test_sort_price_ascending_unavailable_last(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), sort="price")
    assert _ids(page) == ["ch", "bh", "wh", "bc"]


def test_sort_price_descending_unavailable_last(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), sort="price_desc")
    assert _ids(page) == ["wh", "bh", "ch", "bc"]


def test_sort_price_uses_quote(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), quotes={"wh": _q("wh", 2000)}, sort="price")
    assert _ids(page)[0] == "wh"


def test_sort_by_budget_fit(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix(), max_price_inr=30000, sort="fit",
                   budget_match="fits_or_unknown")
    assert _ids(page) == ["ch", "bh", "bc"]   # within, possibly, unknown


def test_no_budget_leaves_status_unknown(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    page = _search(_mix())
    assert all(p.budget_status == "unknown" for p in page.prices.values())
    assert len(page.results) == 4


def test_existing_demo_price_sort_still_works():
    page = venue_service.search(VenueQuery(sort="price", page_size=50))
    lows = [page.prices[v.id].min_paise for v in page.results
            if page.prices[v.id].min_paise is not None]
    assert lows == sorted(lows)


# --------------------------------------------------------------------------
# Quote persistence + validation + ownership (service and HTTP)
# --------------------------------------------------------------------------
def test_quote_persists_updates_and_deletes():
    ev = event_service.create_event(
        __import__("app.models.event", fromlist=["EventCreate"])
        .EventCreate.model_validate(_event_payload()), owner_id=None)
    event_service.save_venue_quote(
        ev.id, "venue-osm-1", VenueQuoteInput(amount_inr=18000,
                                               venue_name="Hall A"), None)
    stored = event_service.list_venue_quotes(ev.id, None)
    assert stored["venue-osm-1"]["amount_paise"] == 18_000_00
    assert stored["venue-osm-1"]["venue_name"] == "Hall A"

    event_service.save_venue_quote(
        ev.id, "venue-osm-1", VenueQuoteInput(amount_inr=16000), None)
    assert event_service.list_venue_quotes(ev.id, None)[
        "venue-osm-1"]["amount_paise"] == 16_000_00  # replaced, not duplicated

    event_service.delete_venue_quote(ev.id, "venue-osm-1", None)
    assert event_service.list_venue_quotes(ev.id, None) == {}
    with pytest.raises(event_service.NotFound):
        event_service.delete_venue_quote(ev.id, "venue-osm-1", None)


def test_quote_input_validation():
    with pytest.raises(ValueError):
        VenueQuoteInput(amount_inr=0)
    with pytest.raises(ValueError):
        VenueQuoteInput(amount_inr=-5)
    with pytest.raises(ValueError):
        VenueQuoteInput(amount_inr=1000, scope="everything")


def test_rental_only_cannot_list_inclusions():
    ev = client.post("/api/events", json=_event_payload()).json()
    r = client.put(f"/api/events/{ev['id']}/venues/v-x/quote",
                   json={"amount_inr": 9000, "scope": "rental_only",
                         "package_includes": ["catering"]})
    assert r.status_code == 422


def test_http_quote_flow_and_search_override():
    ev = client.post("/api/events", json=_event_payload()).json()
    demo = client.post("/api/venues/search",
                       json={"city": "Madurai", "page_size": 50}).json()
    target = demo["results"][0]
    vid = target["id"]

    r = client.put(f"/api/events/{ev['id']}/venues/{vid}/quote",
                   json={"amount_inr": 1234, "scope": "package",
                         "package_includes": ["catering"],
                         "venue_name": target["name"]})
    assert r.status_code == 200
    assert r.json()[vid]["scope"] == "package"

    page = client.post(f"/api/events/{ev['id']}/venues/search",
                       json={"city": "Madurai", "page_size": 50}).json()
    assert page["prices"][vid]["kind"] == "quoted"
    assert page["prices"][vid]["min_paise"] == 1234_00
    # Public search (no event) does not see the event's quote.
    pub = client.post("/api/venues/search",
                      json={"city": "Madurai", "page_size": 50}).json()
    assert pub["prices"][vid]["kind"] != "quoted"

    assert client.get(f"/api/events/{ev['id']}/venues/quotes").json()[vid]
    assert client.delete(
        f"/api/events/{ev['id']}/venues/{vid}/quote").status_code == 200


def test_selected_venue_uses_quote():
    ev = client.post("/api/events", json=_event_payload()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    venue = client.post("/api/venues/search",
                        json={"city": "Madurai"}).json()["results"][0]
    client.post(f"/api/events/{ev['id']}/venues/shortlist",
                json={"venue": venue})
    client.put(f"/api/events/{ev['id']}/venues/{venue['id']}/quote",
               json={"amount_inr": 1000})
    sel = client.post(f"/api/events/{ev['id']}/venues/select",
                      json={"venue_id": venue["id"]}).json()
    assert sel["est_price_paise"] == 1000_00
    assert sel["price"]["kind"] == "quoted"
    assert sel["within_budget"] is True


def test_quote_ownership_enforced():
    app.dependency_overrides[get_current_owner] = lambda: "userA"
    ev = client.post("/api/events", json=_event_payload()).json()
    app.dependency_overrides[get_current_owner] = lambda: "userB"
    assert client.put(f"/api/events/{ev['id']}/venues/v/quote",
                      json={"amount_inr": 100}).status_code == 403
    assert client.get(
        f"/api/events/{ev['id']}/venues/quotes").status_code == 403
    assert client.post(f"/api/events/{ev['id']}/venues/search",
                       json={}).status_code == 403


def test_price_bands_endpoint_marks_draft():
    r = client.get("/api/venues/price-bands")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "draft"
    assert "not verified" in body["note"].lower()
    assert body["estimate_label"] == "Estimated — confirm with venue"
    types = {b["venue_type"] for b in body["bands"]}
    assert types == {t.value for t in VenueType}


def test_recommend_no_longer_treats_unpriced_as_within(monkeypatch):
    monkeypatch.setattr(venue_service, "_demo_catalogue", lambda: [])
    venues = [_v("cheap", VenueType.community_hall, name="Cheap"),
              _v("pricey", VenueType.wedding_hall, name="Pricey"),
              _v("nope", VenueType.beach, name="Unknown")]
    monkeypatch.setattr(venue_service, "_ai_reasoning",
                        lambda *a, **k: {"generated_by": "deterministic",
                                         "text": "t"})
    out = venue_service.recommend("wedding", "", 100, 30_000_00, "any", [],
                                  extra=venues)
    names = [r["name"] for r in out["recommendations"]]
    assert names[0] == "Cheap"                    # within budget first
    assert names.index("Unknown") < names.index("Pricey")  # unknown > outside
    assert out["prices"]["pricey"]["budget_status"] == "outside"
