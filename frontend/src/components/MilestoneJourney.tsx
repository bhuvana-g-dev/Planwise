import { useNavigate } from "react-router-dom";
import { Check, Circle, Dot, TriangleAlert } from "lucide-react";
import type { Milestone } from "../utils/milestones";
import { classNames } from "../utils/format";

// Horizontal (desktop) / vertical (mobile) milestone track. Each node is a
// real button that navigates to the relevant module. No fake states.
export default function MilestoneJourney({
  milestones,
}: {
  milestones: Milestone[];
}) {
  const navigate = useNavigate();

  return (
    <ol className="stagger flex flex-col gap-3 md:flex-row md:items-start md:gap-0">
      {milestones.map((m, i) => (
        <li
          key={m.key}
          className="flex items-start gap-3 md:flex-1 md:flex-col md:items-center md:text-center"
          style={{ ["--i" as string]: i }}
        >
          <div className="flex items-center md:w-full md:flex-col">
            {/* connector (left) on desktop */}
            <span
              className={classNames(
                "hidden h-0.5 flex-1 md:block",
                i === 0 ? "opacity-0" : "",
                m.status === "done" ? "bg-brand-400" : "bg-sand-300"
              )}
              aria-hidden
            />
            <button
              onClick={() => navigate(m.to)}
              className={classNames(
                "group relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition",
                m.status === "done" &&
                  "border-brand-500 bg-brand-500 text-white",
                m.status === "current" &&
                  "border-brand-500 bg-white text-brand-600 ring-4 ring-brand-100",
                m.status === "overdue" &&
                  "border-rose-400 bg-rose-50 text-rose-600",
                m.status === "upcoming" &&
                  "border-sand-300 bg-white text-slate-400 hover:border-brand-300"
              )}
              aria-label={`${m.label} — ${m.status}`}
              title={m.detail}
            >
              {m.status === "done" ? (
                <Check className="h-5 w-5" />
              ) : m.status === "overdue" ? (
                <TriangleAlert className="h-5 w-5" />
              ) : m.status === "current" ? (
                <Dot className="h-7 w-7 animate-pulse" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
            </button>
            {/* connector (right) on desktop */}
            <span
              className={classNames(
                "hidden h-0.5 flex-1 md:block",
                i === milestones.length - 1 ? "opacity-0" : "",
                m.status === "done" ? "bg-brand-400" : "bg-sand-300"
              )}
              aria-hidden
            />
          </div>
          <div className="md:mt-2 md:px-1">
            <button
              onClick={() => navigate(m.to)}
              className={classNames(
                "text-left text-sm font-semibold hover:underline md:text-center",
                m.status === "upcoming" ? "text-slate-500" : "text-slate-800"
              )}
            >
              {m.label}
            </button>
            <p className="text-xs text-slate-500">{m.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
