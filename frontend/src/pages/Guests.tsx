import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ContactRound, Plus, Save, Trash2 } from "lucide-react";
import { api, ApiError } from "../services/api";
import type { Guest, GuestImportResult, GuestSummary, RsvpStatus } from "../types";
import ContactImportDialog from "../components/guests/ContactImportDialog";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "../components/ui";
import ModuleHeader from "../components/ModuleHeader";
import { GuestsArt } from "../components/Illustrations";
import { eventTheme } from "../theme/eventTheme";
import { useEventDetail } from "../hooks/useEventDetail";
import { useToast } from "../components/Toast";

const RSVP_TONE: Record<RsvpStatus, "green" | "amber" | "rose" | "slate"> = {
  confirmed: "green",
  tentative: "amber",
  declined: "rose",
  invited: "slate",
};

const RSVP_OPTIONS: RsvpStatus[] = [
  "invited",
  "confirmed",
  "tentative",
  "declined",
];

function blankGuest(): Guest {
  return {
    name: "",
    group: "",
    rsvp: "invited",
    plus_ones: 0,
    dietary: [],
    accessibility: [],
    contact: "",
    notes: "",
  };
}

export default function Guests() {
  const { eventId } = useParams();
  const toast = useToast();
  // Event detail is used only to theme the header; the guest list itself is
  // still loaded/saved through the dedicated guests API below.
  const { data: eventDetail } = useEventDetail(eventId);
  const theme = eventTheme(
    eventDetail?.event.event_type,
    eventDetail?.event.style
  );
  const [rows, setRows] = useState<Guest[]>([]);
  const [summary, setSummary] = useState<GuestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Snapshot of the last saved list, so an import never overwrites unsaved
  // edits (import writes server-side, then replaces the local list).
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const hasUnsavedChanges = JSON.stringify(rows) !== savedSnapshot;

  useEffect(() => {
    if (!eventId) return;
    api
      .listGuests(eventId)
      .then((d) => {
        setRows(d.guests);
        setSummary(d.summary);
        setSavedSnapshot(JSON.stringify(d.guests));
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load guests")
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  function update(i: number, patch: Partial<Guest>) {
    setRows((r) => r.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }

  async function save() {
    if (!eventId) return;
    const valid = rows.filter((g) => g.name.trim());
    setSaving(true);
    setError(null);
    try {
      const d = await api.saveGuests(eventId, valid);
      setRows(d.guests);
      setSummary(d.summary);
      setSavedSnapshot(JSON.stringify(d.guests));
      toast.success(
        `Guest list saved · ${d.summary.confirmed_headcount} confirmed.`
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to save guests";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function onImported(res: GuestImportResult) {
    setRows(res.guests);
    setSummary(res.summary);
    setSavedSnapshot(JSON.stringify(res.guests));
    toast.success(
      `${res.added} guest${res.added === 1 ? "" : "s"} imported` +
        (res.skipped.length ? ` · ${res.skipped.length} skipped` : "")
    );
  }

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );

  return (
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <ModuleHeader
          theme={theme}
          eyebrow="Guest management"
          title="Guest management"
          subtitle={
            summary
              ? `${summary.confirmed_headcount} confirmed · ${summary.total_headcount} attending`
              : "Track RSVPs, plus-ones and dietary needs"
          }
          art={<GuestsArt className="h-16 w-16" />}
          actions={
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setImportOpen(true)}
              >
                <ContactRound className="h-4 w-4" /> Import contacts
              </button>
              <Link to={`/events/${eventId}`} className="btn-secondary">
                Back to dashboard
              </Link>
            </>
          }
        />
      </div>

      {error && <ErrorBanner message={error} />}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-4" style={{ ["--i" as string]: 1 }}>
          <Stat label="Guests (rows)" value={summary.total_guests} />
          <Stat label="Confirmed heads" value={summary.confirmed_headcount} />
          <Stat
            label="Attending (conf+tentative)"
            value={summary.total_headcount}
          />
          <Stat
            label="Declined"
            value={summary.by_status["declined"] ?? 0}
          />
        </div>
      )}

      {summary && Object.keys(summary.dietary_counts).length > 0 && (
        <div className="card p-4" style={{ ["--i" as string]: 2 }}>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Dietary needs (headcount) — confirm with your caterer
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.dietary_counts).map(([k, v]) => (
              <Badge key={k} tone="amber">
                {k}: {v}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<GuestsArt className="h-9 w-9" />}
          title="No guests yet"
          description="Add guests to track RSVPs, plus-ones, and dietary needs. Confirmed headcount feeds your catering estimates."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                className="btn-primary"
                onClick={() => setImportOpen(true)}
              >
                <ContactRound className="h-4 w-4" /> Import contacts
              </button>
              <button
                className="btn-secondary"
                onClick={() => setRows([blankGuest()])}
              >
                <Plus className="h-4 w-4" /> Add a guest manually
              </button>
            </div>
          }
        />
      ) : (
        <div className="card overflow-x-auto" style={{ ["--i" as string]: 3 }}>
          <table className="w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">RSVP</th>
                <th className="px-4 py-3">+1s</th>
                <th className="px-4 py-3">Dietary</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200">
              {rows.map((g, i) => (
                <tr key={i} className="transition hover:bg-sand-50">
                  <td className="px-4 py-2">
                    <input
                      className="input"
                      value={g.name}
                      placeholder="Guest name"
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="input min-w-[150px] tabular-nums"
                      value={g.contact}
                      placeholder="+91 98765 43210"
                      inputMode="tel"
                      aria-label="Phone"
                      onChange={(e) => update(i, { contact: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="input"
                      value={g.group}
                      placeholder="family / friends"
                      onChange={(e) => update(i, { group: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="input"
                        value={g.rsvp}
                        onChange={(e) =>
                          update(i, { rsvp: e.target.value as RsvpStatus })
                        }
                      >
                        {RSVP_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <Badge tone={RSVP_TONE[g.rsvp]}>{g.rsvp}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      className="input w-20"
                      value={g.plus_ones}
                      onChange={(e) =>
                        update(i, { plus_ones: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="input"
                      value={g.dietary.join(", ")}
                      placeholder="veg, nut-allergy"
                      onChange={(e) =>
                        update(i, {
                          dietary: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-rose-600 hover:text-rose-700"
                      aria-label="Remove guest"
                      onClick={() =>
                        setRows((r) => r.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="btn-secondary"
          onClick={() => setRows((r) => [...r, blankGuest()])}
        >
          <Plus className="h-4 w-4" /> Add guest
        </button>
        <button
          className="btn-secondary"
          onClick={() => setImportOpen(true)}
        >
          <ContactRound className="h-4 w-4" /> Import contacts
        </button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save guest list"}
        </button>
      </div>

      {eventId && (
        <ContactImportDialog
          open={importOpen}
          eventId={eventId}
          existing={rows}
          hasUnsavedChanges={hasUnsavedChanges}
          onSaveFirst={save}
          onImported={onImported}
          onClose={() => setImportOpen(false)}
        />
      )}

      <p className="text-xs text-slate-400">
        Plus-ones are included in headcounts. Allergen/dietary info must be
        verified with your caterer — PlanWise never guarantees it.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
