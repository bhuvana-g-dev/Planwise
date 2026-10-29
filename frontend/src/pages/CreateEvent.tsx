import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  Users,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "../services/api";
import type { EventCreate, EventType, Preference } from "../types";
import { ErrorBanner } from "../components/ui";
import EventHero from "../components/EventHero";
import { EventHeroArt } from "../components/Illustrations";
import { eventTheme, STYLE_OPTIONS } from "../theme/eventTheme";
import { formatINR, classNames } from "../utils/format";

type Errors = Partial<Record<string, string>>;

const today = new Date().toISOString().slice(0, 10);

// Only the three backend-supported event types are selectable (the API's
// EventType enum). Each gets an illustrated card.
const TYPE_CARDS: { value: EventType; title: string; blurb: string }[] = [
  { value: "birthday", title: "Birthday", blurb: "Cakes, balloons & fun" },
  { value: "wedding", title: "Wedding", blurb: "Elegant & romantic" },
  {
    value: "community",
    title: "Community",
    blurb: "Gatherings & festivals",
  },
];

const EMPTY: EventCreate = {
  name: "",
  event_type: "birthday",
  event_date: "",
  location: "",
  guest_count: 50,
  budget_inr: 30000,
  theme: "",
  style: "",
  dietary_requirements: [],
  accessibility_requirements: [],
  preferences: [
    { label: "catering", rank: 1 },
    { label: "venue", rank: 2 },
    { label: "decorations", rank: 3 },
  ],
  hard_constraints: [],
  flexible_choices: [],
};

const DEMO: EventCreate = {
  ...EMPTY,
  name: "Aarav's 10th Birthday",
  event_date: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
  location: "Madurai, Tamil Nadu, India",
  theme: "Jungle adventure",
  style: "Simple outdoor celebration",
  dietary_requirements: ["Vegetarian food"],
  hard_constraints: ["Vegetarian catering only"],
  flexible_choices: ["decorations", "activities"],
};

const STEP_LABELS = ["Basics", "Budget & details", "Priorities", "Review"];

export default function CreateEvent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EventCreate>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const theme = eventTheme(form.event_type, form.style);

  const set = <K extends keyof EventCreate>(key: K, value: EventCreate[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function validateStep(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (!form.name.trim()) e.name = "Event name is required";
      if (!form.event_date) e.event_date = "Pick an event date";
      else if (form.event_date < today) e.event_date = "Date can't be in the past";
      if (!form.location.trim()) e.location = "Location is required";
    }
    if (s === 1) {
      if (!Number.isFinite(form.guest_count) || form.guest_count < 1)
        e.guest_count = "At least 1 guest";
      if (!Number.isFinite(form.budget_inr) || form.budget_inr <= 0)
        e.budget_inr = "Budget must be positive";
    }
    return e;
  }

  function next() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length === 0)
      setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  async function submit() {
    const e = { ...validateStep(0), ...validateStep(1) };
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setStep(0);
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      // Unchanged payload / flow: create event, then generate the first plan,
      // then land on the real dashboard.
      const created = await api.createEvent(form);
      await api.generatePlan(created.id).catch(() => null);
      navigate(`/events/${created.id}`);
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Could not create event");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Create an event</h1>
        <button
          type="button"
          className="text-sm text-brand-600 hover:underline"
          onClick={() => setForm(DEMO)}
        >
          Fill demo data
        </button>
      </div>

      <Stepper step={step} />

      {apiError && (
        <div className="mt-4">
          <ErrorBanner message={apiError} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Form column ── */}
        <div>
          {/* key={step} restarts the entrance animation on each step */}
          <div key={step} className="card animate-fade-up p-6">
            {step === 0 && (
              <div className="space-y-5">
                <Field label="Event name" error={errors.name}>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Aarav's 10th Birthday"
                  />
                </Field>

                <div>
                  <label className="label">Event type</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {TYPE_CARDS.map((t) => {
                      const th = eventTheme(t.value);
                      const active = form.event_type === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => set("event_type", t.value)}
                          aria-pressed={active}
                          className={classNames(
                            "group relative overflow-hidden rounded-2xl border p-3 text-left transition",
                            active
                              ? "border-brand-500 shadow-lift"
                              : "border-sand-300 hover:border-brand-300 hover:shadow-card"
                          )}
                          style={active ? { background: th.heroGradient } : undefined}
                        >
                          <EventHeroArtMini theme={th} />
                          <p className="mt-1 font-semibold text-slate-900">
                            {t.title}
                          </p>
                          <p className="text-xs text-slate-500">{t.blurb}</p>
                          {active && (
                            <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Event date" error={errors.event_date}>
                    <input
                      type="date"
                      className="input"
                      min={today}
                      value={form.event_date}
                      onChange={(e) => set("event_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Location" error={errors.location}>
                    <input
                      className="input"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder="City, State"
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Estimated guests" error={errors.guest_count}>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={form.guest_count}
                      onChange={(e) => set("guest_count", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Total budget (₹)" error={errors.budget_inr}>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={form.budget_inr}
                      onChange={(e) => set("budget_inr", Number(e.target.value))}
                    />
                  </Field>
                </div>
                <Field label="Theme">
                  <input
                    className="input"
                    value={form.theme}
                    onChange={(e) => set("theme", e.target.value)}
                    placeholder="e.g. Jungle"
                  />
                </Field>
                <StylePicker
                  eventType={form.event_type}
                  value={form.style ?? ""}
                  onChange={(v) => set("style", v)}
                />
                <Field label="Dietary requirements (comma separated)">
                  <input
                    className="input"
                    value={(form.dietary_requirements ?? []).join(", ")}
                    onChange={(e) =>
                      set("dietary_requirements", splitList(e.target.value))
                    }
                    placeholder="e.g. Vegetarian food"
                  />
                </Field>
                <Field label="Accessibility requirements (comma separated)">
                  <input
                    className="input"
                    value={(form.accessibility_requirements ?? []).join(", ")}
                    onChange={(e) =>
                      set("accessibility_requirements", splitList(e.target.value))
                    }
                    placeholder="e.g. Wheelchair access"
                  />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <PreferenceEditor
                  value={form.preferences ?? []}
                  onChange={(p) => set("preferences", p)}
                />
                <Field label="Hard constraints — must never be violated (one per line)">
                  <textarea
                    className="input min-h-[80px]"
                    value={(form.hard_constraints ?? []).join("\n")}
                    onChange={(e) =>
                      set("hard_constraints", splitLines(e.target.value))
                    }
                    placeholder="e.g. Vegetarian catering only"
                  />
                </Field>
                <Field label="Flexible choices — may change during replanning (one per line)">
                  <textarea
                    className="input min-h-[80px]"
                    value={(form.flexible_choices ?? []).join("\n")}
                    onChange={(e) =>
                      set("flexible_choices", splitLines(e.target.value))
                    }
                    placeholder="e.g. decorations"
                  />
                </Field>
              </div>
            )}

            {step === 3 && <ReviewStep form={form} />}
          </div>
        </div>

        {/* ── Live themed preview ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          {/* key on type+style so the preview re-animates when the look changes */}
          <div
            key={`${theme.key}-${theme.styleKey}`}
            className="animate-fade-up transition-all duration-300"
          >
          <EventHero theme={theme} compact>
            <h2 className="truncate text-xl font-bold text-slate-900">
              {form.name || "Your event name"}
            </h2>
            <p className="mt-1 text-sm capitalize text-slate-600">
              {theme.label}
              {theme.styleLabel ? ` · ${theme.styleLabel}` : ""}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-brand-500" />
                {form.event_date || "Pick a date"}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-500" />
                {form.location || "Add a location"}
              </li>
              <li className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-500" />
                {form.guest_count} guests
              </li>
              <li className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand-500" />
                {formatINR((form.budget_inr || 0) * 100)}
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">
              Live preview — updates as you fill the form.
            </p>
          </EventHero>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          className="btn-secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {step < STEP_LABELS.length - 1 ? (
          <button className="btn-primary" onClick={next}>
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating &
                generating plan…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Create & generate plan
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function EventHeroArtMini({ theme }: { theme: ReturnType<typeof eventTheme> }) {
  // Event-type scene (rings / balloons & cake / people & bunting), reusing the
  // same illustration as the dashboard hero so the card matches the result.
  // Decorative only: EventHeroArt is aria-hidden and the card has a text label.
  return (
    <div
      className="flex h-20 w-full items-center justify-center overflow-hidden rounded-xl transition-colors duration-300 sm:h-24"
      style={{ background: theme.soft }}
    >
      <EventHeroArt
        theme={theme}
        className="h-full w-auto max-w-full transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
    </div>
  );
}

// Style preset chips for the chosen event type. The stored value is the preset
// label (a plain string the backend accepts). Selecting the active chip again
// clears it (back to the base/classic look). A free-text fallback keeps any
// custom style the user types — the resolver matches it to the closest preset.
function StylePicker({
  eventType,
  value,
  onChange,
}: {
  eventType: EventType;
  value: string;
  onChange: (v: string) => void;
}) {
  const options = STYLE_OPTIONS[eventType] ?? [];
  const activeByLabel = options.find(
    (o) => o.label.toLowerCase() === value.trim().toLowerCase()
  );
  return (
    <div>
      <label className="label">Style</label>
      <p className="mb-2 text-xs text-slate-500">
        Pick a style to tailor the colours, motifs and preview — or type your
        own below.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = activeByLabel?.key === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? "" : o.label)}
              className={classNames(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                  : "border-sand-300 text-slate-600 hover:border-brand-300 hover:bg-sand-50"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <input
        className="input mt-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Simple outdoor celebration"
      />
    </div>
  );
}

function ReviewStep({ form }: { form: EventCreate }) {
  const rows: [string, string][] = [
    ["Name", form.name || "—"],
    ["Type", form.event_type],
    ["Date", form.event_date || "—"],
    ["Location", form.location || "—"],
    ["Guests", String(form.guest_count)],
    ["Budget", formatINR((form.budget_inr || 0) * 100)],
    ["Theme", form.theme || "—"],
    ["Style", form.style || "—"],
    ["Dietary", (form.dietary_requirements ?? []).join(", ") || "—"],
    ["Accessibility", (form.accessibility_requirements ?? []).join(", ") || "—"],
    [
      "Priorities",
      (form.preferences ?? [])
        .filter((p) => p.label.trim())
        .map((p) => `${p.label} (#${p.rank})`)
        .join(", ") || "—",
    ],
    ["Hard constraints", (form.hard_constraints ?? []).join(", ") || "—"],
    ["Flexible choices", (form.flexible_choices ?? []).join(", ") || "—"],
  ];
  return (
    <div>
      <h3 className="mb-1 font-display text-lg font-semibold text-slate-900">
        Review your event
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Confirm the details — you can go back to edit anything.
      </p>
      <dl className="divide-y divide-sand-200 rounded-xl border border-sand-200">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-2.5 text-sm">
            <dt className="w-36 shrink-0 text-slate-500">{k}</dt>
            <dd className="font-medium capitalize text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function splitList(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
function splitLines(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEP_LABELS.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span
            className={classNames(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition",
              i < step
                ? "bg-brand-600 text-white"
                : i === step
                ? "bg-brand-600 text-white ring-4 ring-brand-100"
                : "bg-sand-200 text-slate-500"
            )}
          >
            {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span
            className={classNames(
              "hidden text-sm sm:inline",
              i <= step ? "font-medium text-slate-900" : "text-slate-400"
            )}
          >
            {l}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <span
              className={classNames(
                "h-px flex-1 transition",
                i < step ? "bg-brand-400" : "bg-sand-300"
              )}
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function PreferenceEditor({
  value,
  onChange,
}: {
  value: Preference[];
  onChange: (p: Preference[]) => void;
}) {
  return (
    <div>
      <label className="label">
        Prioritized preferences (rank 1 = most important)
      </label>
      <p className="mb-2 text-xs text-slate-500">
        PlanWise cuts your lowest-priority categories first when the budget drops.
      </p>
      <div className="space-y-2">
        {value.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input"
              value={p.label}
              onChange={(e) => {
                const copy = [...value];
                copy[i] = { ...p, label: e.target.value };
                onChange(copy);
              }}
              placeholder="category e.g. catering"
            />
            <input
              type="number"
              min={1}
              className="input w-24"
              value={p.rank}
              onChange={(e) => {
                const copy = [...value];
                copy[i] = { ...p, rank: Number(e.target.value) };
                onChange(copy);
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 text-sm text-brand-600 hover:underline"
        onClick={() => onChange([...value, { label: "", rank: value.length + 1 }])}
      >
        + Add preference
      </button>
    </div>
  );
}
