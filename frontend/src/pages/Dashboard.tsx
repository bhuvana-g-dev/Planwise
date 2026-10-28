import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Lightbulb,
  ListChecks,
  MapPin,
  PartyPopper,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEventDetail } from "../hooks/useEventDetail";
import {
  Badge,
  EmptyState,
  ErrorBanner,
  ProgressRing,
  Skeleton,
} from "../components/ui";
import BudgetSummaryCard from "../components/BudgetSummaryCard";
import BudgetChart from "../components/BudgetChart";
import { Countdown } from "../components/Countdown";
import { Confetti } from "../components/Confetti";
import MilestoneJourney from "../components/MilestoneJourney";
import { EventTypeSticker } from "../components/Stickers";
import EventHero from "../components/EventHero";
import { eventTheme } from "../theme/eventTheme";
import { useToast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import {
  deriveMilestones,
  milestoneProgress,
  nextAction,
} from "../utils/milestones";
import { formatDate } from "../utils/format";
import { api } from "../services/api";

function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

export default function Dashboard() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useEventDetail(eventId);
  const [generating, setGenerating] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const prevProgress = useRef<number | null>(null);

  const milestones = data && eventId ? deriveMilestones(data, eventId) : [];
  const progress = milestoneProgress(milestones);
  const next = nextAction(milestones);

  // Fire confetti once when progress reaches 100% (a real, data-derived state).
  useEffect(() => {
    if (prevProgress.current !== null && prevProgress.current < 100 && progress === 100) {
      setConfetti((c) => c + 1);
    }
    prevProgress.current = progress;
  }, [progress]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { event, active_plan: plan, plans } = data;
  const theme = eventTheme(event.event_type, event.style);

  async function generate() {
    if (!eventId) return;
    setGenerating(true);
    try {
      await api.generatePlan(eventId);
      await reload();
      toast.success("Plan generated and saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  }

  const upcoming =
    plan?.tasks
      .filter((t) => t.status !== "done" && t.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 4) ?? [];
  const doneCount = plan?.tasks.filter((t) => t.status === "done").length ?? 0;
  const totalTasks = plan?.tasks.length ?? 0;

  return (
    <div className="stagger space-y-6">
      <Confetti fire={confetti} />

      {/* ───────── Hero / command center ───────── */}
      <div style={{ ["--i" as string]: 0 }}>
      <EventHero theme={theme}>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">
              {greeting(user?.displayName ?? user?.email)}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <EventTypeSticker type={event.event_type} size={34} />
              <h1 className="truncate text-3xl font-bold text-slate-900">
                {event.name}
              </h1>
              <Badge tone="brand">{event.event_type}</Badge>
              {theme.styleLabel && (
                <Badge tone="slate">{theme.styleLabel}</Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-brand-500" />
                {formatDate(event.event_date)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand-500" />
                {event.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-brand-500" />
                {event.guest_count} guests
              </span>
            </div>
            <div className="mt-4">
              <Countdown dateISO={event.event_date} />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <ProgressRing
              pct={progress}
              label={
                <div className="text-center">
                  <div className="text-xl font-bold text-slate-900">
                    {progress}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    ready
                  </div>
                </div>
              }
            />
            <div className="max-w-[220px]">
              <p className="font-display text-lg font-semibold text-slate-900">
                {progress === 100
                  ? "Your celebration is ready! 🎉"
                  : "Your celebration is coming together!"}
              </p>
              {next ? (
                <button
                  onClick={() => navigate(next.to)}
                  className="btn-primary mt-3 w-full"
                >
                  <Sparkles className="h-4 w-4" />
                  Next: {next.label}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Everything's on track.
                </p>
              )}
            </div>
          </div>
        </div>
      </EventHero>
      </div>

      {/* ───────── Milestone journey ───────── */}
      <section className="card p-6" style={{ ["--i" as string]: 1 }}>
        <div className="mb-5 flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-900">
            Your planning journey
          </h2>
        </div>
        <MilestoneJourney milestones={milestones} />
      </section>

      {/* Quick actions */}
      <div
        className="flex flex-wrap gap-2"
        style={{ ["--i" as string]: 2 }}
      >
        <Link to={`/events/${eventId}/adapt`} className="btn-primary">
          <Sparkles className="h-4 w-4" /> Adapt plan with AI
        </Link>
        <Link to={`/events/${eventId}/budget`} className="btn-secondary">
          <Wallet className="h-4 w-4" /> Budget
        </Link>
        <Link to={`/events/${eventId}/timeline`} className="btn-secondary">
          <ListChecks className="h-4 w-4" /> Timeline
        </Link>
        <Link to={`/events/${eventId}/guests`} className="btn-secondary">
          <Users className="h-4 w-4" /> Guests
        </Link>
        <Link to={`/events/${eventId}/venues-discovery`} className="btn-secondary">
          <MapPin className="h-4 w-4" /> Venues
        </Link>
        <Link to={`/events/${eventId}/catering`} className="btn-secondary">
          Catering
        </Link>
      </div>

      {data.selected_venue && (
        <div className="card p-5" style={{ ["--i" as string]: 3 }}>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
            <MapPin className="h-5 w-5 text-brand-600" /> Selected venue
          </h3>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">
                {data.selected_venue.name}
              </p>
              <p className="text-sm text-slate-500">
                {data.selected_venue.location || "Location not listed"} ·
                capacity{" "}
                {data.selected_venue.capacity > 0
                  ? data.selected_venue.capacity
                  : "n/a"}
              </p>
            </div>
            <Link
              to={`/events/${eventId}/venues-discovery`}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Change venue →
            </Link>
          </div>
          {data.selected_venue.source === "demo" && (
            <p className="mt-2 text-xs text-amber-600">
              Demo venue — verify details independently before booking.
            </p>
          )}
        </div>
      )}

      {data.guest_summary && data.guest_summary.total_guests > 0 && (
        <div className="card p-5" style={{ ["--i" as string]: 4 }}>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <Users className="h-5 w-5 text-brand-600" /> RSVP progress
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <RsvpStat
              label="Confirmed heads"
              value={data.guest_summary.confirmed_headcount}
            />
            <RsvpStat label="Attending" value={data.guest_summary.total_headcount} />
            <RsvpStat label="Invited (rows)" value={data.guest_summary.total_guests} />
            <RsvpStat
              label="Declined"
              value={data.guest_summary.by_status["declined"] ?? 0}
            />
          </div>
          {data.guest_summary.confirmed_headcount > event.guest_count && (
            <p className="mt-3 text-xs text-slate-500">
              Confirmed headcount ({data.guest_summary.confirmed_headcount})
              exceeds planned guests ({event.guest_count}).{" "}
              <Link
                to={`/events/${eventId}/adapt`}
                className="font-medium text-brand-600 hover:underline"
              >
                Adapt guest count →
              </Link>
            </p>
          )}
        </div>
      )}

      {!plan ? (
        <EmptyState
          icon={<Sparkles className="h-7 w-7" />}
          title="Let's build your plan"
          description="Generate a validated, budget-aware plan — it sets your category budgets, task timeline, and recommendations."
          action={
            <button className="btn-primary" onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Generate my plan"}
            </button>
          }
        />
      ) : (
        <>
          <div
            className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800"
            style={{ ["--i" as string]: 5 }}
          >
            <span>
              Active plan v{plan.version} · by{" "}
              <strong>{plan.generated_by}</strong>
              {plan.change_summary && <> · {plan.change_summary}</>}
            </span>
            <Link
              to={`/events/${eventId}/budget`}
              className="font-medium hover:underline"
            >
              Budget planner →
            </Link>
          </div>

          <div
            className="grid gap-6 lg:grid-cols-3"
            style={{ ["--i" as string]: 6 }}
          >
            <div className="lg:col-span-1">
              <BudgetSummaryCard budget={plan.budget} />
            </div>
            <div className="card p-6 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-brand-600" />
                <h3 className="font-semibold text-slate-900">
                  Category breakdown
                </h3>
              </div>
              <BudgetChart budget={plan.budget} />
            </div>
          </div>

          <div
            className="grid gap-6 lg:grid-cols-3"
            style={{ ["--i" as string]: 7 }}
          >
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <ClipboardList className="h-5 w-5 text-brand-600" /> Upcoming
                </h3>
                <span className="text-xs text-slate-500">
                  {doneCount}/{totalTasks} done
                </span>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-500">No pending deadlines.</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((t) => (
                    <li key={t.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {t.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Due {formatDate(t.due_date)}
                        </p>
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-6">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <Lightbulb className="h-5 w-5 text-brand-600" /> Recommendations
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                {plan.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-6">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Risks &
                open decisions
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                {plan.risks.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    {r.description}
                  </li>
                ))}
                {plan.open_decisions.map((d, i) => (
                  <li key={`d-${i}`} className="flex gap-2 text-slate-500">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card p-6" style={{ ["--i" as string]: 8 }}>
            <h3 className="mb-2 font-semibold text-slate-900">Plan overview</h3>
            <p className="text-sm text-slate-600">{plan.overview}</p>
            {plans.length > 1 && (
              <p className="mt-3 text-xs text-slate-400">
                {plans.length} plan versions saved.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full lg:col-span-2" />
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

function RsvpStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
