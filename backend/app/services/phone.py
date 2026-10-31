"""Phone number normalisation for guest contacts (India-first, E.164 out).

Rules (deliberately conservative — an ambiguous number is reported invalid
rather than guessed):

- "+<digits>" or "00<digits>": already international. Kept as-is (E.164,
  8–15 digits). If it is +91, the national part must be exactly 10 digits.
- 10 digits starting 6–9:                Indian mobile      -> +91XXXXXXXXXX
- 11 digits starting 0 (trunk prefix):   Indian number      -> +91 + 10 digits
- 12 digits starting 91 + valid 10:      Indian, "+" missing -> +91XXXXXXXXXX
- anything else (e.g. 7-digit local landline, 13 digits): invalid.

International numbers are never rewritten to +91.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

_SEPARATORS = re.compile(r"[\s\-\.\(\)\u00a0]")
# Split a cell that holds several numbers ("98765 43210 / 91234 56789").
_MULTI = re.compile(r"\s*[/,;|]\s*|\s+or\s+", re.IGNORECASE)


@dataclass(frozen=True)
class PhoneResult:
    e164: Optional[str]       # normalised number, or None when invalid
    valid: bool
    is_mobile: bool = False
    reason: str = ""          # why it is invalid (empty when valid)


def _india_national(nat: str) -> PhoneResult:
    """Validate a 10-digit Indian national significant number."""
    if len(nat) != 10 or not nat.isdigit():
        return PhoneResult(None, False, reason="Indian numbers need 10 digits")
    if nat[0] == "0":
        return PhoneResult(None, False, reason="Number can't start with 0")
    return PhoneResult("+91" + nat, True, is_mobile=nat[0] in "6789")


def normalize(raw: Optional[str]) -> PhoneResult:
    """Normalise one phone number string."""
    if raw is None:
        return PhoneResult(None, False, reason="No number")
    s = _SEPARATORS.sub("", str(raw).strip())
    # Drop a trailing extension ("x123", "ext123").
    s = re.split(r"(?i)(?:ext|x)\d+$", s)[0]
    if not s:
        return PhoneResult(None, False, reason="No number")

    if s.startswith("00"):
        s = "+" + s[2:]
    if s.startswith("+"):
        digits = s[1:]
        if not digits.isdigit():
            return PhoneResult(None, False, reason="Contains invalid characters")
        if digits.startswith("91"):
            return _india_national(digits[2:])
        if not 8 <= len(digits) <= 15:
            return PhoneResult(None, False,
                               reason="International numbers need 8–15 digits")
        return PhoneResult("+" + digits, True, is_mobile=False)

    if not s.isdigit():
        return PhoneResult(None, False, reason="Contains invalid characters")
    if len(s) == 10:
        if s[0] in "6789":
            return PhoneResult("+91" + s, True, is_mobile=True)
        return PhoneResult(None, False,
                           reason="10-digit numbers must start with 6–9; add "
                                  "the country code for other numbers")
    if len(s) == 11 and s[0] == "0":
        return _india_national(s[1:])
    if len(s) == 12 and s.startswith("91"):
        return _india_national(s[2:])
    return PhoneResult(None, False,
                       reason="Unrecognised length — include the country "
                              "code, e.g. +91 98765 43210")


def best_of(raw: Optional[str]) -> PhoneResult:
    """Pick the best number from a cell that may hold several.

    Prefers a valid mobile, then any valid number; otherwise returns the
    first part's result so the reason is shown.
    """
    if raw is None or not str(raw).strip():
        return normalize(raw)
    parts = [p for p in _MULTI.split(str(raw)) if p.strip()]
    results = [normalize(p) for p in parts] or [normalize(raw)]
    for r in results:
        if r.valid and r.is_mobile:
            return r
    for r in results:
        if r.valid:
            return r
    return results[0]


def name_key(name: str) -> str:
    """Case/space-insensitive key for name-based duplicate checks."""
    return " ".join((name or "").lower().split())
