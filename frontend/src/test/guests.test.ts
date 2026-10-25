import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider } from "../services/api";
import type { Guest } from "../types";

describe("guest api", () => {
  afterEach(() => {
    setTokenProvider(async () => null);
    vi.restoreAllMocks();
  });

  it("PUTs the guest list and returns summary", async () => {
    const guests: Guest[] = [
      {
        name: "Priya",
        group: "family",
        rsvp: "confirmed",
        plus_ones: 1,
        dietary: ["veg"],
        accessibility: [],
        contact: "",
        notes: "",
      },
    ];
    const responseBody = {
      guests: guests.map((g, i) => ({ ...g, id: `g-${i}` })),
      summary: {
        total_guests: 1,
        total_headcount: 2,
        confirmed_headcount: 2,
        by_status: { confirmed: 2 },
        by_group: { family: 2 },
        dietary_counts: { veg: 2 },
        accessibility_counts: {},
      },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }) as Response
      );

    const out = await api.saveGuests("evt-1", guests);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/events/evt-1/guests");
    expect((init as RequestInit).method).toBe("PUT");
    expect(out.summary.confirmed_headcount).toBe(2);
    expect(out.guests[0].id).toBe("g-0");
  });
});
