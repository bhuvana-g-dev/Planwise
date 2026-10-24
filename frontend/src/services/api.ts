import type {
  EventCreate,
  EventDetail,
  EventRecord,
  Plan,
  ReplanRequest,
  ReplanResult,
  Task,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
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
};
