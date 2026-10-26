"""Venue discovery: demo catalogue, search/filter/sort/paginate, AI assist.

No external venue API is configured, so the catalogue is clearly-labelled DEMO
data for local development (source="demo"). When a provider is configured in
future, swap `_demo_catalogue()` for the provider call; the API shape is stable.

Coordinates in demo data are approximate city centres used only to demonstrate
the map; they are NOT real venue addresses and are labelled as demo.
"""
from __future__ import annotations

import uuid

from app.core.money import rupees_to_paise
from app.models.venue import (
    Venue,
    VenuePage,
    VenueQuery,
    VenueSource,
    VenueType,
)

DEMO_DISCLAIMER = (
    "Demo venues for illustration only — not verified real businesses. "
    "Prices and coordinates are approximate samples. Verify everything "
    "directly with the venue."
)

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
    if q.min_capacity is not None and v.capacity < q.min_capacity:
        return False
    if q.max_price_inr is not None and v.est_price_paise is not None:
        if v.est_price_paise > rupees_to_paise(q.max_price_inr):
            return False
    if q.indoor is True and not v.indoor:
        return False
    if q.outdoor is True and not v.outdoor:
        return False
    if q.amenities:
        have = {a.lower() for a in v.amenities}
        if not all(a.lower() in have for a in q.amenities):
            return False
    return True


def _sort(venues: list[Venue], sort: str) -> list[Venue]:
    if sort == "price":
        return sorted(venues, key=lambda v: (v.est_price_paise is None,
                                             v.est_price_paise or 0))
    if sort == "capacity":
        return sorted(venues, key=lambda v: -v.capacity)
    return venues  # relevance = catalogue order (keyword already filtered)


def search(query: VenueQuery, extra: list[Venue] | None = None) -> VenuePage:
    """Search demo + user-provided venues with filter/sort/pagination."""
    catalogue = _demo_catalogue() + list(extra or [])
    filtered = [v for v in catalogue if _matches(v, query)]
    filtered = _sort(filtered, query.sort)

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
        source_mode="demo",
        disclaimer=DEMO_DISCLAIMER,
    )


def get_venue(venue_id: str, extra: list[Venue] | None = None) -> Venue | None:
    for v in _demo_catalogue() + list(extra or []):
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
              required_amenities: list[str]) -> dict:
    """Return a recommendation. generated_by = 'gemini' | 'deterministic'.

    Deterministic ranking: capacity >= guests, within budget, amenity match,
    indoor/outdoor preference. Gemini only adds narrative reasoning.
    """
    q = VenueQuery(city=city, min_capacity=guest_count,
                   amenities=required_amenities, page_size=50)
    candidates = search(q).results
    if not candidates:
        # relax capacity if nothing fits
        candidates = search(VenueQuery(city=city, page_size=50)).results

    def score(v: Venue) -> tuple:
        fits_cap = v.capacity >= guest_count
        within = (venue_budget_paise is None or v.est_price_paise is None
                  or v.est_price_paise <= venue_budget_paise)
        amen = len(set(a.lower() for a in required_amenities)
                   & set(a.lower() for a in v.amenities))
        pref_ok = (
            (indoor_pref == "indoor" and v.indoor) or
            (indoor_pref == "outdoor" and v.outdoor) or
            indoor_pref not in ("indoor", "outdoor")
        )
        return (fits_cap, within, pref_ok, amen,
                -(v.est_price_paise or 10**12))

    ranked = sorted(candidates, key=score, reverse=True)[:3]

    reasoning = _ai_reasoning(event_type, city, guest_count,
                              venue_budget_paise, indoor_pref,
                              required_amenities, ranked)

    return {
        "generated_by": reasoning["generated_by"],
        "recommendations": [v.model_dump(mode="json") for v in ranked],
        "reasoning": reasoning["text"],
        "disclaimer": DEMO_DISCLAIMER,
    }


def _ai_reasoning(event_type, city, guests, budget, indoor_pref,
                  amenities, ranked) -> dict:
    from app.services import gemini_client
    from app.services.gemini_client import GeminiError

    names = ", ".join(v.name for v in ranked) or "no suitable demo venues"
    try:
        system = (
            "You are a venue advisor. Return STRICT JSON {\"text\": string}. "
            "Explain briefly why the shortlisted venues suit the event. These "
            "are demo venues — do not claim they are real or verified."
        )
        prompt = (
            f"Event: {event_type}, city {city}, {guests} guests, indoor pref "
            f"{indoor_pref}, required amenities {amenities}. Shortlisted demo "
            f"venues: {names}. Give 2-3 sentences of practical reasoning."
        )
        data = gemini_client.generate_json(prompt, system=system)
        if isinstance(data, dict) and isinstance(data.get("text"), str):
            return {"generated_by": "gemini", "text": data["text"][:800]}
    except GeminiError:
        pass
    # Deterministic fallback reasoning.
    fit = [v.name for v in ranked if v.capacity >= guests]
    text = (
        f"Shortlisted {len(ranked)} demo venue(s) in {city} for ~{guests} guests"
        + (f"; {', '.join(fit)} meet the capacity requirement" if fit else "")
        + ". Compare price against your venue budget and verify details with "
        "each venue directly."
    )
    return {"generated_by": "deterministic", "text": text}
