import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardPen,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import { cateringService } from "../../services/cateringService";
import { ApiError } from "../../services/api";
import type {
  CatererSearchResponse,
  CatererSearchResult,
  FoodType,
} from "../../types";
import { CateringArt } from "../Illustrations";
import { Skeleton } from "../ui";
import { classNames, formatDate } from "../../utils/format";
import CatererCard from "./CatererCard";

const RADII = [10, 25, 50] as const;
const FOODS: { v: FoodType; label: string }[] = [
  { v: "veg", label: "Vegetarian" },
  { v: "nonveg", label: "Non-vegetarian" },
  { v: "both", label: "Both" },
];

export default function CateringSearch({
  defaultLocation,
  headcount,
  eventDate,
  foodPreference,
  onFoodPreferenceChange,
  addedProviderIds,
  onAdd,
  onManual,
}: {
  defaultLocation: string;
  headcount: number;
  eventDate: string;
  foodPreference: FoodType;
  onFoodPreferenceChange: (f: FoodType) => void;
  addedProviderIds: Set<string>;
  onAdd: (r: CatererSearchResult) => void;
  onManual: () => void;
}) {
  const [location, setLocation] = useState(defaultLocation);
  const [radius, setRadius] = useState<number>(25);
  const [includeRestaurants, setIncludeRestaurants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<CatererSearchResponse | null>(null);

  const run = useCallback(
    async (over?: Partial<{ radius: number; restaurants: boolean; food: FoodType }>) => {
      if (!location.trim()) {
        setError("Enter the event location to search.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const out = await cateringService.search({
          location: location.trim(),
          radius_km: over?.radius ?? radius,
          food: over?.food ?? foodPreference,
          include_restaurants: over?.restaurants ?? includeRestaurants,
        });
        setRes(out);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [location, radius, foodPreference, includeRestaurants]
  );

  // Search once on arrival so users immediately see real providers nearby.
  useEffect(() => {
    if (defaultLocation.trim()) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* ---- Search panel ---- */}
      <form
        className="card overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="cat-location">
                Event location
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="cat-location"
                  className="input pl-9"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City or area, e.g. Madurai"
                />
              </div>
            </div>
            <div>
              <span className="label">Food preference</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Food preference">
                {FOODS.map((f) => {
                  const active = foodPreference === f.v;
                  return (
                    <button
                      key={f.v}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        onFoodPreferenceChange(f.v);
                        if (res) void run({ food: f.v });
                      }}
                      className={classNames(
                        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                          : "border-sand-300 text-slate-600 hover:border-brand-300 hover:bg-sand-50"
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <span className="label">Search radius</span>
              <div className="inline-flex rounded-xl border border-sand-300 bg-white p-1" role="radiogroup" aria-label="Search radius">
                {RADII.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={radius === r}
                    onClick={() => {
                      setRadius(r);
                      if (res) void run({ radius: r });
                    }}
                    className={classNames(
                      "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                      radius === r ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-sand-50"
                    )}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                checked={includeRestaurants}
                onChange={(e) => {
                  setIncludeRestaurants(e.target.checked);
                  if (res) void run({ restaurants: e.target.checked });
                }}
              />
              <span>
                Also show restaurants that may offer catering
                <span className="block text-xs text-slate-400">
                  Restaurants are labelled — confirm they cater events.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 bg-sand-50/60 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {headcount} guests
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDate(eventDate)}
            </span>
            <span>Availability for your date must be confirmed with each caterer.</span>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search real providers
          </button>
        </div>
      </form>

      {/* ---- Manual entry CTA ---- */}
      <button
        type="button"
        onClick={onManual}
        className="group flex w-full items-center gap-4 rounded-2xl border border-dashed border-brand-300 bg-brand-50/40 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
          <ClipboardPen className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-slate-900">
            Already arranged a caterer?
          </span>
          <span className="block text-sm text-slate-500">
            Record a caterer you know or booked yourself — agreed price, advance
            and balance.
          </span>
        </span>
        <span className="hidden text-sm font-medium text-brand-700 group-hover:underline sm:inline">
          Add manually →
        </span>
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ---- Results ---- */}
      {loading && !res && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      )}

      {res && res.status === "unavailable" && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Live search isn't available right now</p>
            <p className="mt-0.5">{res.message}</p>
          </div>
        </div>
      )}

      {res && res.status === "ok" && (
        <section aria-live="polite" className={classNames(loading && "opacity-60 transition-opacity")}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {res.results.length > 0
                ? `${res.results.length} real provider${res.results.length === 1 ? "" : "s"} near ${res.center?.label.split(",")[0] ?? location}`
                : "No providers found"}
            </h2>
            <p className="text-xs text-slate-400">Within {res.radius_km} km · sorted by type, then distance</p>
          </div>

          {res.notice && (
            <div
              className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"
              role="status"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">{res.notice}</p>
              <button
                type="button"
                className="btn-secondary !py-1.5 text-xs"
                onClick={() => void run()}
                disabled={loading}
              >
                <RefreshCw className={classNames("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden="true" />
                Search again
              </button>
            </div>
          )}

          {res.results.length === 0 ? (
            <div className="card flex flex-col items-center p-10 text-center">
              <CateringArt className="h-20 w-20" />
              <p className="mt-3 font-semibold text-slate-800">Nothing listed nearby yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{res.message}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {radius < 50 && (
                  <button type="button" className="btn-secondary" onClick={() => { setRadius(50); void run({ radius: 50 }); }}>
                    Search within 50 km
                  </button>
                )}
                {!includeRestaurants && (
                  <button type="button" className="btn-secondary" onClick={() => { setIncludeRestaurants(true); void run({ restaurants: true }); }}>
                    Include restaurants
                  </button>
                )}
                <button type="button" className="btn-primary" onClick={onManual}>
                  Add a caterer manually
                </button>
              </div>
            </div>
          ) : (
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {res.results.map((r, i) => (
                <CatererCard
                  key={r.provider_id}
                  result={r}
                  added={addedProviderIds.has(r.provider_id)}
                  onAdd={onAdd}
                  style={{ ["--i" as string]: Math.min(i, 8) }}
                />
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-slate-400">{res.attribution}</p>
        </section>
      )}
    </div>
  );
}
