"""Live catering smoke test against a running server (default :8010).

create event -> generate plan (makes catering allocation) -> generate menu ->
save -> reload -> over-budget save -> optimize -> verify stored plan unchanged.
"""
from __future__ import annotations

import datetime as dt
import sys

import httpx

BASE = "http://127.0.0.1:8010"


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=30)
    print("health:", c.get("/health").json())

    ev = c.post("/api/events", json={
        "name": "Catering Demo",
        "event_type": "wedding",
        "event_date": (dt.date.today() + dt.timedelta(days=60)).isoformat(),
        "location": "Madurai",
        "guest_count": 100,
        "budget_inr": 200000,
        "dietary_requirements": ["Vegetarian"],
    }).json()
    eid = ev["id"]
    print("event:", eid)

    plan = c.post(f"/api/events/{eid}/plans").json()
    cat_alloc = plan["budget"]["category_totals"].get("catering")
    print("catering allocation paise:", cat_alloc)

    gen = c.post(f"/api/events/{eid}/catering/generate",
                 json={"preferences": {"vegetarian_only": True,
                                       "cuisines": ["South Indian"]}}).json()
    print("generated_by:", gen["generated_by"],
          "items:", len(gen["state"]["plan"]["items"]),
          "total:", gen["state"]["summary"]["total_paise"])

    # Save the generated menu.
    saved = c.put(f"/api/events/{eid}/catering", json={
        "items": gen["state"]["plan"]["items"],
        "preferences": gen["state"]["plan"]["preferences"],
        "headcount_override": None,
    }).json()
    assert all(it["id"] for it in saved["plan"]["items"])
    print("saved cost/guest paise:", saved["summary"]["cost_per_guest_paise"],
          "within_budget:", saved["summary"]["within_budget"])

    # Reload persists.
    reloaded = c.get(f"/api/events/{eid}/catering").json()
    assert len(reloaded["plan"]["items"]) == len(saved["plan"]["items"])
    print("reload items:", len(reloaded["plan"]["items"]))

    # Force over budget and optimize.
    big = c.put(f"/api/events/{eid}/catering", json={
        "items": [{"name": "Lavish Platter", "category": "main_course",
                   "unit_cost_paise": 500000, "servings_per_guest": 1.0,
                   "dietary": "vegetarian"}],
        "preferences": {"vegetarian_only": True},
        "headcount_override": None,
    }).json()
    print("over-budget total:", big["summary"]["total_paise"],
          "overrun:", big["summary"]["overrun_paise"])

    opt = c.post(f"/api/events/{eid}/catering/optimize",
                 json={"goal": "lower_cost"}).json()
    print("optimize feasible:", opt["feasible"],
          "before:", opt["before"]["total_paise"],
          "after:", opt["after"]["total_paise"],
          "trade_offs:", opt["trade_offs"])

    # Stored plan must be UNCHANGED until approval.
    still = c.get(f"/api/events/{eid}/catering").json()
    assert still["plan"]["items"][0]["status"] != "rejected", \
        "optimize must not mutate stored plan"
    print("stored plan unchanged after optimize: OK")

    print("\nCATERING E2E PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
