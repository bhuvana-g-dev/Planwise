import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InvitationCard from "../components/invitations/InvitationCard";
import EventLayout, { navGroups } from "../layouts/EventLayout";
import { contentArea, layoutInvitation, wrapText } from "../invitations/layout";
import {
  CARD_H,
  defaultTemplate,
  getTemplate,
  initialDesign,
  invitationText,
  longDate,
  switchTemplate,
  TEMPLATES,
  templatesFor,
} from "../invitations/templates";
import type { InvitationDesign } from "../types";

const facts = { name: "Priya & Arjun", date: "2026-12-25", venue: "CR Mahal, Madurai" };

const full: InvitationDesign = {
  template_id: "wedding-royal-mandala",
  eyebrow: "Together with their families",
  headline: "Priya Lakshmi Narayanan & Arjun Venkataraman Iyer",
  hosts: "The Narayanan and Iyer families",
  message:
    "With the blessings of our elders, we warmly invite you and your family to join us " +
    "for the wedding ceremony and the reception that follows. Your presence would make " +
    "our celebration complete and fill our hearts with joy. Please come and bless the couple.",
  date_text: "Friday, 25 December 2026",
  time_text: "7 PM onwards",
  venue_text: "CR Mahal Wedding Hall, Bypass Road, Madurai, Tamil Nadu 625010",
  dress_code: "Traditional",
  rsvp_text: "RSVP to Meena by 15 December · 98765 43210",
};

describe("template catalogue", () => {
  it("has many templates for every event type plus any-occasion ones", () => {
    for (const type of ["wedding", "birthday", "community"]) {
      expect(TEMPLATES.filter((t) => t.group === type).length).toBeGreaterThanOrEqual(5);
    }
    expect(TEMPLATES.filter((t) => t.group === "any").length).toBeGreaterThanOrEqual(3);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });

  it("uses unique ids within the backend's 60-char limit", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.length).toBeLessThanOrEqual(60));
  });

  it("suggests the event's own designs first, then any-occasion", () => {
    const list = templatesFor("birthday");
    expect(list[0].group).toBe("birthday");
    expect(list.every((t) => t.group === "birthday" || t.group === "any")).toBe(true);
    expect(defaultTemplate("community").group).toBe("community");
    expect(defaultTemplate("unknown").group).toBe("any");
  });

  it("defaults fit the backend field limits", () => {
    for (const t of TEMPLATES) {
      const d = initialDesign(t, facts);
      expect(d.eyebrow.length).toBeLessThanOrEqual(80);
      expect(d.headline.length).toBeLessThanOrEqual(90);
      expect(d.message.length).toBeLessThanOrEqual(400);
    }
  });
});

describe("initial design + switching", () => {
  it("pre-fills from the event, never inventing a time or RSVP", () => {
    const d = initialDesign(getTemplate("wedding-royal-mandala")!, facts);
    expect(d.headline).toBe("Priya & Arjun");
    expect(d.date_text).toBe(longDate("2026-12-25"));
    expect(d.date_text).toContain("25");
    expect(d.date_text).toContain("2026");
    expect(d.venue_text).toBe("CR Mahal, Madurai");
    expect(d.time_text).toBe("");
    expect(d.rsvp_text).toBe("");
  });

  it("formats the date without shifting a day", () => {
    expect(longDate("2026-01-01")).toMatch(/1 January 2026/);
    expect(longDate("not-a-date")).toBe("not-a-date");
  });

  it("keeps edited wording but swaps untouched defaults", () => {
    const a = getTemplate("wedding-royal-mandala")!;
    const b = getTemplate("wedding-modern-minimal")!;
    const d0 = initialDesign(a, facts);
    const edited = { ...d0, message: "Our own words", time_text: "6 PM" };
    const d1 = switchTemplate(edited, a, b, facts.name);
    expect(d1.template_id).toBe(b.id);
    expect(d1.message).toBe("Our own words");
    expect(d1.time_text).toBe("6 PM");
    expect(d1.eyebrow).toBe(b.defaults.eyebrow);
  });
});

describe("layout", () => {
  it("wraps by width and hard-breaks very long words", () => {
    expect(wrapText("one two three four", 200, 40, 0.5)).toEqual(["one two", "three four"]);
    const broken = wrapText("x".repeat(30), 200, 40, 0.5);
    expect(broken.length).toBeGreaterThan(1);
    expect(broken.every((l) => l.length <= 10)).toBe(true);
  });

  it("fits long content inside the content area for every template", () => {
    for (const t of TEMPLATES) {
      const { lines, area } = layoutInvitation(t, { ...full, template_id: t.id });
      expect(lines.length).toBeGreaterThan(5);
      for (const l of lines) {
        // Baselines sit ~0.8em below a line's top edge.
        expect(l.y - l.size * 0.8).toBeGreaterThanOrEqual(area.top - 1);
        expect(l.y).toBeLessThanOrEqual(area.bottom + 2);
        expect(l.y).toBeLessThan(CARD_H);
      }
      // Lines are in reading order.
      const ys = lines.map((l) => l.y);
      expect([...ys].sort((p, q) => p - q)).toEqual(ys);
    }
  });

  it("skips empty fields and drops the divider when nothing follows it", () => {
    const t = getTemplate("any-mono-modern")!;
    const only: InvitationDesign = { ...full, eyebrow: "", hosts: "", message: "", date_text: "",
      time_text: "", venue_text: "", dress_code: "", rsvp_text: "", headline: "Hello" };
    const out = layoutInvitation(t, only);
    expect(out.lines.map((l) => l.text)).toEqual(["HELLO"]);
    expect(out.dividerY).toBeNull();
  });

  it("uses the frame's area", () => {
    expect(contentArea("arch").width).toBeLessThan(contentArea("none").width);
  });
});

describe("plain-text export", () => {
  it("includes every filled field and skips empty ones", () => {
    const text = invitationText({ ...full, dress_code: "" });
    expect(text).toContain(full.headline);
    expect(text).toContain("When: Friday, 25 December 2026 · 7 PM onwards");
    expect(text).toContain(`Where: ${full.venue_text}`);
    expect(text).not.toContain("Dress code");
    expect(text).not.toMatch(/\n{3,}/);
  });
});

describe("InvitationCard", () => {
  it("renders the text as SVG with an accessible label", () => {
    render(<InvitationCard template={getTemplate("birthday-balloon-bash")!} design={full} />);
    const img = screen.getByRole("img", { name: /Invitation preview/ });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img.textContent).toContain("Friday, 25 December 2026");
  });

  it("renders every template without crashing", () => {
    for (const t of TEMPLATES) {
      const { unmount, container } = render(
        <InvitationCard template={t} design={{ ...full, template_id: t.id }} decorative />
      );
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });
});

describe("event navigation", () => {
  it("is short: three titled groups and no duplicate food entries", () => {
    const groups = navGroups("e1");
    expect(groups.filter((g) => g.title).map((g) => g.title)).toEqual(["Plan", "Book", "Guests"]);
    const items = groups.flatMap((g) => g.items);
    expect(items.length).toBeLessThanOrEqual(10);
    expect(items.filter((i) => /cater/i.test(i.label))).toHaveLength(1);
    expect(items.some((i) => i.to === "/events/e1/invitations")).toBe(true);
  });

  it("highlights Food & catering on the caterers page and shows the switch", () => {
    render(
      <MemoryRouter initialEntries={["/events/e1/caterers"]}>
        <Routes>
          <Route path="events/:eventId" element={<EventLayout />}>
            <Route path="caterers" element={<p>caterers page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const food = screen.getByRole("link", { name: "Food & catering" });
    expect(food.className).toContain("bg-brand-50");
    expect(screen.getByRole("link", { name: "Caterers & booking" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Menu & quantities" })).not.toHaveAttribute("aria-current");
  });
});

describe("downloadBlob", () => {
  it("doesn't revoke the URL right after clicking, only on the next download", async () => {
    const { downloadBlob } = await import("../utils/invitationExport");
    const created: string[] = [];
    const revoked: string[] = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const clicks: { href: string; download: string }[] = [];
    URL.createObjectURL = () => { const u = `blob:test/${created.length}`; created.push(u); return u; };
    URL.revokeObjectURL = (u: string) => { revoked.push(u); };
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute("href") ?? "", download: this.download });
    };
    try {
      vi.useFakeTimers();
      downloadBlob(new Blob(["a"], { type: "image/png" }), "one.png");
      vi.advanceTimersByTime(10 * 60 * 1000);   // a long "Save as" dialog
      expect(revoked).toEqual([]);
      downloadBlob(new Blob(["b"], { type: "image/png" }), "two.png");
      expect(revoked).toEqual(["blob:test/0"]);
      expect(clicks).toEqual([
        { href: "blob:test/0", download: "one.png" },
        { href: "blob:test/1", download: "two.png" },
      ]);
      expect(document.querySelectorAll("a[download]").length).toBe(0);
    } finally {
      vi.useRealTimers();
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
