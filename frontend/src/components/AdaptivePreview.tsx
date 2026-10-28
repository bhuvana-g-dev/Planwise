import { useMemo, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { eventTheme } from "../theme/eventTheme";
import { formatINR } from "../utils/format";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { classNames } from "../utils/format";

// A self-contained, illustrative demonstration of PlanWise's core behaviour:
// when the budget drops, the plan rebalances by trimming the lowest-priority
// categories first while protecting the top priority (catering). This mirrors
// the real deterministic engine's logic (rank_savings_candidates) but is a
// LOCAL illustration only — clearly labelled, no API calls, no real data.
//
// Decorative motion is gated on prefers-reduced-motion. No external deps.

interface Cat {
  key: string;
  label: string;
  /** priority rank: 1 = highest (protected longest) */
  rank: number;
  base: number; // rupees at the full budget
}

// Starting allocation at the full ₹30,000 budget (illustrative).
const CATS: Cat[] = [
  { key: "catering", label: "Catering", rank: 1, base: 12600 },
  { key: "venue", label: "Venue", rank: 2, base: 6000 },
  { key: "decorations", label: "Decorations", rank: 3, base: 5400 },
  { key: "activities", label: "Activities", rank: 4, base: 3600 },
  { key: "logistics", label: "Logistics", rank: 5, base: 2400 },
];

const FULL = 30000;

/** Deterministically trim to `target`, cutting lowest priority (highest rank)
 *  first, never touching the top-priority category below a protected floor. */
function rebalance(target: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CATS) out[c.key] = c.base;
  let overrun = FULL - target;
  if (overrun <= 0) return out;
  // Cut from least important first.
  const order = [...CATS].sort((a, b) => b.rank - a.rank);
  for (const c of order) {
    if (overrun <= 0) break;
    // Protect the #1 priority: never cut it below 80% of its base.
    const floor = c.rank === 1 ? Math.round(c.base * 0.8) : 0;
    const canCut = out[c.key] - floor;
    const cut = Math.min(canCut, overrun);
    out[c.key] -= cut;
    overrun -= cut;
  }
  return out;
}

export default function AdaptivePreview({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  // Two illustrative scenarios the user can toggle between.
  const [target, setTarget] = useState(FULL);
  const theme = eventTheme("birthday");

  const alloc = useMemo(() => rebalance(target), [target]);
  const baseTotal = FULL;
  const allocated = Object.values(alloc).reduce((a, b) => a + b, 0);
  const changed = target !== FULL;

  return (
    <div
      className={classNames(
        "card relative overflow-hidden p-5 sm:p-6",
        className
      )}
      style={{ background: theme.heroGradient }}
    >
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: theme.accent }}
            >
              Live demo
            </p>
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Watch a plan adapt
            </h3>
          </div>
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-500">
            Illustrative — not a saved event
          </span>
        </div>

        {/* Scenario toggle */}
        <div
          className="mt-4 inline-flex rounded-xl border border-sand-300 bg-white/60 p-1"
          role="group"
          aria-label="Choose a budget scenario"
        >
          {[
            { v: FULL, label: formatINR(FULL * 100) },
            { v: 24000, label: formatINR(24000 * 100) },
            { v: 18000, label: formatINR(18000 * 100) },
          ].map((o) => {
            const active = target === o.v;
            return (
              <button
                key={o.v}
                type="button"
                aria-pressed={active}
                onClick={() => setTarget(o.v)}
                className={classNames(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white"
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Drop the budget and PlanWise trims the lowest-priority categories
          first — protecting catering.
        </p>

        {/* Category bars */}
        <ul className="mt-4 space-y-2.5">
          {CATS.map((c) => {
            const value = alloc[c.key];
            const pct = Math.round((value / c.base) * 100);
            const cut = value < c.base;
            return (
              <li key={c.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    {c.label}
                    {c.rank === 1 && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: theme.soft, color: theme.accent }}
                      >
                        protected
                      </span>
                    )}
                  </span>
                  <span
                    className={classNames(
                      "tabular-nums",
                      cut ? "text-amber-700" : "text-slate-600"
                    )}
                  >
                    {formatINR(value * 100)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-200">
                  <div
                    className={classNames(
                      "h-full rounded-full",
                      reduced ? "" : "transition-[width] duration-500 ease-out"
                    )}
                    style={{
                      width: `${pct}%`,
                      background:
                        c.rank === 1 ? theme.accent : theme.accent2,
                      opacity: cut ? 0.75 : 1,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {/* Before/after summary */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="tabular-nums">{formatINR(baseTotal * 100)}</span>
            <ArrowRight className="h-4 w-4 text-brand-500" />
            <span className="font-semibold tabular-nums text-slate-900">
              {formatINR(allocated * 100)}
            </span>
          </div>
          <span
            className={classNames(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
              changed
                ? "bg-emerald-100 text-emerald-700"
                : "bg-sand-200 text-slate-600"
            )}
          >
            <RefreshCw className="h-3 w-3" />
            {changed ? "Rebalanced, still on budget" : "Fully allocated"}
          </span>
        </div>
      </div>
    </div>
  );
}
