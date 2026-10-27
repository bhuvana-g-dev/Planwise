import type { BudgetSummary } from "../types";
import { Badge, ProgressBar, ProgressRing } from "./ui";
import { formatINR } from "../utils/format";

export default function BudgetSummaryCard({ budget }: { budget: BudgetSummary }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Budget</h3>
        {budget.within_budget ? (
          <Badge tone="green">Within budget</Badge>
        ) : (
          <Badge tone="rose">Over by {formatINR(budget.overrun_paise)}</Badge>
        )}
      </div>

      <div className="mt-5 flex items-center gap-5">
        <ProgressRing
          pct={budget.utilization_pct}
          size={92}
          label={
            <div className="text-center">
              <div className="text-base font-bold text-slate-900">
                {Math.round(budget.utilization_pct)}%
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                used
              </div>
            </div>
          }
        />
        <div className="flex-1 space-y-2.5">
          <Row label="Budget" value={formatINR(budget.budget_paise)} />
          <Row label="Allocated" value={formatINR(budget.allocated_paise)} />
          <Row
            label="Remaining"
            value={formatINR(budget.remaining_paise)}
            tone={budget.remaining_paise < 0 ? "rose" : "default"}
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-slate-500">
          <span>Utilization</span>
          <span>{budget.utilization_pct}%</span>
        </div>
        <ProgressBar pct={budget.utilization_pct} />
      </div>

      {budget.committed_paise > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Committed: {formatINR(budget.committed_paise)}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "rose";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={
          tone === "rose"
            ? "text-sm font-bold text-rose-600"
            : "text-sm font-bold text-slate-900"
        }
      >
        {value}
      </span>
    </div>
  );
}
