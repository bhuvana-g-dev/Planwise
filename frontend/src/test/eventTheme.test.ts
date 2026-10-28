import { describe, expect, it } from "vitest";
import { eventTheme } from "../theme/eventTheme";

describe("eventTheme", () => {
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

  it("always provides a gradient, accent, and tagline", () => {
    for (const t of ["wedding", "birthday", "community", "x"]) {
      const theme = eventTheme(t);
      expect(theme.heroGradient).toContain("gradient");
      expect(theme.accent).toMatch(/^#/);
      expect(theme.tagline.length).toBeGreaterThan(0);
    }
  });
});
