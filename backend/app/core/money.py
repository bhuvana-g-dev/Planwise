"""Money helpers.

All monetary values are stored internally as **integer paise** to avoid
floating-point error. 1 INR = 100 paise. Display formatting happens only at
the presentation boundary.
"""
from __future__ import annotations


def rupees_to_paise(rupees: float | int) -> int:
    """Convert a rupee amount to integer paise (rounded to nearest paise)."""
    return int(round(float(rupees) * 100))


def paise_to_rupees(paise: int) -> float:
    """Convert integer paise to a rupee float (2 dp)."""
    return round(paise / 100, 2)


def format_inr(paise: int) -> str:
    """Format integer paise as an INR string using the Indian numbering system.

    Example: 3000000 paise -> '₹30,000.00'
    """
    negative = paise < 0
    paise = abs(paise)
    whole = paise // 100
    frac = paise % 100

    digits = str(whole)
    if len(digits) <= 3:
        grouped = digits
    else:
        last3 = digits[-3:]
        rest = digits[:-3]
        parts = []
        while len(rest) > 2:
            parts.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            parts.insert(0, rest)
        grouped = ",".join(parts) + "," + last3

    sign = "-" if negative else ""
    return f"{sign}₹{grouped}.{frac:02d}"
