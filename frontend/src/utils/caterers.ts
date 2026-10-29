// Pure helpers for the caterer module. The live estimate in the form mirrors
// the backend formula exactly (integer paise), but the backend remains the
// authority — every saved total is recomputed server-side.
import type {
  BookingStatus,
  CatererInput,
  FoodType,
  PaymentStatus,
  PriceSource,
} from "../types";

export const toPaise = (rupees: number | null | undefined) =>
  Math.round(Number(rupees || 0) * 100);

export interface Estimate {
  guests: number;
  basePaise: number;
  computedPaise: number;
  totalPaise: number;
  advancePaise: number;
  balancePaise: number;
  paidPct: number;
  hasPrice: boolean;
  isFixed: boolean;
  payment: PaymentStatus;
}

/** Estimated total = guests x price per guest + extras (or fixed price). */
export function estimate(input: CatererInput, eventHeadcount: number): Estimate {
  const guests = input.guest_count ?? eventHeadcount;
  const ppg = toPaise(input.price_per_guest_inr);
  const basePaise = guests * ppg;
  const computedPaise = basePaise + toPaise(input.extras_inr);
  const isFixed =
    input.fixed_total_inr !== null && input.fixed_total_inr !== undefined;
  const totalPaise = isFixed ? toPaise(input.fixed_total_inr) : computedPaise;
  const advancePaise = toPaise(input.advance_paid_inr);
  const hasPrice = isFixed || ppg > 0;
  let payment: PaymentStatus;
  if (input.refunded) payment = "refunded";
  else if (advancePaise <= 0) payment = "unpaid";
  else if (advancePaise < totalPaise) payment = "partially_paid";
  else payment = "paid";
  return {
    guests,
    basePaise,
    computedPaise,
    totalPaise,
    advancePaise,
    balancePaise: totalPaise - advancePaise,
    paidPct: totalPaise > 0 ? Math.min(100, (advancePaise / totalPaise) * 100) : 0,
    hasPrice,
    isFixed,
    payment,
  };
}

/** Same rules the backend enforces, so users see problems before saving. */
export function validateCaterer(
  input: CatererInput,
  eventHeadcount: number
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!input.name?.trim())
    e.name = "Add the caterer's name or a short description";
  const g = input.guest_count;
  if (g !== null && g !== undefined && (!Number.isInteger(g) || g < 1))
    e.guest_count = "Guests must be a whole number of 1 or more";
  for (const k of [
    "price_per_guest_inr",
    "extras_inr",
    "advance_paid_inr",
    "fixed_total_inr",
  ] as const) {
    const v = input[k];
    if (v !== null && v !== undefined && (Number.isNaN(v) || v < 0))
      e[k] = "Must be zero or more";
  }
  const isFixed =
    input.fixed_total_inr !== null && input.fixed_total_inr !== undefined;
  if (isFixed && !input.fixed_total_reason?.trim())
    e.fixed_total_reason = "Say why the price is fixed (e.g. negotiated package)";
  const est = estimate(input, eventHeadcount);
  if (est.advancePaise > 0 && !est.hasPrice)
    e.advance_paid_inr = "Enter the agreed price before recording an advance";
  else if (est.hasPrice && est.advancePaise > est.totalPaise)
    e.advance_paid_inr = "Advance can't be more than the agreed total";
  if (
    input.min_guests &&
    input.max_guests &&
    input.min_guests > input.max_guests
  )
    e.max_guests = "Maximum must be at least the minimum";
  return e;
}

export const FOOD_LABEL: Record<FoodType, string> = {
  veg: "Vegetarian",
  nonveg: "Non-vegetarian",
  both: "Veg & non-veg",
};

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  not_booked: "Not booked",
  requested: "Quote / booking requested",
  confirmed: "Confirmed by you",
  cancelled: "Cancelled",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid in full",
  refunded: "Refunded",
};

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  published: "Published price",
  estimated: "Your estimate",
  quoted: "Quoted by caterer",
  quote_needed: "Quote needed",
};

export const DIET_LABEL: Record<string, string> = {
  pure_veg: "Pure veg",
  veg_options: "Veg options",
  non_veg: "Non-veg",
  unknown: "Diet info not listed",
};

export const INCLUSION_PRESETS = [
  "Serving staff",
  "Plates & cutlery",
  "Transport",
  "Setup & cleanup",
  "Tables & linen",
  "Drinking water",
  "Live counters",
];

export const MENU_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
  "custom",
] as const;

export function emptyCaterer(): CatererInput {
  return {
    name: "",
    source: "manual",
    menu_types: [],
    food_type: "veg",
    cuisines: [],
    menu: { starters: "", mains: "", desserts: "", beverages: "" },
    inclusions: [],
    guest_count: null,
    price_per_guest_inr: 0,
    extras_inr: 0,
    fixed_total_inr: null,
    fixed_total_reason: "",
    advance_paid_inr: 0,
    price_source: "quoted",
    min_guests: null,
    max_guests: null,
    booking_status: "not_booked",
    refunded: false,
    notes: "",
    phone: "",
    email: "",
    website: "",
    address: "",
  };
}

/** Normalise a phone string into a tel: href (keeps + and digits). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;
}
