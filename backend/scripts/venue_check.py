"""Live venue smoke test against a running server (default :8011)."""
from __future__ import annotations

import datetime as dt
import sys

import httpx

BASE = "http://127.0.0.1:8011"


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=30)
    print("health:", c.get("/health").json())

    # Public search with filters + sort.
    page = c.post("/api/venues/search",
                  json={"city": "Madurai", "sort": "price"}).json()
    print("search total:", page["total"], "source:", page["source_mode"])
    assert page["total"] > 0
    assert "not verified" in page["disclaimer"].lower()
    prices = [v["est_price_paise"] or 0 for v in page["results"]]
    assert prices == sorted(prices), "price sort broken"

    ev = c.post("/api/events", json={
        "name": "Venue Demo", "event_type": "wedding",
        "event_date": (dt.date.today() + dt.timedelta(days=60)).isoformat(),
        "location": "Madurai, Tamil Nadu, India",
        "guest_count": 200, "budget_inr": 200000,
    }).json()
    eid = ev["id"]
    c.post(f"/api/events/{eid}/plans")  # creates venue allocation

    venue = page["results"][0]
    sl = c.post(f"/api/events/{eid}/venues/shortlist",
                json={"venue": venue}).json()
    print("shortlist size:", len(sl))

    sel = c.post(f"/api/events/{eid}/venues/select",
                 json={"venue_id": venue["id"]}).json()
    print("selected:", sel["venue"]["name"],
          "venue_budget:", sel["venue_budget_paise"],
          "within:", sel["within_budget"])
    assert sel["venue_budget_paise"] is not None

    detail = c.get(f"/api/events/{eid}").json()
    assert detail["selected_venue"]["id"] == venue["id"]
    assert len(detail["venue_shortlist"]) >= 1
    print("persisted selected venue on event: OK")

    rec = c.post(f"/api/events/{eid}/venues/recommend",
                 json={"indoor_pref": "outdoor",
                       "required_amenities": ["parking"]}).json()
    print("recommend generated_by:", rec["generated_by"],
          "count:", len(rec["recommendations"]))
    assert len(rec["recommendations"]) > 0

    print("\nVENUE E2E PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
