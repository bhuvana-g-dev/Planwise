// Phone normalisation — mirrors backend/app/services/phone.py exactly so the
// import preview shows what the server will store. The server re-validates.
//
// - "+<digits>" / "00<digits>": international, kept (E.164, 8–15 digits);
//   +91 must have exactly 10 national digits.
// - 10 digits starting 6–9:           Indian mobile  -> +91XXXXXXXXXX
// - 11 digits starting 0 (trunk):     Indian number  -> +91 + 10 digits
// - 12 digits starting 91:            "+" missing    -> +91XXXXXXXXXX
// - anything else: invalid (never guessed). International numbers are never
//   rewritten to +91.

export interface PhoneResult {
  e164: string | null;
  valid: boolean;
  isMobile: boolean;
  reason: string;
}

const SEPARATORS = /[\s\-.()\u00a0]/g;
const MULTI = /\s*[/,;|]\s*|\s+or\s+/i;

const bad = (reason: string): PhoneResult => ({ e164: null, valid: false, isMobile: false, reason });
const ok = (e164: string, isMobile: boolean): PhoneResult => ({ e164, valid: true, isMobile, reason: "" });

function indiaNational(nat: string): PhoneResult {
  if (nat.length !== 10 || !/^\d+$/.test(nat)) return bad("Indian numbers need 10 digits");
  if (nat[0] === "0") return bad("Number can't start with 0");
  return ok("+91" + nat, "6789".includes(nat[0]));
}

export function normalizePhone(raw: string | null | undefined): PhoneResult {
  if (raw === null || raw === undefined) return bad("No number");
  let s = String(raw).trim().replace(SEPARATORS, "");
  s = s.split(/(?:ext|x)\d+$/i)[0];
  if (!s) return bad("No number");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    if (!/^\d+$/.test(digits)) return bad("Contains invalid characters");
    if (digits.startsWith("91")) return indiaNational(digits.slice(2));
    if (digits.length < 8 || digits.length > 15)
      return bad("International numbers need 8–15 digits");
    return ok("+" + digits, false);
  }
  if (!/^\d+$/.test(s)) return bad("Contains invalid characters");
  if (s.length === 10) {
    if ("6789".includes(s[0])) return ok("+91" + s, true);
    return bad("10-digit numbers must start with 6–9; add the country code for other numbers");
  }
  if (s.length === 11 && s[0] === "0") return indiaNational(s.slice(1));
  if (s.length === 12 && s.startsWith("91")) return indiaNational(s.slice(2));
  return bad("Unrecognised length — include the country code, e.g. +91 98765 43210");
}

/** Best number from a value that may hold several (prefers a valid mobile). */
export function bestPhone(raw: string | null | undefined): PhoneResult {
  if (raw === null || raw === undefined || !String(raw).trim()) return normalizePhone(raw);
  const parts = String(raw).split(MULTI).filter((p) => p.trim());
  const results = (parts.length ? parts : [String(raw)]).map(normalizePhone);
  return (
    results.find((r) => r.valid && r.isMobile) ??
    results.find((r) => r.valid) ??
    results[0]
  );
}

export const nameKey = (name: string) => (name || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");

/** Readable Indian format: +91 98765 43210 (others shown as E.164). */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
