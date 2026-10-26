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

export default function VenueDiscovery() {
  const { eventId } = useParams();
  const [query, setQuery] = useState<VenueQuery>({
    keyword: "",
    city: "",
    sort: "relevance",
    page: 1,
    page_size: 12,
  });
  const [venues, setVenues] = useState<Venue[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [focused, setFocused] = useState<Venue | null>(null);
  const [shortlist, setShortlist] = useState<Venue[]>([]);
  const [selected, setSelected] = useState<SelectedVenue | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rec, setRec] = useState<VenueRecommendation | null>(null);
  const [recBusy, setRecBusy] = useState(false);

  const runSearch = useCallback(
    async (q: VenueQuery) => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.searchVenues(q);
        setVenues(page.results);
        setDisclaimer(page.disclaimer);
        setTotal(page.total);
        setTotalPages(page.total_pages);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Venue search failed");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!eventId) return;
    api.listShortlist(eventId).then(setShortlist).catch(() => {});
  }, [eventId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = { ...query, page: 1 };
    setQuery(q);
    void runSearch(q);
  }

  function changePage(p: number) {
    const q = { ...query, page: p };
    setQuery(q);
    void runSearch(q);
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
      // Ensure it's shortlisted so the backend can resolve user venues.
      if (!inShortlist(v.id)) {
        const next = await api.shortlistVenue(eventId, v);
        setShortlist(next);
      }
      const sel = await api.selectVenue(eventId, v.id);
      setSelected(sel);
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
      const r = await api.recommendVenues(eventId, "any", []);
      setRec(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Recommendation failed");
    } finally {
      setRecBusy(false);
    }
  }

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

      <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        {disclaimer ||
          "Demo venues for illustration only — not verified real businesses."}
      </div>

      {error && <ErrorBanner message={error} />}
      {msg && <SuccessBanner message={msg} />}

      {selected && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Selected venue</p>
              <p className="text-lg font-bold text-slate-900">
                {selected.venue.name}
              </p>
              <p className="text-sm text-slate-500">{selected.venue.location}</p>
            </div>
            <div className="text-right">
              {selected.est_price_paise != null && (
                <p className="text-sm text-slate-600">
                  Est. {formatINR(selected.est_price_paise)}
                </p>
              )}
              {selected.venue_budget_paise != null &&
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
            !selected.within_budget && (
              <Link
                to={`/events/${eventId}/adapt`}
                className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Over budget — open Adapt Plan to rebalance →
              </Link>
            )}
        </div>
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
            placeholder="City"
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
            className="input max-w-[150px]"
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
            className="input max-w-[150px]"
            placeholder="Max price ₹"
            value={query.max_price_inr ?? ""}
            onChange={(e) =>
              setQuery({
                ...query,
                max_price_inr: e.target.value ? Number(e.target.value) : null,
              })
            }
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
        </div>
      </form>

      {/* View toggle + AI */}
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
        <button className="btn-secondary" onClick={recommend} disabled={recBusy}>
          <Sparkles className="h-4 w-4" />{" "}
          {recBusy ? "Thinking…" : "AI venue suggestions"}
        </button>
      </div>

      {rec && (
        <div className="card p-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Star className="h-4 w-4 text-brand-600" /> AI suggestions (
            {rec.generated_by})
          </p>
          <p className="mb-3 text-sm text-slate-600">{rec.reasoning}</p>
          <div className="flex flex-wrap gap-2">
            {rec.recommendations.map((v) => (
              <button
                key={v.id}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => {
                  setFocused(v);
                  setView("map");
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-600">{rec.disclaimer}</p>
        </div>
      )}

      {loading ? (
        <Spinner label="Searching venues…" />
      ) : venues.length === 0 ? (
        <EmptyState
          title="No venues match your filters"
          description="Try broadening the keyword, city, capacity, or price range."
          action={
            <button
              className="btn-primary"
              onClick={() => {
                const q = { keyword: "", city: "", sort: "relevance", page: 1, page_size: 12 };
                setQuery(q);
                void runSearch(q);
              }}
            >
              Reset filters
            </button>
          }
        />
      ) : view === "map" ? (
        <VenueMap venues={venues} focused={focused} onFocus={setFocused} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
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
                    className={inShortlist(v.id) ? "text-rose-500" : "text-slate-300 hover:text-rose-400"}
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
                    <Users className="h-3.5 w-3.5" /> {v.capacity}
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
                      : "Price n/a"}
                  </span>
                  {v.source === "demo" && (
                    <span className="text-[10px] uppercase text-amber-600">
                      demo
                    </span>
                  )}
                </div>
                <button
                  className="btn-primary mt-4"
                  onClick={() => select(v)}
                >
                  <Check className="h-4 w-4" /> Select for event
                </button>
              </article>
            ))}
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
