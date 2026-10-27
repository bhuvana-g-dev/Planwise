import { useEffect, useState } from "react";

// Live countdown to the event date. Ticks once per minute (not per second) to
// avoid unnecessary rerenders. Handles past dates gracefully (returns past=true).
interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  past: boolean;
  today: boolean;
}

function compute(targetISO: string): Remaining {
  const target = new Date(targetISO + "T00:00:00").getTime();
  const now = Date.now();
  let diff = target - now;
  const past = diff < -24 * 3600 * 1000; // more than a day ago
  const today =
    new Date(targetISO + "T00:00:00").toDateString() ===
    new Date().toDateString();
  if (diff < 0) diff = 0;
  const days = Math.floor(diff / (24 * 3600 * 1000));
  const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  return { days, hours, minutes, past, today };
}

export function useCountdown(targetISO: string | undefined): Remaining | null {
  const [state, setState] = useState<Remaining | null>(() =>
    targetISO ? compute(targetISO) : null
  );
  useEffect(() => {
    if (!targetISO) {
      setState(null);
      return;
    }
    setState(compute(targetISO));
    const id = setInterval(() => setState(compute(targetISO)), 60_000);
    return () => clearInterval(id);
  }, [targetISO]);
  return state;
}

export function Countdown({ dateISO }: { dateISO: string | undefined }) {
  const r = useCountdown(dateISO);
  if (!r) return null;

  if (r.past) {
    return (
      <span className="badge bg-sand-200 text-slate-600">Event has passed</span>
    );
  }
  if (r.today) {
    return (
      <span className="badge bg-plum-100 text-plum-600">🎉 It's today!</span>
    );
  }

  const cells: { v: number; l: string }[] = [
    { v: r.days, l: "days" },
    { v: r.hours, l: "hrs" },
    { v: r.minutes, l: "min" },
  ];
  return (
    <div className="flex items-center gap-2" aria-label={`${r.days} days remaining`}>
      {cells.map((c) => (
        <div
          key={c.l}
          className="flex min-w-[48px] flex-col items-center rounded-xl bg-white/80 px-2.5 py-1.5 shadow-sm ring-1 ring-sand-200"
        >
          <span className="text-lg font-bold tabular-nums text-brand-700">
            {c.v}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            {c.l}
          </span>
        </div>
      ))}
    </div>
  );
}
