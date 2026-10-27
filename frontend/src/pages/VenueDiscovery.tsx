import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  Heart,
  List,
  MapPin,
  MapPinned,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { api, ApiError } from "../services/api";
import type {
  SelectedVenue,
  Venue,
  VenueQuery,
  VenueRecommendation,
  VenueType,
} from "../types";
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Spinner,
  SuccessBanner,
} from "../components/ui";
import VenueMap from "../components/VenueMap";
import { formatINR, titleCase } from "../utils/format";

const TYPES: { value: VenueType | ""; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "wedding_hall", label: "Wedding hall" },
  { value: "banquet_hall", label: "Banquet hall" },
  { value: "hotel", label: "Hotel" },
  { value: "outdoor_garden", label: "Outdoor garden" },
  { value: "beach", label: "Beach" },
  { value: "community_hall", label: "Community hall" },
  { value: "conference_hall", label: "Conference hall" },
  { value: "other", label: "Other" },
];

const EMPTY_QUERY: VenueQuery = {
  keyword: "",
  city: "",
  sort: "relevance",
  page: 1,
  page_size: 12,
  amenities: [],
};

function sourceBadge(source: Venue["source"]) {
  switch (source) {
    case "osm":
      return { tone: "brand" as const, label: "OpenStreetMap" };
    case "user":
      return { tone: "slate" as const, label: "your entry" };
    case "provider":
      return { tone: "green" as const, label: "provider" };
    default:
      return { tone: "amber" as const, label: "demo" };
  }
}

export default function VenueDiscovery() {
  const { eventId } = useParams();
  const [query, setQuery] = useState<VenueQuery>(EMPTY_QUERY);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [sourceMode, setSourceMode] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [focused, setFocused] = useState<Venue | null>(null);
  const [shortlist, setShortlist] = useState<Venue[]>([]);
  const [selected, setSelected] = useState<SelectedVenue | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [rec, setRec] = useState<VenueRecommendation | null>(null);
  const [recBusy, setRecBusy] = useState(false);

  // Recommendation preferences (P4)
  const [indoorPref, setIndoorPref] = useState<"any" | "indoor" | "outdoor">(
    "any"
  );
  const [recAmenities, setRecAmenities] = useState<string>("");

  // Amenity filter (P5)
  const [amenityFilter, setAmenityFilter] = useState<string>("");

  const runSearch = useCallback(async (q: VenueQuery) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.searchVenues(q);
      setVenues(page.results);
      setDisclaimer(page.disclaimer);
      setSourceMode(page.source_mode);
      setTotal(page.total);
      setTotalPages(page.total_pages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Venue search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P1: restore shortlist + the saved selected venue (with authoritative
  // budget comparison) when the page loads / after a refresh.
  useEffect(() => {
    if (!eventId) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [sl, detail] = await Promise.all([
          api.listShortlist(eventId).catch(() => [] as Venue[]),
          api.getEvent(eventId),
        ]);
        if (cancelled) return;
        setShortlist(sl);
        if (detail.selected_venue) {
          // Re-fetch the authoritative budget comparison from the backend
          // rather than trusting a stale client copy.
          try {
            const sel = await api.selectVenue(
              eventId,
              detail.selected_venue.id
            );
            if (!cancelled) {
              setSelected(sel);
              setFocused(sel.venue);
            }
          } catch {
            // Fall back to showing the stored venue without a fresh comparison.
            if (!cancelled) {
              setSelected({
                venue: detail.selected_venue,
                est_price_paise: detail.selected_venue.est_price_paise,
                venue_budget_paise: null,
                remaining_paise: null,
                overrun_paise: null,
                within_budget: null,
              });
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError
              ? e.message
              : "Could not restore this event's venue selection"
          );
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function buildQuery(base: VenueQuery): VenueQuery {
    const amenities = amenityFilter
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { ...base, amenities };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = buildQuery({ ...query, page: 1 });
    setQuery(q);
    void runSearch(q);
  }

  function changePage(p: number) {
    const q = { ...query, page: p };
    setQuery(q);
    void runSearch(q);
  }

  function resetFilters() {
    setQuery(EMPTY_QUERY);
    setAmenityFilter("");
    void runSearch(EMPTY_QUERY);
  }

  const inShortlist = (id: string) => shortlist.some((v) => v.id === id);

  async function toggleShortlist(v: Venue) {
    if (!eventId) return;
    try {
      const next = inShortlist(v.id)
        ? await api.removeShortlist(eventId, v.id)
        : await api.shortlistVenue(eventId, v);
      setShortlist(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update shortlist");
    }
  }

  async function select(v: Venue) {
    if (!eventId) return;
    setMsg(null);
    try {
      if (!inShortlist(v.id)) {
        const next = await api.shortlistVenue(eventId, v);
        setShortlist(next);
      }
      const sel = await api.selectVenue(eventId, v.id);
      setSelected(sel);
      setFocused(sel.venue);
      setMsg(`Selected ${sel.venue.name} for this event.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to select venue");
    }
  }

  async function recommend() {
    if (!eventId) return;
    setRecBusy(true);
    setError(null);
    try {
      const amenities = recAmenities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await api.recommendVenues(eventId, indoorPref, amenities);
      setRec(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Recommendation failed");
    } finally {
      setRecBusy(false);
    }
  }

  // Merge a recommended venue into the current result set (so cards/map show
  // it) and focus it. Avoids duplicates.
  function focusRecommendation(v: Venue) {
    setVenues((prev) =>
      prev.some((p) => p.id === v.id) ? prev : [v, ...prev]
    );
    setFocused(v);
    setView("map");
  }

  const liveOsm = sourceMode === "osm";
  const demoFallback = sourceMode === "demo_fallback";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <MapPinned className="h-6 w-6 text-brand-600" /> Venue discovery
        </h1>
        <Link to={`/events/${eventId}`} className="btn-secondary">
          Back to dashboard
        </Link>
      </div>

      {/* Source-mode indicator (P3): live OSM vs demo fallback */}
      <div
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs ${
          liveOsm
            ? "bg-sky-50 text-sky-800"
            : "bg-amber-50 text-amber-800"
        }`}
      >
        <Badge tone={liveOsm ? "brand" : "amber"}>
          {liveOsm
            ? "Live OpenStreetMap"
            : demoFallback
            ? "Demo (OSM unavailable)"
            : "Demo samples"}
        </Badge>
        <span>{disclaimer || "Loading venue source…"}</span>
      </div>

      {error && <ErrorBanner message={error} />}
      {msg && <SuccessBanner message={msg} />}

      {restoring ? (
        <Spinner label="Restoring saved selection…" />
      ) : (
        selected && (
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Selected venue</p>
                <p className="text-lg font-bold text-slate-900">
                  {selected.venue.name}
                </p>
                <p className="text-sm text-slate-500">
                  {selected.venue.location || "Location not listed"}
                </p>
                <span className="mt-1 inline-block">
                  <Badge tone={sourceBadge(selected.venue.source).tone}>
                    {sourceBadge(selected.venue.source).label}
                  </Badge>
                </span>
              </div>
              <div className="text-right">
                {selected.est_price_paise != null ? (
                  <p className="text-sm text-slate-600">
                    Est. {formatINR(selected.est_price_paise)}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">Price not listed</p>
                )}
                {selected.venue_budget_paise != null &&
                  selected.within_budget != null &&
                  (selected.within_budget ? (
                    <Badge tone="green">
                      Within venue budget ·{" "}
                      {formatINR(selected.remaining_paise ?? 0)} left
                    </Badge>
                  ) : (
                    <Badge tone="rose">
                      Over venue budget by{" "}
                      {formatINR(selected.overrun_paise ?? 0)}
                    </Badge>
                  ))}
              </div>
            </div>
            {selected.venue_budget_paise != null &&
              selected.within_budget === false && (
                <Link
                  to={`/events/${eventId}/adapt`}
                  className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
                >
                  Over budget — open Adapt Plan to rebalance →
                </Link>
              )}
          </div>
        )
      )}

      {/* Search + filters */}
      <form onSubmit={submit} className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search name, amenity, keyword"
              value={query.keyword}
              onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
            />
          </div>
          <input
            className="input max-w-[160px]"
            placeholder="City (for live OSM)"
            value={query.city}
            onChange={(e) => setQuery({ ...query, city: e.target.value })}
          />
          <select
            className="input max-w-[170px]"
            value={query.venue_type ?? ""}
            onChange={(e) =>
              setQuery({
                ...query,
                venue_type: (e.target.value || null) as VenueType | null,
              })
            }
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="number"
            min={0}
            className="input max-w-[140px]"
            placeholder="Min capacity"
            value={query.min_capacity ?? ""}
            onChange={(e) =>
              setQuery({
                ...query,
                min_capacity: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <input
            type="number"
            min={0}
            className="input max-w-[140px]"
            placeholder="Max capacity"
            value={query.max_capacity ?? ""}
            onChange={(e) =>
              setQuery({
                ...query,
                max_capacity: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <input
            type="number"
            min={0}
            className="input max-w-[140px]"
            placeholder="Max price ₹"
            value={query.max_price_inr ?? ""}
            onChange={(e) =>
              setQuery({
                ...query,
                max_price_inr: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <input
            className="input max-w-[200px]"
            placeholder="Amenities (e.g. parking, ac)"
            value={amenityFilter}
            onChange={(e) => setAmenityFilter(e.target.value)}
          />
          <select
            className="input max-w-[160px]"
            value={query.sort}
            onChange={(e) => setQuery({ ...query, sort: e.target.value })}
          >
            <option value="relevance">Sort: relevance</option>
            <option value="price">Sort: price</option>
            <option value="capacity">Sort: capacity</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={query.outdoor === true}
              onChange={(e) =>
                setQuery({ ...query, outdoor: e.target.checked ? true : null })
              }
            />
            Outdoor
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={query.indoor === true}
              onChange={(e) =>
                setQuery({ ...query, indoor: e.target.checked ? true : null })
              }
            />
            Indoor
          </label>
          <button type="submit" className="btn-primary">
            <Search className="h-4 w-4" /> Search
          </button>
          <button type="button" className="btn-secondary" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </form>

      {/* View toggle + AI recommendation panel */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border border-slate-200 p-1">
          <button
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === "list" ? "bg-brand-50 text-brand-700" : "text-slate-600"
            }`}
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4" /> List
          </button>
          <button
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === "map" ? "bg-brand-50 text-brand-700" : "text-slate-600"
            }`}
            onClick={() => setView("map")}
          >
            <MapPin className="h-4 w-4" /> Map
          </button>
        </div>
      </div>

      {/* P4: recommendation preferences */}
      <div className="card p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-brand-600" /> AI venue suggestions
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Preference</label>
            <select
              className="input w-40"
              value={indoorPref}
              onChange={(e) =>
                setIndoorPref(e.target.value as "any" | "indoor" | "outdoor")
              }
            >
              <option value="any">No preference</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="label">Required amenities (comma separated)</label>
            <input
              className="input"
              placeholder="parking, ac, catering"
              value={recAmenities}
              onChange={(e) => setRecAmenities(e.target.value)}
            />
          </div>
          <button
            className="btn-secondary"
            onClick={recommend}
            disabled={recBusy}
          >
            <Sparkles className="h-4 w-4" />{" "}
            {recBusy ? "Thinking…" : "Suggest venues"}
          </button>
        </div>

        {rec && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Star className="h-4 w-4 text-brand-600" /> Suggestions (
              {rec.generated_by})
            </p>
            <p className="mb-3 text-sm text-slate-600">{rec.reasoning}</p>
            {rec.recommendations.length === 0 ? (
              <p className="text-sm text-slate-500">
                No suitable venues found for these preferences.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rec.recommendations.map((v) => (
                  <button
                    key={v.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
                    onClick={() => focusRecommendation(v)}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-amber-600">{rec.disclaimer}</p>
          </div>
        )}
      </div>

      {loading ? (
        <Spinner label="Searching venues…" />
      ) : venues.length === 0 ? (
        <EmptyState
          title="No venues match your filters"
          description="Try broadening the keyword, city, capacity, price range, or amenities. Live OpenStreetMap search needs a city."
          action={
            <button className="btn-primary" onClick={resetFilters}>
              Reset filters
            </button>
          }
        />
      ) : view === "map" ? (
        <VenueMap venues={venues} focused={focused} onFocus={setFocused} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => {
              const sb = sourceBadge(v.source);
              return (
                <article
                  key={v.id}
                  className={`card flex flex-col p-5 transition ${
                    focused?.id === v.id ? "ring-2 ring-brand-400" : ""
                  }`}
                  onMouseEnter={() => setFocused(v)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{v.name}</h3>
                    <button
                      aria-label="Shortlist"
                      onClick={() => toggleShortlist(v)}
                      className={
                        inShortlist(v.id)
                          ? "text-rose-500"
                          : "text-slate-300 hover:text-rose-400"
                      }
                    >
                      <Heart
                        className="h-5 w-5"
                        fill={inShortlist(v.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5" /> {v.location || "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="brand">
                      {titleCase(v.venue_type.replace("_", " "))}
                    </Badge>
                    <span className="flex items-center gap-1 text-slate-500">
                      <Users className="h-3.5 w-3.5" />{" "}
                      {v.capacity > 0 ? v.capacity : "n/a"}
                    </span>
                    {v.outdoor && <Badge tone="green">Outdoor</Badge>}
                    {v.indoor && <Badge tone="slate">Indoor</Badge>}
                  </div>
                  {v.amenities.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      {v.amenities.slice(0, 4).join(" · ")}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {v.est_price_paise != null
                        ? formatINR(v.est_price_paise)
                        : "Price not listed"}
                    </span>
                    <Badge tone={sb.tone}>{sb.label}</Badge>
                  </div>
                  <button className="btn-primary mt-4" onClick={() => select(v)}>
                    <Check className="h-4 w-4" /> Select for event
                  </button>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                className="btn-secondary"
                disabled={(query.page ?? 1) <= 1}
                onClick={() => changePage((query.page ?? 1) - 1)}
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {query.page} of {totalPages} · {total} venues
              </span>
              <button
                className="btn-secondary"
                disabled={(query.page ?? 1) >= totalPages}
                onClick={() => changePage((query.page ?? 1) + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
