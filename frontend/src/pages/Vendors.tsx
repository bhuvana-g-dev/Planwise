import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, Store, Trash2 } from "lucide-react";
import { useEventDetail } from "../hooks/useEventDetail";
import { Badge, ErrorBanner, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { api, ApiError } from "../services/api";
import type { VendorComparison, VendorQuote } from "../types";
import { titleCase } from "../utils/format";

function blankQuote(): VendorQuote {
  return {
    vendor_name: "",
    category: "catering",
    amount_inr: 0,
    inclusions: [],
    exclusions: [],
    contact: "",
    quote_date: null,
    availability_verified: false,
    notes: "",
  };
}

export default function Vendors() {
  const { eventId } = useParams();
  const { data, loading, error } = useEventDetail(eventId);
  const toast = useToast();
  const [quotes, setQuotes] = useState<VendorQuote[]>([blankQuote()]);
  const [comparison, setComparison] = useState<VendorComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const existing = data.vendors ?? [];

  function update(i: number, patch: Partial<VendorQuote>) {
    setQuotes((q) => q.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  async function compare() {
    if (!eventId) return;
    const valid = quotes.filter((q) => q.vendor_name.trim());
    if (valid.length === 0) {
      toast.error("Add at least one vendor with a name.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await api.compareVendors(eventId, valid);
      setComparison(res);
      toast.success(`Compared ${valid.length} quote(s).`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Comparison failed";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stagger space-y-6">
      <div
        className="flex items-center justify-between"
        style={{ ["--i" as string]: 0 }}
      >
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Store className="h-6 w-6 text-brand-600" /> Vendor quotations
        </h1>
        <Link to={`/events/${eventId}`} className="btn-secondary">
          Back to dashboard
        </Link>
      </div>

      <p className="text-sm text-slate-500" style={{ ["--i" as string]: 1 }}>
        Enter real quotes you've collected. PlanWise never invents vendor prices
        or availability — it only compares what you provide.
      </p>

      {actionError && <ErrorBanner message={actionError} />}

      {existing.length > 0 && (
        <p className="text-xs text-slate-400">
          {existing.length} previously saved quote(s).
        </p>
      )}

      <div className="space-y-4" style={{ ["--i" as string]: 2 }}>
        {quotes.map((q, i) => (
          <div key={i} className="card p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                className="input"
                placeholder="Vendor name"
                value={q.vendor_name}
                onChange={(e) => update(i, { vendor_name: e.target.value })}
              />
              <input
                className="input"
                placeholder="Category"
                value={q.category}
                onChange={(e) => update(i, { category: e.target.value })}
              />
              <input
                type="number"
                className="input"
                placeholder="Amount (₹)"
                value={q.amount_inr}
                onChange={(e) => update(i, { amount_inr: Number(e.target.value) })}
              />
              <input
                className="input"
                placeholder="Contact"
                value={q.contact}
                onChange={(e) => update(i, { contact: e.target.value })}
              />
              <input
                className="input sm:col-span-2"
                placeholder="Inclusions (comma separated)"
                value={q.inclusions.join(", ")}
                onChange={(e) =>
                  update(i, {
                    inclusions: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <input
                className="input sm:col-span-2"
                placeholder="Exclusions (comma separated)"
                value={q.exclusions.join(", ")}
                onChange={(e) =>
                  update(i, {
                    exclusions: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={q.availability_verified}
                  onChange={(e) =>
                    update(i, { availability_verified: e.target.checked })
                  }
                />
                I've verified availability for the event date
              </label>
              {quotes.length > 1 && (
                <button
                  className="text-sm text-rose-600 hover:underline"
                  onClick={() => setQuotes((qs) => qs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="inline h-4 w-4" /> Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          className="btn-secondary"
          onClick={() => setQuotes((q) => [...q, blankQuote()])}
        >
          <Plus className="h-4 w-4" /> Add vendor
        </button>
        <button className="btn-primary" onClick={compare} disabled={busy}>
          {busy ? "Comparing…" : "Compare quotes"}
        </button>
      </div>

      {comparison && (
        <div className="card p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Comparison</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {comparison.cheapest_vendor && (
              <Badge tone="green">Cheapest: {comparison.cheapest_vendor}</Badge>
            )}
            {comparison.best_value_vendor && (
              <Badge tone="brand">
                Best value: {comparison.best_value_vendor}
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Inclusions</th>
                  <th className="px-4 py-2">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {comparison.quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {q.vendor_name}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {titleCase(q.category)}
                    </td>
                    <td className="px-4 py-2 text-right">₹{q.amount_inr}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {q.inclusions.length || "—"}
                    </td>
                    <td className="px-4 py-2">
                      {q.availability_verified ? (
                        <Badge tone="green">Yes</Badge>
                      ) : (
                        <Badge tone="amber">Unverified</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(comparison.missing_info).length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">Missing info</p>
              <ul className="mt-1 text-sm text-slate-600">
                {Object.entries(comparison.missing_info).map(([v, gaps]) => (
                  <li key={v}>
                    <strong>{v}:</strong> {gaps.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">
              Questions to ask vendors
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
              {comparison.questions.map((qn, i) => (
                <li key={i}>{qn}</li>
              ))}
            </ul>
          </div>

          {comparison.notes.map((n, i) => (
            <p key={i} className="mt-3 text-xs text-slate-400">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
