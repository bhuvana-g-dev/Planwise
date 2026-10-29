import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  CircleDot,
  Info,
  Loader2,
  Pencil,
  Phone,
  RefreshCw,
  Send,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { cateringService } from "../../services/cateringService";
import { ApiError } from "../../services/api";
import type {
  BookingStatus,
  CatererBudgetPreview,
  CatererOverview,
  CatererView,
} from "../../types";
import { BOOKING_LABEL, PAYMENT_LABEL, telHref } from "../../utils/caterers";
import { classNames, formatINR } from "../../utils/format";
import { ConfirmDialog, Skeleton } from "../ui";
import { useToast } from "../Toast";
import FoodTypeBadge from "./FoodTypeBadge";

const STEPS: { k: BookingStatus; label: string; hint: string; icon: React.ReactNode }[] = [
  { k: "not_booked", label: "Not booked", hint: "Still deciding", icon: <CircleDot className="h-4 w-4" /> },
  { k: "requested", label: "Requested", hint: "You contacted them", icon: <Send className="h-4 w-4" /> },
  { k: "confirmed", label: "Confirmed", hint: "Confirmed by you", icon: <BadgeCheck className="h-4 w-4" /> },
];

export default function CateringBookingPanel({
  eventId,
  overview,
  onChanged,
  onEdit,
  onCompare,
}: {
  eventId: string;
  overview: CatererOverview;
  onChanged: (ov: CatererOverview) => void;
  onEdit: (r: CatererView) => void;
  onCompare: () => void;
}) {
  const toast = useToast();
  const rec = overview.records.find((r) => r.id === overview.selected_id) ?? null;
  const [preview, setPreview] = useState<CatererBudgetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!rec || !rec.has_price || !overview.budget.has_plan || rec.booking_status === "cancelled") {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      setPreview(await cateringService.budgetPreview(eventId, rec.id));
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof ApiError ? e.message : "Couldn't load the budget impact");
    } finally {
      setLoadingPreview(false);
    }
  }, [eventId, rec, overview.budget.has_plan]);

  // Refresh whenever the selected caterer or its total/plan changes.
  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.id, rec?.total_paise, rec?.booking_status, overview.budget.plan_version]);

  if (!rec) {
    return (
      <div className="card flex flex-col items-center p-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Wallet className="h-7 w-7" />
        </span>
        <p className="mt-3 text-lg font-semibold text-slate-800">No caterer selected yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Pick one of your options to track its booking and payment, and add its
          cost to your event budget.
        </p>
        <button type="button" className="btn-primary mt-5" onClick={onCompare}>
          Compare options <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  async function setStatus(status: BookingStatus) {
    if (!rec || status === rec.booking_status) return;
    setBusy(true);
    try {
      const ov = await cateringService.update(eventId, rec.id, { booking_status: status });
      onChanged(ov);
      toast.success(`Booking marked as ${BOOKING_LABEL[status].toLowerCase()}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update booking");
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  async function toggleRefund() {
    if (!rec) return;
    setBusy(true);
    try {
      onChanged(await cateringService.update(eventId, rec.id, { refunded: !rec.refunded }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update payment");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!rec || !preview) return;
    setBusy(true);
    try {
      const out = await cateringService.applyBudget(eventId, rec.id, preview.base_version, preview.total_paise);
      onChanged(out.overview);
      toast.success(`Budget updated — catering is now ${formatINR(preview.total_paise)}.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't update the budget";
      toast.error(msg);
      if (e instanceof ApiError && e.status === 409) void loadPreview();
    } finally {
      setBusy(false);
      setConfirmApply(false);
    }
  }

  const cancelled = rec.booking_status === "cancelled";
  const stepIndex = STEPS.findIndex((s) => s.k === rec.booking_status);
  const paidPct = rec.total_paise > 0 ? Math.min(100, (rec.advance_paid_paise / rec.total_paise) * 100) : 0;
  const sync = rec.budget_sync;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
      <div className="space-y-5">
        {/* Caterer summary */}
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Selected caterer</p>
              <h2 className="mt-0.5 truncate text-xl font-bold text-slate-900">{rec.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <FoodTypeBadge type={rec.food_type} />
                <span>{rec.source === "osm" || rec.provider_id ? "Found on OpenStreetMap" : "Recorded by you"}</span>
                {rec.address && <span className="truncate">· {rec.address}</span>}
              </div>
            </div>
            <div className="flex gap-1.5">
              {rec.phone && (
                <a href={telHref(rec.phone)} className="btn-secondary px-3 py-1.5 text-sm">
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => onEdit(rec)}>
                <Pencil className="h-4 w-4" /> Edit
              </button>
            </div>
          </div>
        </section>

        {/* Booking status */}
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Booking status</h3>
            {!cancelled ? (
              <button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={() => setConfirmCancel(true)} disabled={busy}>
                Mark cancelled
              </button>
            ) : (
              <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => void setStatus("not_booked")} disabled={busy}>
                Reopen
              </button>
            )}
          </div>

          {cancelled ? (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <Ban className="h-4 w-4" /> This booking is cancelled and can't be added to the budget.
            </div>
          ) : (
            <ol className="grid grid-cols-3 gap-2" aria-label="Booking progress">
              {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const current = i === stepIndex;
                return (
                  <li key={s.k}>
                    <button
                      type="button"
                      onClick={() => void setStatus(s.k)}
                      disabled={busy}
                      aria-current={current ? "step" : undefined}
                      className={classNames(
                        "flex w-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition",
                        current
                          ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                          : done
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-sand-200 hover:border-brand-300 hover:bg-sand-50"
                      )}
                    >
                      <span className={classNames("grid h-7 w-7 place-items-center rounded-full", current ? "bg-brand-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-sand-200 text-slate-500")}>
                        {s.icon}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                      <span className="text-[11px] text-slate-500">{s.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            PlanWise records the status you set. It doesn't contact caterers or make reservations.
          </p>
        </section>

        {/* Payment */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Payment</h3>
            <span className={classNames("rounded-full px-2.5 py-0.5 text-xs font-semibold",
              rec.payment_status === "paid" ? "bg-emerald-100 text-emerald-700"
                : rec.payment_status === "partially_paid" ? "bg-amber-100 text-amber-800"
                : rec.payment_status === "refunded" ? "bg-sky-100 text-sky-700"
                : "bg-sand-200 text-slate-600")}>
              {PAYMENT_LABEL[rec.payment_status]}
            </span>
          </div>
          {rec.has_price ? (
            <>
              <div className="h-3 overflow-hidden rounded-full bg-sand-200">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${paidPct}%` }} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Money label="Agreed total" value={rec.total_paise} />
                <Money label="Advance paid" value={rec.advance_paid_paise} />
                <Money label="Balance due" value={rec.balance_paise} strong />
              </dl>
            </>
          ) : (
            <p className="text-sm text-slate-500">Add the agreed price to track payments.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => onEdit(rec)}>
              Record a payment
            </button>
            {rec.advance_paid_paise > 0 && (
              <button type="button" className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800" onClick={() => void toggleRefund()} disabled={busy}>
                {rec.refunded ? "Undo refund" : "Mark as refunded"}
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Budget impact */}
      <section className="card h-fit p-5 xl:sticky xl:top-24">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Budget impact</h3>
          <SyncBadge sync={sync} />
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Your plan keeps one catering line. Applying replaces it — catering is never counted twice.
        </p>

        {!overview.budget.has_plan ? (
          <Notice tone="amber">Generate your event plan from the dashboard first — it creates the budget catering is added to.</Notice>
        ) : cancelled ? (
          <Notice tone="slate">Cancelled bookings aren't added to the budget.</Notice>
        ) : !rec.has_price ? (
          <Notice tone="slate">Add a price to see how this caterer affects your budget.</Notice>
        ) : loadingPreview && !preview ? (
          <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : previewError ? (
          <Notice tone="rose">{previewError}</Notice>
        ) : preview ? (
          <>
            <ImpactRow label="Catering" before={preview.before.catering_paise} after={preview.after.catering_paise} max={Math.max(preview.before.budget_paise, preview.after.allocated_paise)} />
            <ImpactRow label="Total allocated" before={preview.before.allocated_paise} after={preview.after.allocated_paise} max={Math.max(preview.before.budget_paise, preview.after.allocated_paise)} />
            <div className="mt-4 flex items-baseline justify-between rounded-xl bg-sand-50 px-4 py-3">
              <span className="text-sm text-slate-600">Remaining after</span>
              <span className={classNames("text-xl font-bold tabular-nums", preview.after.remaining_paise < 0 ? "text-rose-600" : "text-emerald-700")}>
                {formatINR(preview.after.remaining_paise)}
              </span>
            </div>
            <p className="mt-1 text-right text-xs text-slate-400">of {formatINR(preview.after.budget_paise)} budget</p>

            {preview.warnings.map((w) => (
              <div key={w} className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {w}
              </div>
            ))}

            {sync === "in_sync" ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-700">
                <BadgeCheck className="h-4 w-4" /> Your budget already includes this caterer.
              </p>
            ) : (
              <button type="button" className="btn-primary mt-4 w-full" onClick={() => setConfirmApply(true)} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : sync === "out_of_date" ? <RefreshCw className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                {sync === "out_of_date" ? "Update budget to new total" : "Apply to budget"}
              </button>
            )}
          </>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmApply}
        title="Update your event budget?"
        message={preview
          ? `Catering will be set to ${formatINR(preview.total_paise)} (was ${formatINR(preview.before.catering_paise)}). Remaining budget becomes ${formatINR(preview.after.remaining_paise)}. This saves a new plan version.`
          : ""}
        confirmLabel="Update budget"
        onConfirm={() => void apply()}
        onCancel={() => setConfirmApply(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={confirmCancel}
        title="Mark this booking as cancelled?"
        message="Your budget isn't changed automatically. Select another caterer and apply it to replace the catering cost."
        confirmLabel="Mark cancelled"
        tone="danger"
        onConfirm={() => void setStatus("cancelled")}
        onCancel={() => setConfirmCancel(false)}
        busy={busy}
      />
    </div>
  );
}

function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={classNames("mt-0.5 tabular-nums", strong ? "text-lg font-bold text-slate-900" : "font-semibold text-slate-700")}>
        {formatINR(value)}
      </dd>
    </div>
  );
}

function ImpactRow({ label, before, after, max }: { label: string; before: number; after: number; max: number }) {
  const pct = (v: number) => (max > 0 ? Math.min(100, (v / max) * 100) : 0);
  const delta = after - before;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">
          {formatINR(before)} <ArrowRight className="inline h-3 w-3" />{" "}
          <span className="font-semibold text-slate-900">{formatINR(after)}</span>
          {delta !== 0 && (
            <span className={classNames("ml-1.5 text-xs", delta > 0 ? "text-rose-600" : "text-emerald-600")}>
              ({delta > 0 ? "+" : "−"}{formatINR(Math.abs(delta))})
            </span>
          )}
        </span>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
          <div className="h-full rounded-full bg-slate-300" style={{ width: `${pct(before)}%` }} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${pct(after)}%` }} />
        </div>
      </div>
    </div>
  );
}

function SyncBadge({ sync }: { sync: CatererView["budget_sync"] }) {
  const map = {
    in_sync: ["In budget", "bg-emerald-100 text-emerald-700"],
    out_of_date: ["Budget out of date", "bg-amber-100 text-amber-800"],
    not_applied: ["Not in budget yet", "bg-sand-200 text-slate-600"],
    replaced: ["Replaced", "bg-sand-200 text-slate-600"],
  } as const;
  const [label, cls] = map[sync];
  return <span className={classNames("rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>{label}</span>;
}

function Notice({ tone, children }: { tone: "amber" | "slate" | "rose"; children: React.ReactNode }) {
  const cls = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800"
    : tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-sand-200 bg-sand-50 text-slate-600";
  return <div className={classNames("rounded-xl border p-3 text-sm", cls)}>{children}</div>;
}
