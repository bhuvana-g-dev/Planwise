import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider } from "../services/api";
import { sourceLabelText } from "../components/VenueMap";
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

  // P4: recommendation preferences are sent to the endpoint
  it("sends indoor preference and required amenities to recommend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          generated_by: "deterministic",
          recommendations: [demoVenue],
          reasoning: "ok",
          disclaimer: "demo — not verified",
        }),
        { status: 200 }
      ) as Response
    );
    await api.recommendVenues("evt-1", "outdoor", ["parking", "ac"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/events/evt-1/venues/recommend");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.indoor_pref).toBe("outdoor");
    expect(body.required_amenities).toEqual(["parking", "ac"]);
  });

  // P5: max_capacity + amenities travel in the search query
  it("includes max_capacity and amenities in the search request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [],
          total: 0,
          page: 1,
          page_size: 12,
          total_pages: 1,
          source_mode: "demo",
          disclaimer: "demo",
        }),
        { status: 200 }
      ) as Response
    );
    await api.searchVenues({
      city: "Madurai",
      max_capacity: 300,
      amenities: ["ac"],
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.max_capacity).toBe(300);
    expect(body.amenities).toEqual(["ac"]);
  });
});

// P2: source-specific popup labels (pure helper, no map render needed)
describe("venue source labels", () => {
  it("labels demo venues as illustrative/unverified", () => {
    const t = sourceLabelText("demo").toLowerCase();
    expect(t).toContain("demo");
    expect(t).toMatch(/illustrative|unverified/);
  });

  it("labels OSM venues with OpenStreetMap attribution + unknown data note", () => {
    const t = sourceLabelText("osm").toLowerCase();
    expect(t).toContain("openstreetmap");
    expect(t).toMatch(/unknown|verify/);
  });

  it("labels user venues as user-provided, not verified", () => {
    const t = sourceLabelText("user").toLowerCase();
    expect(t).toContain("user");
    expect(t).toContain("not");
  });
});
