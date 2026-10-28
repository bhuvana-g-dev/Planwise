import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  PartyPopper,
  Phone,
  Users,
} from "lucide-react";
import { useEventDetail } from "../hooks/useEventDetail";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "../components/ui";
import { Countdown, useCountdown } from "../components/Countdown";
import EventHero from "../components/EventHero";
import { eventTheme } from "../theme/eventTheme";
import { formatDate } from "../utils/format";

export default function EventDay() {
  const { eventId } = useParams();
  const { data, loading, error } = useEventDetail(eventId);
  const remaining = useCountdown(data?.event.event_date);

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { event, active_plan: plan } = data;
  const tasks = plan?.tasks ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const done = tasks.filter((t) => t.status === "done");
  const pending = tasks.filter((t) => t.status !== "done");
  const overdue = pending.filter((t) => t.due_date && t.due_date < today);
  const isPast = remaining?.past ?? false;
  const isToday = remaining?.today ?? false;

  return (
    <div className="stagger space-y-6">
      {/* Hero */}
      <div style={{ ["--i" as string]: 0 }}>
      <EventHero theme={eventTheme(event.event_type, event.style)} compact>
        <div className="relative">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-brand-600" />
            <h1 className="text-2xl font-bold text-slate-900">
              {isPast
                ? "Event summary"
                : isToday
                ? "It's event day!"
                : "Event-day preparation"}
            </h1>
          </div>
          <p className="mt-1 text-slate-600">{event.name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-brand-500" />
              {formatDate(event.event_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-brand-500" />
              {data.selected_venue?.name || event.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-brand-500" />
              {data.guest_summary?.confirmed_headcount
                ? `${data.guest_summary.confirmed_headcount} confirmed`
                : `${event.guest_count} guests`}
            </span>
          </div>
          {!isPast && (
            <div className="mt-4">
              <Countdown dateISO={event.event_date} />
            </div>
          )}
        </div>
      </EventHero>
      </div>

      {/* Past event summary */}
      {isPast ? (
        <section className="card p-6" style={{ ["--i" as string]: 1 }}>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            How it went
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat label="Tasks completed" value={`${done.length}/${tasks.length}`} />
            <SummaryStat
              label="Confirmed guests"
              value={String(data.guest_summary?.confirmed_headcount ?? 0)}
            />
            <SummaryStat
              label="Venue"
              value={data.selected_venue ? "Selected" : "—"}
            />
            <SummaryStat
              label="Plan versions"
              value={String(data.plans.length)}
            />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            This event's date has passed. The information above reflects your
            saved plan. Create a new event to start planning your next
            celebration.
          </p>
          <Link to="/create" className="btn-primary mt-4 w-fit">
            Plan another event
          </Link>
        </section>
      ) : !plan ? (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" />}
          title="No day-of schedule yet"
          description="Generate a plan to build your task timeline. Your event-day checklist and schedule are derived from it."
          action={
            <Link to={`/events/${eventId}`} className="btn-primary">
              Go to dashboard
            </Link>
          }
        />
      ) : (
        <>
          {overdue.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
              style={{ ["--i" as string]: 1 }}
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{overdue.length}</strong> preparation task
                {overdue.length === 1 ? " is" : "s are"} overdue. Review these
                before the event:{" "}
                {overdue.map((t) => t.name).join(", ")}.
              </span>
            </div>
          )}

          {/* Chronological schedule */}
          <section className="card p-6" style={{ ["--i" as string]: 2 }}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock className="h-5 w-5 text-brand-600" /> Preparation schedule
            </h2>
            <ol className="relative space-y-4 border-l-2 border-sand-200 pl-6">
              {[...tasks]
                .sort((a, b) => (a.due_date ?? "") < (b.due_date ?? "") ? -1 : 1)
                .map((t) => {
                  const isDone = t.status === "done";
                  const isOverdue =
                    !isDone && t.due_date && t.due_date < today;
                  return (
                    <li key={t.id} className="relative">
                      <span
                        className={`absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ${
                          isDone
                            ? "bg-emerald-500 text-white"
                            : isOverdue
                            ? "bg-rose-500 text-white"
                            : "bg-white ring-2 ring-sand-300"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Circle className="h-3 w-3 text-slate-300" />
                        )}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-sm font-medium ${
                            isDone
                              ? "text-slate-400 line-through"
                              : "text-slate-800"
                          }`}
                        >
                          {t.name}
                        </p>
                        {isOverdue && <Badge tone="rose">overdue</Badge>}
                      </div>
                      <p className="text-xs text-slate-500">
                        {t.due_date ? `Due ${formatDate(t.due_date)}` : "No date"}
                        {t.related_category ? ` · ${t.related_category}` : ""}
                      </p>
                    </li>
                  );
                })}
            </ol>
            <Link
              to={`/events/${eventId}/timeline`}
              className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              Manage tasks in Timeline →
            </Link>
          </section>

          {/* Venue + contacts */}
          <div className="grid gap-6 md:grid-cols-2" style={{ ["--i" as string]: 3 }}>
            <section className="card p-6">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <MapPin className="h-5 w-5 text-brand-600" /> Venue
              </h3>
              {data.selected_venue ? (
                <>
                  <p className="font-medium text-slate-900">
                    {data.selected_venue.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {data.selected_venue.location || "Location not listed"}
                  </p>
                  {data.selected_venue.contact && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                      <Phone className="h-4 w-4 text-brand-500" />
                      {data.selected_venue.contact}
                    </p>
                  )}
                  {data.selected_venue.source === "demo" && (
                    <p className="mt-2 text-xs text-amber-600">
                      Demo venue — confirm details before the event.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  No venue selected yet.{" "}
                  <Link
                    to={`/events/${eventId}/venues-discovery`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    Choose one →
                  </Link>
                </p>
              )}
            </section>

            <section className="card p-6">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <Users className="h-5 w-5 text-brand-600" /> Headcount
              </h3>
              {data.guest_summary && data.guest_summary.total_guests > 0 ? (
                <ul className="space-y-1.5 text-sm text-slate-600">
                  <li>
                    Confirmed:{" "}
                    <strong>{data.guest_summary.confirmed_headcount}</strong>
                  </li>
                  <li>
                    Attending (incl. tentative):{" "}
                    <strong>{data.guest_summary.total_headcount}</strong>
                  </li>
                  <li>
                    Guest rows:{" "}
                    <strong>{data.guest_summary.total_guests}</strong>
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  No guests added yet.{" "}
                  <Link
                    to={`/events/${eventId}/guests`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    Add guests →
                  </Link>
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sand-50 p-4 text-center">
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
