import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider } from "../services/api";
import type { VenuePrice } from "../types";
import {
  ESTIMATE_LABEL,
  formatPriceRange,
  parseIncludes,
  statusDetail,
  validateQuote,
} from "../utils/venuePricing";

const price = (over: Partial<VenuePrice>): VenuePrice => ({
  kind: "estimated",
  label: ESTIMATE_LABEL,
  min_paise: 3_500_00,
  max_paise: 25_000_00,
  scope: "rental_only",
  scope_label: "Venue rental only",
  package_includes: [],
  verified: false,
  budget_paise: null,
  budget_status: "unknown",
  note: "",
  ...over,
});

describe("venue price display", () => {
  it("uses the exact estimate label", () => {
    expect(ESTIMATE_LABEL).toBe("Estimated — confirm with venue");
  });

  it("formats a range and a single price", () => {
    expect(formatPriceRange(price({}))).toMatch(/3,500.*25,000/);
    expect(formatPriceRange(price({ min_paise: 12_000_00, max_paise: 12_000_00 }))).toMatch(/^₹12,000$/);
  });

  it("returns null when no price exists", () => {
    expect(formatPriceRange(price({ kind: "unavailable", min_paise: null, max_paise: null }))).toBeNull();
  });

  it("explains each budget status", () => {
    expect(statusDetail(price({ budget_paise: 30_000_00, budget_status: "within" }))).toMatch(/top of the range/);
    expect(statusDetail(price({ budget_paise: 10_000_00, budget_status: "possibly_within" }))).toMatch(/10,000 or less/);
    expect(statusDetail(price({ min_paise: 40_000_00, max_paise: 5_00_000_00, budget_paise: 30_000_00, budget_status: "outside" }))).toMatch(/10,000 over/);
    expect(statusDetail(price({ budget_status: "unknown" }))).toBe("");
  });
});

describe("quote validation", () => {
  it("requires a positive amount", () => {
    expect(validateQuote("", "rental_only", [])).toBeTruthy();
    expect(validateQuote("0", "rental_only", [])).toBeTruthy();
    expect(validateQuote("-10", "rental_only", [])).toBeTruthy();
    expect(validateQuote("18000", "rental_only", [])).toBeNull();
  });

  it("rejects inclusions on a rental-only price", () => {
    expect(validateQuote("18000", "rental_only", ["Catering"])).toBeTruthy();
    expect(validateQuote("150000", "package", ["Catering"])).toBeNull();
  });

  it("cleans package inclusions", () => {
    expect(parseIncludes(" Catering, ,Decor, Catering ")).toEqual(["Catering", "Decor"]);
  });
});

describe("venue quote api", () => {
  afterEach(() => {
    setTokenProvider(async () => null);
    vi.restoreAllMocks();
  });

  it("PUTs a quote for a venue", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }) as Response);
    await api.saveVenueQuote("evt-1", "venue-osm-a/b", {
      amount_inr: 18000,
      scope: "package",
      package_includes: ["Catering"],
      notes: "",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/events/evt-1/venues/venue-osm-a%2Fb/quote");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string).scope).toBe("package");
  });

  it("uses the event-scoped search so quotes apply", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ results: [], total: 0, page: 1, page_size: 12, total_pages: 1, source_mode: "demo", disclaimer: "", prices: {} }),
        { status: 200 }
      ) as Response
    );
    await api.searchEventVenues("evt-1", { max_price_inr: 30000, budget_match: "within", sort: "fit" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/events/evt-1/venues/search");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.budget_match).toBe("within");
    expect(body.sort).toBe("fit");
  });
});
