import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { api, ApiError } from "../services/api";
import type { EventCreate, EventType, Preference } from "../types";
import { ErrorBanner } from "../components/ui";
import { classNames } from "../utils/format";

type Errors = Partial<Record<string, string>>;

const today = new Date().toISOString().slice(0, 10);

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

export default function CreateEvent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EventCreate>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, 2));
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
      const created = await api.createEvent(form);
      const plan = await api.generatePlan(created.id).catch(() => null);
      void plan;
      navigate(`/events/${created.id}`);
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Could not create event");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
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

      <div className="card mt-6 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Event name" error={errors.name}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Aarav's 10th Birthday"
              />
            </Field>
            <Field label="Event type">
              <div className="grid grid-cols-3 gap-2">
                {(["birthday", "wedding", "community"] as EventType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("event_type", t)}
                    className={classNames(
                      "rounded-xl border px-3 py-2 text-sm font-medium capitalize",
                      form.event_type === t
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Theme">
                <input
                  className="input"
                  value={form.theme}
                  onChange={(e) => set("theme", e.target.value)}
                  placeholder="e.g. Jungle"
                />
              </Field>
              <Field label="Style">
                <input
                  className="input"
                  value={form.style}
                  onChange={(e) => set("style", e.target.value)}
                  placeholder="e.g. Simple outdoor celebration"
                />
              </Field>
            </div>
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
                onChange={(e) => set("hard_constraints", splitLines(e.target.value))}
                placeholder="e.g. Vegetarian catering only"
              />
            </Field>
            <Field label="Flexible choices — may change during replanning (one per line)">
              <textarea
                className="input min-h-[80px]"
                value={(form.flexible_choices ?? []).join("\n")}
                onChange={(e) => set("flexible_choices", splitLines(e.target.value))}
                placeholder="e.g. decorations"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          className="btn-secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {step < 2 ? (
          <button className="btn-primary" onClick={next}>
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating plan…
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

function splitList(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
function splitLines(v: string): string[] {
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}

function Stepper({ step }: { step: number }) {
  const labels = ["Basics", "Budget & details", "Priorities"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span
            className={classNames(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
              i <= step ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
            )}
          >
            {i + 1}
          </span>
          <span
            className={classNames(
              "text-sm",
              i <= step ? "font-medium text-slate-900" : "text-slate-400"
            )}
          >
            {l}
          </span>
          {i < labels.length - 1 && (
            <span className="h-px flex-1 bg-slate-200" aria-hidden />
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
