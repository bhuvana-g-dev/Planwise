"""Live OSM venue fetch check (hits real Overpass). Run directly."""
from __future__ import annotations

import sys

from app.services import osm_venues


def main() -> int:
    city = sys.argv[1] if len(sys.argv) > 1 else "Madurai"
    try:
        venues = osm_venues.fetch_city_venues(city)
    except osm_venues.OsmUnavailable as exc:
        print("OSM unavailable:", exc)
        return 1
    print(f"Fetched {len(venues)} real OSM venues for {city}:")
    for v in venues[:12]:
        print(f" - {v.name} | {v.venue_type.value} | "
              f"coords={v.lat},{v.lng} | {v.location[:50]}")
    print("All source=osm:", all(v.source.value == "osm" for v in venues))
    print("No invented prices:", all(v.est_price_paise is None for v in venues))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
