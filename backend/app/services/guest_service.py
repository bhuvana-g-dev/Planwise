"""Deterministic guest/RSVP rollups."""
from __future__ import annotations

from collections import defaultdict

from app.models.guest import Guest, GuestSummary, RsvpStatus


def _heads(g: Guest) -> int:
    """A guest counts as 1 + their plus-ones."""
    return 1 + g.plus_ones


def summarize(guests: list[Guest]) -> GuestSummary:
    by_status: dict[str, int] = defaultdict(int)
    by_group: dict[str, int] = defaultdict(int)
    dietary: dict[str, int] = defaultdict(int)
    access: dict[str, int] = defaultdict(int)

    confirmed_head = 0
    attending_head = 0  # confirmed + tentative

    for g in guests:
        heads = _heads(g)
        by_status[g.rsvp.value] += heads
        group = g.group.strip() or "ungrouped"
        by_group[group] += heads
        for d in g.dietary:
            dietary[d.strip().lower()] += heads
        for a in g.accessibility:
            access[a.strip().lower()] += heads
        if g.rsvp == RsvpStatus.confirmed:
            confirmed_head += heads
            attending_head += heads
        elif g.rsvp == RsvpStatus.tentative:
            attending_head += heads

    return GuestSummary(
        total_guests=len(guests),
        total_headcount=attending_head,
        confirmed_headcount=confirmed_head,
        by_status=dict(by_status),
        by_group=dict(by_group),
        dietary_counts=dict(dietary),
        accessibility_counts=dict(access),
    )
