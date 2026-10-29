import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Award,
  CheckCircle2,
  CircleAlert,
  Pencil,
  Phone,
  Trash2,
  Users,
} from "lucide-react";
import type { CatererOverview, CatererView } from "../../types";
import {
  BOOKING_LABEL,
  FOOD_LABEL,
  PRICE_SOURCE_LABEL,
  telHref,
} from "../../utils/caterers";
import { classNames, formatINR } from "../../utils/format";
import { CateringArt } from "../Illustrations";
import FoodTypeBadge from "./FoodTypeBadge";

type SortKey = "best" | "total" | "ppg" | "capacity" | "inclusions";

const SORTS: { k: SortKey; label: string }[] = [
  { k: "best", label: "Best fit first" },
  { k: "total", label: "Lowest total" },
  { k: "ppg", label: "Lowest price / guest" },
  { k: "capacity", label: "Highest capacity" },
  { k: "inclusions", label: "Most inclusions" },
];

const PRICE_TONE: Record<string, string> = {
  quoted: "bg-emerald-50 text-emerald-700",
  published: "bg-sky-50 text-sky-700",
  estimated: "bg-amber-50 text-amber-700",
  quote_needed: "bg-sand-100 text-slate-500",
};

export default function MenuComparison({
  overview,
  busyId,
  onEdit,
  onSelect,
  onRemove,
  onDiscover,
  onManual,
}: {
  overview: CatererOverview;
  busyId: string | null;
  onEdit: (r: CatererView) => void;
  onSelect: (r: CatererView) => void;
  onRemove: (r: CatererView) => void;
  onDiscover: () => void;
  onManual: () => void;
}) {
  const [sort, setSort] = useState<SortKey>("best");
  const { records, best_fit_id, headcount, food_preference } = overview;

  const sorted = useMemo(() => {
    const priced = (r: CatererView) => (r.has_price ? 0 : 1);
    const list = [...records];
    list.sort((a, b) => {
      switch (sort) {
        case "total":
          return priced(a) - priced(b) || a.total_paise - b.total_paise;
        case "ppg":
          return priced(a) - priced(b) || a.price_per_guest_paise - b.price_per_guest_paise;
        case "capacity":
          return (b.max_guests ?? 0) - (a.max_guests ?? 0);
        case "inclusions":
          return b.inclusions.length - a.inclusions.length;
        default: {
          const rank = (r: CatererView) =>
            r.id === best_fit_id ? 0 : r.meets_requirements ? 1 : r.has_price ? 2 : 3;
          return rank(a) - rank(b) || a.total_paise - b.total_paise;
        }
      }
    });
    return list;
  }, [records, sort, best_fit_id]);

  if (records.length === 0) {
    return (
      <div className="card flex flex-col items-center p-10 text-center">
        <CateringArt className="h-20 w-20" />
        <p className="mt-3 text-lg font-semibold text-slate-800">Nothing to compare yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Add caterers from real search results, or record one you already know.
          Then compare totals, menus and inclusions side by side.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={onDiscover}>Find caterers</button>
          <button type="button" className="btn-secondary" onClick={onManual}>Add manually</button>
        </div>
      </div>
    );
  }

  const best = records.find((r) => r.id === best_fit_id);
  const failing = records.filter((r) => !r.meets_requirements).length;

  return (
    <div className="space-y-5">
      {/* Requirements + sort bar */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Your requirements:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-xs">
            <Users className="h-3.5 w-3.5" /> {headcount.count} guests
          </span>
          <FoodTypeBadge type={food_preference} />
          {failing > 0 && (
            <span className="text-xs text-slate-400">
              {failing} option{failing === 1 ? "" : "s"} don't meet them
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <ArrowUpDown className="h-4 w-4 text-slate-400" />
          <span className="sr-only">Sort options</span>
          <select className="input w-auto py-1.5" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {best ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Award className="h-4 w-4 text-brand-600" />
          <span>
            <span className="font-semibold text-slate-900">{best.name}</span> is the
            lowest-cost option that meets all your requirements.
          </span>
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          No priced option meets every requirement yet — add quotes to find a best fit.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {sorted.map((r) => (
          <OptionCard
            key={r.id}
            r={r}
            isBest={r.id === best_fit_id}
            busy={busyId === r.id}
            onEdit={() => onEdit(r)}
            onSelect={() => onSelect(r)}
            onRemove={() => onRemove(r)}
          />
        ))}
      </div>
    </div>
  );
}

function OptionCard({
  r,
  isBest,
  busy,
  onEdit,
  onSelect,
  onRemove,
}: {
  r: CatererView;
  isBest: boolean;
  busy: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const cancelled = r.booking_status === "cancelled";
  const courses = (["starters", "mains", "desserts", "beverages"] as const).filter((c) => r.menu[c]);
  return (
    <article
      className={classNames(
        "relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-card transition",
        r.selected ? "border-brand-500 ring-2 ring-brand-500/30" : isBest ? "border-brand-300" : "border-sand-200",
        cancelled && "opacity-60"
      )}
    >
      {(isBest || r.selected) && (
        <div className={classNames("flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold", r.selected ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700")}>
          {r.selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Award className="h-3.5 w-3.5" />}
          {r.selected ? "Your selected caterer" : "Best fit"}
          {r.selected && isBest && <span className="ml-auto opacity-80">· Best fit</span>}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900" title={r.name}>{r.name}</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {r.source === "osm" || r.provider_id ? "From OpenStreetMap" : "Added by you"}
              {r.distance_km != null && ` · ${r.distance_km} km`}
            </p>
          </div>
          <FoodTypeBadge type={r.food_type} compact />
        </div>

        {/* Price */}
        <div className="mt-4 rounded-xl bg-sand-50 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {r.has_price ? formatINR(r.total_paise) : "Quote needed"}
            </span>
            <span className={classNames("rounded-full px-2 py-0.5 text-[11px] font-medium", PRICE_TONE[r.price_source])}>
              {PRICE_SOURCE_LABEL[r.price_source]}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {r.is_fixed_price
              ? `Fixed package · ${r.fixed_total_reason}`
              : r.has_price
              ? `${r.guests_used} guests × ${formatINR(r.price_per_guest_paise)}${r.extras_paise ? ` + ${formatINR(r.extras_paise)} extras` : ""}`
              : "Contact the caterer for a per-guest price"}
          </p>
          {r.guests_follow_event && r.has_price && (
            <p className="mt-1 text-[11px] text-slate-400">Updates as your headcount changes</p>
          )}
        </div>

        {/* Requirement checks */}
        <ul className="mt-4 space-y-1.5">
          {r.checks.map((c) => (
            <li key={c.key} className={classNames("flex items-center gap-2 text-sm", c.ok ? "text-slate-600" : "text-rose-700")}>
              {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <CircleAlert className="h-4 w-4 shrink-0" />}
              {c.ok ? c.label : `Doesn't meet: ${c.label.toLowerCase()}`}
            </li>
          ))}
        </ul>

        {/* Inclusions */}
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Included</p>
          {r.inclusions.length ? (
            <div className="flex flex-wrap gap-1.5">
              {r.inclusions.map((x) => (
                <span key={x} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">{x}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Not specified — ask what's included.</p>
          )}
        </div>

        {(courses.length > 0 || r.menu_types.length > 0) && (
          <details className="group mt-4 rounded-xl border border-sand-200 px-3.5 py-2.5">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-700 marker:hidden">
              <span className="group-open:hidden">View menu</span>
              <span className="hidden group-open:inline">Hide menu</span>
              {r.menu_types.length > 0 && (
                <span className="ml-2 text-xs font-normal capitalize text-slate-400">{r.menu_types.join(" · ")}</span>
              )}
            </summary>
            <dl className="mt-2 space-y-1.5 text-sm">
              {courses.map((c) => (
                <div key={c}>
                  <dt className="text-xs font-semibold capitalize text-slate-500">{c}</dt>
                  <dd className="text-slate-700">{r.menu[c]}</dd>
                </div>
              ))}
              {courses.length === 0 && <dd className="text-xs text-slate-400">No dishes recorded.</dd>}
            </dl>
          </details>
        )}

        <p className="mt-3 text-xs text-slate-500">
          {FOOD_LABEL[r.food_type]} · {BOOKING_LABEL[r.booking_status]}
          {r.min_guests ? ` · min ${r.min_guests}` : ""}
          {r.max_guests ? ` · up to ${r.max_guests}` : ""}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-sand-200 px-4 py-3">
        {r.phone && (
          <a href={telHref(r.phone)} className="rounded-lg p-2 text-slate-500 transition hover:bg-sand-100 hover:text-slate-800" aria-label={`Call ${r.name}`}>
            <Phone className="h-4 w-4" />
          </a>
        )}
        <button type="button" onClick={onEdit} className="rounded-lg p-2 text-slate-500 transition hover:bg-sand-100 hover:text-slate-800" aria-label={`Edit ${r.name}`}>
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={onRemove} className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${r.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSelect}
          disabled={busy || cancelled}
          className={classNames("ml-auto px-3 py-1.5 text-sm", r.selected ? "btn-secondary" : "btn-primary")}
        >
          {r.selected ? "Selected" : "Select this caterer"}
        </button>
      </div>
    </article>
  );
}
