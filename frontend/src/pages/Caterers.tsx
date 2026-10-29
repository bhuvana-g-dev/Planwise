import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ChefHat,
  ClipboardList,
  Link2,
  Plus,
  Scale,
  Search,
  Wallet,
} from "lucide-react";
import ModuleHeader from "../components/ModuleHeader";
import { CateringArt } from "../components/Illustrations";
import { ConfirmDialog, ErrorBanner, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import CateringSearch from "../components/caterers/CateringSearch";
import MenuComparison from "../components/caterers/MenuComparison";
import ManualCateringForm from "../components/caterers/ManualCateringForm";
import CateringBookingPanel from "../components/caterers/CateringBookingPanel";
import Modal from "../components/caterers/Modal";
import { cateringService } from "../services/cateringService";
import { ApiError } from "../services/api";
import { eventTheme } from "../theme/eventTheme";
import type {
  CatererInput,
  CatererOverview,
  CatererSearchResult,
  CatererView,
  FoodType,
} from "../types";
import { emptyCaterer } from "../utils/caterers";
import { classNames, formatINR } from "../utils/format";

type Tab = "discover" | "compare" | "booking";

interface FormState {
  mode: "create" | "edit";
  title: string;
  subtitle?: string;
  submitLabel: string;
  initial: CatererInput;
  editId?: string;
}

function inputFromRecord(r: CatererView): CatererInput {
  return {
    name: r.name, source: r.source, provider_id: r.provider_id, kind: r.kind,
    phone: r.phone, email: r.email, website: r.website, address: r.address,
    lat: r.lat, lng: r.lng, distance_km: r.distance_km,
    menu_types: r.menu_types, food_type: r.food_type, cuisines: r.cuisines,
    menu: r.menu, inclusions: r.inclusions, guest_count: r.guest_count,
    price_per_guest_inr: r.price_per_guest_paise / 100,
    extras_inr: r.extras_paise / 100,
    fixed_total_inr: r.fixed_total_paise === null ? null : r.fixed_total_paise / 100,
    fixed_total_reason: r.fixed_total_reason,
    advance_paid_inr: r.advance_paid_paise / 100,
    price_source: r.price_source, min_guests: r.min_guests, max_guests: r.max_guests,
    booking_status: r.booking_status, refunded: r.refunded, notes: r.notes,
  };
}

function inputFromResult(r: CatererSearchResult): CatererInput {
  return {
    ...emptyCaterer(),
    name: r.name,
    source: "osm",
    provider_id: r.provider_id,
    kind: r.kind,
    phone: r.phone,
    email: r.email,
    website: r.website,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    distance_km: r.distance_km,
    cuisines: r.cuisines,
    // Only map what OpenStreetMap actually states; the user confirms the rest.
    food_type: r.diet === "pure_veg" ? "veg" : r.diet === "non_veg" ? "nonveg" : r.diet === "veg_options" ? "both" : "veg",
    price_source: "quote_needed",
  };
}

export default function Caterers() {
  const { eventId = "" } = useParams();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (["discover", "compare", "booking"].includes(params.get("tab") ?? "")
    ? params.get("tab")
    : "discover") as Tab;
  const setTab = (t: Tab) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });

  const [ov, setOv] = useState<CatererOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CatererView | null>(null);
  const [linkCandidate, setLinkCandidate] = useState<CatererSearchResult | null>(null);

  const load = useCallback(async () => {
    try {
      setOv(await cateringService.overview(eventId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Couldn't load caterers");
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const addedProviderIds = useMemo(
    () => new Set((ov?.records ?? []).map((r) => r.provider_id).filter(Boolean) as string[]),
    [ov]
  );
  // Manual records not yet linked to a real provider — candidates for linking.
  const linkable = useMemo(
    () => (ov?.records ?? []).filter((r) => !r.provider_id),
    [ov]
  );

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!ov) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const theme = eventTheme(ov.event.event_type);
  const selected = ov.records.find((r) => r.id === ov.selected_id) ?? null;

  function openManual() {
    setFormError(null);
    setForm({
      mode: "create",
      title: "Record a catering arrangement",
      subtitle: "For a caterer you found yourself or already booked outside PlanWise.",
      submitLabel: "Save caterer",
      initial: emptyCaterer(),
    });
  }

  function openFromResult(r: CatererSearchResult) {
    setFormError(null);
    setForm({
      mode: "create",
      title: `Add ${r.name}`,
      subtitle: "Real business details from OpenStreetMap. Add a quote now, or later once you hear back.",
      submitLabel: "Add to my options",
      initial: inputFromResult(r),
    });
  }

  function onAddResult(r: CatererSearchResult) {
    if (linkable.length > 0) setLinkCandidate(r);
    else openFromResult(r);
  }

  async function linkTo(target: CatererView, r: CatererSearchResult) {
    setBusyId(target.id);
    try {
      const out = await cateringService.create(eventId, inputFromResult(r), target.id);
      setOv(out.overview);
      toast.success(`Linked ${r.name} to "${target.name}" — no duplicate created.`);
      setLinkCandidate(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't link");
    } finally {
      setBusyId(null);
    }
  }

  async function submitForm(input: CatererInput) {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      if (form.mode === "edit" && form.editId) {
        setOv(await cateringService.update(eventId, form.editId, input));
        toast.success("Caterer updated.");
      } else {
        const out = await cateringService.create(eventId, input);
        setOv(out.overview);
        toast.success(`${input.name} added to your options.`);
        setTab("compare");
      }
      setForm(null);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelect(r: CatererView) {
    setBusyId(r.id);
    try {
      const next = await cateringService.select(eventId, r.id, !r.selected);
      setOv(next);
      if (!r.selected) {
        toast.success(`${r.name} selected. Review the budget impact next.`);
        setTab("booking");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't select");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusyId(removeTarget.id);
    try {
      setOv(await cateringService.remove(eventId, removeTarget.id));
      toast.info(`${removeTarget.name} removed.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove");
    } finally {
      setBusyId(null);
      setRemoveTarget(null);
    }
  }

  async function changeFood(f: FoodType) {
    try {
      setOv(await cateringService.setPreference(eventId, f));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save preference");
    }
  }

  const tabs: { k: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { k: "discover", label: "Find caterers", icon: <Search className="h-4 w-4" /> },
    { k: "compare", label: "Compare", icon: <Scale className="h-4 w-4" />, count: ov.records.length },
    { k: "booking", label: "Booking & budget", icon: <Wallet className="h-4 w-4" /> },
  ];

  return (
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <ModuleHeader
          theme={theme}
          eyebrow="Caterers & booking"
          title="Caterers & booking"
          subtitle={`Find real caterers, compare quotes and keep catering in your budget — for ${ov.headcount.count} guests.`}
          art={<CateringArt className="h-16 w-16" />}
          actions={
            <>
              <Link to={`/events/${eventId}/catering`} className="btn-secondary">
                <ChefHat className="h-4 w-4" /> Menu planner
              </Link>
              <button type="button" className="btn-primary" onClick={openManual}>
                <Plus className="h-4 w-4" /> Add manually
              </button>
            </>
          }
        />
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-3" style={{ ["--i" as string]: 1 }}>
        <Tile
          icon={<ClipboardList className="h-5 w-5" />}
          label="Options"
          value={String(ov.records.length)}
          hint={ov.best_fit_id ? `Best fit: ${ov.records.find((r) => r.id === ov.best_fit_id)?.name}` : "Add quotes to compare"}
          onClick={() => setTab("compare")}
        />
        <Tile
          icon={<ChefHat className="h-5 w-5" />}
          label="Selected caterer"
          value={selected ? (selected.has_price ? formatINR(selected.total_paise) : "Quote needed") : "None yet"}
          hint={selected ? selected.name : "Choose one in Compare"}
          onClick={() => setTab(selected ? "booking" : "compare")}
        />
        <Tile
          icon={<Wallet className="h-5 w-5" />}
          label="Catering in budget"
          value={ov.budget.catering_paise != null ? formatINR(ov.budget.catering_paise) : "—"}
          hint={ov.budget.has_plan
            ? `${formatINR(ov.budget.remaining_paise ?? 0)} left of ${formatINR(ov.budget.budget_paise ?? 0)}`
            : "No plan generated yet"}
          tone={selected?.budget_sync === "out_of_date" ? "warn" : selected?.budget_sync === "in_sync" ? "ok" : undefined}
          onClick={() => setTab("booking")}
        />
      </div>

      {/* Tabs */}
      <div className="sticky top-[60px] z-10 -mx-1 overflow-x-auto px-1" style={{ ["--i" as string]: 2 }}>
        <div className="inline-flex min-w-full gap-1 rounded-2xl border border-sand-200 bg-white/90 p-1 shadow-sm backdrop-blur sm:min-w-0" role="tablist" aria-label="Caterer sections">
          {tabs.map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={tab === t.k}
              onClick={() => setTab(t.k)}
              className={classNames(
                "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition sm:flex-none",
                tab === t.k ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-sand-50"
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={classNames("rounded-full px-1.5 text-xs tabular-nums", tab === t.k ? "bg-white/25" : "bg-sand-200 text-slate-600")}>
                  {t.count}
                </span>
              )}
              {t.k === "booking" && selected?.budget_sync === "out_of_date" && (
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Budget needs update" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="animate-fade-up" role="tabpanel">
        {tab === "discover" && (
          <CateringSearch
            defaultLocation={ov.event.location}
            headcount={ov.headcount.count}
            eventDate={ov.event.date}
            foodPreference={ov.food_preference}
            onFoodPreferenceChange={(f) => void changeFood(f)}
            addedProviderIds={addedProviderIds}
            onAdd={onAddResult}
            onManual={openManual}
          />
        )}
        {tab === "compare" && (
          <MenuComparison
            overview={ov}
            busyId={busyId}
            onEdit={(r) => {
              setFormError(null);
              setForm({ mode: "edit", title: `Edit ${r.name}`, submitLabel: "Save changes", initial: inputFromRecord(r), editId: r.id });
            }}
            onSelect={(r) => void toggleSelect(r)}
            onRemove={(r) => setRemoveTarget(r)}
            onDiscover={() => setTab("discover")}
            onManual={openManual}
          />
        )}
        {tab === "booking" && (
          <CateringBookingPanel
            eventId={eventId}
            overview={ov}
            onChanged={setOv}
            onEdit={(r) => {
              setFormError(null);
              setForm({ mode: "edit", title: `Edit ${r.name}`, submitLabel: "Save changes", initial: inputFromRecord(r), editId: r.id });
            }}
            onCompare={() => setTab("compare")}
          />
        )}
      </div>

      {form && (
        <ManualCateringForm
          open
          title={form.title}
          subtitle={form.subtitle}
          initial={form.initial}
          headcount={ov.headcount.count}
          headcountSource={ov.headcount.source}
          saving={saving}
          serverError={formError}
          submitLabel={form.submitLabel}
          onSubmit={(i) => void submitForm(i)}
          onClose={() => setForm(null)}
        />
      )}

      {/* Link-or-add dialog: prevents counting the same caterer twice */}
      <Modal
        open={linkCandidate !== null}
        title="Is this a caterer you've already recorded?"
        subtitle={linkCandidate ? `${linkCandidate.name} · ${linkCandidate.address || "address not listed"}` : undefined}
        onClose={() => setLinkCandidate(null)}
        size="md"
        footer={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const r = linkCandidate;
              setLinkCandidate(null);
              if (r) openFromResult(r);
            }}
          >
            No — add as a new option
          </button>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          Linking attaches this business's real contact details to your existing
          record and keeps your agreed price and payments — so it isn't counted twice.
        </p>
        <ul className="space-y-2">
          {linkable.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => linkCandidate && void linkTo(r, linkCandidate)}
                className="flex w-full items-center gap-3 rounded-xl border border-sand-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/50"
              >
                <Link2 className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">Same as "{r.name}"</span>
                  <span className="block text-xs text-slate-500">
                    {r.has_price ? formatINR(r.total_paise) : "No price yet"} · {r.selected ? "selected" : "option"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name ?? "caterer"}?`}
        message={removeTarget?.budget_sync === "in_sync"
          ? "This caterer's cost is in your budget. Removing the record does not change the budget — apply another caterer to replace it."
          : "This removes the option and its payment record from PlanWise."}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoveTarget(null)}
        busy={busyId !== null}
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card group flex items-start gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift motion-reduce:hover:translate-y-0"
    >
      <span className={classNames("grid h-10 w-10 shrink-0 place-items-center rounded-xl",
        tone === "warn" ? "bg-amber-100 text-amber-700" : tone === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-brand-50 text-brand-600")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="block truncate text-xl font-bold tabular-nums text-slate-900">{value}</span>
        <span className="block truncate text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
}
