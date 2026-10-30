"""Resolve which price applies to a venue and compare it with a budget.

Precedence (first match wins):
  1. User quote for this event        -> "Quoted"       (verified by the user)
  2. Price on the venue record        -> demo sample / user-entered price
  3. Draft band for the venue type    -> "Estimated — confirm with venue"
  4. Nothing valid                    -> "Price unavailable"

Budget status (budget = max price in paise; boundaries are inclusive):
  - single price p:   within if p <= budget, else outside
  - range [lo, hi]:   within if hi <= budget,
                      possibly_within if lo <= budget < hi,
                      outside if lo > budget
  - no price or no budget: unknown
"""
from __future__ import annotations

from typing import Optional

from app.core.venue_price_bands import ESTIMATE_LABEL, band_for
from app.models.venue import Venue, VenueQuote, VenueSource, VenuePrice

SCOPE_LABEL = {
    "rental_only": "Venue rental only",
    "package": "Event package",
}


def budget_status(lo: Optional[int], hi: Optional[int],
                  budget: Optional[int]) -> str:
    if lo is None or hi is None or budget is None:
        return "unknown"
    if hi <= budget:
        return "within"
    if lo <= budget:
        return "possibly_within"
    return "outside"


def resolve(venue: Venue, quote: Optional[VenueQuote],
            budget_paise: Optional[int]) -> VenuePrice:
    """The price that applies to `venue`, compared with `budget_paise`."""
    if quote is not None:
        scope = quote.scope
        note = ""
        if scope == "package":
            inc = ", ".join(quote.package_includes) or "extra services"
            note = (f"Package price includes {inc}. Compare it with your "
                    "combined budget for those items, not venue rental alone.")
        return VenuePrice(
            kind="quoted", label="Quoted",
            min_paise=quote.amount_paise, max_paise=quote.amount_paise,
            scope=scope, scope_label=SCOPE_LABEL[scope],
            package_includes=quote.package_includes, verified=True,
            budget_paise=budget_paise,
            budget_status=budget_status(quote.amount_paise, quote.amount_paise,
                                        budget_paise),
            note=note,
        )

    if venue.est_price_paise is not None and venue.est_price_paise > 0:
        p = venue.est_price_paise
        if venue.source == VenueSource.demo:
            label, note = "Demo sample price", "Illustrative sample — not a real venue price."
        else:
            label, note = "Your entered price", "Entered when you added this venue."
        return VenuePrice(
            kind="listed", label=label, min_paise=p, max_paise=p,
            scope="rental_only", scope_label=SCOPE_LABEL["rental_only"],
            budget_paise=budget_paise,
            budget_status=budget_status(p, p, budget_paise), note=note,
        )

    band = band_for(venue.venue_type)
    if band is not None:
        lo, hi = band.min_inr * 100, band.max_inr * 100
        return VenuePrice(
            kind="estimated", label=ESTIMATE_LABEL, min_paise=lo, max_paise=hi,
            scope=band.scope, scope_label=band.covers,
            budget_paise=budget_paise,
            budget_status=budget_status(lo, hi, budget_paise),
            note="Draft range for this venue type, not this venue's real price.",
        )

    return VenuePrice(kind="unavailable", label="Price unavailable",
                      budget_paise=budget_paise, budget_status="unknown",
                      note="No quote or estimate for this venue type yet — "
                           "ask the venue and add their quote.")


def sort_low(p: VenuePrice) -> Optional[int]:
    return p.min_paise


def sort_high(p: VenuePrice) -> Optional[int]:
    return p.max_paise


FIT_RANK = {"within": 0, "possibly_within": 1, "unknown": 2, "outside": 3}
# Prefer more trustworthy prices when two are otherwise equal.
KIND_RANK = {"quoted": 0, "listed": 1, "estimated": 2, "unavailable": 3}
