import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { useEventDetail } from "../hooks/useEventDetail";
import { Badge, EmptyState, ErrorBanner, Spinner } from "../components/ui";
import { api } from "../services/api";
import type { Task, TaskStatus } from "../types";
import { formatDate } from "../utils/format";

export default function Timeline() {
  const { eventId } = useParams();
  const { data, loading, error, reload } = useEventDetail(eventId);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <Spinner label="Loading timeline…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const plan = data.active_plan;

  if (!plan)
    return (
      <EmptyState
        title="No tasks yet"
        description="Generate a plan to see the task timeline."
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

  function prereqsDone(t: Task): boolean {
    return t.depends_on.every((d) => byId.get(d)?.status === "done");
  }

  async function toggle(t: Task) {
    if (!eventId) return;
    const next: TaskStatus = t.status === "done" ? "ready" : "done";
    if (next === "done" && !prereqsDone(t)) {
      setActionError(
        `Can't complete "${t.name}" — a prerequisite task isn't done yet.`
      );
      return;
    }
    setBusy(t.id);
    setActionError(null);
    try {
      await api.updateTask(eventId, t.id, { status: next });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Timeline & checklist</h1>
        <Link to={`/events/${eventId}`} className="btn-secondary">
          Back to dashboard
        </Link>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      <div className="card divide-y divide-slate-100">
        {tasks.map((t) => {
          const locked = t.status !== "done" && !prereqsDone(t);
          return (
            <div key={t.id} className="flex items-start gap-4 p-5">
              <button
                onClick={() => toggle(t)}
                disabled={busy === t.id || (locked && t.status !== "done")}
                className="mt-0.5 shrink-0"
                aria-label={
                  t.status === "done" ? "Mark not done" : "Mark done"
                }
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
                  <PriorityBadge priority={t.priority} />
                  {locked && <Badge tone="amber">Blocked</Badge>}
                </div>
                {t.description && (
                  <p className="mt-0.5 text-sm text-slate-500">{t.description}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>Due {formatDate(t.due_date)}</span>
                  {t.depends_on.length > 0 && (
                    <span>
                      Depends on:{" "}
                      {t.depends_on
                        .map((d) => byId.get(d)?.name ?? d)
                        .join(", ")}
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
