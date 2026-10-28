import { describe, expect, it } from "vitest";
import { eventTheme, STYLE_OPTIONS } from "../theme/eventTheme";

describe("eventTheme — base types", () => {
  it("maps known event types to distinct themes with the right motif", () => {
    expect(eventTheme("wedding").motif).toBe("rings");
    expect(eventTheme("birthday").motif).toBe("balloons");
    expect(eventTheme("community").motif).toBe("people");
  });

  it("falls back to the default theme for unknown/absent types", () => {
    expect(eventTheme(undefined).key).toBe("default");
    expect(eventTheme("gala").key).toBe("default");
    expect(eventTheme("").key).toBe("default");
  });

  it("always provides a gradient, accent, motifAccent and tagline", () => {
    for (const t of ["wedding", "birthday", "community", "x"]) {
      const theme = eventTheme(t);
      expect(theme.heroGradient).toContain("gradient");
      expect(theme.accent).toMatch(/^#/);
      expect(theme.accent2).toMatch(/^#/);
      expect(theme.motifAccent).toMatch(/^#/);
      expect(theme.tagline.length).toBeGreaterThan(0);
    }
  });

  it("uses the classic (base) look when no style is given", () => {
    for (const t of ["wedding", "birthday", "community"]) {
      const theme = eventTheme(t);
      expect(theme.styleKey).toBe("classic");
      expect(theme.styleLabel).toBe("");
    }
  });
});

describe("eventTheme — functional styles", () => {
  it("exposes pickable style presets for each backend event type", () => {
    for (const t of ["wedding", "birthday", "community"] as const) {
      expect(STYLE_OPTIONS[t].length).toBeGreaterThan(0);
      // "classic" is the implicit base and must not be a pickable option.
      expect(STYLE_OPTIONS[t].some((o) => o.key === "classic")).toBe(false);
    }
  });

  it("resolves every advertised style preset to its own visual tokens", () => {
    for (const t of ["wedding", "birthday", "community"] as const) {
      const base = eventTheme(t);
      for (const opt of STYLE_OPTIONS[t]) {
        const styled = eventTheme(t, opt.label);
        expect(styled.styleKey).toBe(opt.key);
        expect(styled.styleLabel).toBe(opt.label);
        // Keeps the type identity (motif) but changes the mood (accent).
        expect(styled.motif).toBe(base.motif);
        expect(styled.accent).not.toBe(base.accent);
        expect(styled.heroGradient).toContain("gradient");
      }
    }
  });

  it("matches free-text style strings via synonyms (case-insensitive)", () => {
    expect(eventTheme("wedding", "ROYAL grand hall").styleKey).toBe("royal");
    expect(eventTheme("birthday", "a jungle themed kids party").styleKey).toBe(
      "kids"
    );
    expect(eventTheme("community", "Cultural Festival").styleKey).toBe(
      "festival"
    );
    expect(eventTheme("wedding", "soft blush florals").styleKey).toBe(
      "romantic"
    );
  });

  it("falls back to classic for unknown or empty styles", () => {
    expect(eventTheme("wedding", "something unheard of").styleKey).toBe(
      "classic"
    );
    expect(eventTheme("birthday", "   ").styleKey).toBe("classic");
    expect(eventTheme("community", "").styleKey).toBe("classic");
  });

  it("ignores style for unknown event types (graceful default)", () => {
    const theme = eventTheme("gala", "royal");
    expect(theme.key).toBe("default");
    expect(theme.styleKey).toBe("classic");
  });
});
