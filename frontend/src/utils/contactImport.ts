// Bulk contact import: parse CSV / Excel (.xlsx) / vCard files and Contact
// Picker results into contacts, then build a preview with validation and
// duplicate detection. Everything here runs in the browser — the file itself
// is never uploaded; only the contacts the user ticks are sent to the server.
import type { Guest } from "../types";
import { bestPhone, nameKey, type PhoneResult } from "./phone";

export type ImportSource = "picker" | "csv" | "xlsx" | "vcf";

export interface RawContact {
  name: string;
  /** Raw phone text; may hold several numbers ("a / b"). */
  phone: string;
}

export class ImportError extends Error {}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CONTACTS = 2000;

// ---------------------------------------------------------------------------
// Text decoding (UTF-8 / UTF-16 with BOM — Excel "Unicode text" is UTF-16LE)
// ---------------------------------------------------------------------------
export function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const text = new TextDecoder("utf-8").decode(b);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t"]) {
    let inQ = false;
    let n = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) n++;
    }
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/** RFC 4180 CSV → rows of cells (quotes, escaped quotes, embedded newlines). */
export function parseCsvRows(text: string): string[][] {
  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (inQ) throw new ImportError("The CSV has an unclosed quote — re-export it and try again.");
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const H = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const FULL_NAME = new Set(["name", "full name", "fullname", "display name", "contact name", "guest name", "guest", "contact"]);
const FIRST = new Set(["first name", "given name", "first", "firstname"]);
const MIDDLE = new Set(["middle name", "additional name", "middle"]);
const LAST = new Set(["last name", "family name", "surname", "last", "lastname"]);
const isPhoneHeader = (h: string) =>
  /(phone|mobile|tel|cell|whatsapp|contact no|contact number|^number$|^mob)/.test(h) &&
  !/(type|label)/.test(h);

/** Map spreadsheet rows (CSV or Excel) to contacts using the header row. */
export function rowsToContacts(rows: string[][]): RawContact[] {
  if (rows.length === 0) throw new ImportError("The file has no rows.");
  const header = rows[0].map(H);
  const hasHeader = header.some(
    (h) => FULL_NAME.has(h) || FIRST.has(h) || LAST.has(h) || isPhoneHeader(h)
  );

  if (!hasHeader) {
    // No header: the column with the most valid numbers is the phone column;
    // the first other column with text is the name.
    const width = Math.max(...rows.map((r) => r.length));
    const phoneScore = Array.from({ length: width }, (_, c) =>
      rows.filter((r) => bestPhone(r[c] ?? "").valid).length
    );
    const phoneCol = phoneScore.indexOf(Math.max(...phoneScore));
    if (phoneScore[phoneCol] === 0)
      throw new ImportError("Couldn't find names or phone numbers. Add a header row like “Name, Phone”.");
    const nameCol = Array.from({ length: width }, (_, c) => c).find(
      (c) => c !== phoneCol && rows.some((r) => /[a-z]/i.test(r[c] ?? ""))
    );
    if (nameCol === undefined)
      throw new ImportError("Couldn't find a name column. Add a header row like “Name, Phone”.");
    return rows.map((r) => ({ name: (r[nameCol] ?? "").trim(), phone: (r[phoneCol] ?? "").trim() }));
  }

  const idx = (set: Set<string>) => header.findIndex((h) => set.has(h));
  const full = idx(FULL_NAME);
  const first = idx(FIRST);
  const middle = idx(MIDDLE);
  const last = idx(LAST);
  const phoneCols = header.map((h, i) => (isPhoneHeader(h) ? i : -1)).filter((i) => i >= 0);
  if (full < 0 && first < 0 && last < 0)
    throw new ImportError("Couldn't find a name column. Use a header such as “Name” or “First Name”.");

  return rows.slice(1).map((r) => {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const name = get(full) || [get(first), get(middle), get(last)].filter(Boolean).join(" ");
    const phone = phoneCols.map(get).filter(Boolean).join(" / ");
    return { name, phone };
  });
}

export function parseCsv(text: string): RawContact[] {
  return rowsToContacts(parseCsvRows(text));
}

// ---------------------------------------------------------------------------
// vCard (2.1 / 3.0 / 4.0), incl. quoted-printable and folded lines
// ---------------------------------------------------------------------------
function decodeQuotedPrintable(value: string, charset: string): string {
  const bytes: number[] = [];
  const v = value.replace(/=\r?\n/g, "");
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "=" && /^[0-9A-F]{2}$/i.test(v.slice(i + 1, i + 3))) {
      bytes.push(parseInt(v.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(v.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

const unescapeVcf = (s: string) =>
  s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

/** Split on ";" that isn't escaped as "\;" (no regex lookbehind: older Safari). */
function splitUnescaped(value: string, sep = ";"): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      cur += value[i] + value[i + 1];
      i++;
    } else if (value[i] === sep) {
      out.push(cur);
      cur = "";
    } else cur += value[i];
  }
  out.push(cur);
  return out;
}

export function parseVcf(text: string): RawContact[] {
  if (!/BEGIN:VCARD/i.test(text))
    throw new ImportError("This doesn't look like a vCard file (no BEGIN:VCARD found).");
  // Unfold continuation lines, and join quoted-printable soft line breaks
  // ("=" at end of line) — but ONLY on quoted-printable properties, so base64
  // data that happens to end in "=" never swallows the next property.
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  const isQpLine = (l: string) => /QUOTED-PRINTABLE/i.test(l.slice(0, Math.max(0, l.indexOf(":"))));
  for (const line of raw.split("\n")) {
    const prev = lines.length ? lines[lines.length - 1] : null;
    if (prev !== null && isQpLine(prev) && prev.endsWith("=")) lines[lines.length - 1] = prev + "\n" + line;
    else if (prev !== null && /^[ \t]/.test(line)) lines[lines.length - 1] = prev + line.slice(1);
    else lines.push(line);
  }

  const contacts: RawContact[] = [];
  let cur: { fn: string; n: string; org: string; cell: string[]; other: string[] } | null = null;
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const parts = left.split(";");
    const prop = parts[0].replace(/^.*\./, "").toUpperCase(); // drop "item1."
    const params = parts.slice(1).map((p) => p.toUpperCase().replace(/"/g, ""));
    if (prop === "BEGIN" && /VCARD/i.test(value)) {
      cur = { fn: "", n: "", org: "", cell: [], other: [] };
      continue;
    }
    if (prop === "END" && /VCARD/i.test(value)) {
      if (cur) {
        const name = cur.fn || cur.n || cur.org;
        contacts.push({ name, phone: [...cur.cell, ...cur.other].join(" / ") });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (params.some((p) => p === "QUOTED-PRINTABLE" || p === "ENCODING=QUOTED-PRINTABLE")) {
      const cs = params.find((p) => p.startsWith("CHARSET="))?.slice(8) ?? "utf-8";
      value = decodeQuotedPrintable(value, cs.toLowerCase());
    }
    if (prop === "FN") cur.fn = unescapeVcf(value);
    else if (prop === "N") {
      const [family = "", given = "", additional = ""] = splitUnescaped(value).map(unescapeVcf);
      cur.n = [given, additional, family].filter(Boolean).join(" ");
    } else if (prop === "ORG") cur.org = unescapeVcf(splitUnescaped(value)[0]);
    else if (prop === "TEL") {
      const num = unescapeVcf(value.replace(/^tel:/i, ""));
      if (!num) continue;
      const isCell = params.some((p) => /(^|=|,)(CELL|MOBILE|IPHONE)(,|$)/.test(p) || p === "CELL");
      (isCell ? cur.cell : cur.other).push(num);
    }
  }
  if (contacts.length === 0) throw new ImportError("No contacts were found in this vCard file.");
  return contacts;
}

// ---------------------------------------------------------------------------
// Excel .xlsx (zip of XML) — no dependency; uses the browser's
// DecompressionStream for deflated entries.
// ---------------------------------------------------------------------------
const MAX_UNZIPPED = 25 * 1024 * 1024;

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  offset: number;
}

function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError("This Excel file is damaged or not a real .xlsx file.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new ImportError("This Excel file is damaged.");
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.push({ name, method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipFile(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  if (e.size > MAX_UNZIPPED) throw new ImportError("This Excel file is too large to read.");
  const v = new DataView(buf);
  const nameLen = v.getUint16(e.offset + 26, true);
  const extraLen = v.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = new Uint8Array(buf, start, e.compSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new ImportError("This Excel file uses an unsupported compression.");
  if (typeof DecompressionStream === "undefined")
    throw new ImportError("This browser can't read Excel files. Save the sheet as CSV and upload that instead.");
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  }).pipeThrough(new DecompressionStream("deflate-raw"));
  const out = await new Response(stream).arrayBuffer();
  if (out.byteLength > MAX_UNZIPPED) throw new ImportError("This Excel file is too large to read.");
  return new TextDecoder().decode(out);
}

const byTag = (node: Document | Element, tag: string) =>
  Array.from(node.getElementsByTagNameNS("*", tag));

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function parseXlsx(buf: ArrayBuffer): Promise<RawContact[]> {
  const u = new Uint8Array(buf.slice(0, 8));
  if (u[0] === 0xd0 && u[1] === 0xcf)
    throw new ImportError("Old Excel .xls files aren't supported. Save as .xlsx or CSV and try again.");
  if (u[0] !== 0x50 || u[1] !== 0x4b)
    throw new ImportError("This isn't a valid .xlsx file.");
  const entries = readZipEntries(buf);
  const find = (name: string) => entries.find((e) => e.name === name);
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");

  // First sheet in workbook order (via workbook.xml + its relationships).
  let sheetPath: string | undefined;
  const wb = find("xl/workbook.xml");
  const rels = find("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const firstSheet = byTag(xml(await readZipFile(buf, wb)), "sheet")[0];
    const rid =
      firstSheet?.getAttribute("r:id") ??
      firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = byTag(xml(await readZipFile(buf, rels)), "Relationship").find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheetEntry =
    (sheetPath && find(sheetPath)) ||
    entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
  if (!sheetEntry) throw new ImportError("No worksheet was found in this Excel file.");

  const shared: string[] = [];
  const ss = find("xl/sharedStrings.xml");
  if (ss) {
    for (const si of byTag(xml(await readZipFile(buf, ss)), "si")) {
      shared.push(byTag(si, "t").map((t) => t.textContent ?? "").join(""));
    }
  }

  const rows: string[][] = [];
  for (const rowEl of byTag(xml(await readZipFile(buf, sheetEntry)), "row")) {
    const row: string[] = [];
    for (const c of byTag(rowEl, "c")) {
      const t = c.getAttribute("t");
      const vEl = byTag(c, "v")[0];
      let val = "";
      if (t === "s") val = shared[Number(vEl?.textContent ?? -1)] ?? "";
      else if (t === "inlineStr") val = byTag(c, "t").map((x) => x.textContent ?? "").join("");
      else {
        val = vEl?.textContent ?? "";
        // Phone numbers saved as numbers may be in exponent form (9.87E9).
        if (t !== "str" && /e/i.test(val)) {
          const num = Number(val);
          if (Number.isSafeInteger(num)) val = String(num);
        }
      }
      row[colIndex(c.getAttribute("r") ?? "A")] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rowsToContacts(rows.filter((r) => r.some((c) => c.trim())));
}

// ---------------------------------------------------------------------------
// File dispatch
// ---------------------------------------------------------------------------
export function sourceForFile(name: string): ImportSource | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "vcf" || ext === "vcard") return "vcf";
  if (ext === "xls") throw new ImportError("Old Excel .xls files aren't supported. Save as .xlsx or CSV and try again.");
  return null;
}

export async function readContactFile(file: File): Promise<{ source: ImportSource; contacts: RawContact[] }> {
  const source = sourceForFile(file.name);
  if (!source)
    throw new ImportError("Unsupported file type. Use a .csv, .xlsx or .vcf file.");
  if (file.size === 0) throw new ImportError("This file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new ImportError("This file is over 5 MB. Split it into smaller files.");
  const buf = await file.arrayBuffer();
  const contacts =
    source === "xlsx" ? await parseXlsx(buf) : source === "vcf" ? parseVcf(decodeText(buf)) : parseCsv(decodeText(buf));
  if (contacts.length === 0) throw new ImportError("No contacts were found in this file.");
  if (contacts.length > MAX_CONTACTS)
    throw new ImportError(`This file has ${contacts.length} contacts — the limit is ${MAX_CONTACTS} per import.`);
  return { source, contacts };
}

// ---------------------------------------------------------------------------
// Preview: validation + duplicate detection
// ---------------------------------------------------------------------------
export type PreviewStatus =
  | "ready"
  | "no_phone"
  | "invalid_phone"
  | "possible_duplicate"
  | "duplicate_file"
  | "existing"
  | "missing_name";

export interface PreviewRow {
  id: string;
  name: string;
  rawPhone: string;
  phone: PhoneResult | null;
  status: PreviewStatus;
  message: string;
  /** Can the user tick it at all? */
  selectable: boolean;
  /** Ticked by default? */
  selected: boolean;
}

export function buildPreview(contacts: RawContact[], existing: Guest[]): PreviewRow[] {
  const existingPhones = new Map<string, string>();
  const existingNames = new Map<string, string>();
  for (const g of existing) {
    if (!g.name.trim()) continue;
    const r = g.contact ? bestPhone(g.contact) : null;
    if (r?.valid && r.e164) existingPhones.set(r.e164, g.name);
    existingNames.set(nameKey(g.name), g.name);
  }
  const seenPhones = new Map<string, string>();
  const seenNames = new Map<string, string>();

  return contacts.map((c, i) => {
    const name = c.name.split(/\s+/).filter(Boolean).join(" ").slice(0, 160);
    const rawPhone = c.phone.trim();
    const phone = rawPhone ? bestPhone(rawPhone) : null;
    const base = { id: `row-${i}`, name, rawPhone, phone };
    const row = (status: PreviewStatus, message: string, selectable: boolean, selected: boolean): PreviewRow => ({
      ...base,
      status,
      message,
      selectable,
      selected,
    });

    if (!name) return row("missing_name", "No name — can't be imported", false, false);
    const key = nameKey(name);

    if (phone?.valid && phone.e164) {
      const ex = existingPhones.get(phone.e164);
      if (ex) return row("existing", `Already a guest (${ex})`, false, false);
      const dup = seenPhones.get(phone.e164);
      if (dup) return row("duplicate_file", `Same number as ${dup} above`, false, false);
      seenPhones.set(phone.e164, name);
      seenNames.set(key, name);
      const sameName = existingNames.get(key);
      if (sameName)
        return row("possible_duplicate", `A guest named ${sameName} already exists — check before importing`, true, false);
      return row("ready", "", true, true);
    }

    // No usable phone: duplicates are judged by name.
    const ex = existingNames.get(key);
    if (ex) return row("existing", `Already a guest (${ex})`, false, false);
    if (seenNames.has(key)) return row("duplicate_file", "Duplicate name in this list", false, false);
    seenNames.set(key, name);
    if (phone && !phone.valid)
      return row("invalid_phone", `${phone.reason}. If imported, it's saved without a phone.`, true, false);
    return row("no_phone", "No phone number — imported with name only", true, true);
  });
}

export function summarizePreview(rows: PreviewRow[]) {
  const count = (s: PreviewStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  return {
    total: rows.length,
    ready: count(["ready", "no_phone"]),
    attention: count(["invalid_phone", "possible_duplicate"]),
    skipped: count(["existing", "duplicate_file", "missing_name"]),
    selected: rows.filter((r) => r.selected && r.selectable).length,
  };
}

/** What gets sent to the server: the normalised number when valid. */
export function toImportPayload(rows: PreviewRow[]): RawContact[] {
  return rows
    .filter((r) => r.selected && r.selectable)
    .map((r) => ({
      name: r.name,
      phone: r.phone?.valid && r.phone.e164 ? r.phone.e164 : r.rawPhone.slice(0, 200),
    }));
}

// ---------------------------------------------------------------------------
// Contact Picker API results
// ---------------------------------------------------------------------------
export interface PickedContact {
  name?: string[];
  tel?: string[];
}

export function fromPicker(results: PickedContact[]): RawContact[] {
  return results.map((r) => ({
    name: (r.name ?? []).find((n) => n && n.trim()) ?? "",
    phone: (r.tel ?? []).filter(Boolean).join(" / "),
  }));
}
