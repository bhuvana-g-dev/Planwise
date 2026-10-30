"""DRAFT estimated venue price bands — the single place to edit them.

!! These figures are UNVERIFIED DRAFT ESTIMATES, not market data. !!
They are rough starting points for a Tier-2 Indian city (e.g. Madurai) so the
app can show *something* useful before a real quote exists. Every price shown
from this table is labelled "Estimated — confirm with venue", and a user's own
quote always overrides it.

Edit the numbers below to correct them. Units: whole rupees, for ONE event day.
`scope` says what the price covers:
  - "rental_only": hire of the space only (no food, decor, staff extras).
  - "package":     venue plus some services (say which in `covers`).
Set a band to None when no sensible estimate exists — the UI then shows
"Price unavailable" instead of a guess.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.models.venue import VenueType

# Shown with every estimate. Kept here so wording stays consistent.
ESTIMATE_LABEL = "Estimated — confirm with venue"
BANDS_STATUS = "draft"   # change to "reviewed" once a human has checked them
BANDS_NOTE = (
    "Draft rupee ranges per event day for a Tier-2 Indian city. Not verified "
    "market data — real prices vary by city, season, day and inclusions."
)


@dataclass(frozen=True)
class PriceBand:
    min_inr: int
    max_inr: int
    scope: str = "rental_only"        # "rental_only" | "package"
    covers: str = "Venue rental only"  # human description of what's included


# ---- EDIT HERE -------------------------------------------------------------
PRICE_BANDS: dict[VenueType, Optional[PriceBand]] = {
    VenueType.community_hall:  PriceBand(3_500, 25_000),
    VenueType.conference_hall: PriceBand(8_000, 60_000),
    VenueType.outdoor_garden:  PriceBand(10_000, 1_00_000),
    VenueType.banquet_hall:    PriceBand(25_000, 2_00_000),
    VenueType.wedding_hall:    PriceBand(40_000, 5_00_000),
    VenueType.hotel:           PriceBand(50_000, 5_00_000),
    # Public beaches need permits rather than rental; resort lawns vary too
    # widely to estimate. "Other" is too broad to guess.
    VenueType.beach:           None,
    VenueType.other:           None,
}
# ---------------------------------------------------------------------------


def band_for(venue_type: VenueType) -> Optional[PriceBand]:
    """Return a validated band, or None if missing/invalid (never a guess)."""
    band = PRICE_BANDS.get(venue_type)
    if band is None:
        return None
    if band.min_inr < 0 or band.max_inr <= 0 or band.min_inr > band.max_inr:
        return None  # a mis-edited band is ignored rather than shown wrongly
    return band


def bands_table() -> list[dict]:
    """The table as data, for the UI's "how estimates work" panel."""
    rows = []
    for vt in VenueType:
        b = band_for(vt)
        rows.append({
            "venue_type": vt.value,
            "min_inr": b.min_inr if b else None,
            "max_inr": b.max_inr if b else None,
            "scope": b.scope if b else None,
            "covers": b.covers if b else None,
        })
    return rows
