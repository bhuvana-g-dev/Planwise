import type { ReactNode } from "react";
import type { EventTheme } from "../theme/eventTheme";

// A compact, themed page header reused across the feature modules (Budget,
// Timeline, Guests, Catering, Venues, Vendors, Adapt). It mirrors the
// EventHero look — a soft event-type gradient wash and a spot illustration —
// so every module feels part of the same celebration, while the title/subtitle
// and right-hand actions stay per-page. Purely presentational: no data wiring.
export default function ModuleHeader({
  theme,
  eyebrow,
  title,
  subtitle,
  art,
  actions,
}: {
  /** Optional event theme — when provided, drives the gradient + accent. */
  theme?: EventTheme;
  /** Small uppercase label above the title (defaults to the theme label). */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** A module spot illustration (e.g. <BudgetArt/>), shown on the right. */
  art?: ReactNode;
  /** Right-aligned action buttons / links. */
  actions?: ReactNode;
}) {
  const background =
    theme?.heroGradient ??
    "radial-gradient(900px 400px at 100% -20%, #fef3c7 0%, rgba(254,243,199,0) 60%), #fdfcf9";
  const accent = theme?.accent ?? "#d97706";
  const label = eyebrow ?? theme?.label ?? "PlanWise";

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-sand-200 p-5 shadow-card sm:p-6"
      style={{ background }}
    >
      {art && (
        <div
          className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 opacity-90 sm:block"
          aria-hidden
        >
          {art}
        </div>
      )}
      <div className="relative sm:pr-28">
        <span
          className="mb-1 inline-block text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: accent }}
        >
          {label}
        </span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-900">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
