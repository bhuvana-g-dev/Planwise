import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ContactRound,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Search,
  Smartphone,
  Upload,
} from "lucide-react";
import Modal from "../caterers/Modal";
import { api, ApiError } from "../../services/api";
import type { Guest, GuestImportResult } from "../../types";
import {
  buildPreview,
  ImportError,
  type ImportSource,
  type PreviewRow,
  type PreviewStatus,
  readContactFile,
  type RawContact,
  summarizePreview,
  toImportPayload,
} from "../../utils/contactImport";
import { contactPickerSupport, PickerError, pickContacts } from "../../utils/contactPicker";
import { formatPhone } from "../../utils/phone";
import { classNames } from "../../utils/format";

type Step = "choose" | "preview" | "done";
type Filter = "all" | "ready" | "attention" | "skipped";

const STATUS_BADGE: Record<PreviewStatus, [string, string]> = {
  ready: ["Ready", "bg-emerald-100 text-emerald-800"],
  no_phone: ["No phone", "bg-sand-200 text-slate-700"],
  invalid_phone: ["Invalid number", "bg-amber-100 text-amber-800"],
  possible_duplicate: ["Check name", "bg-amber-100 text-amber-800"],
  duplicate_file: ["Duplicate", "bg-slate-200 text-slate-600"],
  existing: ["Already a guest", "bg-slate-200 text-slate-600"],
  missing_name: ["No name", "bg-rose-100 text-rose-700"],
};

const SOURCE_LABEL: Record<ImportSource, string> = {
  picker: "phone contacts",
  csv: "CSV file",
  xlsx: "Excel file",
  vcf: "vCard file",
};

export default function ContactImportDialog({
  open,
  eventId,
  existing,
  hasUnsavedChanges,
  onSaveFirst,
  onImported,
  onClose,
}: {
  open: boolean;
  eventId: string;
  existing: Guest[];
  hasUnsavedChanges: boolean;
  onSaveFirst: () => Promise<void>;
  onImported: (result: GuestImportResult) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [source, setSource] = useState<ImportSource>("csv");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "picking" | "importing" | "saving">("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [result, setResult] = useState<GuestImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const vcfInput = useRef<HTMLInputElement>(null);
  const picker = useMemo(() => contactPickerSupport(), []);

  function reset() {
    setStep("choose");
    setRows([]);
    setError(null);
    setFilter("all");
    setSearch("");
    setResult(null);
    setFileName("");
  }

  function close() {
    reset();
    onClose();
  }

  function showPreview(src: ImportSource, contacts: RawContact[]) {
    setSource(src);
    setRows(buildPreview(contacts, existing));
    setFilter("all");
    setSearch("");
    setStep("preview");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("reading");
    try {
      const { source: src, contacts } = await readContactFile(file);
      setFileName(file.name);
      showPreview(src, contacts);
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "Couldn't read this file. Check it's a valid .csv, .xlsx or .vcf.");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
      if (vcfInput.current) vcfInput.current.value = "";
    }
  }

  async function onPick() {
    setError(null);
    setBusy("picking");
    try {
      const contacts = await pickContacts();
      if (contacts.length === 0) return; // cancelled — stay on this step
      setFileName("");
      showPreview("picker", contacts);
    } catch (e) {
      setError(e instanceof PickerError ? e.message : "Couldn't open your contacts.");
    } finally {
      setBusy("");
    }
  }

  async function doImport() {
    const payload = toImportPayload(rows);
    if (payload.length === 0) return;
    setBusy("importing");
    setError(null);
    try {
      const res = await api.importGuests(eventId, payload, group.trim(), source);
      setResult(res);
      onImported(res);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed — nothing was added.");
    } finally {
      setBusy("");
    }
  }

  async function saveFirst() {
    setBusy("saving");
    try {
      await onSaveFirst();
    } finally {
      setBusy("");
    }
  }

  const stats = summarizePreview(rows);
  const visible = rows.filter((r) => {
    if (search && !`${r.name} ${r.rawPhone}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "ready") return r.status === "ready" || r.status === "no_phone";
    if (filter === "attention") return r.status === "invalid_phone" || r.status === "possible_duplicate";
    if (filter === "skipped") return !r.selectable;
    return true;
  });
  const visibleSelectable = visible.filter((r) => r.selectable);
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => r.selected);

  function setSelected(ids: Set<string>, value: boolean) {
    setRows((rs) => rs.map((r) => (r.selectable && ids.has(r.id) ? { ...r, selected: value } : r)));
  }

  const title = step === "choose" ? "Import contacts" : step === "preview" ? "Review contacts" : "Import complete";
  const subtitle =
    step === "preview"
      ? `${stats.total} found in your ${SOURCE_LABEL[source]}${fileName ? ` · ${fileName}` : ""}. Nothing is added until you confirm.`
      : step === "choose"
      ? "Add many guests at once. You'll review every contact before anything is added."
      : undefined;

  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={close}
      size="xl"
      footer={
        step === "preview" ? (
          <>
            <button type="button" className="btn-secondary mr-auto" onClick={reset} disabled={busy !== ""}>
              <ArrowLeft className="h-4 w-4" /> Choose another source
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void doImport()}
              disabled={stats.selected === 0 || busy !== "" || hasUnsavedChanges}
            >
              {busy === "importing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Import {stats.selected} contact{stats.selected === 1 ? "" : "s"}
            </button>
          </>
        ) : step === "done" ? (
          <button type="button" className="btn-primary" onClick={close}>Done</button>
        ) : (
          <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
        )
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ---------------- Step 1: choose a source ---------------- */}
      {step === "choose" && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            {/* Contact Picker */}
            <div
              className={classNames(
                "flex flex-col rounded-2xl border p-4",
                picker.supported ? "border-brand-300 bg-brand-50/40" : "border-sand-200 bg-sand-50/60"
              )}
            >
              <span className={classNames("grid h-10 w-10 place-items-center rounded-xl", picker.supported ? "bg-white text-brand-600 shadow-sm" : "bg-sand-200 text-slate-400")}>
                <Smartphone className="h-5 w-5" />
              </span>
              <p className="mt-3 font-semibold text-slate-900">Pick from phone contacts</p>
              {picker.supported ? (
                <>
                  <p className="mt-1 flex-1 text-sm text-slate-600">
                    Your phone opens its own contact list. Only the people you tick are shared — PlanWise never sees your whole address book.
                  </p>
                  <button type="button" className="btn-primary mt-3" onClick={() => void onPick()} disabled={busy !== ""}>
                    {busy === "picking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ContactRound className="h-4 w-4" />}
                    Choose contacts
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1 flex-1 text-sm text-slate-500">
                    {picker.reason === "insecure"
                      ? "Needs a secure (https) connection."
                      : "Not available in this browser. It works in Chrome on Android phones."}
                  </p>
                  <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                    Use a <span className="font-semibold">vCard</span> or <span className="font-semibold">CSV</span> export instead — see how below.
                  </p>
                </>
              )}
            </div>

            {/* CSV / Excel */}
            <div className="flex flex-col rounded-2xl border border-sand-200 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <p className="mt-3 font-semibold text-slate-900">CSV or Excel file</p>
              <p className="mt-1 flex-1 text-sm text-slate-600">
                A sheet with a name column and a phone column (.csv or .xlsx). Google Contacts and Outlook exports work.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
                aria-label="Upload CSV or Excel file"
              />
              <button type="button" className="btn-secondary mt-3" onClick={() => fileInput.current?.click()} disabled={busy !== ""}>
                <Upload className="h-4 w-4" /> Upload CSV / Excel
              </button>
            </div>

            {/* vCard */}
            <div className="flex flex-col rounded-2xl border border-sand-200 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <FileText className="h-5 w-5" />
              </span>
              <p className="mt-3 font-semibold text-slate-900">vCard file (.vcf)</p>
              <p className="mt-1 flex-1 text-sm text-slate-600">
                Exported from your phone or iCloud. One file can hold many contacts.
              </p>
              <input
                ref={vcfInput}
                type="file"
                accept=".vcf,.vcard,text/vcard,text/x-vcard"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
                aria-label="Upload vCard file"
              />
              <button type="button" className="btn-secondary mt-3" onClick={() => vcfInput.current?.click()} disabled={busy !== ""}>
                <Upload className="h-4 w-4" /> Upload vCard
              </button>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void onFile(e.dataTransfer.files?.[0]);
            }}
            className={classNames(
              "flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-sm transition",
              dragOver ? "border-brand-400 bg-brand-50 text-brand-700" : "border-sand-300 text-slate-500"
            )}
          >
            {busy === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy === "reading" ? "Reading file…" : "…or drop a .csv, .xlsx or .vcf file here"}
          </div>

          <details className="rounded-xl border border-sand-200 px-4 py-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">How do I export my contacts?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><span className="font-medium">Android:</span> Contacts app → Fix &amp; manage (or Settings) → Export to file → saves a .vcf.</li>
              <li><span className="font-medium">iPhone:</span> on a computer, open icloud.com/contacts → select contacts → share/export vCard.</li>
              <li><span className="font-medium">Google Contacts:</span> contacts.google.com → Export → “Google CSV” or “vCard”.</li>
              <li><span className="font-medium">Excel:</span> any sheet with “Name” and “Phone” columns. Save as .xlsx or CSV.</li>
            </ul>
          </details>

          <p className="flex items-start gap-2 text-xs text-slate-400">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Files are read on this device and never uploaded. Only the contacts you confirm are saved to this event.
          </p>
        </div>
      )}

      {/* ---------------- Step 2: preview & select ---------------- */}
      {step === "preview" && (
        <div className="space-y-4">
          {hasUnsavedChanges && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">You have unsaved changes in your guest list. Save them first so nothing is lost.</span>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => void saveFirst()} disabled={busy !== ""}>
                {busy === "saving" && <Loader2 className="h-4 w-4 animate-spin" />} Save guest list now
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Filter contacts">
            {([
              ["all", "All", stats.total, "text-slate-900"],
              ["ready", "Ready", stats.ready, "text-emerald-700"],
              ["attention", "Needs a look", stats.attention, "text-amber-700"],
              ["skipped", "Will be skipped", stats.skipped, "text-slate-500"],
            ] as const).map(([k, label, n, tone]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={classNames(
                  "rounded-xl border px-3 py-2 text-left transition",
                  filter === k ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-sand-200 hover:border-brand-300"
                )}
              >
                <span className={classNames("block text-xl font-bold tabular-nums", tone)}>{n}</span>
                <span className="block text-xs text-slate-500">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input py-2 pl-9" placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search contacts" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Add to group
              <input className="input w-36 py-2" placeholder="e.g. Family" value={group} onChange={(e) => setGroup(e.target.value)} maxLength={80} />
            </label>
          </div>

          <div className="max-h-[48vh] overflow-auto rounded-xl border border-sand-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-sand-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      className="h-4 w-4 rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                      checked={allVisibleSelected}
                      disabled={visibleSelectable.length === 0}
                      onChange={(e) => setSelected(new Set(visibleSelectable.map((r) => r.id)), e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {visible.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No contacts in this view.</td></tr>
                )}
                {visible.map((r) => {
                  const [label, cls] = STATUS_BADGE[r.status];
                  return (
                    <tr key={r.id} className={classNames(!r.selectable && "bg-sand-50/70 text-slate-400", r.selectable && "hover:bg-sand-50")}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Import ${r.name || "contact"}`}
                          className="h-4 w-4 rounded border-sand-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
                          checked={r.selectable && r.selected}
                          disabled={!r.selectable}
                          onChange={(e) => setSelected(new Set([r.id]), e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{r.name || <span className="italic">No name</span>}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.phone?.valid && r.phone.e164 ? (
                          <>
                            {formatPhone(r.phone.e164)}
                            {r.rawPhone && r.rawPhone.replace(/\s/g, "") !== r.phone.e164 && (
                              <span className="block text-[11px] text-slate-400">from “{r.rawPhone.length > 40 ? r.rawPhone.slice(0, 40) + "…" : r.rawPhone}”</span>
                            )}
                          </>
                        ) : r.rawPhone ? (
                          <span className="text-amber-700">{r.rawPhone}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={classNames("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>
                        {r.message && <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{r.message}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Duplicates of guests already on your list are skipped automatically. New guests are added as “invited”.
          </p>
        </div>
      )}

      {/* ---------------- Step 3: result ---------------- */}
      {step === "done" && result && (
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <p className="text-lg font-semibold text-slate-900">
            {result.added} guest{result.added === 1 ? "" : "s"} added
          </p>
          <p className="text-sm text-slate-500">Your guest list now has {result.summary.total_guests} guests.</p>
          {result.skipped.length > 0 && (
            <div className="mx-auto max-w-md rounded-xl border border-sand-200 p-3 text-left text-sm">
              <p className="mb-1 font-medium text-slate-700">{result.skipped.length} not added</p>
              <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-slate-500">
                {result.skipped.map((s, i) => (
                  <li key={i}>{s.name} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
