import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, Save, Trash2, Users } from "lucide-react";
import { api, ApiError } from "../services/api";
import type { Guest, GuestSummary, RsvpStatus } from "../types";
import { Badge, EmptyState, ErrorBanner, Spinner, SuccessBanner } from "../components/ui";

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
  const [rows, setRows] = useState<Guest[]>([]);
  const [summary, setSummary] = useState<GuestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    api
      .listGuests(eventId)
      .then((d) => {
        setRows(d.guests);
        setSummary(d.summary);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load guests")
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  function update(i: number, patch: Partial<Guest>) {
    setRows((r) => r.map((g, j) => (j === i ? { ...g, ...patch } : g)));
    setSaved(false);
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
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save guests");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading guests…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Users className="h-6 w-6 text-brand-600" /> Guest management
        </h1>
        <Link to={`/events/${eventId}`} className="btn-secondary">
          Back to dashboard
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}
      {saved && <SuccessBanner message="Guest list saved. RSVP counts updated." />}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-4">
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
        <div className="card p-4">
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
          title="No guests yet"
          description="Add guests to track RSVPs, plus-ones, and dietary needs. Confirmed headcount feeds your catering estimates."
          action={
            <button
              className="btn-primary"
              onClick={() => setRows([blankGuest()])}
            >
              Add first guest
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">RSVP</th>
                <th className="px-4 py-3">+1s</th>
                <th className="px-4 py-3">Dietary</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((g, i) => (
                <tr key={i}>
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
                      className="input"
                      value={g.group}
                      placeholder="family / friends"
                      onChange={(e) => update(i, { group: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
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
        <button className="btn-primary" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save guest list"}
        </button>
      </div>

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
