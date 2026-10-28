import type {
  CateringOptimizeResult,
  CateringPlan,
  CateringPreferences,
  CateringState,
  EventCreate,
  EventDetail,
  EventRecord,
  GenerateMenuResult,
  Guest,
  GuestSummary,
  InterpretReplanResult,
  Plan,
  ReplanRequest,
  ReplanResult,
  SelectedVenue,
  Task,
  Venue,
  VenuePage,
  VenueQuery,
  VenueRecommendation,
  VendorComparison,
  VendorQuote,
} from "../types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Pluggable token provider. The app wires this to Firebase at startup; tests
// and anonymous mode leave it returning null (no Authorization header sent).
let tokenProvider: () => Promise<string | null> = async () => null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  tokenProvider = fn;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const token = await tokenProvider();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(resp.status, String(detail));
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  health: () => request<{ status: string; gemini_enabled: boolean }>("/health"),

  createEvent: (payload: EventCreate) =>
    request<EventRecord>("/api/events", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listEvents: () => request<EventRecord[]>("/api/events"),

  getEvent: (id: string) => request<EventDetail>(`/api/events/${id}`),

  generatePlan: (id: string) =>
    request<Plan>(`/api/events/${id}/plans`, { method: "POST" }),

  listPlans: (id: string) => request<Plan[]>(`/api/events/${id}/plans`),

  replan: (id: string, body: ReplanRequest) =>
    request<ReplanResult>(`/api/events/${id}/replans`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  interpretReplan: (id: string, text: string) =>
    request<InterpretReplanResult>(`/api/events/${id}/replans/interpret`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  approvePlan: (id: string, proposed_plan: Plan, base_version: number) =>
    request<Plan>(`/api/events/${id}/plans/approve`, {
      method: "POST",
      body: JSON.stringify({ proposed_plan, base_version }),
    }),

  updateTask: (id: string, taskId: string, patch: Partial<Task>) =>
    request<Task>(`/api/events/${id}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  compareVendors: (id: string, quotes: VendorQuote[]) =>
    request<VendorComparison>(`/api/events/${id}/vendors/compare`, {
      method: "POST",
      body: JSON.stringify({ quotes }),
    }),

  listVendors: (id: string) => request<VendorQuote[]>(`/api/events/${id}/vendors`),

  listGuests: (id: string) =>
    request<{ guests: Guest[]; summary: GuestSummary }>(
      `/api/events/${id}/guests`
    ),

  saveGuests: (id: string, guests: Guest[]) =>
    request<{ guests: Guest[]; summary: GuestSummary }>(
      `/api/events/${id}/guests`,
      { method: "PUT", body: JSON.stringify({ guests }) }
    ),

  getCatering: (id: string) =>
    request<CateringState>(`/api/events/${id}/catering`),

  saveCatering: (id: string, plan: CateringPlan) =>
    request<CateringState>(`/api/events/${id}/catering`, {
      method: "PUT",
      body: JSON.stringify(plan),
    }),

  generateCatering: (id: string, preferences: CateringPreferences) =>
    request<GenerateMenuResult>(`/api/events/${id}/catering/generate`, {
      method: "POST",
      body: JSON.stringify({ preferences }),
    }),

  optimizeCatering: (id: string, goal: string) =>
    request<CateringOptimizeResult>(`/api/events/${id}/catering/optimize`, {
      method: "POST",
      body: JSON.stringify({ goal }),
    }),

  // --- venues ---
  searchVenues: (query: VenueQuery) =>
    request<VenuePage>(`/api/venues/search`, {
      method: "POST",
      body: JSON.stringify(query),
    }),

  listShortlist: (id: string) =>
    request<Venue[]>(`/api/events/${id}/venues/shortlist`),

  shortlistVenue: (id: string, venue: Venue) =>
    request<Venue[]>(`/api/events/${id}/venues/shortlist`, {
      method: "POST",
      body: JSON.stringify({ venue }),
    }),

  removeShortlist: (id: string, venueId: string) =>
    request<Venue[]>(`/api/events/${id}/venues/shortlist/${venueId}`, {
      method: "DELETE",
    }),

  selectVenue: (id: string, venueId: string) =>
    request<SelectedVenue>(`/api/events/${id}/venues/select`, {
      method: "POST",
      body: JSON.stringify({ venue_id: venueId }),
    }),

  recommendVenues: (
    id: string,
    indoor_pref: string,
    required_amenities: string[]
  ) =>
    request<VenueRecommendation>(`/api/events/${id}/venues/recommend`, {
      method: "POST",
      body: JSON.stringify({ indoor_pref, required_amenities }),
    }),
};
