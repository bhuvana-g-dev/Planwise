import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEventDetail } from "../hooks/useEventDetail";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Skeleton,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { api, ApiError } from "../services/api";
import type { ChangeType, ReplanRequest, ReplanResult } from "../types";
import { formatDate, formatINR, titleCase } from "../utils/format";

export default function AdaptPlan() {
  const { eventId } = useParams();
  const { data, loading, error, reload } = useEventDetail(eventId);
  const toast = useToast();

  const [changeType, setChangeType] = useState<ChangeType>("budget");
  const [budget, setBudget] = useState<number>(24000);
  const [guests, setGuests] = useState<number>(80);
  const [date, setDate] = useState<string>("");
  const [result, setResult] = useState<ReplanResult | null>(null);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const plan = data.active_plan;

  if (!plan)
    return (
      <EmptyState
        icon={<RefreshCw className="h-7 w-7" />}
        title="No active plan to adapt"
        description="Generate a plan first, then you can change the budget, guests or date and preview the impact."
        action={
          <Link to={`/events/${eventId}`} className="btn-primary">
            Back to dashboard
          </Link>
        }
      />
    );

  async function propose() {
    if (!eventId) return;
    const req: ReplanRequest = { change_type: changeType };
    if (changeType === "budget") req.new_budget_inr = budget;
    if (changeType === "guest_count") req.new_guest_count = guests;
    if (changeType === "event_date") req.new_event_date = date;

    setRunning(true);
    setActionError(null);
    setResult(null);
    try {
      const res = await api.replan(eventId, req);
      setResult(res);
      if (!res.report.feasible) {
        toast.info("No feasible plan found — see the conflict details below.");
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Replan failed";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  async function approve() {
    if (!eventId || !result?.proposed_plan || !plan) return;
    setApproving(true);
    setActionError(null);
    try {
      await api.approvePlan(eventId, result.proposed_plan, plan.version);
      toast.success("Revision approved and saved as the new active plan. 🎉");
      setResult(null);
      setConfirmOpen(false);
      await reload();
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 409
          ? "This proposal is stale — the plan changed since it was generated. Regenerate and try again."
          : e instanceof ApiError
          ? e.message
          : "Approval failed";
      setActionError(msg);
      toast.error(msg);
      setConfirmOpen(false);
    } finally {
      setApproving(false);
    }
  }

  const report = result?.report;

  return (
    <div className="stagger space-y-6">
      <div
        className="flex items-center justify-between"
        style={{ ["--i" as string]: 0 }}
      >
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <RefreshCw className="h-6 w-6 text-brand-600" /> Adapt plan
          </h1>
          <p className="text-sm text-slate-500">
            Current plan v{plan.version} · {formatINR(plan.budget.budget_paise)}{" "}
            budget
          </p>
        </div>
        <Link to={`/events/${eventId}`} className="btn-secondary">
          Back to dashboard
        </Link>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      {/* Change controls */}
      <div className="card p-6" style={{ ["--i" as string]: 1 }}>
        <div className="mb-4 inline-flex gap-1 rounded-xl border border-sand-300 p-1">
          {(
            [
              ["budget", "Budget"],
              ["guest_count", "Guest count"],
              ["event_date", "Event date"],
            ] as [ChangeType, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setChangeType(t)}
              className={
                changeType === t
                  ? "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm"
                  : "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-sand-50"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {changeType === "budget" && (
            <div>
              <label className="label">New budget (₹)</label>
              <input
                type="number"
                className="input w-48"
                value={budget}
                min={1}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </div>
          )}
          {changeType === "guest_count" && (
            <div>
              <label className="label">New guest count</label>
              <input
                type="number"
                className="input w-48"
                value={guests}
                min={1}
                onChange={(e) => setGuests(Number(e.target.value))}
              />
            </div>
          )}
          {changeType === "event_date" && (
            <div>
              <label className="label">New event date</label>
              <input
                type="date"
                className="input w-48"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          )}
          <button
            className="btn-primary"
            onClick={propose}
            disabled={running || (changeType === "event_date" && !date)}
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
              </>
            ) : (
              "Propose changes"
            )}
          </button>
        </div>
      </div>

      {/* Result */}
      {report && (
        <div className="stagger space-y-6" style={{ ["--i" as string]: 2 }}>
          {report.feasible ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              Feasible proposal — review the before/after below, then approve or
              reject.
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">No feasible plan found.</p>
                <ul className="mt-1 list-disc pl-4">
                  {report.constraint_violations.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Before / after budget */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryTile
              label="Previous budget"
              value={formatINR(report.previous_budget_paise)}
            />
            <SummaryTile
              label="Proposed allocated"
              value={formatINR(report.proposed_allocated_paise)}
            />
            <SummaryTile
              label="Proposed remaining"
              value={formatINR(report.proposed_remaining_paise)}
              tone={report.proposed_remaining_paise < 0 ? "rose" : "green"}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Expense diff */}
            {report.expense_deltas.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-4 font-semibold text-slate-900">
                  Expense changes
                </h3>
                <ul className="space-y-2">
                  {report.expense_deltas
                    .filter((d) => d.kind !== "unchanged")
                    .map((d, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-sand-50 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <DeltaIcon kind={d.kind} />
                          <span className="font-medium text-slate-700">
                            {titleCase(d.category)}
                          </span>
                        </span>
                        <span className="text-slate-600">
                          {d.previous_paise != null && (
                            <span className="text-slate-400 line-through">
                              {formatINR(d.previous_paise)}
                            </span>
                          )}
                          {d.new_paise != null && (
                            <span className="ml-2 font-medium text-slate-900">
                              {formatINR(d.new_paise)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  {report.expense_deltas.every((d) => d.kind === "unchanged") && (
                    <li className="text-sm text-slate-500">
                      No expense amounts changed.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Task diff */}
            {report.task_deltas.length > 0 && (
              <div className="card p-6">
                <h3 className="mb-4 font-semibold text-slate-900">
                  Affected deadlines
                </h3>
                <ul className="space-y-2 text-sm">
                  {report.task_deltas.map((d, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-sand-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-700">{d.name}</span>
                      <span className="text-slate-600">
                        {d.previous_due && (
                          <span className="text-slate-400 line-through">
                            {formatDate(d.previous_due)}
                          </span>
                        )}
                        {d.new_due && (
                          <span className="ml-2">{formatDate(d.new_due)}</span>
                        )}
                        {d.kind === "overdue" && (
                          <Badge tone="rose">overdue</Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reasons & trade-offs */}
            <div className="card p-6">
              <h3 className="mb-3 font-semibold text-slate-900">
                Reasoning & trade-offs
              </h3>
              <ul className="space-y-1.5 text-sm text-slate-600">
                {report.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    {r}
                  </li>
                ))}
                {report.trade_offs.map((t, i) => (
                  <li key={`t-${i}`} className="flex gap-2 text-amber-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Preserved constraints */}
            <div className="card p-6">
              <h3 className="mb-3 font-semibold text-slate-900">
                Preserved requirements
              </h3>
              {report.preserved_constraints.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No hard constraints declared.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm text-emerald-700">
                  {report.preserved_constraints.map((c, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4" /> {c}
                    </li>
                  ))}
                </ul>
              )}
              {report.unresolved_questions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase text-slate-400">
                    Unresolved
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">
                    {report.unresolved_questions.map((q, i) => (
                      <li key={i}>• {q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={() => setResult(null)}>
              Return to editing
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                setResult(null);
                toast.info("Proposal rejected. Your current plan is unchanged.");
              }}
            >
              <X className="h-4 w-4" /> Reject
            </button>
            <button
              className="btn-primary"
              disabled={!report.feasible || !result?.proposed_plan}
              onClick={() => setConfirmOpen(true)}
            >
              <Check className="h-4 w-4" /> Approve revision
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Approve this revision?"
        message="The proposed plan becomes your new active plan (a new version). Your previous versions stay saved for comparison."
        confirmLabel="Approve & save"
        busy={approving}
        onConfirm={approve}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "rose";
}) {
  const color =
    tone === "green"
      ? "text-emerald-600"
      : tone === "rose"
      ? "text-rose-600"
      : "text-slate-900";
  return (
    <div className="card p-4 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function DeltaIcon({ kind }: { kind: string }) {
  if (kind === "added") return <Plus className="h-4 w-4 text-emerald-500" />;
  if (kind === "removed") return <X className="h-4 w-4 text-rose-500" />;
  if (kind === "modified")
    return <ArrowRight className="h-4 w-4 text-brand-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}
