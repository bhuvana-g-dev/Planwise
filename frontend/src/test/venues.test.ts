import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider } from "../services/api";
import type { Venue } from "../types";

const demoVenue: Venue = {
  id: "venue-demo-1",
  name: "Riverside Banquet",
  venue_type: "banquet_hall",
  location: "Madurai, Tamil Nadu, India",
  city: "Madurai",
  est_price_paise: 6000000,
  capacity: 250,
  indoor: true,
  outdoor: false,
  amenities: ["parking", "ac"],
  lat: 9.9252,
  lng: 78.1198,
  image_url: "",
  contact: "",
  source: "demo",
  notes: "",
};

describe("venue api", () => {
  afterEach(() => {
    setTokenProvider(async () => null);
    vi.restoreAllMocks();
  });

  it("POSTs a search query and returns a page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [demoVenue],
          total: 1,
          page: 1,
          page_size: 12,
          total_pages: 1,
          source_mode: "demo",
          disclaimer: "Demo venues — not verified real businesses.",
        }),
        { status: 200 }
      ) as Response
    );
    const page = await api.searchVenues({ city: "Madurai", sort: "price" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/venues/search");
    expect((init as RequestInit).method).toBe("POST");
    expect(page.results[0].name).toBe("Riverside Banquet");
    expect(page.source_mode).toBe("demo");
  });

  it("selects a venue and returns budget comparison", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          venue: demoVenue,
          est_price_paise: 6000000,
          venue_budget_paise: 4000000,
          remaining_paise: -2000000,
          overrun_paise: 2000000,
          within_budget: false,
        }),
        { status: 200 }
      ) as Response
    );
    const sel = await api.selectVenue("evt-1", "venue-demo-1");
    expect(sel.within_budget).toBe(false);
    expect(sel.overrun_paise).toBe(2000000);
  });
});
