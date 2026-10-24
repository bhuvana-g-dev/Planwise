import type { BudgetSummary } from "../types";
import { formatINR, titleCase } from "../utils/format";

const COLORS = [
  "#4f46e5",
  "#6366f1",
  "#818cf8",
  "#a5b4fc",
  "#c7d2fe",
  "#0ea5e9",
  "#14b8a6",
];

// A dependency-free horizontal bar breakdown driven entirely by real data.
export default function BudgetChart({ budget }: { budget: BudgetSummary }) {
  const entries = Object.entries(budget.category_totals).sort(
    (a, b) => b[1] - a[1]
  );
  const max = Math.max(1, ...entries.map(([, v]) => v));

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No expenses yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map(([cat, paise], i) => {
        const pct = (paise / max) * 100;
        const share = budget.allocated_paise
          ? Math.round((paise / budget.allocated_paise) * 100)
          : 0;
        return (
          <li key={cat}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{titleCase(cat)}</span>
              <span className="text-slate-500">
                {formatINR(paise)} · {share}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
