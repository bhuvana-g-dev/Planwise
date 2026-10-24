import { describe, expect, it } from "vitest";
import { formatINR, formatDate, titleCase } from "../utils/format";

describe("formatINR", () => {
  it("formats whole rupees with Indian grouping", () => {
    expect(formatINR(3000000)).toBe("₹30,000");
    expect(formatINR(10000000)).toBe("₹1,00,000");
  });

  it("shows paise when non-integer", () => {
    expect(formatINR(3050050)).toBe("₹30,500.50");
  });
});

describe("formatDate", () => {
  it("renders em dash for empty", () => {
    expect(formatDate(null)).toBe("—");
  });
  it("formats an ISO date", () => {
    expect(formatDate("2026-12-25")).toMatch(/2026/);
  });
});

describe("titleCase", () => {
  it("capitalizes first letter", () => {
    expect(titleCase("catering")).toBe("Catering");
  });
});
