import type { ReactNode } from "react";
import { EventHeroArt } from "./Illustrations";
import type { EventTheme } from "../theme/eventTheme";

// Themed hero banner: a soft event-type gradient wash + a large scene
// illustration on the right, with slotted content on the left. Reused by the
// dashboard and the create-event live preview so both feel consistent.
export default function EventHero({
  theme,
  children,
  compact = false,
}: {
  theme: EventTheme;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-sand-200 shadow-card transition-[background] duration-500"
      style={{ background: theme.heroGradient }}
    >
      {/* Decorative scene, non-interactive, hidden on very small screens. */}
      <div
        className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 opacity-90 sm:block"
        aria-hidden
      >
        <EventHeroArt
          theme={theme}
          className={compact ? "h-28 w-40" : "h-40 w-56"}
        />
      </div>
      <div
        className={`relative ${compact ? "p-5 sm:p-6" : "p-6 sm:p-8"} sm:pr-56`}
      >
        <span
          className="mb-2 inline-block text-xs font-semibold uppercase tracking-wider"
          style={{ color: theme.accent }}
        >
          {theme.tagline}
        </span>
        {children}
      </div>
    </section>
  );
}
