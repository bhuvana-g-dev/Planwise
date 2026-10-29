// API calls for the caterer management module (discovery, comparison,
// manual arrangements, booking state and budget integration).
import { request } from "./api";
import type {
  CatererBudgetPreview,
  CatererInput,
  CatererOverview,
  CatererSearchResponse,
  FoodType,
} from "../types";

const ev = (id: string) => `/api/events/${encodeURIComponent(id)}/caterers`;

export const cateringService = {
  search: (params: {
    location: string;
    radius_km: number;
    food: FoodType;
    include_restaurants: boolean;
  }) => {
    const q = new URLSearchParams({
      location: params.location,
      radius_km: String(params.radius_km),
      food: params.food,
      include_restaurants: String(params.include_restaurants),
    });
    return request<CatererSearchResponse>(`/api/caterers/search?${q}`);
  },

  overview: (eventId: string) => request<CatererOverview>(ev(eventId)),

  setPreference: (eventId: string, food_preference: FoodType) =>
    request<CatererOverview>(`${ev(eventId)}/preferences`, {
      method: "PUT",
      body: JSON.stringify({ food_preference }),
    }),

  create: (eventId: string, record: CatererInput, linkToId?: string) =>
    request<{ record_id: string; linked: boolean; overview: CatererOverview }>(
      ev(eventId),
      {
        method: "POST",
        body: JSON.stringify({ record, link_to_id: linkToId ?? null }),
      }
    ),

  update: (eventId: string, id: string, patch: Partial<CatererInput>) =>
    request<CatererOverview>(`${ev(eventId)}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  remove: (eventId: string, id: string) =>
    request<CatererOverview>(`${ev(eventId)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  select: (eventId: string, id: string, selected = true) =>
    request<CatererOverview>(
      `${ev(eventId)}/${encodeURIComponent(id)}/select`,
      { method: "POST", body: JSON.stringify({ selected }) }
    ),

  budgetPreview: (eventId: string, id: string) =>
    request<CatererBudgetPreview>(
      `${ev(eventId)}/${encodeURIComponent(id)}/budget-preview`
    ),

  applyBudget: (
    eventId: string,
    id: string,
    base_version: number,
    expected_total_paise: number
  ) =>
    request<{ plan_version: number; overview: CatererOverview }>(
      `${ev(eventId)}/${encodeURIComponent(id)}/apply-budget`,
      {
        method: "POST",
        body: JSON.stringify({ base_version, expected_total_paise }),
      }
    ),
};
