import { useEffect, useMemo, useState } from "react";
import { Check, Info, Loader2, Lock, Plus, Users } from "lucide-react";
import type {
  BookingStatus,
  CatererInput,
  CatererMenuType,
  FoodType,
  PriceSource,
} from "../../types";
import {
  BOOKING_LABEL,
  estimate,
  FOOD_LABEL,
  INCLUSION_PRESETS,
  MENU_TYPES,
  PAYMENT_LABEL,
  PRICE_SOURCE_LABEL,
  validateCaterer,
} from "../../utils/caterers";
import { classNames, formatINR } from "../../utils/format";
import Modal from "./Modal";

type Errors = Record<string, string>;

function num(v: string): number {
  return v === "" ? 0 : Number(v);
}
function optNum(v: string): number | null {
  return v === "" ? null : Number(v);
}

export default function ManualCateringForm({
  open,
  title,
  subtitle,
  initial,
  headcount,
  headcountSource,
  saving,
  serverError,
  submitLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  initial: CatererInput;
  headcount: number;
  headcountSource: string;
  saving: boolean;
  serverError: string | null;
  submitLabel: string;
  onSubmit: (input: CatererInput) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<CatererInput>(initial);
  const [touched, setTouched] = useState(false);
  const [customInclusion, setCustomInclusion] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (open) {
      setF(initial);
      setTouched(false);
      setCustomInclusion("");
      const m = initial.menu;
      setShowMenu(Boolean(m && (m.starters || m.mains || m.desserts || m.beverages)));
    }
  }, [open, initial]);

  const set = <K extends keyof CatererInput>(k: K, v: CatererInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const est = useMemo(() => estimate(f, headcount), [f, headcount]);
  const errors: Errors = useMemo(() => validateCaterer(f, headcount), [f, headcount]);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const fixed = f.fixed_total_inr !== null && f.fixed_total_inr !== undefined;
  const followEvent = f.guest_count === null || f.guest_count === undefined;

  function toggle<T extends string>(list: T[] | undefined, v: T): T[] {
    const cur = list ?? [];
    return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  }

  function submit() {
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSubmit(f);
  }

  const headcountLabel =
    headcountSource === "confirmed" ? "confirmed RSVPs" : headcountSource === "override" ? "catering override" : "planned guests";

  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <p className="mr-auto hidden text-xs text-slate-400 sm:block">
            PlanWise records this arrangement — it doesn't contact or book the caterer.
          </p>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* ---------------- Form ---------------- */}
        <div className="space-y-6">
          {serverError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
              {serverError}
            </div>
          )}

          <Section title="Caterer">
            <Field label="Caterer / business name" error={show("name")} htmlFor="c-name">
              <input
                id="c-name"
                className="input"
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Annapoorna Caterers, or 'Ravi uncle's kitchen'"
                autoFocus
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone (optional)" htmlFor="c-phone">
                <input id="c-phone" className="input" inputMode="tel" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email or website (optional)" htmlFor="c-web">
                <input
                  id="c-web"
                  className="input"
                  value={f.website || f.email || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.includes("@") && !v.includes("/")) {
                      set("email", v);
                      set("website", "");
                    } else {
                      set("website", v);
                      set("email", "");
                    }
                  }}
                />
              </Field>
            </div>
          </Section>

          <Section title="Menu">
            <div>
              <span className="label">Food type</span>
              <Chips
                options={(["veg", "nonveg", "both"] as FoodType[]).map((v) => ({ v, label: FOOD_LABEL[v] }))}
                isActive={(v) => f.food_type === v}
                onPick={(v) => set("food_type", v as FoodType)}
                role="radio"
              />
            </div>
            <div>
              <span className="label">Meals covered</span>
              <Chips
                options={MENU_TYPES.map((v) => ({ v, label: v === "custom" ? "Custom package" : v[0].toUpperCase() + v.slice(1) }))}
                isActive={(v) => (f.menu_types ?? []).includes(v as CatererMenuType)}
                onPick={(v) => set("menu_types", toggle(f.menu_types, v as CatererMenuType))}
              />
            </div>
            <div>
              <button
                type="button"
                className="text-sm font-medium text-brand-700 hover:underline"
                onClick={() => setShowMenu((s) => !s)}
                aria-expanded={showMenu}
              >
                {showMenu ? "Hide dish details" : "+ Add dishes by course (optional)"}
              </button>
              {showMenu && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(["starters", "mains", "desserts", "beverages"] as const).map((course) => (
                    <Field key={course} label={course[0].toUpperCase() + course.slice(1)} htmlFor={`c-${course}`}>
                      <textarea
                        id={`c-${course}`}
                        className="input min-h-[64px]"
                        value={f.menu?.[course] ?? ""}
                        onChange={(e) =>
                          set("menu", {
                            starters: "", mains: "", desserts: "", beverages: "",
                            ...f.menu,
                            [course]: e.target.value,
                          })
                        }
                        placeholder={course === "mains" ? "e.g. Veg biryani, sambar, rasam" : ""}
                      />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title="Price">
            <div>
              <span className="label">Guests</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionCard
                  active={followEvent}
                  onClick={() => set("guest_count", null)}
                  title={`Follow headcount (${headcount})`}
                  body={`Updates automatically from your ${headcountLabel}.`}
                />
                <OptionCard
                  active={!followEvent}
                  onClick={() => set("guest_count", f.guest_count ?? headcount)}
                  title="Agreed fixed count"
                  body="Use the number you agreed with the caterer."
                />
              </div>
              {!followEvent && (
                <div className="mt-2 max-w-[200px]">
                  <input
                    aria-label="Agreed guest count"
                    type="number"
                    min={1}
                    step={1}
                    className="input"
                    value={f.guest_count ?? ""}
                    onChange={(e) => set("guest_count", optNum(e.target.value))}
                  />
                  {show("guest_count") && <ErrorText>{show("guest_count")}</ErrorText>}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Price per guest (₹)" error={show("price_per_guest_inr")} htmlFor="c-ppg">
                <MoneyInput id="c-ppg" value={f.price_per_guest_inr} onChange={(v) => set("price_per_guest_inr", v)} disabled={fixed} />
              </Field>
              <Field label="Extras — transport, taxes, staff (₹)" error={show("extras_inr")} htmlFor="c-extras">
                <MoneyInput id="c-extras" value={f.extras_inr} onChange={(v) => set("extras_inr", v)} disabled={fixed} />
              </Field>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                checked={fixed}
                onChange={(e) =>
                  set("fixed_total_inr", e.target.checked ? Math.round(est.computedPaise / 100) : null)
                }
              />
              <Lock className="h-3.5 w-3.5 text-slate-400" /> Negotiated fixed package price
            </label>
            {fixed && (
              <div className="grid gap-3 rounded-xl border border-sand-200 bg-sand-50/60 p-3 sm:grid-cols-2">
                <Field label="Fixed total (₹)" error={show("fixed_total_inr")} htmlFor="c-fixed">
                  <MoneyInput id="c-fixed" value={f.fixed_total_inr ?? 0} onChange={(v) => set("fixed_total_inr", v)} />
                </Field>
                <Field label="Reason" error={show("fixed_total_reason")} htmlFor="c-reason">
                  <input
                    id="c-reason"
                    className="input"
                    value={f.fixed_total_reason ?? ""}
                    onChange={(e) => set("fixed_total_reason", e.target.value)}
                    placeholder="e.g. All-inclusive family rate"
                  />
                </Field>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Where does this price come from?" htmlFor="c-src">
                <select
                  id="c-src"
                  className="input"
                  value={f.price_source}
                  onChange={(e) => set("price_source", e.target.value as PriceSource)}
                >
                  {(Object.keys(PRICE_SOURCE_LABEL) as PriceSource[]).map((k) => (
                    <option key={k} value={k}>{PRICE_SOURCE_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min guests" htmlFor="c-min">
                  <input id="c-min" type="number" min={1} className="input" value={f.min_guests ?? ""} onChange={(e) => set("min_guests", optNum(e.target.value))} />
                </Field>
                <Field label="Max guests" error={show("max_guests")} htmlFor="c-max">
                  <input id="c-max" type="number" min={1} className="input" value={f.max_guests ?? ""} onChange={(e) => set("max_guests", optNum(e.target.value))} />
                </Field>
              </div>
            </div>

            <div>
              <span className="label">Included in the package</span>
              <Chips
                options={[...INCLUSION_PRESETS, ...(f.inclusions ?? []).filter((x) => !INCLUSION_PRESETS.includes(x))].map((v) => ({ v, label: v }))}
                isActive={(v) => (f.inclusions ?? []).includes(v)}
                onPick={(v) => set("inclusions", toggle(f.inclusions, v))}
              />
              <div className="mt-2 flex max-w-sm gap-2">
                <input
                  className="input py-1.5"
                  placeholder="Add another inclusion"
                  value={customInclusion}
                  onChange={(e) => setCustomInclusion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customInclusion.trim()) {
                      e.preventDefault();
                      set("inclusions", [...(f.inclusions ?? []), customInclusion.trim()]);
                      setCustomInclusion("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5"
                  disabled={!customInclusion.trim()}
                  onClick={() => {
                    set("inclusions", [...(f.inclusions ?? []), customInclusion.trim()]);
                    setCustomInclusion("");
                  }}
                  aria-label="Add inclusion"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Section>

          <Section title="Booking & payment">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Booking status" htmlFor="c-book">
                <select
                  id="c-book"
                  className="input"
                  value={f.booking_status}
                  onChange={(e) => set("booking_status", e.target.value as BookingStatus)}
                >
                  {(Object.keys(BOOKING_LABEL) as BookingStatus[]).map((k) => (
                    <option key={k} value={k}>{BOOKING_LABEL[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Advance paid (₹)" error={show("advance_paid_inr")} htmlFor="c-adv">
                <MoneyInput id="c-adv" value={f.advance_paid_inr} onChange={(v) => set("advance_paid_inr", v)} />
              </Field>
            </div>
            {f.booking_status === "confirmed" && (
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Marked confirmed because you arranged it with the caterer. PlanWise
                doesn't make or verify bookings.
              </p>
            )}
            <Field label="Notes (optional)" htmlFor="c-notes">
              <textarea id="c-notes" className="input min-h-[64px]" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Tasting date, special requests, payment schedule…" />
            </Field>
          </Section>
        </div>

        {/* ---------------- Live summary ---------------- */}
        <aside className="lg:sticky lg:top-0 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-sand-200 bg-gradient-to-b from-brand-50 to-white">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                Estimated total
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {est.hasPrice ? formatINR(est.totalPaise) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {est.isFixed
                  ? "Fixed package price"
                  : est.hasPrice
                  ? `${est.guests} guests × ${formatINR(Math.round((f.price_per_guest_inr ?? 0) * 100))}${f.extras_inr ? ` + ${formatINR(Math.round(f.extras_inr * 100))} extras` : ""}`
                  : "Add a price per guest to estimate"}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" />
                {followEvent ? `Follows your ${headcountLabel}` : "Fixed agreed guest count"}
              </p>
            </div>
            <div className="space-y-3 border-t border-sand-200 bg-white p-5">
              <Row label="Advance paid" value={formatINR(est.advancePaise)} />
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-sand-200">
                  <div
                    className={classNames(
                      "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                      est.advancePaise > est.totalPaise && est.hasPrice ? "bg-rose-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${est.paidPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{PAYMENT_LABEL[est.payment]}</p>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-sand-200 pt-3">
                <span className="text-sm font-medium text-slate-700">Balance due</span>
                <span className={classNames("text-xl font-bold tabular-nums", est.balancePaise < 0 ? "text-rose-600" : "text-slate-900")}>
                  {est.hasPrice ? formatINR(est.balancePaise) : "—"}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Saved totals are recalculated by PlanWise. Adding this to your
                budget is a separate step you review first.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-rose-600">{children}</p>;
}

function MoneyInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number | undefined;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
      <input
        id={id}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        className="input pl-7 tabular-nums disabled:bg-sand-100 disabled:text-slate-400"
        placeholder="0"
        value={value ? value : ""}
        onChange={(e) => onChange(num(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}

function Chips({
  options,
  isActive,
  onPick,
  role,
}: {
  options: { v: string; label: string }[];
  isActive: (v: string) => boolean;
  onPick: (v: string) => void;
  role?: "radio";
}) {
  return (
    <div className="flex flex-wrap gap-2" role={role === "radio" ? "radiogroup" : "group"}>
      {options.map((o) => {
        const active = isActive(o.v);
        return (
          <button
            key={o.v}
            type="button"
            role={role}
            aria-checked={role === "radio" ? active : undefined}
            aria-pressed={role === "radio" ? undefined : active}
            onClick={() => onPick(o.v)}
            className={classNames(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition",
              active
                ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                : "border-sand-300 text-slate-600 hover:border-brand-300 hover:bg-sand-50"
            )}
          >
            {active && role !== "radio" && <Check className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function OptionCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        "rounded-xl border p-3 text-left transition",
        active ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-sand-300 hover:border-brand-300"
      )}
    >
      <span className="block text-sm font-semibold text-slate-800">{title}</span>
      <span className="block text-xs text-slate-500">{body}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
