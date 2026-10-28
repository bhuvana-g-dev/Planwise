import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  BalloonSticker,
  GiftSticker,
  StarSticker,
} from "../components/Stickers";
import { EventHeroArt } from "../components/Illustrations";
import { eventTheme } from "../theme/eventTheme";

export default function Landing() {
  return (
    <div className="stagger space-y-16">
      <section
        className="grid items-center gap-10 md:grid-cols-2"
        style={{ ["--i" as string]: 0 }}
      >
        <div>
          <span className="badge bg-brand-100 text-brand-700">
            <Sparkles className="h-3.5 w-3.5" /> Adaptive event planning
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Plan celebrations that stay{" "}
            <span className="text-brand-600">within budget</span>.
          </h1>
          <p className="mt-4 max-w-lg text-lg text-slate-600">
            PlanWise AI builds a complete plan for birthdays, weddings and
            community events — then intelligently replans when your budget,
            guest count or date changes, showing exactly what moves and why.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/create" className="btn-primary">
              Create an event <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/events" className="btn-secondary">
              View saved events
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Costs shown are illustrative estimates, never verified vendor quotes.
          </p>
        </div>

        <div
          className="card relative overflow-hidden p-6"
          style={{ background: eventTheme("birthday").heroGradient }}
        >
          <BalloonSticker
            size={64}
            className="pointer-events-none absolute -right-3 -top-3 animate-float opacity-80"
          />
          <EventHeroArt
            theme={eventTheme("birthday")}
            className="mx-auto mb-4 h-28 w-44"
          />
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-900">Birthday · Madurai</h3>
            <span className="text-sm text-slate-500">50 guests</span>
          </div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">
            Illustrative example — not a saved event
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <Row label="Budget" value="₹30,000" />
            <Row label="Allocated" value="₹30,000" />
            <Row label="Remaining" value="₹0" />
          </div>
          <div className="mt-4 rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
            Reduce budget to ₹24,000 → PlanWise proposes targeted cuts to your
            lowest-priority categories while keeping vegetarian catering intact.
          </div>
        </div>
      </section>

      <section
        className="grid gap-6 md:grid-cols-3"
        style={{ ["--i" as string]: 1 }}
      >
        <Feature
          icon={<Scale className="h-5 w-5" />}
          sticker={<StarSticker size={40} />}
          title="Deterministic budget engine"
          body="All money math runs on the backend in integer paise. The AI never decides your numbers."
        />
        <Feature
          icon={<CalendarCheck className="h-5 w-5" />}
          sticker={<GiftSticker size={40} />}
          title="Change-impact reports"
          body="Every change produces a before/after diff: affected categories, tasks, trade-offs and preserved constraints."
        />
        <Feature
          icon={<ShieldCheck className="h-5 w-5" />}
          sticker={<BalloonSticker size={40} />}
          title="Approve before it sticks"
          body="Proposals are never auto-applied. Reject leaves your plan untouched; stale approvals are blocked."
        />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function Feature({
  icon,
  sticker,
  title,
  body,
}: {
  icon: React.ReactNode;
  sticker?: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card relative overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
      {sticker && (
        <span className="pointer-events-none absolute right-3 top-3 opacity-70">
          {sticker}
        </span>
      )}
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600">{body}</p>
    </div>
  );
}
