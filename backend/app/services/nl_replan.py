"""Natural-language → structured ReplanRequest interpretation.

Gemini is used ONLY to interpret a free-text change request into a strict,
validated intent. It is never the authority for arithmetic, dates, feasibility
or persistence — the deterministic change engine and budget service do all of
that downstream.

Design rules (mirrors docs/AI_PROMPTS.md separation):
- Gemini returns a tiny JSON intent; Python validates every field against the
  real ReplanRequest / ChangeType contracts before anything else runs.
- Missing required values are NEVER invented — they trigger a clarification.
- Ambiguous / unsupported requests return a clarification, not an arbitrary
  change.
- All Gemini failure modes (no key, timeout, quota, malformed JSON) degrade to
  a graceful clarification response, clearly marked, so the caller can prompt
  the user to use the structured controls.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from app.models.change import ChangeType, ReplanRequest
from app.models.event import Event
from app.services import gemini_client
from app.services.gemini_client import (
    GeminiError,
    GeminiTimeout,
    GeminiUnavailable,
)

# Bounds mirror the Pydantic models (EventCreate / ReplanRequest) so the UI and
# the AI path reject the same out-of-range values.
GUEST_MIN, GUEST_MAX = 1, 100_000
BUDGET_MIN_INR = 1


@dataclass
class Interpretation:
    """Result of interpreting a natural-language change request."""

    status: str  # "interpreted" | "needs_clarification" | "unavailable"
    source: str = "gemini"  # how the intent was produced (never "deterministic")
    replan_request: Optional[ReplanRequest] = None
    # Human-readable echo of what we understood (shown to the user for trust).
    understood: str = ""
    message: str = ""
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "source": self.source,
            "replan_request": (
                self.replan_request.model_dump(mode="json")
                if self.replan_request
                else None
            ),
            "understood": self.understood,
            "message": self.message,
            "reasons": self.reasons,
        }


_SYSTEM = (
    "You interpret a user's event-change request into a STRICT JSON intent. "
    "You do NOT plan, calculate money, or decide feasibility. Return JSON only "
    "with keys: change_type (one of budget, guest_count, event_date, "
    "preferences, hard_constraints, or the literal 'unclear'), "
    "new_budget_inr (number or null), new_guest_count (integer or null), "
    "new_event_date (YYYY-MM-DD or null), new_preferences (array of "
    "{label, rank} or null), new_hard_constraints (array of strings or null), "
    "and understood (a one-sentence paraphrase). "
    "Never invent a value the user did not state: if a required value is "
    "missing or the request is ambiguous or unsupported, set change_type to "
    "'unclear' and explain in 'understood'. Only ONE change_type per request; "
    "if several are requested, pick the primary money/guest/date change and "
    "note the rest in 'understood'."
)


def _prompt(event: Event, text: str) -> str:
    return (
        "Current event context (for grounding only — do not change these unless "
        "the user asks):\n"
        f"- type: {event.event_type.value}\n"
        f"- date: {event.event_date.isoformat()}\n"
        f"- guests: {event.guest_count}\n"
        f"- budget_inr: {event.budget_paise / 100:.0f}\n"
        f"- current hard constraints: {list(event.hard_constraints)}\n"
        f"- current preferences: {[p.model_dump() for p in event.preferences]}\n\n"
        f'User request: "{text.strip()}"\n\n'
        "Return the JSON intent now."
    )


def _clarify(message: str, *, understood: str = "",
             reasons: Optional[list[str]] = None,
             source: str = "gemini") -> Interpretation:
    return Interpretation(
        status="needs_clarification",
        source=source,
        understood=understood,
        message=message,
        reasons=reasons or [],
    )


def _as_change_type(raw: Any) -> Optional[ChangeType]:
    if not isinstance(raw, str):
        return None
    key = raw.strip().lower()
    try:
        return ChangeType(key)
    except ValueError:
        return None


def _num(raw: Any) -> Optional[float]:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        cleaned = raw.replace(",", "").replace("₹", "").replace("inr", "",).strip()
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _build_request(data: dict) -> Interpretation:
    """Validate a parsed Gemini intent into a ReplanRequest or a clarification."""
    understood = ""
    if isinstance(data.get("understood"), str):
        understood = data["understood"].strip()[:280]

    ct = _as_change_type(data.get("change_type"))
    if ct is None:
        return _clarify(
            "I couldn't tell which supported change you meant. Try a budget, "
            "guest-count, date, preferences or hard-constraints change — or use "
            "the controls below.",
            understood=understood,
        )

    # --- budget ---
    if ct == ChangeType.budget:
        val = _num(data.get("new_budget_inr"))
        if val is None:
            return _clarify(
                "What budget should I use? For example: "
                "\u201creduce the budget to \u20b975,000\u201d.",
                understood=understood,
            )
        if val < BUDGET_MIN_INR:
            return _clarify(
                f"That budget ({val:g}) is too low. Please give a positive "
                "amount in rupees.",
                understood=understood,
            )
        return Interpretation(
            status="interpreted", understood=understood,
            replan_request=ReplanRequest(
                change_type=ct, new_budget_inr=round(val, 2)
            ),
        )

    # --- guest count ---
    if ct == ChangeType.guest_count:
        val = _num(data.get("new_guest_count"))
        if val is None:
            return _clarify(
                "How many guests should I plan for? For example: "
                "\u201cchange guests to 120\u201d.",
                understood=understood,
            )
        count = int(round(val))
        if count < GUEST_MIN or count > GUEST_MAX:
            return _clarify(
                f"A guest count of {count} is out of the supported range "
                f"({GUEST_MIN}\u2013{GUEST_MAX}).",
                understood=understood,
            )
        return Interpretation(
            status="interpreted", understood=understood,
            replan_request=ReplanRequest(
                change_type=ct, new_guest_count=count
            ),
        )

    # --- event date ---
    if ct == ChangeType.event_date:
        raw = data.get("new_event_date")
        if not isinstance(raw, str) or not raw.strip():
            return _clarify(
                "What date should the event move to? Please give it as "
                "YYYY-MM-DD.",
                understood=understood,
            )
        try:
            parsed = date.fromisoformat(raw.strip())
        except ValueError:
            return _clarify(
                f"I couldn't read \u201c{raw}\u201d as a date. Please use "
                "YYYY-MM-DD.",
                understood=understood,
            )
        if parsed < date.today():
            return _clarify(
                "That date is in the past. Please choose today or a future "
                "date.",
                understood=understood,
            )
        return Interpretation(
            status="interpreted", understood=understood,
            replan_request=ReplanRequest(
                change_type=ct, new_event_date=parsed
            ),
        )

    # --- preferences ---
    if ct == ChangeType.preferences:
        prefs = _coerce_preferences(data.get("new_preferences"))
        if not prefs:
            return _clarify(
                "Which categories should I prioritise, and in what order? For "
                "example: \u201cprioritise catering, then venue\u201d.",
                understood=understood,
            )
        return Interpretation(
            status="interpreted", understood=understood,
            replan_request=ReplanRequest(
                change_type=ct, new_preferences=prefs
            ),
        )

    # --- hard constraints ---
    if ct == ChangeType.hard_constraints:
        cons = _coerce_str_list(data.get("new_hard_constraints"))
        if not cons:
            return _clarify(
                "What hard constraint should I add? For example: "
                "\u201cvegetarian catering only\u201d.",
                understood=understood,
            )
        return Interpretation(
            status="interpreted", understood=understood,
            replan_request=ReplanRequest(
                change_type=ct, new_hard_constraints=cons
            ),
        )

    return _clarify(
        "That change isn't supported yet. You can change budget, guests, date, "
        "preferences or hard constraints.",
        understood=understood,
    )


def _coerce_preferences(raw: Any) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for i, entry in enumerate(raw):
        if not isinstance(entry, dict):
            continue
        label = entry.get("label")
        if not isinstance(label, str) or not label.strip():
            continue
        rank = entry.get("rank")
        rank_int = int(rank) if isinstance(rank, (int, float)) and rank >= 1 else i + 1
        out.append({"label": label.strip().lower()[:120], "rank": rank_int})
    return out


def _coerce_str_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [s.strip()[:160] for s in raw if isinstance(s, str) and s.strip()]


def interpret(event: Event, text: str) -> Interpretation:
    """Interpret a natural-language change request for the given event.

    Returns an Interpretation. Never raises for Gemini failures — those become
    a clarification/unavailable response the caller can surface to the user.
    """
    if not text or not text.strip():
        return _clarify("Please describe the change you'd like to make.")

    try:
        data = gemini_client.generate_json(_prompt(event, text), system=_SYSTEM)
    except GeminiUnavailable:
        return Interpretation(
            status="unavailable",
            source="unavailable",
            message=(
                "The natural-language assistant isn't configured right now. "
                "Please use the structured controls below to make your change."
            ),
        )
    except GeminiTimeout:
        return Interpretation(
            status="unavailable",
            source="unavailable",
            message=(
                "Interpreting your request took too long. Please try again, or "
                "use the structured controls below."
            ),
        )
    except GeminiError:
        # Covers quota exhaustion, SDK/network errors, malformed JSON, etc.
        return Interpretation(
            status="unavailable",
            source="unavailable",
            message=(
                "I couldn't interpret that request just now. Please try "
                "rephrasing, or use the structured controls below."
            ),
        )

    if not isinstance(data, dict):
        return _clarify(
            "I couldn't interpret that request. Please rephrase it, or use the "
            "structured controls below."
        )
    return _build_request(data)
