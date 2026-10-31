// Invitation template catalogue.
//
// A template is pure data: palette, fonts, frame, ornament and default wording.
// The card renderer (components/invitations/InvitationCard) turns a template +
// the user's InvitationDesign into an SVG, so adding a template needs no new
// component code.
//
// Fonts are system stacks on purpose: the PNG export draws the SVG through an
// <img>, which can't load web fonts, so only installed fonts render reliably.

import type { EventType, InvitationDesign } from "../types";

export type FontKey = "serif" | "elegant" | "script" | "sans" | "rounded" | "mono" | "black";

/** Family stack + average glyph width (em) used for text wrapping. */
export const FONTS: Record<FontKey, { family: string; width: number }> = {
  serif: { family: "Georgia, 'Times New Roman', serif", width: 0.5 },
  elegant: { family: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", width: 0.5 },
  script: { family: "'Segoe Script', 'Brush Script MT', 'Apple Chancery', cursive", width: 0.52 },
  sans: { family: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", width: 0.52 },
  rounded: { family: "'Trebuchet MS', 'Segoe UI', Arial, sans-serif", width: 0.52 },
  mono: { family: "'Courier New', Courier, monospace", width: 0.6 },
  black: { family: "'Arial Black', 'Segoe UI Black', Arial, sans-serif", width: 0.64 },
};

export type Frame = "none" | "double" | "arch" | "band" | "corners" | "panel";
export type Ornament =
  | "mandala" | "floral" | "kolam" | "leaves" | "balloons" | "confetti"
  | "stars" | "bunting" | "diya" | "hearts" | "sparkle" | "cake" | "geometric";
export type Divider = "diamond" | "dots" | "heart" | "star" | "flower" | "line";

export type TemplateGroup = EventType | "any";

export interface InvitationTemplate {
  id: string;
  name: string;
  /** Which event type it's designed for; "any" suits every occasion. */
  group: TemplateGroup;
  palette: {
    bg: string;
    bg2: string;
    ink: string;
    accent: string;
    muted: string;
    /** Fill for arch/panel frames. */
    panel: string;
  };
  display: FontKey;
  body: FontKey;
  headlineWeight: number;
  uppercaseHeadline?: boolean;
  italicHeadline?: boolean;
  frame: Frame;
  ornament: Ornament;
  divider: Divider;
  /** `{event}` in these is replaced with the event name. */
  defaults: { eyebrow: string; headline: string; message: string };
}

export const CARD_W = 1080;
export const CARD_H = 1350;

const T = (t: InvitationTemplate) => t;

export const TEMPLATES: InvitationTemplate[] = [
  // ── Wedding ────────────────────────────────────────────────────────────
  T({
    id: "wedding-royal-mandala", name: "Royal mandala", group: "wedding",
    palette: { bg: "#4a0d2a", bg2: "#2a0617", ink: "#fdf2d0", accent: "#e6b74a", muted: "#e9cfa0", panel: "#3a0a21" },
    display: "elegant", body: "serif", headlineWeight: 600,
    frame: "double", ornament: "mandala", divider: "diamond",
    defaults: {
      eyebrow: "Together with their families",
      headline: "{event}",
      message: "request the pleasure of your company to celebrate their wedding and bless the couple.",
    },
  }),
  T({
    id: "wedding-blush-floral", name: "Blush florals", group: "wedding",
    palette: { bg: "#fff1f2", bg2: "#fde4ec", ink: "#5b2333", accent: "#be185d", muted: "#9f5f73", panel: "#ffffff" },
    display: "script", body: "elegant", headlineWeight: 400,
    frame: "none", ornament: "floral", divider: "flower",
    defaults: {
      eyebrow: "You're invited to the wedding of",
      headline: "{event}",
      message: "With joy in our hearts, we invite you to share in our special day.",
    },
  }),
  T({
    id: "wedding-temple-kolam", name: "Temple kolam", group: "wedding",
    palette: { bg: "#fff7e6", bg2: "#fde9c3", ink: "#6b1d1d", accent: "#b91c1c", muted: "#92400e", panel: "#fffaf0" },
    display: "serif", body: "serif", headlineWeight: 700, uppercaseHeadline: true,
    frame: "band", ornament: "kolam", divider: "dots",
    defaults: {
      eyebrow: "With the blessings of our elders",
      headline: "{event}",
      message: "We cordially invite you and your family to grace the auspicious wedding ceremony with your presence.",
    },
  }),
  T({
    id: "wedding-garden-vows", name: "Garden vows", group: "wedding",
    palette: { bg: "#eef5ea", bg2: "#dcebd3", ink: "#23412e", accent: "#3f7d4e", muted: "#5f7d68", panel: "#fbfdf9" },
    display: "elegant", body: "serif", headlineWeight: 500, italicHeadline: true,
    frame: "arch", ornament: "leaves", divider: "line",
    defaults: {
      eyebrow: "Please join us for the wedding of",
      headline: "{event}",
      message: "Celebrate love, laughter and a happily ever after with us under the open sky.",
    },
  }),
  T({
    id: "wedding-modern-minimal", name: "Modern minimal", group: "wedding",
    palette: { bg: "#ffffff", bg2: "#f5f5f4", ink: "#1c1917", accent: "#a16207", muted: "#78716c", panel: "#ffffff" },
    display: "sans", body: "sans", headlineWeight: 300, uppercaseHeadline: true,
    frame: "none", ornament: "geometric", divider: "line",
    defaults: {
      eyebrow: "The wedding of",
      headline: "{event}",
      message: "We would love for you to celebrate with us.",
    },
  }),
  T({
    id: "wedding-save-the-date", name: "Save the date", group: "wedding",
    palette: { bg: "#1e293b", bg2: "#0b1220", ink: "#f8fafc", accent: "#fbbf24", muted: "#cbd5e1", panel: "#111827" },
    display: "script", body: "sans", headlineWeight: 400,
    frame: "double", ornament: "sparkle", divider: "heart",
    defaults: {
      eyebrow: "Save the date",
      headline: "{event}",
      message: "Formal invitation to follow. We can't wait to celebrate with you.",
    },
  }),

  // ── Birthday ───────────────────────────────────────────────────────────
  T({
    id: "birthday-balloon-bash", name: "Balloon bash", group: "birthday",
    palette: { bg: "#fff7ed", bg2: "#ffe4cc", ink: "#7c2d12", accent: "#ea580c", muted: "#9a3412", panel: "#ffffff" },
    display: "black", body: "rounded", headlineWeight: 900,
    frame: "none", ornament: "balloons", divider: "dots",
    defaults: {
      eyebrow: "You're invited",
      headline: "{event}",
      message: "Come celebrate with cake, games and lots of fun. It won't be a party without you.",
    },
  }),
  T({
    id: "birthday-kids-stars", name: "Kids & stars", group: "birthday",
    palette: { bg: "#e0f2fe", bg2: "#dbeafe", ink: "#1e3a8a", accent: "#2563eb", muted: "#475569", panel: "#ffffff" },
    display: "rounded", body: "rounded", headlineWeight: 800,
    frame: "panel", ornament: "stars", divider: "star",
    defaults: {
      eyebrow: "Hooray! It's party time",
      headline: "{event}",
      message: "Join us for games, treats and big smiles. Bring your best party mood.",
    },
  }),
  T({
    id: "birthday-black-gold", name: "Black & gold milestone", group: "birthday",
    palette: { bg: "#18181b", bg2: "#09090b", ink: "#fafaf9", accent: "#d4a72c", muted: "#d6d3d1", panel: "#111113" },
    display: "elegant", body: "serif", headlineWeight: 600, uppercaseHeadline: true,
    frame: "double", ornament: "confetti", divider: "diamond",
    defaults: {
      eyebrow: "Please join us to celebrate",
      headline: "{event}",
      message: "An evening of good food, music and great company to mark a special milestone.",
    },
  }),
  T({
    id: "birthday-neon-glow", name: "Neon glow", group: "birthday",
    palette: { bg: "#1e1b4b", bg2: "#2e1065", ink: "#f5f3ff", accent: "#22d3ee", muted: "#c4b5fd", panel: "#1e1b4b" },
    display: "black", body: "sans", headlineWeight: 900, uppercaseHeadline: true,
    frame: "corners", ornament: "sparkle", divider: "star",
    defaults: {
      eyebrow: "Get ready to glow",
      headline: "{event}",
      message: "Music, lights and the best crowd. Dress bright and come dance the night away.",
    },
  }),
  T({
    id: "birthday-pastel-cake", name: "Pastel cake", group: "birthday",
    palette: { bg: "#fdf2f8", bg2: "#ede9fe", ink: "#6b21a8", accent: "#db2777", muted: "#7e22ce", panel: "#ffffff" },
    display: "script", body: "rounded", headlineWeight: 400,
    frame: "arch", ornament: "cake", divider: "heart",
    defaults: {
      eyebrow: "Let's celebrate",
      headline: "{event}",
      message: "Sweet treats, warm hugs and happy memories. We'd love to see you there.",
    },
  }),
  T({
    id: "birthday-first", name: "First birthday", group: "birthday",
    palette: { bg: "#f0fdf4", bg2: "#fefce8", ink: "#14532d", accent: "#f59e0b", muted: "#4d7c0f", panel: "#ffffff" },
    display: "rounded", body: "rounded", headlineWeight: 800,
    frame: "panel", ornament: "balloons", divider: "heart",
    defaults: {
      eyebrow: "Our little one is turning one",
      headline: "{event}",
      message: "Join us as we celebrate a wonderful first year full of giggles and love.",
    },
  }),

  // ── Community ──────────────────────────────────────────────────────────
  T({
    id: "community-festival-mela", name: "Festival mela", group: "community",
    palette: { bg: "#fff7ed", bg2: "#fef3c7", ink: "#7c2d12", accent: "#db2777", muted: "#9a3412", panel: "#ffffff" },
    display: "black", body: "sans", headlineWeight: 900, uppercaseHeadline: true,
    frame: "none", ornament: "bunting", divider: "dots",
    defaults: {
      eyebrow: "Everyone's welcome",
      headline: "{event}",
      message: "Food stalls, music, games and good company. Bring your family and friends.",
    },
  }),
  T({
    id: "community-cultural-night", name: "Cultural night", group: "community",
    palette: { bg: "#422006", bg2: "#1c0f02", ink: "#fef3c7", accent: "#f59e0b", muted: "#fcd34d", panel: "#2a1504" },
    display: "elegant", body: "serif", headlineWeight: 600,
    frame: "double", ornament: "diya", divider: "diamond",
    defaults: {
      eyebrow: "You are warmly invited to",
      headline: "{event}",
      message: "An evening of music, dance and tradition, celebrated together as one community.",
    },
  }),
  T({
    id: "community-formal", name: "Formal gathering", group: "community",
    palette: { bg: "#f8fafc", bg2: "#e2e8f0", ink: "#0f172a", accent: "#0369a1", muted: "#475569", panel: "#ffffff" },
    display: "serif", body: "sans", headlineWeight: 700, uppercaseHeadline: true,
    frame: "band", ornament: "geometric", divider: "line",
    defaults: {
      eyebrow: "Invitation",
      headline: "{event}",
      message: "We are pleased to invite you to this gathering. Your presence will be greatly valued.",
    },
  }),
  T({
    id: "community-charity", name: "Charity drive", group: "community",
    palette: { bg: "#f0fdf4", bg2: "#dcfce7", ink: "#14532d", accent: "#15803d", muted: "#3f6212", panel: "#ffffff" },
    display: "rounded", body: "sans", headlineWeight: 800,
    frame: "panel", ornament: "hearts", divider: "heart",
    defaults: {
      eyebrow: "Join hands with us",
      headline: "{event}",
      message: "Every bit of help counts. Come along, lend a hand and make a difference together.",
    },
  }),
  T({
    id: "community-meetup", name: "Neighbourhood meetup", group: "community",
    palette: { bg: "#ecfeff", bg2: "#ccfbf1", ink: "#134e4a", accent: "#0d9488", muted: "#115e59", panel: "#ffffff" },
    display: "sans", body: "sans", headlineWeight: 800,
    frame: "corners", ornament: "confetti", divider: "dots",
    defaults: {
      eyebrow: "Come say hello",
      headline: "{event}",
      message: "Meet your neighbours, share some snacks and help us plan what's next for our community.",
    },
  }),

  // ── Any occasion ───────────────────────────────────────────────────────
  T({
    id: "any-classic-ivory", name: "Classic ivory", group: "any",
    palette: { bg: "#fdfbf5", bg2: "#f3ead6", ink: "#3f2d1c", accent: "#a16207", muted: "#78614a", panel: "#fffdf8" },
    display: "elegant", body: "serif", headlineWeight: 600,
    frame: "double", ornament: "leaves", divider: "diamond",
    defaults: {
      eyebrow: "You are cordially invited to",
      headline: "{event}",
      message: "We would be delighted to have you join us for this special occasion.",
    },
  }),
  T({
    id: "any-golden-sparkle", name: "Golden sparkle", group: "any",
    palette: { bg: "#fffbeb", bg2: "#fef3c7", ink: "#78350f", accent: "#d97706", muted: "#92400e", panel: "#ffffff" },
    display: "script", body: "serif", headlineWeight: 400,
    frame: "corners", ornament: "sparkle", divider: "star",
    defaults: {
      eyebrow: "Join us for",
      headline: "{event}",
      message: "A celebration isn't complete without you. Please come and make it memorable.",
    },
  }),
  T({
    id: "any-mono-modern", name: "Mono modern", group: "any",
    palette: { bg: "#fafafa", bg2: "#f4f4f5", ink: "#18181b", accent: "#18181b", muted: "#71717a", panel: "#ffffff" },
    display: "black", body: "mono", headlineWeight: 900, uppercaseHeadline: true,
    frame: "none", ornament: "geometric", divider: "line",
    defaults: {
      eyebrow: "You're invited",
      headline: "{event}",
      message: "Good people, good food, good times. Hope to see you there.",
    },
  }),
];

export const GROUP_LABEL: Record<TemplateGroup, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  community: "Community",
  any: "Any occasion",
};

export function getTemplate(id: string | undefined): InvitationTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Templates made for this event type first, then the any-occasion ones. */
export function templatesFor(type: EventType | string): InvitationTemplate[] {
  return [
    ...TEMPLATES.filter((t) => t.group === type),
    ...TEMPLATES.filter((t) => t.group === "any"),
  ];
}

export function defaultTemplate(type: EventType | string): InvitationTemplate {
  return templatesFor(type)[0] ?? TEMPLATES[0];
}

export interface EventFacts {
  name: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  /** Selected venue name and/or location. */
  venue: string;
}

/** "Friday, 25 December 2026" without UTC off-by-one shifts. */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function templateDefaults(t: InvitationTemplate, eventName: string) {
  const fill = (s: string) => s.split("{event}").join(eventName);
  return {
    eyebrow: fill(t.defaults.eyebrow),
    headline: fill(t.defaults.headline),
    message: fill(t.defaults.message),
  };
}

/** A complete design pre-filled from the event. Nothing comes from the AI. */
export function initialDesign(t: InvitationTemplate, ev: EventFacts): InvitationDesign {
  return {
    template_id: t.id,
    ...templateDefaults(t, ev.name),
    hosts: "",
    date_text: longDate(ev.date),
    time_text: "",
    venue_text: ev.venue,
    dress_code: "",
    rsvp_text: "",
  };
}

/**
 * Switch template, keeping everything the user typed. Wording fields that still
 * hold the old template's default text move to the new template's default.
 */
export function switchTemplate(
  design: InvitationDesign,
  from: InvitationTemplate | undefined,
  to: InvitationTemplate,
  eventName: string
): InvitationDesign {
  const next = { ...design, template_id: to.id };
  if (!from) return next;
  const a = templateDefaults(from, eventName);
  const b = templateDefaults(to, eventName);
  for (const k of ["eyebrow", "headline", "message"] as const) {
    if (design[k] === a[k]) next[k] = b[k];
  }
  return next;
}

/** Plain-text version for messaging apps (the user pastes it themselves). */
export function invitationText(d: InvitationDesign): string {
  const when = [d.date_text, d.time_text].filter(Boolean).join(" · ");
  const blocks = [
    [d.eyebrow, d.headline, d.hosts].filter(Boolean).join("\n"),
    d.message,
    [when && `When: ${when}`, d.venue_text && `Where: ${d.venue_text}`,
      d.dress_code && `Dress code: ${d.dress_code}`].filter(Boolean).join("\n"),
    d.rsvp_text,
  ];
  return blocks.map((b) => b.trim()).filter(Boolean).join("\n\n");
}
