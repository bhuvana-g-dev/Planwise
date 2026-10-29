import { describe, expect, it } from "vitest";
import {
  emptyCaterer,
  estimate,
  safeUrl,
  telHref,
  validateCaterer,
} from "../utils/caterers";

const base = () => ({ ...emptyCaterer(), name: "Annapoorna" });

describe("caterer estimate", () => {
  it("multiplies guests by price per guest", () => {
    const e = estimate({ ...base(), guest_count: 200, price_per_guest_inr: 250 }, 50);
    expect(e.totalPaise).toBe(50000 * 100);
    expect(e.balancePaise).toBe(50000 * 100);
    expect(e.payment).toBe("unpaid");
  });

  it("follows the event headcount when no guest count is fixed", () => {
    const e = estimate({ ...base(), price_per_guest_inr: 250 }, 250);
    expect(e.guests).toBe(250);
    expect(e.totalPaise).toBe(62500 * 100);
  });

  it("adds extras and subtracts the advance", () => {
    const e = estimate(
      {
        ...base(),
        guest_count: 200,
        price_per_guest_inr: 250,
        extras_inr: 5000,
        advance_paid_inr: 10000,
      },
      0
    );
    expect(e.totalPaise).toBe(55000 * 100);
    expect(e.balancePaise).toBe(45000 * 100);
    expect(e.payment).toBe("partially_paid");
  });

  it("uses a fixed package price over the per-guest maths", () => {
    const e = estimate(
      {
        ...base(),
        guest_count: 200,
        price_per_guest_inr: 250,
        fixed_total_inr: 45000,
        fixed_total_reason: "deal",
      },
      0
    );
    expect(e.isFixed).toBe(true);
    expect(e.totalPaise).toBe(45000 * 100);
  });
});

describe("caterer validation", () => {
  it("requires a name", () => {
    expect(validateCaterer({ ...emptyCaterer() }, 10).name).toBeTruthy();
  });

  it("rejects an advance above the total", () => {
    const errs = validateCaterer(
      { ...base(), guest_count: 10, price_per_guest_inr: 100, advance_paid_inr: 5000 },
      10
    );
    expect(errs.advance_paid_inr).toBeTruthy();
  });

  it("requires a reason for a fixed price", () => {
    const errs = validateCaterer({ ...base(), fixed_total_inr: 40000 }, 10);
    expect(errs.fixed_total_reason).toBeTruthy();
  });

  it("rejects non-positive guest counts and negative amounts", () => {
    const errs = validateCaterer(
      { ...base(), guest_count: 0, price_per_guest_inr: -1 },
      10
    );
    expect(errs.guest_count).toBeTruthy();
    expect(errs.price_per_guest_inr).toBeTruthy();
  });

  it("accepts a valid record with no contact details", () => {
    expect(
      validateCaterer({ ...base(), price_per_guest_inr: 200, advance_paid_inr: 500 }, 10)
    ).toEqual({});
  });
});

describe("link helpers", () => {
  it("builds tel: links from formatted numbers", () => {
    expect(telHref("+91 452 000-0000")).toBe("tel:+914520000000");
  });

  it("only allows http(s) URLs", () => {
    expect(safeUrl("example.com")).toBe("https://example.com/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});
