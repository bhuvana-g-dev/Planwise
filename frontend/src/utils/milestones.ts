import type { EventDetail } from "../types";

export type MilestoneStatus = "done" | "current" | "upcoming" | "overdue";

export interface Milestone {
  key: string;
  label: string;
  status: MilestoneStatus;
  to: string; // route to the relevant module
  detail: string; // short explanation of state / why it matters
}

/**
 * Derive the event-planning journey from REAL saved data only. Nothing here
 * invents completion state:
 *  - "Event created" is always done (the event exists).
 *  - "Budget / plan" done when an active plan exists.
 *  - "Venue selected" done when selected_venue is set.
 *  - "Guests invited" done when at least one guest row exists.
 *  - "Tasks" reflect the active plan's real task statuses.
 * The first non-done step is marked "current". Overdue is derived from real
 * task due dates that are past and not done.
 */
export function deriveMilestones(
  detail: EventDetail,
  eventId: string
): Milestone[] {
  const base = `/events/${eventId}`;
  const plan = detail.active_plan;
  const hasPlan = !!plan;
  const hasVenue = !!detail.selected_venue;
  const guestCount = detail.guest_summary?.total_guests ?? 0;
  const hasGuests = guestCount > 0;

  const tasks = plan?.tasks ?? [];
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.due_date && t.due_date < today
  ).length;
  const allTasksDone = tasks.length > 0 && doneTasks === tasks.length;

  const raw: Omit<Milestone, "status">[] = [
    {
      key: "created",
      label: "Event created",
      to: base,
      detail: "Your event details are saved.",
    },
    {
      key: "plan",
      label: "Plan & budget",
      to: `${base}/budget`,
      detail: hasPlan
        ? "A budget plan has been generated."
        : "Generate a plan to allocate your budget.",
    },
    {
      key: "venue",
      label: "Venue selected",
      to: `${base}/venues-discovery`,
      detail: hasVenue
        ? `Selected: ${detail.selected_venue?.name}`
        : "Find and select a venue.",
    },
    {
      key: "guests",
      label: "Guests invited",
      to: `${base}/guests`,
      detail: hasGuests
        ? `${guestCount} guest${guestCount === 1 ? "" : "s"} added.`
        : "Build your guest list and track RSVPs.",
    },
    {
      key: "menu",
      label: "Menu planned",
      to: `${base}/catering`,
      detail: "Plan catering and finalize the menu.",
    },
    {
      key: "tasks",
      label: "Final preparations",
      to: `${base}/timeline`,
      detail: tasks.length
        ? `${doneTasks} of ${tasks.length} tasks done${
            overdue ? ` · ${overdue} overdue` : ""
          }`
        : "Work through your task checklist.",
    },
  ];

  // Determine done flags from real data.
  const doneFlags: Record<string, boolean> = {
    created: true,
    plan: hasPlan,
    venue: hasVenue,
    guests: hasGuests,
    menu: false, // catering state isn't in event detail; never fake "done"
    tasks: allTasksDone,
  };

  let currentAssigned = false;
  return raw.map((m) => {
    let status: MilestoneStatus;
    if (doneFlags[m.key]) {
      status = "done";
    } else if (m.key === "tasks" && overdue > 0) {
      status = "overdue";
    } else if (!currentAssigned) {
      status = "current";
      currentAssigned = true;
    } else {
      status = "upcoming";
    }
    return { ...m, status };
  });
}

/** Overall progress 0-100 from the derived milestones (done share). */
export function milestoneProgress(milestones: Milestone[]): number {
  if (!milestones.length) return 0;
  const done = milestones.filter((m) => m.status === "done").length;
  return Math.round((done / milestones.length) * 100);
}

/** The next-best action: the current (or first overdue) milestone. */
export function nextAction(milestones: Milestone[]): Milestone | null {
  return (
    milestones.find((m) => m.status === "overdue") ??
    milestones.find((m) => m.status === "current") ??
    null
  );
}
