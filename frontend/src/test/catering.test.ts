import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider } from "../services/api";
import type { CateringPlan } from "../types";

const sampleState = {
  plan: {
    items: [
      {
        id: "mi-1",
        name: "Paneer Tikka",
        category: "starters",
        description: "",
        dietary: "vegetarian",
        cuisine: "",
        allergen_notes: "",
        servings_per_guest: 1,
        planned_quantity: 0,
        unit: "serving",
        unit_cost_paise: 9000,
        pricing_unit: "per_serving",
        cost_source: "estimate",
        caterer: "",
        status: "selected",
        required: false,
        notes: "",
        computed_quantity: 50,
        total_cost_paise: 450000,
      },
    ],
    preferences: {
      cuisines: [],
      dietary_restrictions: [],
      allergies: [],
      serving_style: "",
      meal_times: [],
      required_dishes: [],
      prohibited_ingredients: [],
      budget_per_guest_inr: null,
      vegetarian_only: true,
    },
    headcount_override: null,
  },
  summary: {
    headcount: {
      planned_guests: 50,
      confirmed_headcount: 0,
      attending_headcount: 0,
      pending_responses: 0,
      plus_ones: 0,
      catering_headcount: 50,
      source: "planned",
      override_differs: false,
    },
    total_paise: 450000,
    cost_per_guest_paise: 9000,
    category_totals: [
      { category: "starters", total_paise: 450000, item_count: 1 },
    ],
    catering_budget_paise: 1200000,
    remaining_paise: 750000,
    overrun_paise: 0,
    within_budget: true,
  },
};

describe("catering api", () => {
  afterEach(() => {
    setTokenProvider(async () => null);
    vi.restoreAllMocks();
  });

  it("PUTs the catering plan", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(sampleState), { status: 200 }) as Response
      );
    const plan: CateringPlan = sampleState.plan as CateringPlan;
    const out = await api.saveCatering("evt-1", plan);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/events/evt-1/catering");
    expect((init as RequestInit).method).toBe("PUT");
    expect(out.summary.cost_per_guest_paise).toBe(9000);
    expect(out.summary.within_budget).toBe(true);
  });

  it("POSTs an optimize request with the goal", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          goal: "lower_cost",
          feasible: true,
          before: sampleState.summary,
          after: sampleState.summary,
          proposed_plan: sampleState.plan,
          trade_offs: [],
          reasons: [],
          constraint_violations: [],
        }),
        { status: 200 }
      ) as Response
    );
    const out = await api.optimizeCatering("evt-1", "lower_cost");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/catering/optimize");
    expect(out.goal).toBe("lower_cost");
  });
});
