"""Caterer management: records, comparison, booking state and budget link.

Python is the authority for every number here. Totals are recomputed from the
stored record on every read, so a guest-count change (e.g. 200 -> 250 RSVPs)
immediately changes the estimate.

Budget integration never double-counts: a plan has ONE catering expense, and
applying a caterer *replaces* its amount. It is an explicit user action that
goes through the same optimistic-concurrency commit as plan approvals.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.money import rupees_to_paise
from app.models.caterer import (
    BookingStatus,
    CatererInput,
    CatererPatch,
    CatererRecord,
    FoodType,
    PaymentStatus,
    PriceSource,
)
from app.models.event import Event
from app.models.plan import Expense, ExpenseSource, Plan
from app.repositories.base import StaleActivePlan
from app.services import budget_service, catering_service
from app.services import event_service as es
from app.services.event_service import InvalidProposal, NotFound, StalePlan

CATERING_EXPENSE_ID = "exp-catering"
DEFAULT_FOOD_PREFERENCE = "veg"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# Storage helpers
# --------------------------------------------------------------------------
def _load(event_id: str) -> dict:
    store = es.get_repository().get_caterers(event_id) or {}
    return {
        "food_preference": store.get("food_preference", DEFAULT_FOOD_PREFERENCE),
        "records": [CatererRecord.model_validate(r)
                    for r in store.get("records", [])],
    }


def _save(event_id: str, food_preference: str,
          records: list[CatererRecord]) -> None:
    es.get_repository().save_caterers(event_id, {
        "food_preference": food_preference,
        "records": [r.model_dump(mode="json") for r in records],
    })


def _find(records: list[CatererRecord], cid: str) -> CatererRecord:
    for r in records:
        if r.id == cid:
            return r
    raise NotFound(cid)


# --------------------------------------------------------------------------
# Input <-> stored conversion (rupees at the edge, paise inside)
# --------------------------------------------------------------------------
def _validate_amounts(data: CatererInput) -> None:
    """Cross-field validation that Pydantic field limits can't express."""
    if data.fixed_total_inr is not None and not data.fixed_total_reason:
        raise InvalidProposal(
            "Give a reason for the fixed package price (e.g. 'negotiated "
            "all-inclusive rate')."
        )
    if (data.min_guests is not None and data.max_guests is not None
            and data.min_guests > data.max_guests):
        raise InvalidProposal("Minimum guests cannot exceed maximum guests.")


def _record_from_input(data: CatererInput, *, rid: str,
                       created_at: datetime,
                       keep: Optional[CatererRecord] = None) -> CatererRecord:
    _validate_amounts(data)
    rec = CatererRecord(
        id=rid,
        name=data.name,
        source=data.source,
        provider_id=data.provider_id,
        kind=data.kind,
        phone=data.phone,
        email=data.email,
        website=data.website,
        address=data.address,
        lat=data.lat,
        lng=data.lng,
        distance_km=data.distance_km,
        menu_types=data.menu_types,
        food_type=data.food_type,
        cuisines=data.cuisines,
        menu=data.menu,
        inclusions=data.inclusions,
        guest_count=data.guest_count,
        price_per_guest_paise=rupees_to_paise(data.price_per_guest_inr),
        extras_paise=rupees_to_paise(data.extras_inr),
        fixed_total_paise=(rupees_to_paise(data.fixed_total_inr)
                           if data.fixed_total_inr is not None else None),
        fixed_total_reason=data.fixed_total_reason,
        advance_paid_paise=rupees_to_paise(data.advance_paid_inr),
        price_source=data.price_source,
        min_guests=data.min_guests,
        max_guests=data.max_guests,
        booking_status=data.booking_status,
        refunded=data.refunded,
        notes=data.notes,
        selected=keep.selected if keep else False,
        applied_total_paise=keep.applied_total_paise if keep else None,
        applied_plan_version=keep.applied_plan_version if keep else None,
        created_at=created_at,
        updated_at=_now(),
    )
    return rec


def _input_from_record(rec: CatererRecord) -> dict:
    return {
        "name": rec.name, "source": rec.source, "provider_id": rec.provider_id,
        "kind": rec.kind, "phone": rec.phone, "email": rec.email,
        "website": rec.website, "address": rec.address, "lat": rec.lat,
        "lng": rec.lng, "distance_km": rec.distance_km,
        "menu_types": rec.menu_types, "food_type": rec.food_type,
        "cuisines": rec.cuisines, "menu": rec.menu.model_dump(),
        "inclusions": rec.inclusions, "guest_count": rec.guest_count,
        "price_per_guest_inr": rec.price_per_guest_paise / 100,
        "extras_inr": rec.extras_paise / 100,
        "fixed_total_inr": (rec.fixed_total_paise / 100
                            if rec.fixed_total_paise is not None else None),
        "fixed_total_reason": rec.fixed_total_reason,
        "advance_paid_inr": rec.advance_paid_paise / 100,
        "price_source": rec.price_source, "min_guests": rec.min_guests,
        "max_guests": rec.max_guests, "booking_status": rec.booking_status,
        "refunded": rec.refunded, "notes": rec.notes,
    }


# --------------------------------------------------------------------------
# Calculations (authoritative)
# --------------------------------------------------------------------------
def _headcount(event: Event, event_id: str, owner_id: Optional[str]) -> dict:
    gsummary = es.guest_summary(event_id, owner_id)
    hc = catering_service.resolve_headcount(event.guest_count, gsummary, None)
    return {"count": hc.catering_headcount, "source": hc.source,
            "planned": hc.planned_guests, "confirmed": hc.confirmed_headcount}


def totals(rec: CatererRecord, headcount: int) -> dict:
    """Estimated total = guests x price per guest + extras (or fixed price)."""
    guests = rec.guest_count if rec.guest_count is not None else headcount
    base = guests * rec.price_per_guest_paise
    computed = base + rec.extras_paise
    total = rec.fixed_total_paise if rec.fixed_total_paise is not None else computed
    has_price = (rec.fixed_total_paise is not None
                 or rec.price_per_guest_paise > 0)
    balance = total - rec.advance_paid_paise
    if rec.refunded:
        payment = PaymentStatus.refunded
    elif rec.advance_paid_paise <= 0:
        payment = PaymentStatus.unpaid
    elif rec.advance_paid_paise < total:
        payment = PaymentStatus.partially_paid
    else:
        payment = PaymentStatus.paid
    return {
        "guests_used": guests,
        "guests_follow_event": rec.guest_count is None,
        "base_paise": base,
        "computed_total_paise": computed,
        "total_paise": total,
        "is_fixed_price": rec.fixed_total_paise is not None,
        "has_price": has_price,
        "balance_paise": balance,
        "overpaid_paise": max(0, -balance),
        "payment_status": payment.value,
    }


def _food_ok(offered: FoodType, needed: str) -> bool:
    if needed == "veg":
        return offered in (FoodType.veg, FoodType.both)
    if needed == "nonveg":
        return offered in (FoodType.nonveg, FoodType.both)
    return offered == FoodType.both  # "both" needs a caterer serving both


def requirement_checks(rec: CatererRecord, guests: int,
                       food_pref: str, has_price: bool) -> list[dict]:
    labels = {"veg": "vegetarian", "nonveg": "non-vegetarian",
              "both": "veg and non-veg"}
    checks = [{
        "key": "food",
        "label": f"Serves {labels.get(food_pref, food_pref)}",
        "ok": _food_ok(rec.food_type, food_pref),
    }]
    if rec.min_guests is not None:
        checks.append({"key": "min_guests",
                       "label": f"Minimum {rec.min_guests} guests",
                       "ok": guests >= rec.min_guests})
    if rec.max_guests is not None:
        checks.append({"key": "capacity",
                       "label": f"Handles up to {rec.max_guests} guests",
                       "ok": guests <= rec.max_guests})
    checks.append({"key": "price", "label": "Price known",
                   "ok": has_price})
    return checks


def _active_catering_paise(active: Optional[dict]) -> Optional[int]:
    if not active:
        return None
    return active.get("budget", {}).get("category_totals", {}).get("catering")


def _sync(rec: CatererRecord, total: int, active: Optional[dict]) -> str:
    """Is the plan's catering expense in step with this caterer?"""
    if rec.applied_total_paise is None or not active:
        return "not_applied"
    current = _active_catering_paise(active)
    if current == total and rec.applied_total_paise == total:
        return "in_sync"
    return "out_of_date"


def _view(rec: CatererRecord, headcount: int, food_pref: str,
          active: Optional[dict]) -> dict:
    t = totals(rec, headcount)
    checks = requirement_checks(rec, t["guests_used"], food_pref, t["has_price"])
    data = rec.model_dump(mode="json")
    data.update(t)
    data["checks"] = checks
    data["meets_requirements"] = all(c["ok"] for c in checks)
    data["budget_sync"] = _sync(rec, t["total_paise"], active) if rec.selected \
        else ("not_applied" if rec.applied_total_paise is None else "replaced")
    return data


# --------------------------------------------------------------------------
# Public service API
# --------------------------------------------------------------------------
def overview(event_id: str, owner_id: Optional[str]) -> dict:
    event = Event.model_validate(es.get_event(event_id, owner_id))
    store = _load(event_id)
    hc = _headcount(event, event_id, owner_id)
    active = es.get_repository().get_active_plan(event_id)
    views = [_view(r, hc["count"], store["food_preference"], active)
             for r in store["records"]]

    priced_fits = [v for v in views
                   if v["meets_requirements"]
                   and v["booking_status"] != BookingStatus.cancelled.value]
    best = min(priced_fits, key=lambda v: v["total_paise"]) if priced_fits else None
    selected = next((v for v in views if v["selected"]), None)
    budget = active.get("budget", {}) if active else {}
    return {
        "food_preference": store["food_preference"],
        "headcount": hc,
        "event": {"name": event.name, "date": event.event_date.isoformat(),
                  "location": event.location, "event_type": event.event_type.value},
        "records": views,
        "best_fit_id": best["id"] if best else None,
        "selected_id": selected["id"] if selected else None,
        "budget": {
            "has_plan": active is not None,
            "plan_version": active.get("version") if active else None,
            "budget_paise": budget.get("budget_paise"),
            "allocated_paise": budget.get("allocated_paise"),
            "remaining_paise": budget.get("remaining_paise"),
            "catering_paise": _active_catering_paise(active),
        },
    }


def set_preference(event_id: str, food_preference: str,
                   owner_id: Optional[str]) -> dict:
    es.get_event(event_id, owner_id)
    if food_preference not in ("veg", "nonveg", "both"):
        raise InvalidProposal("Food preference must be veg, nonveg or both.")
    store = _load(event_id)
    _save(event_id, food_preference, store["records"])
    return overview(event_id, owner_id)


def create(event_id: str, data: CatererInput, owner_id: Optional[str],
           link_to_id: Optional[str] = None) -> dict:
    """Add a caterer record — or link provider details to an existing one.

    Linking is how double-counting is prevented when a user recorded a
    caterer manually and later finds the same business in search results.
    """
    es.get_event(event_id, owner_id)
    store = _load(event_id)
    records = store["records"]

    if data.provider_id:
        dup = next((r for r in records if r.provider_id == data.provider_id
                    and r.id != link_to_id), None)
        if dup:
            raise InvalidProposal(
                f"'{dup.name}' is already in your caterer options."
            )

    if link_to_id:
        existing = _find(records, link_to_id)
        merged = _input_from_record(existing)
        # Attach provider identity + any contact details the record lacks.
        # The user's own prices, payments and status are never overwritten.
        merged["provider_id"] = data.provider_id
        merged["kind"] = existing.kind or data.kind
        for field in ("phone", "email", "website", "address"):
            if not merged.get(field):
                merged[field] = getattr(data, field)
        for field in ("lat", "lng", "distance_km"):
            if merged.get(field) is None:
                merged[field] = getattr(data, field)
        if not merged.get("cuisines"):
            merged["cuisines"] = data.cuisines
        updated = _record_from_input(CatererInput.model_validate(merged),
                                     rid=existing.id,
                                     created_at=existing.created_at,
                                     keep=existing)
        records = [updated if r.id == existing.id else r for r in records]
        _save(event_id, store["food_preference"], records)
        return {"record_id": existing.id, "linked": True,
                "overview": overview(event_id, owner_id)}

    rec = _record_from_input(data, rid=f"cat-{uuid.uuid4().hex[:10]}",
                             created_at=_now())
    _check_advance(rec, event_id, owner_id)
    records.append(rec)
    _save(event_id, store["food_preference"], records)
    return {"record_id": rec.id, "linked": False,
            "overview": overview(event_id, owner_id)}


def _check_advance(rec: CatererRecord, event_id: str,
                   owner_id: Optional[str]) -> None:
    """Advance may not exceed the agreed total (no overpayment support)."""
    event = Event.model_validate(es.get_event(event_id, owner_id))
    hc = _headcount(event, event_id, owner_id)
    t = totals(rec, hc["count"])
    if t["has_price"] and rec.advance_paid_paise > t["total_paise"]:
        raise InvalidProposal(
            "Advance paid cannot be more than the agreed total."
        )
    if not t["has_price"] and rec.advance_paid_paise > 0:
        raise InvalidProposal(
            "Enter the agreed price before recording an advance payment."
        )


def update(event_id: str, cid: str, patch: CatererPatch,
           owner_id: Optional[str]) -> dict:
    es.get_event(event_id, owner_id)
    store = _load(event_id)
    existing = _find(store["records"], cid)
    merged = _input_from_record(existing)
    changes = patch.model_dump(exclude_unset=True)
    if "menu" in changes and changes["menu"] is not None:
        changes["menu"] = patch.menu.model_dump()
    merged.update(changes)
    data = CatererInput.model_validate(merged)
    rec = _record_from_input(data, rid=existing.id,
                             created_at=existing.created_at, keep=existing)
    _check_advance(rec, event_id, owner_id)
    records = [rec if r.id == cid else r for r in store["records"]]
    _save(event_id, store["food_preference"], records)
    return overview(event_id, owner_id)


def delete(event_id: str, cid: str, owner_id: Optional[str]) -> dict:
    """Remove a record. The plan's catering expense is left untouched — the
    budget is only ever changed by an explicit apply."""
    es.get_event(event_id, owner_id)
    store = _load(event_id)
    _find(store["records"], cid)
    records = [r for r in store["records"] if r.id != cid]
    _save(event_id, store["food_preference"], records)
    return overview(event_id, owner_id)


def select(event_id: str, cid: str, selected: bool,
           owner_id: Optional[str]) -> dict:
    """Mark one caterer as the chosen one (at most one is selected)."""
    es.get_event(event_id, owner_id)
    store = _load(event_id)
    target = _find(store["records"], cid)
    if selected and target.booking_status == BookingStatus.cancelled:
        raise InvalidProposal("A cancelled booking cannot be selected.")
    for r in store["records"]:
        r.selected = (r.id == cid) if selected else (r.selected and r.id != cid)
    _save(event_id, store["food_preference"], store["records"])
    return overview(event_id, owner_id)


# --------------------------------------------------------------------------
# Budget integration
# --------------------------------------------------------------------------
def _apply_to_expenses(expenses: list[Expense], rec: CatererRecord,
                       t: dict) -> tuple[list[Expense], list[str]]:
    """Return expenses with the single catering expense set to the caterer's
    total. Never adds a second catering expense."""
    expenses = [e.model_copy(deep=True) for e in expenses]
    warnings: list[str] = []
    confirmed = rec.booking_status == BookingStatus.confirmed
    guests_note = (f"{t['guests_used']} guests x Rs {rec.price_per_guest_paise / 100:,.0f}"
                   + (f" + extras Rs {rec.extras_paise / 100:,.0f}"
                      if rec.extras_paise else ""))
    basis = (f"Fixed package price ({rec.fixed_total_reason})"
             if t["is_fixed_price"] else guests_note)
    source_note = {
        PriceSource.quoted: "quoted by the caterer",
        PriceSource.published: "published price",
        PriceSource.estimated: "your estimate",
        PriceSource.quote_needed: "awaiting quote",
    }[rec.price_source]
    assumptions = (f"Caterer: {rec.name}. {basis}; {source_note}. "
                   f"{'Booking confirmed by you' if confirmed else 'Not yet confirmed'}"
                   " — PlanWise does not make bookings.")[:500]

    cats = [e for e in expenses if e.category.lower() == "catering"]
    target = next((e for e in cats if e.id == CATERING_EXPENSE_ID),
                  cats[0] if cats else None)
    if target is None:
        target = Expense(id=CATERING_EXPENSE_ID, category="catering",
                         label="Catering", amount_paise=0)
        expenses.append(target)
    others = [e for e in cats if e is not target and e.amount_paise > 0]
    if others:
        warnings.append(
            "Other catering expenses also exist in your plan ("
            + ", ".join(e.label for e in others)
            + "). Review them so catering is not counted twice."
        )
    target.amount_paise = t["total_paise"]
    target.label = f"Catering — {rec.name}"[:160]
    target.source = (ExpenseSource.user_quote
                     if rec.price_source != PriceSource.estimated
                     else ExpenseSource.estimate)
    target.assumptions = assumptions
    # Scales with guests only when priced per guest and following headcount.
    target.per_guest = (not t["is_fixed_price"]) and t["guests_follow_event"]
    target.committed = confirmed
    if confirmed:
        target.negotiable = False
    return expenses, warnings


def _context(event_id: str, cid: str, owner_id: Optional[str]):
    event = Event.model_validate(es.get_event(event_id, owner_id))
    active = es.get_repository().get_active_plan(event_id)
    if active is None:
        raise NotFound("Generate an event plan first — it creates the budget "
                       "that catering is added to.")
    store = _load(event_id)
    rec = _find(store["records"], cid)
    if rec.booking_status == BookingStatus.cancelled:
        raise InvalidProposal("A cancelled booking cannot be added to the budget.")
    hc = _headcount(event, event_id, owner_id)
    t = totals(rec, hc["count"])
    if not t["has_price"]:
        raise InvalidProposal(
            "Add a price per guest or a fixed package price before adding "
            "this caterer to the budget."
        )
    return event, active, store, rec, t


def budget_preview(event_id: str, cid: str, owner_id: Optional[str]) -> dict:
    _, active, _, rec, t = _context(event_id, cid, owner_id)
    plan = Plan.model_validate(active)
    new_expenses, warnings = _apply_to_expenses(plan.expenses, rec, t)
    before = plan.budget
    after = budget_service.summarize(before.budget_paise, new_expenses)
    if not after.within_budget:
        warnings.append(
            f"This puts the plan over budget by Rs {after.overrun_paise / 100:,.0f}."
        )
    return {
        "caterer_id": rec.id,
        "caterer_name": rec.name,
        "total_paise": t["total_paise"],
        "base_version": active["version"],
        "before": {
            "budget_paise": before.budget_paise,
            "catering_paise": before.category_totals.get("catering", 0),
            "allocated_paise": before.allocated_paise,
            "remaining_paise": before.remaining_paise,
        },
        "after": {
            "budget_paise": after.budget_paise,
            "catering_paise": after.category_totals.get("catering", 0),
            "allocated_paise": after.allocated_paise,
            "remaining_paise": after.remaining_paise,
            "within_budget": after.within_budget,
        },
        "warnings": warnings,
    }


def apply_budget(event_id: str, cid: str, base_version: int,
                 expected_total_paise: Optional[int],
                 owner_id: Optional[str]) -> dict:
    """Write the caterer's total into the plan as a new plan version."""
    _, active, store, rec, t = _context(event_id, cid, owner_id)
    if active["version"] != base_version:
        raise StalePlan(
            f"The plan changed (now version {active['version']}). Review the "
            "budget impact again before applying."
        )
    if expected_total_paise is not None and expected_total_paise != t["total_paise"]:
        raise StalePlan(
            "The caterer total changed since you reviewed it. Review the "
            "budget impact again before applying."
        )

    plan = Plan.model_validate(active)
    new_expenses, _ = _apply_to_expenses(plan.expenses, rec, t)
    summary = budget_service.summarize(plan.budget.budget_paise, new_expenses)
    errors = budget_service.validate_arithmetic(summary, new_expenses)
    if errors:
        raise InvalidProposal("; ".join(errors))

    new_plan = plan.model_copy(update={
        "id": f"plan-{uuid.uuid4().hex[:10]}",
        "version": active["version"] + 1,
        "expenses": new_expenses,
        "budget": summary,
        "change_summary": f"Catering set to {rec.name}",
        "created_at": _now(),
        "is_active": True,
    })
    try:
        es.get_repository().commit_approved_plan(
            event_id, new_plan.model_dump(mode="json"), base_version
        )
    except StaleActivePlan as exc:
        raise StalePlan(str(exc)) from exc

    for r in store["records"]:
        r.selected = r.id == rec.id
        if r.id == rec.id:
            r.applied_total_paise = t["total_paise"]
            r.applied_plan_version = new_plan.version
    _save(event_id, store["food_preference"], store["records"])
    return {"plan_version": new_plan.version,
            "overview": overview(event_id, owner_id)}
