"""Vendor quotation comparison (deterministic; no invented data)."""
from __future__ import annotations

import uuid

from app.core.money import rupees_to_paise
from app.models.plan import VendorComparison, VendorQuote


def compare_quotes(quotes: list[VendorQuote]) -> VendorComparison:
    for q in quotes:
        if not q.id:
            q.id = f"vq-{uuid.uuid4().hex[:8]}"

    cheapest = None
    if quotes:
        cheapest = min(quotes, key=lambda q: q.amount_inr).vendor_name

    # "Best value" = most inclusions per rupee, among quotes with some inclusions.
    best_value = None
    scored = [
        (q, (len(q.inclusions) / q.amount_inr) if q.amount_inr > 0 else 0.0)
        for q in quotes
    ]
    scored = [s for s in scored if s[1] > 0]
    if scored:
        best_value = max(scored, key=lambda s: s[1])[0].vendor_name

    missing: dict[str, list[str]] = {}
    for q in quotes:
        gaps = []
        if not q.inclusions:
            gaps.append("inclusions")
        if not q.contact:
            gaps.append("contact")
        if not q.availability_verified:
            gaps.append("availability verification")
        if q.quote_date is None:
            gaps.append("quote date")
        if gaps:
            missing[q.vendor_name] = gaps

    questions = [
        "Which items are included vs charged separately?",
        "Are taxes and service charges included in the quoted amount?",
        "Can you confirm availability for our event date in writing?",
        "What is the payment schedule and cancellation policy?",
    ]
    notes = [
        "Quoted amounts are user-entered; availability is only 'verified' when "
        "you mark it so. PlanWise never invents vendor prices or availability.",
    ]
    return VendorComparison(
        quotes=quotes,
        cheapest_vendor=cheapest,
        best_value_vendor=best_value,
        missing_info=missing,
        questions=questions,
        notes=notes,
    )
