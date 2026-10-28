// Reusable event-theme system.
//
// A single resolver maps the REAL event type AND the saved free-text style to a
// coherent set of visual tokens: accent colors, a soft background wash, a motif
// key, decorative accents, and friendly copy. Every themed surface (dashboard
// hero, create wizard preview, event-day, module headers) derives its look from
// this — so theming stays consistent and data-driven rather than styled per
// page.
//
// The `style` argument is FREE TEXT on the backend (EventCreate.style is a
// plain string). To make it visually meaningful without changing the schema,
// the UI offers a curated set of style presets per event type (see
// STYLE_OPTIONS below) and this resolver normalizes any incoming string to the
// closest known preset. Unknown or empty styles fall back gracefully to the
// event type's base look.
//
// Colors are concrete hex (not Tailwind classes) so they can drive inline
// gradients/SVG fills; the golden brand identity is preserved across themes.

export type EventThemeKey = "wedding" | "birthday" | "community" | "default";

export interface EventTheme {
  key: EventThemeKey;
  label: string;
  /** Resolved style preset key (or "classic" when none/unknown). */
  styleKey: string;
  /** Human label for the resolved style (empty when base/no style). */
  styleLabel: string;
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
  /** Decorative accent color used by the illustration layer (style-aware). */
  motifAccent: string;
  /** Short celebratory tagline shown in heroes (style-aware). */
  tagline: string;
}

/** A style preset: the visual overrides it applies on top of the base type. */
interface StyleVariant {
  key: string;
  label: string;
  /** Synonyms / substrings that should resolve to this preset. */
  match: string[];
  accent?: string;
  accent2?: string;
  soft?: string;
  motifAccent?: string;
  tagline?: string;
  /** Two gradient stop colors; the wash is rebuilt from the base recipe. */
  wash?: [string, string];
}

interface BaseTheme {
  key: EventThemeKey;
  label: string;
  accent: string;
  accent2: string;
  soft: string;
  motif: EventTheme["motif"];
  tagline: string;
  /** Default decorative accent for this type. */
  motifAccent: string;
  /** Base gradient stops: [primary wash, secondary wash]. */
  wash: [string, string];
  /** Ordered style presets. The first entry is the default ("classic"). */
  styles: StyleVariant[];
}

/** Build the standard two-stop hero gradient over the warm ivory base. */
function gradient([a, b]: [string, string]): string {
  const fade = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const bl = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${bl},0)`;
  };
  return (
    `radial-gradient(900px 400px at 100% -20%, ${a} 0%, ${fade(a)} 60%), ` +
    `radial-gradient(700px 360px at -10% 0%, ${b} 0%, ${fade(b)} 55%), #fdfcf9`
  );
}

const BASES: Record<EventThemeKey, BaseTheme> = {
  wedding: {
    key: "wedding",
    label: "Wedding",
    accent: "#be185d", // plum/rose
    accent2: "#d97706", // restrained gold
    soft: "#fce7f3",
    motif: "rings",
    motifAccent: "#be185d",
    tagline: "A celebration of forever",
    wash: ["#fce7f3", "#fef3c7"],
    styles: [
      {
        key: "classic",
        label: "Classic",
        match: ["classic", "traditional", "formal", "elegant"],
      },
      {
        key: "romantic",
        label: "Romantic blush",
        match: ["romantic", "blush", "floral", "soft", "pastel"],
        accent: "#db2777",
        accent2: "#fb7185",
        soft: "#ffe4e6",
        motifAccent: "#db2777",
        tagline: "Soft, romantic and timeless",
        wash: ["#ffe4e6", "#fce7f3"],
      },
      {
        key: "royal",
        label: "Royal",
        match: ["royal", "grand", "luxury", "regal", "opulent"],
        accent: "#6d28d9",
        accent2: "#d97706",
        soft: "#ede9fe",
        motifAccent: "#6d28d9",
        tagline: "A grand, regal affair",
        wash: ["#ede9fe", "#fef3c7"],
      },
      {
        key: "rustic",
        label: "Rustic garden",
        match: ["rustic", "garden", "outdoor", "boho", "natural", "greenery"],
        accent: "#047857",
        accent2: "#d97706",
        soft: "#d1fae5",
        motifAccent: "#047857",
        tagline: "Natural, green and heartfelt",
        wash: ["#d1fae5", "#fef3c7"],
      },
    ],
  },
  birthday: {
    key: "birthday",
    label: "Birthday",
    accent: "#d97706", // amber/gold
    accent2: "#db2777", // playful pink
    soft: "#fef3c7",
    motif: "balloons",
    motifAccent: "#db2777",
    tagline: "Let's throw a party",
    wash: ["#fef3c7", "#ffe4e6"],
    styles: [
      {
        key: "classic",
        label: "Classic",
        match: ["classic", "simple", "traditional"],
      },
      {
        key: "kids",
        label: "Kids & playful",
        match: ["kid", "kids", "playful", "fun", "cartoon", "jungle", "circus"],
        accent: "#2563eb",
        accent2: "#f59e0b",
        soft: "#dbeafe",
        motifAccent: "#2563eb",
        tagline: "Bright, playful and full of fun",
        wash: ["#dbeafe", "#fef3c7"],
      },
      {
        key: "elegant",
        label: "Elegant",
        match: ["elegant", "milestone", "adult", "sophisticated", "gold", "black tie"],
        accent: "#b45309",
        accent2: "#78350f",
        soft: "#fef3c7",
        motifAccent: "#b45309",
        tagline: "A refined milestone celebration",
        wash: ["#fef3c7", "#fde68a"],
      },
      {
        key: "neon",
        label: "Neon party",
        match: ["neon", "glow", "disco", "teen", "vibrant", "bold"],
        accent: "#7c3aed",
        accent2: "#06b6d4",
        soft: "#f3e8ff",
        motifAccent: "#7c3aed",
        tagline: "Turn up the colour",
        wash: ["#f3e8ff", "#cffafe"],
      },
    ],
  },
  community: {
    key: "community",
    label: "Community event",
    accent: "#b45309", // warm amber
    accent2: "#0d9488", // teal for a friendly, civic feel
    soft: "#ccfbf1",
    motif: "people",
    motifAccent: "#0d9488",
    tagline: "Bringing people together",
    wash: ["#ccfbf1", "#fef3c7"],
    styles: [
      {
        key: "classic",
        label: "Classic",
        match: ["classic", "gathering", "meetup", "general"],
      },
      {
        key: "festival",
        label: "Festival",
        match: ["festival", "carnival", "fair", "celebration", "mela", "cultural"],
        accent: "#ea580c",
        accent2: "#db2777",
        soft: "#ffedd5",
        motifAccent: "#ea580c",
        tagline: "A vibrant community festival",
        wash: ["#ffedd5", "#ffe4e6"],
      },
      {
        key: "formal",
        label: "Formal / civic",
        match: ["formal", "civic", "conference", "official", "corporate", "fundraiser"],
        accent: "#0369a1",
        accent2: "#0d9488",
        soft: "#e0f2fe",
        motifAccent: "#0369a1",
        tagline: "A dignified community occasion",
        wash: ["#e0f2fe", "#ccfbf1"],
      },
      {
        key: "charity",
        label: "Charity drive",
        match: ["charity", "drive", "volunteer", "donation", "benefit", "nonprofit"],
        accent: "#15803d",
        accent2: "#0d9488",
        soft: "#dcfce7",
        motifAccent: "#15803d",
        tagline: "Giving back, together",
        wash: ["#dcfce7", "#ccfbf1"],
      },
    ],
  },
  default: {
    key: "default",
    label: "Event",
    accent: "#d97706",
    accent2: "#db2777",
    soft: "#fef3c7",
    motif: "sparkles",
    motifAccent: "#d97706",
    tagline: "Your celebration, planned",
    wash: ["#fef3c7", "#ffe4e6"],
    styles: [{ key: "classic", label: "Classic", match: ["classic"] }],
  },
};

/**
 * Public list of selectable style presets per event type. The UI renders these
 * as chips; the stored value is the preset `label` (a plain string the backend
 * accepts as-is). "classic" is intentionally excluded from the pickable list so
 * an empty style naturally means the base/classic look.
 */
export const STYLE_OPTIONS: Record<
  EventThemeKey,
  { key: string; label: string }[]
> = {
  wedding: pickable("wedding"),
  birthday: pickable("birthday"),
  community: pickable("community"),
  default: [],
};

function pickable(key: EventThemeKey): { key: string; label: string }[] {
  return BASES[key].styles
    .filter((s) => s.key !== "classic")
    .map((s) => ({ key: s.key, label: s.label }));
}

/** Resolve the style preset for a base theme from a free-text style string. */
function resolveStyle(base: BaseTheme, style?: string): StyleVariant {
  const classic = base.styles[0];
  if (!style) return classic;
  const needle = style.trim().toLowerCase();
  if (!needle) return classic;
  // Exact label/key match first, then substring/synonym match.
  for (const v of base.styles) {
    if (v.key === needle || v.label.toLowerCase() === needle) return v;
  }
  for (const v of base.styles) {
    if (v.match.some((m) => needle.includes(m) || m.includes(needle))) return v;
  }
  return classic;
}

/** Resolve a full theme from the event type and optional free-text style. */
export function eventTheme(
  type: string | undefined,
  style?: string
): EventTheme {
  const base =
    type && type in BASES ? BASES[type as EventThemeKey] : BASES.default;
  const variant = resolveStyle(base, style);
  const wash = variant.wash ?? base.wash;
  return {
    key: base.key,
    label: base.label,
    styleKey: variant.key,
    styleLabel: variant.key === "classic" ? "" : variant.label,
    accent: variant.accent ?? base.accent,
    accent2: variant.accent2 ?? base.accent2,
    soft: variant.soft ?? base.soft,
    heroGradient: gradient(wash),
    motif: base.motif,
    motifAccent: variant.motifAccent ?? base.motifAccent,
    tagline: variant.tagline ?? base.tagline,
  };
}
