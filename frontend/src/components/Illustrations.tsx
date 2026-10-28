// Reusable SVG illustrations — larger, scene-level graphics (distinct from the
// small Stickers). All are decorative (aria-hidden) and accept theme colors so
// they adapt per event type. Clean geometry, consistent strokes, no emoji.
import type { EventTheme } from "../theme/eventTheme";

interface HeroProps {
  theme: EventTheme;
  className?: string;
}

/** Large event-type hero scene, selected by theme.motif. */
export function EventHeroArt({ theme, className }: HeroProps) {
  switch (theme.motif) {
    case "rings":
      return <WeddingScene theme={theme} className={className} />;
    case "balloons":
      return <BirthdayScene theme={theme} className={className} />;
    case "people":
      return <CommunityScene theme={theme} className={className} />;
    default:
      return <SparkleScene theme={theme} className={className} />;
  }
}

function frame(className?: string) {
  return {
    viewBox: "0 0 200 140",
    className,
    role: "img" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

function WeddingScene({ theme, className }: HeroProps) {
  return (
    <svg {...frame(className)}>
      <circle cx="82" cy="78" r="26" fill="none" stroke={theme.accent} strokeWidth="5" />
      <circle cx="116" cy="78" r="26" fill="none" stroke={theme.accent2} strokeWidth="5" />
      <path d="M70 46l6 8 6-8z" fill="#fcd34d" />
      <path d="M116 44l5 7 5-7z" fill="#fcd34d" />
      {/* floral sprigs */}
      <path d="M30 110c14-6 22-16 24-30" fill="none" stroke={theme.accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="110" r="4" fill={theme.accent2} />
      <circle cx="40" cy="98" r="3" fill={theme.accent} />
      <path d="M170 110c-14-6-22-16-24-30" fill="none" stroke={theme.accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="170" cy="110" r="4" fill={theme.accent2} />
      <circle cx="160" cy="98" r="3" fill={theme.accent} />
    </svg>
  );
}

function BirthdayScene({ theme, className }: HeroProps) {
  return (
    <svg {...frame(className)}>
      {/* balloons */}
      <ellipse cx="70" cy="46" rx="16" ry="20" fill={theme.accent} />
      <ellipse cx="100" cy="38" rx="16" ry="20" fill={theme.accent2} />
      <ellipse cx="130" cy="48" rx="16" ry="20" fill="#fbbf24" />
      <path d="M70 66c0 8 2 10 6 16M100 58c0 8-2 10-6 16M130 68c0 8 2 8-4 14" stroke="#b45309" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* cake */}
      <rect x="78" y="96" width="44" height="26" rx="4" fill="#f9a8d4" />
      <rect x="78" y="96" width="44" height="9" fill={theme.accent} />
      <path d="M100 82v10" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="80" r="3" fill="#fbbf24" />
    </svg>
  );
}

function CommunityScene({ theme, className }: HeroProps) {
  const people = [
    { x: 60, c: theme.accent },
    { x: 90, c: theme.accent2 },
    { x: 120, c: "#fbbf24" },
    { x: 150, c: theme.accent },
  ];
  return (
    <svg {...frame(className)}>
      {/* bunting */}
      <path d="M20 40q90 30 160 0" fill="none" stroke={theme.accent2} strokeWidth="2" />
      {[30, 60, 90, 120, 150, 170].map((x, i) => (
        <path key={i} d={`M${x} 44l6 10 6-10z`} fill={i % 2 ? theme.accent : "#fbbf24"} />
      ))}
      {/* people */}
      {people.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy="84" r="8" fill={p.c} />
          <path d={`M${p.x - 9} 122c0-12 4-18 9-18s9 6 9 18z`} fill={p.c} opacity="0.85" />
        </g>
      ))}
    </svg>
  );
}

function SparkleScene({ theme, className }: HeroProps) {
  return (
    <svg {...frame(className)}>
      <path d="M100 40c3 22 10 30 32 33-22 3-29 11-32 33-3-22-10-30-32-33 22-3 29-11 32-33z" fill={theme.accent} opacity="0.9" />
      <path d="M50 54c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12z" fill={theme.accent2} />
      <path d="M152 92c1 6 3 8 9 9-6 1-8 3-9 9-1-6-3-8-9-9 6-1 8-3 9-9z" fill="#fbbf24" />
    </svg>
  );
}

// ── Module spot illustrations (reused across pages) ──────────────────────
export function BudgetArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <circle cx="24" cy="24" r="16" fill="#fef3c7" />
      <path d="M24 14v20M19 19h7a3 3 0 010 6h-4a3 3 0 000 6h7" stroke="#b45309" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function GuestsArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <circle cx="18" cy="20" r="6" fill="#fbbf24" />
      <circle cx="31" cy="22" r="5" fill="#db2777" />
      <path d="M8 38c0-7 5-11 10-11s10 4 10 11z" fill="#fde68a" />
      <path d="M22 38c0-6 4-9 9-9s9 3 9 9z" fill="#fbcfe8" />
    </svg>
  );
}

export function CateringArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <path d="M12 30a12 12 0 0124 0z" fill="#fbbf24" />
      <rect x="10" y="30" width="28" height="3" rx="1.5" fill="#b45309" />
      <path d="M24 18v-4" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="13" r="2" fill="#db2777" />
    </svg>
  );
}

export function VenueArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <path d="M24 8l14 10v22H10V18z" fill="#fde68a" />
      <path d="M24 8l14 10H10z" fill="#fbbf24" />
      <rect x="20" y="28" width="8" height="12" fill="#b45309" />
    </svg>
  );
}

export function EmptyPlanArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden focusable="false">
      <rect x="24" y="18" width="72" height="56" rx="8" fill="#fff" stroke="#e4dbc9" strokeWidth="2" />
      <rect x="24" y="18" width="72" height="14" rx="8" fill="#fef3c7" />
      <path d="M36 46h30M36 56h20" stroke="#e4dbc9" strokeWidth="3" strokeLinecap="round" />
      <path d="M78 66c1 6 4 9 11 10-7 1-10 4-11 10-1-6-4-9-11-10 7-1 10-4 11-10z" fill="#fbbf24" />
    </svg>
  );
}
