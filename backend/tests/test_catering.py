"""Catering & menu planner: calculations, persistence, guest sync, AI, optimize."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.api.deps import get_current_owner
from app.main import app
from app.models.catering import (
    CateringPlan,
    CateringPreferences,
    CostSource,
    DietaryClass,
    ItemStatus,
    MenuCategory,
    MenuItem,
    PricingUnit,
)
from app.services import catering_service, menu_ai
from app.services.gemini_client import GeminiBadResponse, GeminiTimeout

client = TestClient(app)


def _event(**ov):
    base = {
        "name": "Catering Birthday",
        "event_type": "birthday",
        "event_date": (date.today() + timedelta(days=30)).isoformat(),
        "location": "Madurai",
        "guest_count": 50,
        "budget_inr": 30000,
    }
    base.update(ov)
    return base


def teardown_function():
    app.dependency_overrides.pop(get_current_owner, None)


def _item(**ov):
    data = dict(
        id=ov.pop("id", "mi-1"),
        name=ov.pop("name", "Dish"),
        category=ov.pop("category", MenuCategory.main_course),
        unit_cost_paise=ov.pop("unit_cost_paise", 10000),
        servings_per_guest=ov.pop("servings_per_guest", 1.0),
        pricing_unit=ov.pop("pricing_unit", PricingUnit.per_serving),
    )
    data.update(ov)
    return MenuItem(**data)


# --- deterministic calculations ---
def test_per_serving_quantity_and_total():
    plan = CateringPlan(items=[_item(unit_cost_paise=10000, servings_per_guest=1.0)])
    items, summary = catering_service.compute(plan, 50, None, None)
    assert items[0].computed_quantity == 50       # 50 guests * 1 serving
    assert items[0].total_cost_paise == 500000     # 50 * 10000 paise
    assert summary.total_paise == 500000
    assert summary.cost_per_guest_paise == 10000   # 500000 / 50


def test_servings_per_guest_rounds_up():
    plan = CateringPlan(items=[_item(servings_per_guest=0.5, unit_cost_paise=2000)])
    items, _ = catering_service.compute(plan, 51, None, None)
    assert items[0].computed_quantity == 26        # ceil(51 * 0.5)


def test_package_price_is_flat_not_double_counted():
    plan = CateringPlan(items=[
        _item(id="pkg", pricing_unit=PricingUnit.per_package,
              unit_cost_paise=2000000, planned_quantity=1),
    ])
    items, summary = catering_service.compute(plan, 200, None, None)
    # Flat package cost regardless of 200 guests.
    assert summary.total_paise == 2000000


def test_guest_count_change_recalculates():
    plan = CateringPlan(items=[_item(unit_cost_paise=10000)])
    _, s50 = catering_service.compute(plan, 50, None, None)
    _, s100 = catering_service.compute(plan, 100, None, None)
    assert s100.total_paise == 2 * s50.total_paise


def test_budget_overrun_detection():
    plan = CateringPlan(items=[_item(unit_cost_paise=50000)])  # 50*50000=2.5M
    _, summary = catering_service.compute(plan, 50, None, catering_budget_paise=1000000)
    assert summary.within_budget is False
    assert summary.overrun_paise == 1500000


def test_rejected_items_excluded_from_total():
    plan = CateringPlan(items=[
        _item(id="a", unit_cost_paise=10000),
        _item(id="b", unit_cost_paise=10000, status=ItemStatus.rejected),
    ])
    _, summary = catering_service.compute(plan, 10, None, None)
    assert summary.total_paise == 100000  # only item a


def test_validation_rejects_negative():
    # The model blocks negatives at construction; the service guard is a
    # second line of defence. Build an invalid item bypassing validation.
    bad = MenuItem.model_construct(
        id="x", name="Bad", category=MenuCategory.lunch,
        unit_cost_paise=-1, servings_per_guest=1.0,
        pricing_unit=PricingUnit.per_serving,
    )
    plan = CateringPlan.model_construct(items=[bad],
                                        preferences=CateringPreferences(),
                                        headcount_override=None)
    assert catering_service.validate_plan(plan)


def test_model_blocks_negative_price_at_construction():
    import pytest
    with pytest.raises(Exception):
        MenuItem(id="x", name="Bad", category=MenuCategory.lunch,
                 unit_cost_paise=-1)


def test_vegetarian_only_constraint():
    plan = CateringPlan(
        items=[_item(dietary=DietaryClass.non_vegetarian, name="Chicken")],
        preferences=CateringPreferences(vegetarian_only=True),
    )
    violations = catering_service.check_dietary_constraints(plan)
    assert any("non-vegetarian" in v.lower() for v in violations)


def test_prohibited_ingredient_detected():
    plan = CateringPlan(
        items=[_item(name="Peanut Curry", description="rich peanut gravy")],
        preferences=CateringPreferences(prohibited_ingredients=["peanut"]),
    )
    assert catering_service.check_dietary_constraints(plan)


def test_allergy_notice_present():
    plan = CateringPlan(preferences=CateringPreferences(allergies=["nuts"]))
    assert "verify with the caterer" in (catering_service.allergy_notice(plan) or "")


# --- Gemini generation + fallback ---
def test_generate_menu_falls_back_without_gemini():
    from app.models.event import EventType
    items, gen = menu_ai.generate_menu(
        EventType.birthday, 50, CateringPreferences(), None
    )
    assert gen == "deterministic"
    assert len(items) > 0


def test_generate_menu_uses_gemini_when_available(monkeypatch):
    from app.models.event import EventType
    import app.services.menu_ai as m

    def _fake(prompt, system=""):
        return {"items": [
            {"name": "Veg Pulao", "category": "rice_breads",
             "dietary": "vegetarian", "estimated_unit_cost_inr": 120},
        ]}
    monkeypatch.setattr(m.gemini_client, "generate_json", _fake)
    items, gen = menu_ai.generate_menu(
        EventType.wedding, 100, CateringPreferences(), 300
    )
    assert gen == "gemini"
    assert items[0].name == "Veg Pulao"
    assert items[0].unit_cost_paise == 12000  # 120 INR -> paise, estimate only


def test_generate_menu_handles_malformed_gemini(monkeypatch):
    from app.models.event import EventType
    import app.services.menu_ai as m
    monkeypatch.setattr(
        m.gemini_client, "generate_json",
        lambda *a, **k: (_ for _ in ()).throw(GeminiBadResponse("bad")),
    )
    items, gen = menu_ai.generate_menu(EventType.birthday, 20,
                                       CateringPreferences(), None)
    assert gen == "deterministic" and items


def test_generate_menu_handles_timeout(monkeypatch):
    from app.models.event import EventType
    import app.services.menu_ai as m
    monkeypatch.setattr(
        m.gemini_client, "generate_json",
        lambda *a, **k: (_ for _ in ()).throw(GeminiTimeout("deadline")),
    )
    items, gen = menu_ai.generate_menu(EventType.community, 30,
                                       CateringPreferences(), None)
    assert gen == "deterministic" and items


# --- API: save/load/persist + ownership ---
def test_api_save_and_reload_catering():
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")  # creates catering allocation
    body = {
        "items": [
            {"name": "Paneer Tikka", "category": "starters",
             "unit_cost_paise": 9000, "servings_per_guest": 1.0},
        ],
        "preferences": {"vegetarian_only": True},
    }
    r = client.put(f"/api/events/{ev['id']}/catering", json=body)
    assert r.status_code == 200
    state = r.json()
    assert state["plan"]["items"][0]["id"]  # id assigned
    assert state["summary"]["total_paise"] == 9000 * 50
    assert state["summary"]["catering_budget_paise"] is not None  # from plan

    reload = client.get(f"/api/events/{ev['id']}/catering").json()
    assert reload["plan"]["items"][0]["name"] == "Paneer Tikka"


def test_api_invalid_price_rejected():
    ev = client.post("/api/events", json=_event()).json()
    r = client.put(f"/api/events/{ev['id']}/catering",
                   json={"items": [{"name": "X", "category": "lunch",
                                    "unit_cost_paise": -5}]})
    assert r.status_code == 422


def test_api_generate_endpoint_returns_state():
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    r = client.post(f"/api/events/{ev['id']}/catering/generate",
                    json={"preferences": {"vegetarian_only": True}})
    assert r.status_code == 200
    body = r.json()
    assert body["generated_by"] in ("gemini", "deterministic")
    assert len(body["state"]["plan"]["items"]) > 0


def test_api_optimize_proposal_not_persisted():
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    # Save an over-budget menu (huge unit cost).
    client.put(f"/api/events/{ev['id']}/catering", json={
        "items": [{"name": "Gold Cake", "category": "desserts",
                   "unit_cost_paise": 100000, "servings_per_guest": 1.0}],
    })
    r = client.post(f"/api/events/{ev['id']}/catering/optimize",
                    json={"goal": "lower_cost"})
    assert r.status_code == 200
    proposal = r.json()
    assert "before" in proposal and "after" in proposal
    # Proposal must NOT have changed the stored plan.
    stored = client.get(f"/api/events/{ev['id']}/catering").json()
    assert stored["plan"]["items"][0]["status"] != "rejected"


def test_catering_ownership_enforced():
    app.dependency_overrides[get_current_owner] = lambda: "userA"
    ev = client.post("/api/events", json=_event()).json()
    client.post(f"/api/events/{ev['id']}/plans")
    client.put(f"/api/events/{ev['id']}/catering",
               json={"items": [{"name": "Dish", "category": "lunch",
                                "unit_cost_paise": 1000}]})

    app.dependency_overrides[get_current_owner] = lambda: "userB"
    assert client.get(f"/api/events/{ev['id']}/catering").status_code == 403
    assert client.put(f"/api/events/{ev['id']}/catering",
                      json={"items": []}).status_code == 403
