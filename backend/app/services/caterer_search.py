"""Real caterer discovery via OpenStreetMap (Nominatim + Overpass).

Returns REAL businesses that exist in OpenStreetMap near the event location.
OpenStreetMap does not publish menu prices or date availability, so results
never carry a price or an availability claim — the UI shows "Request quote".

Sources: Overpass (full tag search) first. If every Overpass mirror is down,
a Nominatim name search over the same radius is used instead. It's still
real OSM data, but partial, so the response carries a "notice" saying so.

Honesty rules (do not relax):
- No invented caterers, phone numbers, prices or availability. If OSM is
  unreachable or has no matches, the result is empty and says so.
- Restaurants are only included when the user opts in, and are labelled as
  "may offer catering — confirm", because a restaurant is not a caterer.

Data © OpenStreetMap contributors (ODbL).
"""
from __future__ import annotations

import hashlib
import math
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Optional

import httpx

from app.models.caterer import CatererSearchResult
from app.services.osm_venues import (
    NOMINATIM_URL,
    OVERPASS_URLS,
    USER_AGENT,
)

HTTP_TIMEOUT = 12.0
OVERPASS_TIMEOUT = 20.0
# Total wall-clock budget across all Overpass mirrors. Mirrors are started a
# few seconds apart (hedged), and the first good answer wins, so one slow
# mirror can't stall the search for a minute.
OVERPASS_BUDGET_S = 15.0
OVERPASS_HEDGE_S = 3.0
# After every mirror fails, skip Overpass briefly and use the fallback.
OVERPASS_COOLDOWN_S = 120.0
ALLOWED_RADII_KM = (10, 25, 50)
MAX_RESULTS = 60

# Fallback: Nominatim name search when Overpass is down. Still real OSM data,
# but only finds businesses whose name/category matches, so it's partial.
FALLBACK_QUERIES = ("catering", "caterer", "caterers")
FALLBACK_RESTAURANT_QUERIES = ("restaurant",)
NOMINATIM_MIN_INTERVAL_S = 1.0     # Nominatim usage policy: max 1 req/s
FALLBACK_TTL = 120.0               # re-try the full search sooner
# Nominatim categories that are never businesses (e.g. "Catering Road").
_NON_BUSINESS = {"highway", "place", "boundary", "landuse", "railway",
                 "waterway", "natural", "route"}
FALLBACK_NOTICE = (
    "The full OpenStreetMap search is busy right now, so these results come "
    "from a name search and may miss some caterers. Search again in a few "
    "minutes for the complete list."
)

ATTRIBUTION = (
    "Caterer data © OpenStreetMap contributors (ODbL). Listings show real "
    "businesses; prices and availability for your date are not published — "
    "request a quote and confirm directly."
)

# (expires_at, payload) caches — avoid hammering public OSM services.
_GEOCODE_CACHE: dict[str, tuple[float, tuple[float, float, str]]] = {}
_SEARCH_CACHE: dict[str, tuple[float, list[CatererSearchResult]]] = {}
# provider_id -> result, so GET /caterers/{id} can return details.
_PROVIDERS: dict[str, CatererSearchResult] = {}
_TTL = 600.0
_overpass_down_until = 0.0


class CatererSearchUnavailable(Exception):
    """OSM could not be reached or the location could not be found."""


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def _geocode(location: str) -> tuple[float, float, str]:
    key = location.strip().lower()
    hit = _GEOCODE_CACHE.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    try:
        resp = httpx.get(
            NOMINATIM_URL,
            params={"q": location, "format": "json", "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # network / parse
        raise CatererSearchUnavailable(
            "Could not reach the OpenStreetMap location service."
        ) from exc
    if not data:
        raise CatererSearchUnavailable(
            f"Could not find '{location}' on the map. Try a city or area name."
        )
    first = data[0]
    try:
        result = (float(first["lat"]), float(first["lon"]),
                  str(first.get("display_name", location)))
    except (KeyError, TypeError, ValueError) as exc:
        raise CatererSearchUnavailable("Unexpected geocoding response.") from exc
    _GEOCODE_CACHE[key] = (time.time() + _TTL, result)
    return result


def _query(lat: float, lng: float, radius_m: int,
           include_restaurants: bool) -> str:
    around = f"(around:{radius_m},{lat},{lng})"
    parts = [
        f'nwr["craft"="caterer"]["name"]{around};',
        f'nwr["shop"="caterer"]["name"]{around};',
        f'nwr["catering"="yes"]["name"]{around};',
        f'nwr["service:catering"="yes"]["name"]{around};',
    ]
    if include_restaurants:
        parts.append(f'nwr["amenity"="restaurant"]["name"]{around};')
    return (
        "[out:json][timeout:25];(" + "".join(parts) + ");"
        f"out center tags {MAX_RESULTS * 3};"
    )


def _diet(tags: dict) -> str:
    veg = tags.get("diet:vegetarian", "")
    if veg == "only":
        return "pure_veg"
    if veg in ("yes", "limited"):
        return "veg_options"
    if veg == "no":
        return "non_veg"
    return "unknown"


def _kind(tags: dict) -> str:
    if (tags.get("craft") == "caterer" or tags.get("shop") == "caterer"
            or tags.get("catering") == "yes"
            or tags.get("service:catering") == "yes"
            # The business itself advertises catering ("X Catering Services").
            or "cater" in (tags.get("name") or "").lower()):
        return "caterer"
    return "restaurant"


def _overpass_fetch(query: str) -> Optional[dict]:
    """First good Overpass answer within OVERPASS_BUDGET_S, else None.

    Mirrors start OVERPASS_HEDGE_S apart; a mirror is only tried if the
    earlier ones haven't answered yet, which keeps load on these free public
    services low when the first mirror is healthy.
    """
    def one(url: str) -> dict:
        resp = httpx.post(url, data={"data": query},
                          headers={"User-Agent": USER_AGENT},
                          timeout=OVERPASS_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict) or "elements" not in data:
            raise ValueError("unexpected Overpass response")
        return data

    pool = ThreadPoolExecutor(max_workers=len(OVERPASS_URLS))
    start = time.monotonic()
    pending = set()
    try:
        for i, url in enumerate(OVERPASS_URLS):
            pending.add(pool.submit(one, url))
            last = i == len(OVERPASS_URLS) - 1
            while pending:
                if last:
                    remaining = OVERPASS_BUDGET_S - (time.monotonic() - start)
                else:
                    remaining = min(OVERPASS_HEDGE_S,
                                    OVERPASS_BUDGET_S - (time.monotonic() - start))
                if remaining <= 0:
                    break
                done, pending = wait(pending, timeout=remaining,
                                     return_when=FIRST_COMPLETED)
                for f in done:
                    if f.exception() is None:
                        return f.result()
                if not done and not last:
                    break          # this mirror is slow: hedge with the next
            if time.monotonic() - start >= OVERPASS_BUDGET_S:
                break
        return None
    finally:
        # Don't wait for stragglers; their own HTTP timeouts end them.
        pool.shutdown(wait=False, cancel_futures=True)


def _nominatim_elements(lat: float, lng: float, radius_km: int,
                        include_restaurants: bool) -> list[dict]:
    """Fallback search. Returns Overpass-shaped elements so the same mapping
    (_to_result) applies. Raises CatererSearchUnavailable if every call fails.
    """
    d_lat = radius_km / 111.0
    d_lng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    viewbox = f"{lng - d_lng},{lat + d_lat},{lng + d_lng},{lat - d_lat}"
    queries = FALLBACK_QUERIES + (
        FALLBACK_RESTAURANT_QUERIES if include_restaurants else ())

    elements: list[dict] = []
    ok = 0
    for i, q in enumerate(queries):
        if i:
            time.sleep(NOMINATIM_MIN_INTERVAL_S)
        try:
            resp = httpx.get(
                NOMINATIM_URL,
                params={"q": q, "format": "jsonv2", "limit": 50,
                        "viewbox": viewbox, "bounded": 1,
                        "extratags": 1, "addressdetails": 1},
                headers={"User-Agent": USER_AGENT},
                timeout=HTTP_TIMEOUT,
            )
            resp.raise_for_status()
            items = resp.json()
            if not isinstance(items, list):
                continue
            ok += 1
        except Exception:
            continue
        for it in items:
            el = _nominatim_to_element(it)
            if el:
                elements.append(el)
    if not ok:
        raise CatererSearchUnavailable("OpenStreetMap search is unavailable.")
    return elements


def _nominatim_to_element(it: dict) -> Optional[dict]:
    category = str(it.get("category") or it.get("class") or "")
    if not category or category in _NON_BUSINESS:
        return None
    osm_type = it.get("osm_type")
    osm_id = it.get("osm_id")
    try:
        lat, lon = float(it["lat"]), float(it["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if osm_type not in ("node", "way", "relation") or not osm_id:
        return None
    tags = {k: v for k, v in (it.get("extratags") or {}).items()
            if isinstance(v, str)}
    tags[category] = str(it.get("type") or "")
    tags["name"] = str(it.get("name") or "")
    addr = it.get("address") or {}
    for src, dst in (("house_number", "addr:housenumber"),
                     ("road", "addr:street"),
                     ("suburb", "addr:suburb"),
                     ("postcode", "addr:postcode")):
        if addr.get(src) and dst not in tags:
            tags[dst] = str(addr[src])
    city = addr.get("city") or addr.get("town") or addr.get("village")
    if city and "addr:city" not in tags:
        tags["addr:city"] = str(city)
    return {"type": osm_type, "id": int(osm_id), "lat": lat, "lon": lon,
            "tags": tags}


def _address(tags: dict) -> str:
    parts = [
        tags.get("addr:housenumber", ""),
        tags.get("addr:street", ""),
        tags.get("addr:suburb", ""),
        tags.get("addr:city", ""),
        tags.get("addr:postcode", ""),
    ]
    return ", ".join(p for p in parts if p)


def _stable_id(osm_type: str, osm_id: int) -> str:
    h = hashlib.sha1(f"{osm_type}/{osm_id}".encode()).hexdigest()[:10]
    return f"cat-osm-{h}"


def _to_result(el: dict, center: tuple[float, float]) -> Optional[CatererSearchResult]:
    tags = el.get("tags", {}) or {}
    name = (tags.get("name") or "").strip()
    if not name:
        return None
    lat = el.get("lat")
    lng = el.get("lon")
    if lat is None and isinstance(el.get("center"), dict):
        lat = el["center"].get("lat")
        lng = el["center"].get("lon")
    dist = None
    if lat is not None and lng is not None:
        dist = round(haversine_km(center[0], center[1], float(lat), float(lng)), 1)
    cuisine = tags.get("cuisine", "")
    cuisines = [c.strip().replace("_", " ") for c in cuisine.split(";") if c.strip()]
    osm_type = el.get("type", "node")
    osm_id = el.get("id", 0)
    return CatererSearchResult(
        provider_id=_stable_id(osm_type, osm_id),
        name=name[:160],
        kind=_kind(tags),
        address=_address(tags)[:300],
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        distance_km=dist,
        phone=(tags.get("contact:phone") or tags.get("phone") or "")[:60],
        email=(tags.get("contact:email") or tags.get("email") or "")[:120],
        website=(tags.get("contact:website") or tags.get("website") or "")[:300],
        cuisines=cuisines[:8],
        diet=_diet(tags),
        opening_hours=(tags.get("opening_hours") or "")[:120],
        source="osm",
        osm_url=f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
    )


def _matches_food(r: CatererSearchResult, food: str) -> bool:
    # OSM diet data is sparse, so "unknown" is never excluded — only an
    # explicit contradiction is.
    if food == "veg":
        return r.diet != "non_veg"
    return True


def search(location: str, radius_km: int = 25, food: str = "both",
           include_restaurants: bool = False) -> dict:
    """Search real caterers. Never raises for network failures."""
    location = (location or "").strip()
    if not location:
        return {"status": "invalid", "results": [], "message":
                "Enter the event location to search for caterers.",
                "attribution": ATTRIBUTION, "center": None}
    if radius_km not in ALLOWED_RADII_KM:
        radius_km = 25

    try:
        lat, lng, display = _geocode(location)
    except CatererSearchUnavailable as exc:
        return {"status": "unavailable", "results": [], "message": str(exc),
                "attribution": ATTRIBUTION, "center": None}

    global _overpass_down_until
    key = f"{lat:.4f},{lng:.4f}|{radius_km}|{int(include_restaurants)}"
    hit = _SEARCH_CACHE.get(key)
    if hit and hit[0] > time.time():
        found, fallback = hit[1], hit[2]
    else:
        payload = None
        if time.time() >= _overpass_down_until:
            payload = _overpass_fetch(
                _query(lat, lng, radius_km * 1000, include_restaurants))
            if payload is None:
                _overpass_down_until = time.time() + OVERPASS_COOLDOWN_S
        fallback = payload is None
        if fallback:
            try:
                elements = _nominatim_elements(lat, lng, radius_km,
                                               include_restaurants)
            except CatererSearchUnavailable:
                return {"status": "unavailable", "results": [],
                        "message": "OpenStreetMap search is unavailable right "
                                   "now. Try again shortly, or add a caterer "
                                   "you already know manually.",
                        "attribution": ATTRIBUTION,
                        "center": {"lat": lat, "lng": lng, "label": display}}
        else:
            elements = payload.get("elements", [])
        seen: set[str] = set()
        found = []
        for el in elements:
            r = _to_result(el, (lat, lng))
            if r and r.provider_id not in seen:
                seen.add(r.provider_id)
                found.append(r)
        # Both sources can return edge features; enforce the radius.
        found = [r for r in found
                 if r.distance_km is None or r.distance_km <= radius_km]
        ttl = FALLBACK_TTL if fallback else _TTL
        _SEARCH_CACHE[key] = (time.time() + ttl, found, fallback)

    for r in found:
        _PROVIDERS[r.provider_id] = r

    results = [r for r in found if _matches_food(r, food)
               and (include_restaurants or r.kind == "caterer")]
    # Dedicated caterers first, then nearest.
    results.sort(key=lambda r: (r.kind != "caterer",
                                r.distance_km if r.distance_km is not None else 1e9))
    results = results[:MAX_RESULTS]
    if results:
        message = ""
    elif fallback:
        message = (
            f"The quick name search found no caterers within {radius_km} km. "
            "The full OpenStreetMap search is busy, so try again in a few "
            "minutes, or add a caterer you already know."
        )
    else:
        message = (
            f"No caterers are listed on OpenStreetMap within {radius_km} km. "
            "OpenStreetMap coverage varies — try a wider radius, include "
            "restaurants that may cater, or add a caterer you already know."
        )
    return {
        "status": "ok",
        "results": [r.model_dump(mode="json") for r in results],
        "message": message,
        # Shown above results when they may be incomplete.
        "notice": FALLBACK_NOTICE if fallback else "",
        "search_mode": "name_search" if fallback else "full",
        "attribution": ATTRIBUTION,
        "center": {"lat": lat, "lng": lng, "label": display},
        "radius_km": radius_km,
    }


def get_provider(provider_id: str) -> Optional[CatererSearchResult]:
    """Details for a provider seen in a recent search (cached only)."""
    return _PROVIDERS.get(provider_id)
