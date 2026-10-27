import { describe, expect, it } from "vitest";
import {
  deriveMilestones,
  milestoneProgress,
  nextAction,
} from "../utils/milestones";
import type { EventDetail } from "../types";

function baseDetail(over: Partial<EventDetail> = {}): EventDetail {
  return {
    event: {
      id: "evt-1",
      name: "Test",
      event_type: "birthday",
      event_date: "2099-01-01",
      location: "Madurai",
      guest_count: 50,
      budget_paise: 3000000,
      created_at: "",
      updated_at: "",
    },
    active_plan: null,
    plans: [],
    vendors: [],
    guests: [],
    guest_summary: {
      total_guests: 0,
      total_headcount: 0,
      confirmed_headcount: 0,
      by_status: {},
      by_group: {},
      dietary_counts: {},
      accessibility_counts: {},
    },
    venue_shortlist: [],
    selected_venue: null,
    ...over,
  } as EventDetail;
}

describe("deriveMilestones", () => {
  it("only 'created' is done for a brand-new event; next is the plan step", () => {
    const ms = deriveMilestones(baseDetail(), "evt-1");
    const created = ms.find((m) => m.key === "created")!;
    const plan = ms.find((m) => m.key === "plan")!;
    expect(created.status).toBe("done");
    expect(plan.status).toBe("current"); // first non-done becomes current
    // No milestone is fabricated as done.
    expect(ms.filter((m) => m.status === "done")).toHaveLength(1);
    expect(milestoneProgress(ms)).toBe(Math.round((1 / ms.length) * 100));
    expect(nextAction(ms)?.key).toBe("plan");
  });

  it("marks venue done only when a venue is actually selected", () => {
    const withVenue = baseDetail({
      selected_venue: {
        id: "v1",
        name: "Hall",
        venue_type: "banquet_hall",
        location: "Madurai",
        city: "Madurai",
        est_price_paise: null,
        capacity: 0,
        indoor: true,
        outdoor: false,
        amenities: [],
        lat: null,
        lng: null,
        image_url: "",
        contact: "",
        source: "osm",
        notes: "",
      },
    });
    const ms = deriveMilestones(withVenue, "evt-1");
    expect(ms.find((m) => m.key === "venue")!.status).toBe("done");
  });

  it("flags final preparations as overdue when a task is past due and not done", () => {
    const detail = baseDetail({
      active_plan: {
        id: "p1",
        event_id: "evt-1",
        version: 1,
        overview: "",
        expenses: [],
        allocations: [],
        tasks: [
          {
            id: "t1",
            name: "Book venue",
            description: "",
            priority: "high",
            due_date: "2000-01-01", // long past
            status: "ready",
            depends_on: [],
            related_category: "venue",
          },
        ],
        recommendations: [],
        vendor_questions: [],
        risks: [],
        open_decisions: [],
        budget: {
          budget_paise: 3000000,
          allocated_paise: 0,
          committed_paise: 0,
          remaining_paise: 3000000,
          overrun_paise: 0,
          within_budget: true,
          utilization_pct: 0,
          category_totals: {},
        },
        generated_by: "deterministic",
        change_summary: "",
        created_at: "",
        is_active: true,
      },
    });
    const ms = deriveMilestones(detail, "evt-1");
    const tasksMs = ms.find((m) => m.key === "tasks")!;
    expect(tasksMs.status).toBe("overdue");
    // nextAction prioritizes overdue
    expect(nextAction(ms)?.key).toBe("tasks");
  });
});
