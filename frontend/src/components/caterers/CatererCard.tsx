import {
  Check,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Phone,
  Plus,
} from "lucide-react";
import type { CatererSearchResult } from "../../types";
import {
  DIET_LABEL,
  directionsUrl,
  safeUrl,
  telHref,
} from "../../utils/caterers";
import { classNames } from "../../utils/format";

/** A real provider from discovery. Shows only data the source published. */
export default function CatererCard({
  result,
  added,
  onAdd,
  style,
}: {
  result: CatererSearchResult;
  added: boolean;
  onAdd: (r: CatererSearchResult) => void;
  style?: React.CSSProperties;
}) {
  const website = safeUrl(result.website);
  const isRestaurant = result.kind !== "caterer";
  const dietTone =
    result.diet === "pure_veg" || result.diet === "veg_options"
      ? "bg-emerald-50 text-emerald-700"
      : result.diet === "non_veg"
      ? "bg-rose-50 text-rose-700"
      : "bg-sand-100 text-slate-500";

  return (
    <article
      className="card group flex flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className={classNames(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                isRestaurant ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"
              )}
            >
              {isRestaurant ? "Restaurant · may cater" : "Caterer"}
            </span>
            <span className={classNames("rounded-full px-2 py-0.5 text-[11px] font-medium", dietTone)}>
              {DIET_LABEL[result.diet] ?? DIET_LABEL.unknown}
            </span>
          </div>
          <h3 className="truncate text-base font-semibold text-slate-900" title={result.name}>
            {result.name}
          </h3>
        </div>
        {result.distance_km !== null && (
          <span className="shrink-0 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700">
            {result.distance_km} km
          </span>
        )}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-500">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-2">{result.address || "Address not listed"}</span>
      </p>

      {result.cuisines.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.cuisines.slice(0, 4).map((c) => (
            <span
              key={c}
              className="rounded-md bg-sand-100 px-2 py-0.5 text-xs capitalize text-slate-600"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {result.opening_hours && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <span className="truncate">{result.opening_hours}</span>
        </p>
      )}

      <div className="mt-4 rounded-xl border border-dashed border-sand-300 bg-sand-50/70 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Request quote</span> — price
        and availability for your date aren't published.
      </div>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-1.5">
          {result.phone && (
            <a href={telHref(result.phone)} className="btn-secondary px-2.5 py-1.5 text-xs">
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-2.5 py-1.5 text-xs"
            >
              <Globe className="h-3.5 w-3.5" /> Website
            </a>
          )}
          {result.lat !== null && result.lng !== null && (
            <a
              href={directionsUrl(result.lat, result.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary px-2.5 py-1.5 text-xs"
            >
              <Navigation className="h-3.5 w-3.5" /> Directions
            </a>
          )}
        </div>
        {!result.phone && !website && (
          <p className="mt-2 text-xs text-slate-400">
            No contact details are listed for this business.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <a
            href={result.osm_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
          >
            OpenStreetMap listing <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => onAdd(result)}
            disabled={added}
            className={classNames(
              added ? "btn-secondary text-emerald-700" : "btn-primary",
              "px-3 py-1.5 text-sm"
            )}
          >
            {added ? (
              <>
                <Check className="h-4 w-4" /> In your options
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add to options
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
