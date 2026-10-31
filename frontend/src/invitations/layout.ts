// Pure layout for an invitation card: wraps and sizes every text block so the
// whole stack fits the template's content area, then centres it vertically.
// No DOM measuring (it must match the PNG export and be unit-testable), so
// widths use each font's average glyph width; a safety margin covers wide
// glyphs.

import type { InvitationDesign } from "../types";
import { CARD_H, CARD_W, FONTS, type Frame, type InvitationTemplate } from "./templates";

export interface TextLine {
  text: string;
  y: number;
  size: number;
  family: string;
  weight: number;
  color: string;
  italic: boolean;
  letterSpacing: number;
}

export interface CardLayout {
  lines: TextLine[];
  /** Centre y of the divider ornament, or null when there's no divider. */
  dividerY: number | null;
  area: { top: number; bottom: number; width: number };
}

const AREAS: Record<Frame, { top: number; bottom: number; width: number }> = {
  none: { top: 215, bottom: 1135, width: 800 },
  double: { top: 215, bottom: 1135, width: 780 },
  corners: { top: 215, bottom: 1135, width: 800 },
  band: { top: 250, bottom: 1125, width: 800 },
  arch: { top: 270, bottom: 1140, width: 680 },
  panel: { top: 240, bottom: 1110, width: 720 },
};

export function contentArea(frame: Frame) {
  return AREAS[frame];
}

/** Greedy word wrap by estimated width. Keeps explicit line breaks. */
export function wrapText(text: string, maxWidth: number, size: number, glyph: number): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidth / (size * glyph)));
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (let w of words) {
      while (w.length > maxChars) {            // hard-break very long words
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, maxChars - 1) + "-");
        w = w.slice(maxChars - 1);
      }
      const next = line ? `${line} ${w}` : w;
      if (next.length > maxChars) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

interface Block {
  text: string;
  sizes: number[];          // try in order until maxLines fits
  maxLines: number;
  font: "display" | "body";
  weight: number;
  color: string;
  italic: boolean;
  upper: boolean;
  letterSpacing: number;    // in em
  lineHeight: number;
  gapAfter: number;
  divider?: boolean;
}

function blocks(t: InvitationTemplate, d: InvitationDesign): Block[] {
  const p = t.palette;
  const b = (o: Partial<Block> & Pick<Block, "text" | "sizes">): Block => ({
    maxLines: 3, font: "body", weight: 400, color: p.ink, italic: false,
    upper: false, letterSpacing: 0, lineHeight: 1.3, gapAfter: 24, ...o,
  });
  const when = d.time_text;
  const list: Block[] = [
    b({ text: d.eyebrow, sizes: [30, 27, 24], maxLines: 2, color: p.accent,
        upper: true, letterSpacing: 0.16, weight: 600, gapAfter: 30 }),
    b({ text: d.headline, sizes: [108, 96, 84, 74, 64, 56], maxLines: 3,
        font: "display", weight: t.headlineWeight, italic: !!t.italicHeadline,
        upper: !!t.uppercaseHeadline, letterSpacing: t.uppercaseHeadline ? 0.04 : 0,
        lineHeight: 1.1, gapAfter: 26 }),
    b({ text: d.hosts, sizes: [36, 32, 28], maxLines: 2, italic: true,
        color: p.muted, gapAfter: 34 }),
    b({ text: "", sizes: [0], divider: true, gapAfter: 34 }),
    b({ text: d.message, sizes: [40, 36, 32, 28, 25], maxLines: 7,
        lineHeight: 1.45, gapAfter: 50 }),
    b({ text: d.date_text, sizes: [46, 42, 36], maxLines: 2, font: "display",
        weight: 700, color: p.accent, lineHeight: 1.2, gapAfter: 14 }),
    b({ text: when, sizes: [36, 32], maxLines: 1, gapAfter: 32 }),
    b({ text: d.venue_text, sizes: [36, 32, 28], maxLines: 3, lineHeight: 1.35,
        gapAfter: 32 }),
    b({ text: d.dress_code ? `Dress code: ${d.dress_code}` : "", sizes: [30, 27],
        maxLines: 2, color: p.muted, gapAfter: 16 }),
    b({ text: d.rsvp_text, sizes: [30, 27, 24], maxLines: 2, color: p.muted,
        gapAfter: 0 }),
  ];
  // Drop empty blocks; keep the divider only between real content.
  const kept = list.filter((x) => x.divider || x.text.trim());
  const di = kept.findIndex((x) => x.divider);
  const hasBefore = kept.slice(0, di).length > 0;
  const hasAfter = kept.slice(di + 1).length > 0;
  return hasBefore && hasAfter ? kept : kept.filter((x) => !x.divider);
}

interface Placed { block: Block; size: number; lines: string[]; height: number }

function place(t: InvitationTemplate, list: Block[], width: number, scale: number): Placed[] {
  return list.map((block) => {
    if (block.divider) return { block, size: 0, lines: [], height: 30 * scale };
    const font = FONTS[block.font === "display" ? t.display : t.body];
    // Uppercase and tracking make lines wider than the font average.
    const glyph = (font.width + (block.upper ? 0.1 : 0) + block.letterSpacing) * 1.06;
    const text = block.upper ? block.text.toUpperCase() : block.text;
    let size = block.sizes[block.sizes.length - 1] * scale;
    let lines = wrapText(text, width, size, glyph);
    for (const s of block.sizes) {
      const candidate = wrapText(text, width, s * scale, glyph);
      if (candidate.length <= block.maxLines) { size = s * scale; lines = candidate; break; }
    }
    if (lines.length > block.maxLines) {
      lines = lines.slice(0, block.maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "") + "…";
    }
    const height = size * (1 + (lines.length - 1) * block.lineHeight);
    return { block, size, lines, height };
  });
}

const total = (ps: Placed[], scale: number) =>
  ps.reduce((h, p, i) => h + p.height + (i < ps.length - 1 ? p.block.gapAfter * scale : 0), 0);

export function layoutInvitation(t: InvitationTemplate, d: InvitationDesign): CardLayout {
  const area = AREAS[t.frame];
  const avail = area.bottom - area.top;
  const list = blocks(t, d);

  let scale = 1;
  let placed = place(t, list, area.width, scale);
  for (let i = 0; i < 8 && total(placed, scale) > avail; i++) {
    scale *= 0.92;
    placed = place(t, list, area.width, scale);
  }

  let y = area.top + Math.max(0, (avail - total(placed, scale)) / 2);
  const lines: TextLine[] = [];
  let dividerY: number | null = null;
  for (const p of placed) {
    const b = p.block;
    if (b.divider) {
      dividerY = y + p.height / 2;
    } else {
      const family = FONTS[b.font === "display" ? t.display : t.body].family;
      p.lines.forEach((text, i) => {
        lines.push({
          text,
          // Baseline: cap height sits ~0.8em below the block top.
          y: Math.round(y + p.size * 0.8 + i * p.size * b.lineHeight),
          size: Math.round(p.size * 10) / 10,
          family, weight: b.weight, color: b.color, italic: b.italic,
          letterSpacing: Math.round(b.letterSpacing * p.size * 10) / 10,
        });
      });
    }
    y += p.height + b.gapAfter * scale;
  }
  return { lines, dividerY, area };
}

export { CARD_H, CARD_W };
