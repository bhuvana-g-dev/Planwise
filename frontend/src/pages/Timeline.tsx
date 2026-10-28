import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Circle, ListChecks, Lock } from "lucide-react";
import { useEventDetail } from "../hooks/useEventDetail";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "../components/ui";
import ModuleHeader from "../components/ModuleHeader";
import { EmptyPlanArt } from "../components/Illustrations";
import { eventTheme } from "../theme/eventTheme";
import { useToast } from "../components/Toast";
import { api } from "../services/api";
import type { Task, TaskStatus } from "../types";
import { formatDate } from "../utils/format";

export default function Timeline() {
  const { eventId } = useParams();
  const { data, loading, error, reload } = useEventDetail(eventId);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const plan = data.active_plan;
  const theme = eventTheme(data.event.event_type, data.event.style);

  if (!plan)
    return (
      <EmptyState
        icon={<EmptyPlanArt className="h-12 w-16" />}
        title="No tasks yet"
        description="Generate a plan to see the task timeline and checklist."
        action={
          <Link to={`/events/${eventId}`} className="btn-primary">
            Back to dashboard
          </Link>
        }
      />
    );

  const tasks = [...plan.tasks].sort((a, b) =>
    (a.due_date ?? "") < (b.due_date ?? "") ? -1 : 1
  );
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const today = new Date().toISOString().slice(0, 10);
  const doneCount = tasks.filter((t) => t.status === "done").length;

  // First not-done task = the "next up" highlight.
  const nextId = tasks.find((t) => t.status !== "done")?.id;

  function prereqsDone(t: Task): boolean {
    return t.depends_on.every((d) => byId.get(d)?.status === "done");
  }

  async function toggle(t: Task) {
    if (!eventId) return;
    const next: TaskStatus = t.status === "done" ? "ready" : "done";
    if (next === "done" && !prereqsDone(t)) {
      toast.error(`Can't complete "${t.name}" — a prerequisite isn't done yet.`);
      return;
    }
    setBusy(t.id);
    try {
      await api.updateTask(eventId, t.id, { status: next });
      await reload();
      toast.success(
        next === "done" ? `"${t.name}" completed 🎉` : `"${t.name}" reopened`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <ModuleHeader
          theme={theme}
          eyebrow="Timeline & checklist"
          title="Timeline & checklist"
          subtitle={`${doneCount} of ${tasks.length} tasks done`}
          art={<ListChecks className="h-12 w-12" style={{ color: theme.accent }} />}
          actions={
            <>
              <Badge tone="brand">
                {doneCount}/{tasks.length} done
              </Badge>
              <Link to={`/events/${eventId}`} className="btn-secondary">
                Back
              </Link>
            </>
          }
        />
      </div>

      <div
        className="card divide-y divide-sand-200"
        style={{ ["--i" as string]: 1 }}
      >
        {tasks.map((t) => {
          const locked = t.status !== "done" && !prereqsDone(t);
          const overdue =
            t.status !== "done" && t.due_date && t.due_date < today;
          const isNext = t.id === nextId;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-4 p-5 transition ${
                isNext ? "bg-brand-50/60" : "hover:bg-sand-50"
              }`}
            >
              <button
                onClick={() => toggle(t)}
                disabled={busy === t.id || (locked && t.status !== "done")}
                className="mt-0.5 shrink-0 transition active:scale-90"
                aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                title={
                  locked
                    ? "Blocked: finish prerequisite tasks first"
                    : "Toggle completion"
                }
              >
                {t.status === "done" ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : locked ? (
                  <Lock className="h-6 w-6 text-slate-300" />
                ) : (
                  <Circle className="h-6 w-6 text-slate-300 hover:text-brand-500" />
                )}
              </button>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={
                      t.status === "done"
                        ? "font-medium text-slate-400 line-through"
                        : "font-medium text-slate-800"
                    }
                  >
                    {t.name}
                  </p>
                  {isNext && <Badge tone="brand">Next up</Badge>}
                  <PriorityBadge priority={t.priority} />
                  {locked && <Badge tone="amber">Blocked</Badge>}
                  {overdue && <Badge tone="rose">Overdue</Badge>}
                </div>
                {t.description && (
                  <p className="mt-0.5 text-sm text-slate-500">
                    {t.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>Due {formatDate(t.due_date)}</span>
                  {t.depends_on.length > 0 && (
                    <span>
                      Depends on:{" "}
                      {t.depends_on.map((d) => byId.get(d)?.name ?? d).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "critical"
      ? "rose"
      : priority === "high"
      ? "amber"
      : priority === "medium"
      ? "brand"
      : "slate";
  return <Badge tone={tone as never}>{priority}</Badge>;
}
