import type { BudgetSummary } from "../types";
import { Badge, ProgressBar } from "./ui";
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

      <div className="mt-5 grid grid-cols-3 gap-4 text-center">
        <Stat label="Budget" value={formatINR(budget.budget_paise)} />
        <Stat label="Allocated" value={formatINR(budget.allocated_paise)} />
        <Stat
          label="Remaining"
          value={formatINR(budget.remaining_paise)}
          tone={budget.remaining_paise < 0 ? "rose" : "slate"}
        />
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

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "rose";
}) {
  return (
    <div>
      <p
        className={
          tone === "rose"
            ? "text-lg font-bold text-rose-600"
            : "text-lg font-bold text-slate-900"
        }
      >
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
