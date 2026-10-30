import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import Modal from "../caterers/Modal";
import type { PriceScope, Venue, VenueQuote, VenueQuoteInput } from "../../types";
import { parseIncludes, validateQuote } from "../../utils/venuePricing";
import { classNames } from "../../utils/format";

const SUGGESTED = ["Catering", "Decoration", "Rooms", "Sound & lighting", "Chairs & tables", "Generator"];

/** Record (or edit) the actual price a venue quoted. Overrides estimates. */
export default function VenueQuoteForm({
  venue,
  existing,
  saving,
  serverError,
  onSave,
  onDelete,
  onClose,
}: {
  venue: Venue | null;
  existing: VenueQuote | undefined;
  saving: boolean;
  serverError: string | null;
  onSave: (q: VenueQuoteInput) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState<PriceScope>("rental_only");
  const [includesText, setIncludesText] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!venue) return;
    setAmount(existing ? String(existing.amount_paise / 100) : "");
    setScope(existing?.scope ?? "rental_only");
    setIncludesText(existing?.package_includes.join(", ") ?? "");
    setNotes(existing?.notes ?? "");
    setTouched(false);
  }, [venue, existing]);

  const includes = scope === "package" ? parseIncludes(includesText) : [];
  const error = validateQuote(amount, scope, includes);

  function addSuggestion(s: string) {
    const cur = parseIncludes(includesText);
    if (!cur.includes(s)) setIncludesText([...cur, s].join(", "));
  }

  return (
    <Modal
      open={venue !== null}
      title={existing ? "Update venue quote" : "Add the price you were quoted"}
      subtitle={venue ? `${venue.name}${venue.location ? ` · ${venue.location}` : ""}` : undefined}
      onClose={onClose}
      size="md"
      footer={
        <>
          {existing && (
            <button type="button" className="mr-auto inline-flex items-center gap-1.5 text-sm text-rose-600 hover:underline" onClick={onDelete} disabled={saving}>
              <Trash2 className="h-4 w-4" /> Remove quote
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={() => {
              setTouched(true);
              if (error || !venue) return;
              onSave({
                amount_inr: Number(amount),
                scope,
                package_includes: includes,
                notes: notes.trim(),
                venue_name: venue.name,
                venue_type: venue.venue_type,
              });
            }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save quote
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{serverError}</div>
        )}
        <div>
          <label className="label" htmlFor="vq-amount">Quoted price for the event (₹)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
            <input id="vq-amount" type="number" min={1} step="any" inputMode="decimal" autoFocus
              className="input pl-7 tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 18000" />
          </div>
        </div>

        <div>
          <span className="label">What does this price cover?</span>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Price scope">
            {([
              ["rental_only", "Venue rental only", "Just the space — food, decor and staff extra."],
              ["package", "Event package", "Venue plus services like catering or decor."],
            ] as const).map(([v, title, body]) => (
              <button key={v} type="button" role="radio" aria-checked={scope === v} onClick={() => setScope(v)}
                className={classNames("rounded-xl border p-3 text-left transition",
                  scope === v ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-sand-300 hover:border-brand-300")}>
                <span className="block text-sm font-semibold text-slate-800">{title}</span>
                <span className="block text-xs text-slate-500">{body}</span>
              </button>
            ))}
          </div>
        </div>

        {scope === "package" && (
          <div>
            <label className="label" htmlFor="vq-inc">Included in the package (comma separated)</label>
            <input id="vq-inc" className="input" value={includesText} onChange={(e) => setIncludesText(e.target.value)} placeholder="Catering, Decoration" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button key={s} type="button" onClick={() => addSuggestion(s)}
                  className="rounded-full border border-sand-300 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-300 hover:bg-sand-50">
                  + {s}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-amber-700">
              Compare package prices with your combined budget for those items, not venue rental alone.
            </p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="vq-notes">Notes (optional)</label>
          <textarea id="vq-notes" className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Who quoted, valid until, advance terms…" />
        </div>

        {touched && error && <p className="text-sm text-rose-600">{error}</p>}
        <p className="text-xs text-slate-400">
          Saved for this event only. Your quote replaces the estimate and is labelled "Quoted".
        </p>
      </div>
    </Modal>
  );
}
