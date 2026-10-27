"""Real venue data from OpenStreetMap via the Overpass API.

This fetches REAL venues (real names, coordinates and addresses that exist in
OpenStreetMap). OSM rarely has prices or capacities, so those stay empty/unknown
— we never invent them. Data is © OpenStreetMap contributors (ODbL); the map UI
shows attribution.

Flow:
1. Geocode the city name to a bounding box via Nominatim.
2. Query Overpass for event-relevant features in that area.
3. Map OSM tags -> our Venue model.

All network calls have short timeouts; callers fall back to the demo catalogue
if OSM is unreachable.
"""
from __future__ import annotations

import hashlib
from typing import Optional

import httpx

from app.models.venue import Venue, VenueSource, VenueType

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Multiple public Overpass mirrors — tried in order for resilience.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
USER_AGENT = "PlanWiseAI/1.0 (event planner; contact: admin@planwise.local)"
HTTP_TIMEOUT = 12.0
OVERPASS_TIMEOUT = 30.0

OSM_ATTRIBUTION = (
    "Venue data © OpenStreetMap contributors (ODbL). Real locations from "
    "OpenStreetMap — prices and capacities are usually unavailable; confirm "
    "all details directly with the venue."
)


class OsmUnavailable(Exception):
    """Raised when OSM/Overpass cannot be reached or returns no usable data."""


# Map OSM amenity/leisure/tourism/building tags -> our VenueType.
def _classify(tags: dict) -> Optional[VenueType]:
    amenity = tags.get("amenity", "")
    leisure = tags.get("leisure", "")
    tourism = tags.get("tourism", "")
    building = tags.get("building", "")

    if amenity in ("events_venue", "banquet_hall"):
        return VenueType.banquet_hall
    if amenity == "community_centre" or building == "civic":
        return VenueType.community_hall
    if amenity == "conference_centre" or tourism == "conference_centre":
        return VenueType.conference_hall
    if tourism in ("hotel", "resort") or building == "hotel":
        return VenueType.hotel
    if leisure in ("park", "garden"):
        return VenueType.outdoor_garden
    if leisure == "beach_resort" or tags.get("natural") == "beach":
        return VenueType.beach
    if amenity in ("marquee", "wedding_hall") or building in ("wedding",):
        return VenueType.wedding_hall
    if amenity == "events_centre":
        return VenueType.banquet_hall
    # Something event-ish but unclassified.
    if amenity or leisure or tourism:
        return VenueType.other
    return None


def _address(tags: dict, city: str) -> str:
    parts = [
        tags.get("addr:housenumber", ""),
        tags.get("addr:street", ""),
        tags.get("addr:suburb", ""),
        tags.get("addr:city", city),
        tags.get("addr:state", ""),
    ]
    addr = ", ".join(p for p in parts if p)
    return addr or city


def _amenities(tags: dict) -> list[str]:
    out: list[str] = []
    mapping = {
        "parking": tags.get("parking") or tags.get("amenity") == "parking",
        "wheelchair": tags.get("wheelchair") in ("yes", "limited"),
        "air-conditioning": tags.get("air_conditioning") == "yes",
        "wifi": tags.get("internet_access") in ("wlan", "yes"),
        "catering": tags.get("catering") == "yes" or tags.get("cuisine"),
    }
    for label, present in mapping.items():
        if present:
            out.append(label)
    return out


def _stable_id(osm_type: str, osm_id: int) -> str:
    raw = f"{osm_type}/{osm_id}"
    h = hashlib.sha1(raw.encode()).hexdigest()[:10]
    return f"venue-osm-{h}"


def _geocode_city(city: str) -> Optional[tuple[float, float, float, float]]:
    """Return a bounding box (south, west, north, east) for the city."""
    try:
        resp = httpx.get(
            NOMINATIM_URL,
            params={"q": city, "format": "json", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # network/parse
        raise OsmUnavailable(f"geocoding failed: {exc}") from exc
    if not data:
        return None
    bb = data[0].get("boundingbox")
    if not bb or len(bb) != 4:
        return None
    south, north, west, east = (float(bb[0]), float(bb[1]),
                                float(bb[2]), float(bb[3]))
    return (south, west, north, east)


def _overpass_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    box = f"{s},{w},{n},{e}"
    # Event-relevant features. nwr = nodes, ways, relations. Named only, so we
    # never surface anonymous polygons. _classify maps each tag to a VenueType.
    return f"""
    [out:json][timeout:25];
    (
      nwr["amenity"="events_venue"]["name"]({box});
      nwr["amenity"="events_centre"]["name"]({box});
      nwr["amenity"="banquet_hall"]["name"]({box});
      nwr["amenity"="wedding_hall"]["name"]({box});
      nwr["amenity"="marquee"]["name"]({box});
      nwr["amenity"="community_centre"]["name"]({box});
      nwr["amenity"="conference_centre"]["name"]({box});
      nwr["tourism"="conference_centre"]["name"]({box});
      nwr["tourism"="hotel"]["name"]({box});
      nwr["tourism"="resort"]["name"]({box});
      nwr["building"="hotel"]["name"]({box});
      nwr["leisure"="garden"]["name"]({box});
      nwr["leisure"="park"]["name"]({box});
      nwr["leisure"="beach_resort"]["name"]({box});
      nwr["natural"="beach"]["name"]({box});
    );
    out center tags 120;
    """


def _element_to_venue(el: dict, city: str) -> Optional[Venue]:
    tags = el.get("tags", {})
    name = tags.get("name")
    if not name:
        return None
    vtype = _classify(tags)
    if vtype is None:
        return None

    # Coordinates: node has lat/lon; way/relation has a 'center'.
    lat = el.get("lat")
    lng = el.get("lon")
    if lat is None and "center" in el:
        lat = el["center"].get("lat")
        lng = el["center"].get("lon")

    indoor = vtype not in (VenueType.outdoor_garden, VenueType.beach)
    outdoor = vtype in (VenueType.outdoor_garden, VenueType.beach)

    contact = tags.get("contact:phone") or tags.get("phone") or ""
    website = tags.get("website") or tags.get("contact:website") or ""

    return Venue(
        id=_stable_id(el.get("type", "node"), el.get("id", 0)),
        name=name[:160],
        venue_type=vtype,
        location=_address(tags, city),
        city=city,
        est_price_paise=None,     # OSM has no reliable pricing — never invented
        capacity=0,               # OSM rarely has capacity — left unknown
        indoor=indoor,
        outdoor=outdoor,
        amenities=_amenities(tags),
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        image_url=tags.get("image", "")[:500],
        contact=(contact or website)[:200],
        source=VenueSource.osm,
        notes="Real OpenStreetMap location. Price/capacity not in OSM — "
              "confirm with the venue.",
    )


def fetch_city_venues(city: str) -> list[Venue]:
    """Fetch real venues for a city from OSM. Raises OsmUnavailable on failure."""
    city = (city or "").strip()
    if not city:
        raise OsmUnavailable("no city provided")

    bbox = _geocode_city(city)
    if bbox is None:
        raise OsmUnavailable(f"could not locate city '{city}'")

    query = _overpass_query(bbox)
    payload = None
    last_exc: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            resp = httpx.post(
                url,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=OVERPASS_TIMEOUT,
            )
            resp.raise_for_status()
            payload = resp.json()
            break
        except Exception as exc:  # try the next mirror
            last_exc = exc
            continue
    if payload is None:
        raise OsmUnavailable(f"overpass failed on all mirrors: {last_exc}")

    venues: list[Venue] = []
    seen: set[str] = set()
    for el in payload.get("elements", []):
        v = _element_to_venue(el, city)
        if v and v.id not in seen:
            seen.add(v.id)
            venues.append(v)
    if not venues:
        raise OsmUnavailable(f"no OSM venues found for '{city}'")
    return venues
