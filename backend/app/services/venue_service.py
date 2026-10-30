"""Venue discovery: demo catalogue, search/filter/sort/paginate, AI assist.

No external venue API is configured, so the catalogue is clearly-labelled DEMO
data for local development (source="demo"). When a provider is configured in
future, swap `_demo_catalogue()` for the provider call; the API shape is stable.

Coordinates in demo data are approximate city centres used only to demonstrate
the map; they are NOT real venue addresses and are labelled as demo.
"""
from __future__ import annotations

import time
import uuid

from app.core.config import get_settings
from app.core.money import rupees_to_paise
from app.models.venue import (
    Venue,
    VenuePage,
    VenuePrice,
    VenueQuery,
    VenueQuote,
    VenueSource,
    VenueType,
)
from app.services import venue_pricing

DEMO_DISCLAIMER = (
    "Demo venues for illustration only — not verified real businesses. "
    "Prices and coordinates are approximate samples. Verify everything "
    "directly with the venue."
)

# Simple time-based cache of OSM results per city (avoids hammering Overpass
# on pagination / repeated searches). key -> (expires_at, venues).
_OSM_CACHE: dict[str, tuple[float, list[Venue]]] = {}
_OSM_TTL_SECONDS = 600.0

# Approximate city-centre coordinates (public knowledge) used only to place
# demo markers. Not real venue addresses.
_CITY_COORDS = {
    "madurai": (9.9252, 78.1198),
    "chennai": (13.0827, 80.2707),
    "coimbatore": (11.0168, 76.9558),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
}


def _demo_catalogue() -> list[Venue]:
    """Illustrative sample venues. source=demo everywhere."""
    base = [
        ("Riverside Banquet", VenueType.banquet_hall, "Madurai", 250, 60000,
         True, False, ["parking", "ac", "catering", "stage"]),
        ("Green Lawns Garden", VenueType.outdoor_garden, "Madurai", 400, 45000,
         False, True, ["parking", "open-air", "lighting"]),
        ("Grand Wedding Palace", VenueType.wedding_hall, "Madurai", 600, 120000,
         True, True, ["parking", "ac", "catering", "rooms", "stage"]),
        ("City Community Hall", VenueType.community_hall, "Madurai", 150, 15000,
         True, False, ["parking", "fans", "chairs"]),
        ("Seaside Resort Lawn", VenueType.beach, "Chennai", 300, 95000,
         False, True, ["beach-access", "parking", "catering"]),
        ("Metropolitan Hotel Ballroom", VenueType.hotel, "Chennai", 350, 150000,
         True, False, ["ac", "catering", "rooms", "valet"]),
        ("Tech Park Conference Centre", VenueType.conference_hall, "Bengaluru",
         200, 80000, True, False, ["ac", "projector", "wifi", "parking"]),
        ("Garden Villa Pavilion", VenueType.outdoor_garden, "Coimbatore", 220,
         38000, False, True, ["open-air", "parking", "lighting"]),
    ]
    venues: list[Venue] = []
    for i, (name, vtype, city, cap, price, indoor, outdoor, amen) in enumerate(base):
        coords = _CITY_COORDS.get(city.lower(), (None, None))
        # Spread markers slightly so they don't overlap exactly.
        lat = coords[0] + (i * 0.004) if coords[0] is not None else None
        lng = coords[1] + (i * 0.004) if coords[1] is not None else None
        venues.append(Venue(
            id=f"venue-demo-{i+1}",
            name=name,
            venue_type=vtype,
            location=f"{city}, Tamil Nadu, India" if city.lower() in
            ("madurai", "chennai", "coimbatore") else f"{city}, India",
            city=city,
            est_price_paise=rupees_to_paise(price),
            capacity=cap,
            indoor=indoor,
            outdoor=outdoor,
            amenities=amen,
            lat=lat,
            lng=lng,
            source=VenueSource.demo,
            notes="Demo venue — illustrative only, not a real business.",
        ))
    return venues


def _osm_for_city(city: str) -> list[Venue]:
    """Fetch OSM venues for a city, cached. Raises on failure."""
    from app.services import osm_venues

    key = city.strip().lower()
    now = time.time()
    hit = _OSM_CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]
    venues = osm_venues.fetch_city_venues(city)
    _OSM_CACHE[key] = (now + _OSM_TTL_SECONDS, venues)
    return venues


def _resolve_catalogue(query: VenueQuery) -> tuple[list[Venue], str, str]:
    """Return (catalogue, source_mode, disclaimer).

    When venue_source == 'osm' and a city is provided, fetch REAL venues from
    OpenStreetMap. Fall back to the demo catalogue if OSM is unavailable or no
    city is given, clearly labelling the mode.
    """
    settings = get_settings()
    if settings.venue_source.lower() == "osm" and query.city.strip():
        try:
            from app.services.osm_venues import OSM_ATTRIBUTION
            venues = _osm_for_city(query.city)
            return venues, "osm", OSM_ATTRIBUTION
        except Exception:
            # OSM unreachable / no results -> fall back to demo, labelled.
            return (
                _demo_catalogue(),
                "demo_fallback",
                "Live OpenStreetMap data was unavailable, so sample demo "
                "venues are shown. " + DEMO_DISCLAIMER,
            )
    # No city, or demo mode configured.
    note = (
        "Enter a city to search real OpenStreetMap venues. Showing demo "
        "samples. " + DEMO_DISCLAIMER
        if settings.venue_source.lower() == "osm"
        else DEMO_DISCLAIMER
    )
    return _demo_catalogue(), "demo", note


def _matches(v: Venue, q: VenueQuery) -> bool:
    if q.keyword:
        kw = q.keyword.lower()
        hay = f"{v.name} {v.location} {v.city} {' '.join(v.amenities)}".lower()
        if kw not in hay:
            return False
    if q.venue_type and v.venue_type != q.venue_type:
        return False
    if q.city and q.city.lower() not in v.city.lower():
        return False
    # capacity 0 = unknown (common for OSM); don't exclude on capacity bounds.
    if q.min_capacity is not None and v.capacity and v.capacity < q.min_capacity:
        return False
    if q.max_capacity is not None and v.capacity and v.capacity > q.max_capacity:
        return False
    # Price filtering is applied in _matches_price, using the resolved price
    # (quote > listed > estimate), so it is not done here.
    if q.indoor is True and not v.indoor:
        return False
    if q.outdoor is True and not v.outdoor:
        return False
    if q.amenities:
        have = {a.lower() for a in v.amenities}
        if not all(a.lower() in have for a in q.amenities):
            return False
    return True


def _matches_price(p: VenuePrice, q: VenueQuery) -> bool:
    """Budget window filter using the resolved price."""
    if q.min_price_inr is not None and p.max_paise is not None:
        # Whole price range below the minimum -> outside the window.
        if p.max_paise < rupees_to_paise(q.min_price_inr):
            return False
    if q.max_price_inr is None:
        return True
    status = p.budget_status
    if status == "outside":
        return False
    if q.budget_match == "fits" and status == "unknown":
        return False
    if q.budget_match == "within" and status != "within":
        return False
    return True


def _sort(venues: list[Venue], sort: str,
          prices: dict[str, VenuePrice] | None = None) -> list[Venue]:
    prices = prices or {}

    def price_of(v: Venue) -> VenuePrice:
        return prices.get(v.id) or venue_pricing.resolve(v, None, None)

    if sort in ("price", "price_desc"):
        priced = [v for v in venues if price_of(v).min_paise is not None]
        unpriced = [v for v in venues if price_of(v).min_paise is None]
        if sort == "price":
            # Cheapest possible price first; quotes win ties over estimates.
            priced.sort(key=lambda v: (price_of(v).min_paise,
                                       price_of(v).max_paise,
                                       venue_pricing.KIND_RANK[price_of(v).kind]))
        else:
            priced.sort(key=lambda v: (-(price_of(v).max_paise or 0),
                                       -(price_of(v).min_paise or 0),
                                       venue_pricing.KIND_RANK[price_of(v).kind]))
        return priced + unpriced  # "Price unavailable" always last
    if sort == "fit":
        return sorted(venues, key=lambda v: (
            venue_pricing.FIT_RANK[price_of(v).budget_status],
            venue_pricing.KIND_RANK[price_of(v).kind],
            price_of(v).min_paise if price_of(v).min_paise is not None else 10**15,
        ))
    if sort == "capacity":
        return sorted(venues, key=lambda v: -v.capacity)
    return venues  # relevance = catalogue order (keyword already filtered)


def search(query: VenueQuery, extra: list[Venue] | None = None,
           quotes: dict[str, VenueQuote] | None = None) -> VenuePage:
    """Search real (OSM) + user-provided venues with filter/sort/pagination.

    `quotes` (venue_id -> user quote for one event) override estimates.
    """
    catalogue, source_mode, disclaimer = _resolve_catalogue(query)
    catalogue = catalogue + list(extra or [])
    # De-duplicate by id (a shortlisted venue may also be in the catalogue).
    seen: set[str] = set()
    unique: list[Venue] = []
    for v in catalogue:
        if v.id not in seen:
            seen.add(v.id)
            unique.append(v)

    budget = (rupees_to_paise(query.max_price_inr)
              if query.max_price_inr is not None else None)
    quotes = quotes or {}
    prices = {v.id: venue_pricing.resolve(v, quotes.get(v.id), budget)
              for v in unique}

    filtered = [v for v in unique
                if _matches(v, query) and _matches_price(prices[v.id], query)]
    filtered = _sort(filtered, query.sort, prices)

    total = len(filtered)
    start = (query.page - 1) * query.page_size
    end = start + query.page_size
    page_items = filtered[start:end]
    total_pages = max(1, (total + query.page_size - 1) // query.page_size)

    return VenuePage(
        results=page_items,
        total=total,
        page=query.page,
        page_size=query.page_size,
        total_pages=total_pages,
        source_mode=source_mode,
        disclaimer=disclaimer,
        prices={v.id: prices[v.id] for v in page_items},
    )


def get_venue(venue_id: str, extra: list[Venue] | None = None) -> Venue | None:
    """Resolve a venue by id across user-provided, cached OSM, and demo sets."""
    # 1) user/explicit extras (e.g. shortlist)
    for v in list(extra or []):
        if v.id == venue_id:
            return v
    # 2) cached OSM results (already fetched during a prior search)
    for _, cached in _OSM_CACHE.values():
        for v in cached:
            if v.id == venue_id:
                return v
    # 3) demo catalogue
    for v in _demo_catalogue():
        if v.id == venue_id:
            return v
    return None


def venue_from_create(data) -> Venue:
    from app.models.venue import VenueCreate
    assert isinstance(data, VenueCreate)
    price = (rupees_to_paise(data.est_price_inr)
             if data.est_price_inr is not None else None)
    return Venue(
        id=f"venue-user-{uuid.uuid4().hex[:8]}",
        name=data.name, venue_type=data.venue_type, location=data.location,
        city=data.city, est_price_paise=price, capacity=data.capacity,
        indoor=data.indoor, outdoor=data.outdoor, amenities=data.amenities,
        lat=data.lat, lng=data.lng, image_url=data.image_url,
        contact=data.contact, source=VenueSource.user, notes=data.notes,
    )


# --------------------------------------------------------------------------
# AI venue assistant (Gemini) with deterministic fallback
# --------------------------------------------------------------------------
def recommend(event_type: str, city: str, guest_count: int,
              venue_budget_paise: int | None, indoor_pref: str,
              required_amenities: list[str],
              quotes: dict[str, VenueQuote] | None = None,
              extra: list[Venue] | None = None) -> dict:
    """Return a recommendation. generated_by = 'gemini' | 'deterministic'.

    Deterministic ranking: capacity >= guests, budget fit (quote > listed >
    estimate; "price unavailable" no longer counts as within budget), amenity
    match, indoor/outdoor preference. Gemini only adds narrative reasoning.
    """
    page = search(VenueQuery(city=city, amenities=required_amenities,
                             page_size=50), extra=extra, quotes=quotes)
    candidates = page.results
    if not candidates:
        page = search(VenueQuery(city=city, page_size=50), extra=extra,
                      quotes=quotes)
        candidates = page.results

    quotes = quotes or {}
    prices = {v.id: venue_pricing.resolve(v, quotes.get(v.id),
                                          venue_budget_paise)
              for v in candidates}

    def score(v: Venue) -> tuple:
        # capacity 0 means "unknown" (common in OSM) — don't penalise as "small".
        fits_cap = v.capacity == 0 or v.capacity >= guest_count
        p = prices[v.id]
        # within 3 > possibly 2 > unknown 1 > outside 0
        fit = 3 - venue_pricing.FIT_RANK[p.budget_status]
        amen = len(set(a.lower() for a in required_amenities)
                   & set(a.lower() for a in v.amenities))
        pref_ok = (
            (indoor_pref == "indoor" and v.indoor) or
            (indoor_pref == "outdoor" and v.outdoor) or
            indoor_pref not in ("indoor", "outdoor")
        )
        return (fits_cap, fit, pref_ok, amen,
                -(p.min_paise if p.min_paise is not None else 10**12))

    ranked = sorted(candidates, key=score, reverse=True)[:3]

    reasoning = _ai_reasoning(event_type, city, guest_count,
                              venue_budget_paise, indoor_pref,
                              required_amenities, ranked)

    return {
        "generated_by": reasoning["generated_by"],
        "recommendations": [v.model_dump(mode="json") for v in ranked],
        "prices": {v.id: prices[v.id].model_dump(mode="json") for v in ranked},
        "reasoning": reasoning["text"],
        "disclaimer": page.disclaimer,
        "source_mode": page.source_mode,
    }


def _ai_reasoning(event_type, city, guests, budget, indoor_pref,
                  amenities, ranked) -> dict:
    from app.services import gemini_client
    from app.services.gemini_client import GeminiError

    names = ", ".join(v.name for v in ranked) or "no suitable venues found"
    try:
        system = (
            "You are a venue advisor. Return STRICT JSON {\"text\": string}. "
            "Explain briefly why the shortlisted venues suit the event. Do not "
            "claim prices, capacity, or availability you were not given."
        )
        prompt = (
            f"Event: {event_type}, city {city}, {guests} guests, indoor pref "
            f"{indoor_pref}, required amenities {amenities}. Shortlisted "
            f"venues: {names}. Give 2-3 sentences of practical reasoning, and "
            "remind the user to confirm capacity, price and availability."
        )
        data = gemini_client.generate_json(prompt, system=system)
        if isinstance(data, dict) and isinstance(data.get("text"), str):
            return {"generated_by": "gemini", "text": data["text"][:800]}
    except GeminiError:
        pass
    # Deterministic fallback reasoning.
    fit = [v.name for v in ranked if v.capacity and v.capacity >= guests]
    text = (
        f"Shortlisted {len(ranked)} venue(s) in {city} for ~{guests} guests"
        + (f"; {', '.join(fit)} list enough capacity" if fit else
           "; capacity is not listed for these, so confirm it with each venue")
        + ". Prices are usually not in the source data — confirm cost and "
        "availability directly with each venue."
    )
    return {"generated_by": "deterministic", "text": text}
