// Reusable event-theme system.
//
// A single resolver maps the REAL event type (and optional saved style) to a
// coherent set of visual tokens: accent colors, a soft background wash, a motif
// key, and friendly copy. Every themed surface (dashboard hero, create wizard
// preview, event-day) derives its look from this — so theming stays consistent
// and data-driven rather than styled per page.
//
// Colors are concrete hex (not Tailwind classes) so they can drive inline
// gradients/SVG fills; the golden brand identity is preserved across themes.

export type EventThemeKey = "wedding" | "birthday" | "community" | "default";

export interface EventTheme {
  key: EventThemeKey;
  label: string;
  /** Primary accent (headings, rings). */
  accent: string;
  /** Secondary accent (decor, highlights). */
  accent2: string;
  /** Soft tint used for chips / subtle fills. */
  soft: string;
  /** CSS gradient for hero background washes. */
  heroGradient: string;
  /** Motif used by the illustration layer. */
  motif: "rings" | "balloons" | "people" | "sparkles";
  /** Short celebratory tagline shown in heroes. */
  tagline: string;
}

const THEMES: Record<EventThemeKey, EventTheme> = {
  wedding: {
    key: "wedding",
    label: "Wedding",
    accent: "#be185d", // plum/rose
    accent2: "#d97706", // restrained gold
    soft: "#fce7f3",
    heroGradient:
      "radial-gradient(900px 400px at 100% -20%, #fce7f3 0%, rgba(252,231,243,0) 60%), radial-gradient(700px 360px at -10% 0%, #fef3c7 0%, rgba(254,243,199,0) 55%), #fdfcf9",
    motif: "rings",
    tagline: "A celebration of forever",
  },
  birthday: {
    key: "birthday",
    label: "Birthday",
    accent: "#d97706", // amber/gold
    accent2: "#db2777", // playful pink
    soft: "#fef3c7",
    heroGradient:
      "radial-gradient(900px 400px at 100% -20%, #fef3c7 0%, rgba(254,243,199,0) 60%), radial-gradient(700px 360px at -10% 0%, #ffe4e6 0%, rgba(255,228,230,0) 55%), #fdfcf9",
    motif: "balloons",
    tagline: "Let's throw a party",
  },
  community: {
    key: "community",
    label: "Community event",
    accent: "#b45309", // warm amber
    accent2: "#0d9488", // teal for a friendly, civic feel
    soft: "#ccfbf1",
    heroGradient:
      "radial-gradient(900px 400px at 100% -20%, #ccfbf1 0%, rgba(204,251,241,0) 60%), radial-gradient(700px 360px at -10% 0%, #fef3c7 0%, rgba(254,243,199,0) 55%), #fdfcf9",
    motif: "people",
    tagline: "Bringing people together",
  },
  default: {
    key: "default",
    label: "Event",
    accent: "#d97706",
    accent2: "#db2777",
    soft: "#fef3c7",
    heroGradient:
      "radial-gradient(900px 400px at 100% -20%, #fef3c7 0%, rgba(254,243,199,0) 60%), #fdfcf9",
    motif: "sparkles",
    tagline: "Your celebration, planned",
  },
};

/** Resolve a theme from the event type (style is reserved for future tuning). */
export function eventTheme(
  type: string | undefined,
  _style?: string
): EventTheme {
  if (type && (type in THEMES)) return THEMES[type as EventThemeKey];
  return THEMES.default;
}
