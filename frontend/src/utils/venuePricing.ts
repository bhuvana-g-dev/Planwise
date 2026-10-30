// Display helpers for venue prices. The backend decides which price applies
// (quote > listed > draft estimate) and its budget status; this only formats.
import type { PriceKind, VenueBudgetStatus, VenuePrice } from "../types";
import { formatINR } from "./format";

export const ESTIMATE_LABEL = "Estimated — confirm with venue";

/** "₹3,500 – ₹25,000" for a range, "₹12,000" for one price, null if none. */
export function formatPriceRange(p: VenuePrice): string | null {
  if (p.min_paise === null || p.max_paise === null) return null;
  if (p.min_paise === p.max_paise) return formatINR(p.min_paise);
  return `${formatINR(p.min_paise)} – ${formatINR(p.max_paise)}`;
}

export const STATUS_LABEL: Record<VenueBudgetStatus, string> = {
  within: "Within budget",
  possibly_within: "Possibly within budget",
  outside: "Outside budget",
  unknown: "Budget fit unknown",
};

export const STATUS_STYLE: Record<VenueBudgetStatus, string> = {
  within: "bg-emerald-100 text-emerald-800",
  possibly_within: "bg-amber-100 text-amber-800",
  outside: "bg-rose-100 text-rose-700",
  unknown: "bg-sand-200 text-slate-600",
};

export const KIND_STYLE: Record<PriceKind, string> = {
  quoted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  listed: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  estimated: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  unavailable: "bg-sand-100 text-slate-500 ring-1 ring-sand-300",
};

/** One-line explanation of the budget comparison. */
export function statusDetail(p: VenuePrice): string {
  const b = p.budget_paise;
  if (b === null || p.min_paise === null || p.max_paise === null) return "";
  if (p.budget_status === "within") {
    return p.min_paise === p.max_paise
      ? `${formatINR(b - p.max_paise)} under`
      : "even at the top of the range";
  }
  if (p.budget_status === "possibly_within")
    return `fits if it's ${formatINR(b)} or less`;
  if (p.budget_status === "outside")
    return `${formatINR(p.min_paise - b)} over at the lowest`;
  return "";
}

/** Parse a comma list into clean, de-duplicated inclusions. */
export function parseIncludes(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, 15);
}

export function validateQuote(
  amountText: string,
  scope: "rental_only" | "package",
  includes: string[]
): string | null {
  const n = Number(amountText);
  if (!amountText.trim() || Number.isNaN(n)) return "Enter the quoted amount";
  if (n <= 0) return "The quote must be more than ₹0";
  if (n > 100_000_000) return "That amount looks too large";
  if (scope === "rental_only" && includes.length > 0)
    return "Rental-only prices don't include extras — choose 'Event package'";
  return null;
}
