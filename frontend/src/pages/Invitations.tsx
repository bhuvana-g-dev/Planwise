import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Mail,
  Save,
  Share2,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "../services/api";
import { useEventDetail } from "../hooks/useEventDetail";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import InvitationCard from "../components/invitations/InvitationCard";
import { ErrorBanner, Skeleton } from "../components/ui";
import { eventTheme } from "../theme/eventTheme";
import { classNames } from "../utils/format";
import {
  defaultTemplate,
  getTemplate,
  GROUP_LABEL,
  initialDesign,
  invitationText,
  switchTemplate,
  TEMPLATES,
  templatesFor,
  type TemplateGroup,
} from "../invitations/templates";
import { downloadBlob, invitationFilename, svgToPng } from "../utils/invitationExport";
import type { InvitationDesign, InvitationTone, InvitationWording } from "../types";

type Filter = "suggested" | TemplateGroup | "all";

const TONES: { key: InvitationTone; label: string }[] = [
  { key: "warm", label: "Warm" },
  { key: "formal", label: "Formal" },
  { key: "fun", label: "Fun" },
  { key: "traditional", label: "Traditional" },
];

// Mirrors the backend limits in app/models/invitation.py.
const FIELDS: { key: keyof InvitationDesign; label: string; max: number; placeholder: string; area?: boolean }[] = [
  { key: "eyebrow", label: "Top line", max: 80, placeholder: "e.g. Together with their families" },
  { key: "headline", label: "Headline", max: 90, placeholder: "e.g. Priya & Arjun" },
  { key: "hosts", label: "Hosted by", max: 120, placeholder: "e.g. The Sharma family (optional)" },
  { key: "message", label: "Message", max: 400, placeholder: "A few words for your guests", area: true },
  { key: "date_text", label: "Date", max: 80, placeholder: "e.g. Friday, 25 December 2026" },
  { key: "time_text", label: "Time", max: 60, placeholder: "e.g. 7 PM onwards" },
  { key: "venue_text", label: "Venue", max: 160, placeholder: "Venue name and area" },
  { key: "dress_code", label: "Dress code", max: 80, placeholder: "Optional" },
  { key: "rsvp_text", label: "RSVP", max: 120, placeholder: "e.g. RSVP to Meena · 98xxx xxxxx" },
];

export default function Invitations() {
  const { eventId } = useParams();
  const { data, loading, error } = useEventDetail(eventId);
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);

  const [design, setDesign] = useState<InvitationDesign | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("suggested");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tone, setTone] = useState<InvitationTone>("warm");
  const [details, setDetails] = useState("");
  const [writing, setWriting] = useState(false);
  const [wording, setWording] = useState<InvitationWording | null>(null);

  const event = data?.event;
  const facts = useMemo(() => {
    if (!data) return null;
    const venue = [data.selected_venue?.name, data.event.location].filter(Boolean).join(", ");
    return { name: data.event.name, date: data.event.event_date, venue };
  }, [data]);

  // Load the saved design, or start one from the event's details.
  useEffect(() => {
    if (!eventId || !event || !facts) return;
    let cancelled = false;
    api.getInvitation(eventId)
      .then(({ design: saved }) => {
        if (cancelled) return;
        if (saved && getTemplate(saved.template_id)) {
          setDesign(saved);
          setSavedSnapshot(JSON.stringify(saved));
        } else {
          setDesign(initialDesign(defaultTemplate(event.event_type), facts));
          setSavedSnapshot(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : "Couldn't load the invitation");
      });
    return () => { cancelled = true; };
  }, [eventId, event, facts]);

  const template = getTemplate(design?.template_id) ?? defaultTemplate(event?.event_type ?? "");
  const dirty = design !== null && JSON.stringify(design) !== savedSnapshot;
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  const gallery = useMemo(() => {
    if (!event) return [];
    if (filter === "suggested") return templatesFor(event.event_type);
    if (filter === "all") return TEMPLATES;
    return TEMPLATES.filter((t) => t.group === filter);
  }, [filter, event]);

  if (loading || (!design && !loadError && !error))
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  if (error || loadError) return <ErrorBanner message={error ?? loadError ?? ""} />;
  if (!data || !design || !event || !facts || !eventId) return null;

  const theme = eventTheme(event.event_type, event.style);
  const set = (k: keyof InvitationDesign, v: string) => setDesign((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!design || !eventId) return;
    setSaving(true);
    try {
      const { design: stored } = await api.saveInvitation(eventId, design);
      setDesign(stored);
      setSavedSnapshot(JSON.stringify(stored));
      toast.success("Invitation saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the invitation");
    } finally {
      setSaving(false);
    }
  }

  async function writeWithAI() {
    if (!eventId) return;
    setWriting(true);
    try {
      const w = await api.suggestInvitationWording(eventId, tone, details.trim());
      setWording(w);
      setDesign((d) => (d ? { ...d, headline: w.headline, message: w.message } : d));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't write the wording");
    } finally {
      setWriting(false);
    }
  }

  async function makePng(): Promise<Blob | null> {
    if (!svgRef.current) return null;
    try {
      return await svgToPng(svgRef.current);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the image");
      return null;
    }
  }

  async function download() {
    setExporting(true);
    const blob = await makePng();
    if (blob) {
      try {
        downloadBlob(blob, invitationFilename(facts!.name));
      } catch {
        toast.error("Couldn't save the image. Try again.");
      }
    }
    setExporting(false);
  }

  async function share() {
    setExporting(true);
    const blob = await makePng();
    setExporting(false);
    if (!blob || !design) return;
    const file = new File([blob], invitationFilename(facts!.name), { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) {
      toast.info("Sharing images isn't supported here. Download the PNG instead.");
      return;
    }
    try {
      await navigator.share({ files: [file], text: invitationText(design) });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("Couldn't open the share sheet.");
    }
  }

  async function copyText() {
    if (!design) return;
    try {
      await navigator.clipboard.writeText(invitationText(design));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "suggested", label: `For this ${GROUP_LABEL[event.event_type].toLowerCase()}` },
    ...(["wedding", "birthday", "community", "any"] as TemplateGroup[])
      .filter((g) => g !== event.event_type)
      .map((g) => ({ key: g as Filter, label: GROUP_LABEL[g] })),
    { key: "all", label: `All (${TEMPLATES.length})` },
  ];

  return (
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <ModuleHeader
          theme={theme}
          eyebrow="Invitations"
          title="Create your invitation"
          subtitle="Pick a design, fill in the details, then download or share it."
          art={<Mail className="h-12 w-12" style={{ color: theme.accent }} aria-hidden />}
          actions={
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dirty ? "Save invitation" : "Saved"}
            </button>
          }
        />
      </div>

      {/* 1. Design gallery */}
      <section className="card p-5" style={{ ["--i" as string]: 1 }} aria-labelledby="inv-designs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="inv-designs" className="font-semibold text-slate-900">1. Choose a design</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter designs">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={classNames(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  filter === f.key
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-sand-300 bg-white text-slate-600 hover:bg-sand-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {gallery.map((t) => {
            const active = t.id === template.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`${t.name} design`}
                  onClick={() => setDesign((d) => (d ? switchTemplate(d, template, t, facts.name) : d))}
                  className={classNames(
                    "group w-full rounded-xl border-2 p-1 text-left transition",
                    active ? "border-brand-500 shadow-lift" : "border-transparent hover:border-sand-300"
                  )}
                >
                  <div className="overflow-hidden rounded-lg shadow-sm">
                    <InvitationCard template={t} design={{ ...design, template_id: t.id }} decorative />
                  </div>
                  <span className="mt-1.5 flex items-center gap-1 px-0.5 text-xs font-medium text-slate-700">
                    {active && <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden />}
                    <span className="truncate">{t.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Preview + export */}
        <section className="lg:sticky lg:top-24 lg:self-start" aria-label="Preview">
          <div className="overflow-hidden rounded-2xl shadow-lift">
            <InvitationCard ref={svgRef} template={template} design={design} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => void download()} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PNG
            </button>
            {canShare && (
              <button type="button" className="btn-secondary" onClick={() => void share()} disabled={exporting}>
                <Share2 className="h-4 w-4" /> Share
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => void copyText()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The image is made on your device. Nothing is sent to your guests automatically.
          </p>
        </section>

        <div className="space-y-6">
          {/* 2. AI wording */}
          <section className="card p-5" aria-labelledby="inv-ai">
            <h2 id="inv-ai" className="flex items-center gap-2 font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-brand-600" aria-hidden /> 2. Write the wording with AI
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              AI writes the headline and message only. Your date, time and venue stay exactly as you entered them.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tone">
              {TONES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={tone === t.key}
                  onClick={() => setTone(t.key)}
                  className={classNames(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    tone === t.key
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-sand-300 bg-white text-slate-600 hover:bg-sand-50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label htmlFor="inv-details" className="label mt-3">
              Anything to mention? <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="inv-details"
              className="input"
              maxLength={300}
              placeholder="e.g. turning 30, no gifts please, kids welcome"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <button type="button" className="btn-secondary mt-3" onClick={() => void writeWithAI()} disabled={writing}>
              {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {writing ? "Writing…" : "Write with AI"}
            </button>
            {wording && (
              <p className="mt-3 rounded-lg bg-sand-50 px-3 py-2 text-xs text-slate-600" role="status">
                {wording.generated_by === "gemini"
                  ? "Written by Gemini. Read it through and edit anything before saving."
                  : "AI isn't available right now, so we used ready-made wording for this tone."}
              </p>
            )}
          </section>

          {/* 3. Details */}
          <section className="card p-5" aria-labelledby="inv-details-h">
            <h2 id="inv-details-h" className="font-semibold text-slate-900">3. Details on the card</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => {
                const id = `inv-${f.key}`;
                const value = design[f.key];
                const full = f.area || f.key === "headline" || f.key === "venue_text" || f.key === "eyebrow" || f.key === "hosts";
                return (
                  <div key={f.key} className={full ? "sm:col-span-2" : undefined}>
                    <label htmlFor={id} className="label">{f.label}</label>
                    {f.area ? (
                      <textarea
                        id={id}
                        className="input min-h-[96px]"
                        maxLength={f.max}
                        placeholder={f.placeholder}
                        value={value}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        id={id}
                        className="input"
                        maxLength={f.max}
                        placeholder={f.placeholder}
                        value={value}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    )}
                    {f.area && (
                      <p className="mt-1 text-right text-[11px] text-slate-400">{value.length}/{f.max}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-4">
              <p className="text-xs text-slate-500">
                {dirty ? "You have unsaved changes." : "All changes saved."}
              </p>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save invitation
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
