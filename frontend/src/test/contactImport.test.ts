import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setTokenProvider } from "../services/api";
import type { Guest } from "../types";
import {
  buildPreview,
  fromPicker,
  ImportError,
  parseCsv,
  parseVcf,
  parseXlsx,
  readContactFile,
  summarizePreview,
  toImportPayload,
} from "../utils/contactImport";
import { contactPickerSupport, PickerError, pickContacts } from "../utils/contactPicker";
import { bestPhone, formatPhone, normalizePhone } from "../utils/phone";

const guest = (name: string, contact = ""): Guest => ({
  name, group: "", rsvp: "invited", plus_ones: 0, dietary: [], accessibility: [], contact, notes: "",
});

// ---------------------------------------------------------------------------
// Phone validation (mirrors backend tests)
// ---------------------------------------------------------------------------
describe("phone normalisation", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["(+91) 98765-43210", "+919876543210"],
    ["0452 2345678", "+914522345678"],
    ["+1 415 555 2671", "+14155552671"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalises %s", (raw, e164) => {
    const r = normalizePhone(raw);
    expect(r.valid).toBe(true);
    expect(r.e164).toBe(e164);
  });

  it.each(["", "12345", "2345678", "5876543210", "+91 98765 4321", "+91 0876543210", "+1234567", "98765abc10"])(
    "rejects %s with a reason",
    (raw) => {
      const r = normalizePhone(raw);
      expect(r.valid).toBe(false);
      expect(r.e164).toBeNull();
      expect(r.reason).toBeTruthy();
    }
  );

  it("never turns an international number into +91", () => {
    expect(normalizePhone("+971 50 123 4567").e164).toBe("+971501234567");
  });

  it("prefers a valid mobile when a cell holds several numbers", () => {
    expect(bestPhone("0452 2345678 / 98765 43210").e164).toBe("+919876543210");
  });

  it("formats Indian numbers for display", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+14155552671")).toBe("+14155552671");
  });
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
describe("CSV parsing", () => {
  it("reads a simple Name,Phone sheet", () => {
    expect(parseCsv("Name,Phone\nPriya,98765 43210\nArjun,+44 20 7946 0958\n")).toEqual([
      { name: "Priya", phone: "98765 43210" },
      { name: "Arjun", phone: "+44 20 7946 0958" },
    ]);
  });

  it("handles quotes, embedded commas/newlines, BOM-free semicolons", () => {
    const csv = 'Full Name;Mobile\n"Rao, Kavya";"98765 43210"\n"Meena ""M"" S";9000000001\n';
    expect(parseCsv(csv)).toEqual([
      { name: "Rao, Kavya", phone: "98765 43210" },
      { name: 'Meena "M" S', phone: "9000000001" },
    ]);
  });

  it("combines Google Contacts first/last names and multiple phone columns", () => {
    const csv =
      "First Name,Middle Name,Last Name,Phone 1 - Type,Phone 1 - Value,Phone 2 - Value\n" +
      "Ravi,,Kumar,Mobile,0452 2345678,98765 43210\n";
    const [c] = parseCsv(csv);
    expect(c.name).toBe("Ravi Kumar");
    expect(c.phone).toBe("0452 2345678 / 98765 43210");
    expect(bestPhone(c.phone).e164).toBe("+919876543210"); // mobile preferred
  });

  it("detects columns when there is no header row", () => {
    expect(parseCsv("Priya,9876543210\nArjun,9123456789\n")).toEqual([
      { name: "Priya", phone: "9876543210" },
      { name: "Arjun", phone: "9123456789" },
    ]);
  });

  it("reports a clear error for unusable sheets", () => {
    expect(() => parseCsv("City,Pin\nMadurai,625001\n")).toThrow(ImportError);
    expect(() => parseCsv('Name,Phone\n"Unclosed,9876543210\n')).toThrow(/unclosed quote/i);
    expect(() => parseCsv("Phone\n9876543210\n")).toThrow(/name column/i);
  });
});

// ---------------------------------------------------------------------------
// vCard
// ---------------------------------------------------------------------------
describe("vCard parsing", () => {
  it("reads vCard 3.0 with several contacts and prefers CELL numbers", () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:Priya Sharma", "N:Sharma;Priya;;;",
      "TEL;TYPE=HOME:0452 2345678", "TEL;TYPE=CELL:+91 98765 43210", "END:VCARD",
      "BEGIN:VCARD", "VERSION:3.0", "N:Kumar;Ravi;;;", "item1.TEL:9123456789", "END:VCARD",
    ].join("\r\n");
    const out = parseVcf(vcf);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: "Priya Sharma", phone: "+91 98765 43210 / 0452 2345678" });
    expect(out[1]).toEqual({ name: "Ravi Kumar", phone: "9123456789" });
  });

  it("decodes vCard 2.1 quoted-printable names (Android exports)", () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:2.1",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E0=AE=AA=E0=AE=BF=E0=AE=B0=E0=AE=BF=",
      "=E0=AE=AF=E0=AE=BE",
      "TEL;CELL:98765-43210", "END:VCARD",
    ].join("\n");
    const [c] = parseVcf(vcf);
    expect(c.name).toBe("பிரியா");
    expect(c.phone).toBe("98765-43210");
  });

  it("unfolds folded lines, strips tel: URIs and never lets base64 swallow the next line", () => {
    const vcf = [
      "BEGIN:VCARD", "VERSION:4.0", "FN:Long", " er Name",
      "PHOTO;ENCODING=b;TYPE=JPEG:AAAA==",
      'TEL;VALUE=uri;TYPE="cell":tel:+919876543210', "END:VCARD",
    ].join("\n");
    expect(parseVcf(vcf)).toEqual([{ name: "Longer Name", phone: "+919876543210" }]);
  });

  it("errors on non-vCard content", () => {
    expect(() => parseVcf("hello world")).toThrow(ImportError);
    expect(() => parseVcf("BEGIN:VCARD\nVERSION:3.0\n")).toThrow(/no contacts/i);
  });
});

// ---------------------------------------------------------------------------
// Excel .xlsx (tiny hand-built zip with stored entries)
// ---------------------------------------------------------------------------
function makeZip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name);
    const d = enc.encode(content);
    const local = new Uint8Array(30 + n.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(18, d.length, true);
    lv.setUint32(22, d.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    parts.push(local, d);
    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, d.length, true);
    cv.setUint32(24, d.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    central.push(c);
    offset += local.length + d.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of all) {
    out.set(part, p);
    p += part.length;
  }
  return out.buffer;
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const xlsxFiles = {
  "xl/workbook.xml": `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Guests" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst ${NS}><si><t>Name</t></si><si><t>Mobile</t></si><si><t>Priya</t></si><si><r><t>Ar</t></r><r><t>jun</t></r></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet ${NS}><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>9876543210</v></c></row>
    <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>9.12345678E9</v></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Meena</t></is></c><c r="C4" t="str"><v>x</v></c></row>
  </sheetData></worksheet>`,
};

describe("Excel parsing", () => {
  it("reads shared strings, inline strings and numeric phones", async () => {
    const out = await parseXlsx(makeZip(xlsxFiles));
    expect(out).toEqual([
      { name: "Priya", phone: "9876543210" },
      { name: "Arjun", phone: "9123456780" },
      { name: "Meena", phone: "" },
    ]);
  });

  const canDeflate = (() => {
    try {
      new CompressionStream("deflate-raw" as CompressionFormat);
      return true;
    } catch {
      return false;
    }
  })();

  it.runIf(canDeflate)("reads deflate-compressed entries (how Excel saves files)", async () => {
    async function deflate(s: string): Promise<Uint8Array> {
      const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(c) {
          c.enqueue(new TextEncoder().encode(s));
          c.close();
        },
      }).pipeThrough(new CompressionStream("deflate-raw" as CompressionFormat));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    // Build the zip with stored entries, then rewrite the sheet as deflated.
    const sheet = xlsxFiles["xl/worksheets/sheet1.xml"];
    const files = { ...xlsxFiles };
    delete (files as Record<string, string>)["xl/worksheets/sheet1.xml"];
    const comp = await deflate(sheet);
    const base = new Uint8Array(makeZip(files));
    // Re-assemble: easiest is a zip with only the deflated sheet appended via
    // a fresh builder that accepts raw bytes.
    const enc = new TextEncoder();
    const name = enc.encode("xl/worksheets/sheet1.xml");
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, sheet.length * 3, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    // Split base into (local data) + (central + eocd).
    const bv = new DataView(base.buffer);
    const eocd = base.length - 22;
    const cdOffset = bv.getUint32(eocd + 16, true);
    const cdSize = bv.getUint32(eocd + 12, true);
    const count = bv.getUint16(eocd + 10, true);
    const head = base.subarray(0, cdOffset);
    const oldCentral = base.subarray(cdOffset, cdOffset + cdSize);
    const c = new Uint8Array(46 + name.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, sheet.length * 3, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, head.length, true);
    c.set(name, 46);
    const newCdOffset = head.length + local.length + comp.length;
    const tail = new Uint8Array(22);
    const tv = new DataView(tail.buffer);
    tv.setUint32(0, 0x06054b50, true);
    tv.setUint16(8, count + 1, true);
    tv.setUint16(10, count + 1, true);
    tv.setUint32(12, cdSize + c.length, true);
    tv.setUint32(16, newCdOffset, true);
    const parts = [head, local, comp, oldCentral, c, tail];
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let p = 0;
    for (const part of parts) {
      out.set(part, p);
      p += part.length;
    }
    const contacts = await parseXlsx(out.buffer);
    expect(contacts[0]).toEqual({ name: "Priya", phone: "9876543210" });
    expect(contacts).toHaveLength(3);
  });

  it("rejects old .xls and non-zip files", async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).buffer;
    await expect(parseXlsx(xls)).rejects.toThrow(/\.xls/);
    await expect(parseXlsx(new TextEncoder().encode("not a zip").buffer)).rejects.toThrow(ImportError);
  });
});

// ---------------------------------------------------------------------------
// File dispatch + import errors
// ---------------------------------------------------------------------------
const fakeFile = (name: string, content: string | ArrayBuffer, size?: number) => {
  const buf = typeof content === "string" ? new TextEncoder().encode(content).buffer : content;
  return { name, size: size ?? buf.byteLength, arrayBuffer: async () => buf } as unknown as File;
};

describe("readContactFile", () => {
  it("routes by extension", async () => {
    expect((await readContactFile(fakeFile("c.csv", "Name,Phone\nA,9876543210"))).source).toBe("csv");
    expect((await readContactFile(fakeFile("c.vcf", "BEGIN:VCARD\nFN:A\nTEL:9876543210\nEND:VCARD"))).source).toBe("vcf");
    expect((await readContactFile(fakeFile("c.xlsx", makeZip(xlsxFiles)))).source).toBe("xlsx");
  });

  it("decodes UTF-16 (Excel 'Unicode text') files", async () => {
    const text = "Name\tPhone\nகவிதா\t9876543210\n";
    const body = new Uint8Array(2 + text.length * 2);
    body.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) new DataView(body.buffer).setUint16(2 + i * 2, text.charCodeAt(i), true);
    const { contacts } = await readContactFile(fakeFile("c.txt", body.buffer));
    expect(contacts[0]).toEqual({ name: "கவிதா", phone: "9876543210" });
  });

  it.each([
    ["c.pdf", "x", /unsupported file type/i],
    ["c.xls", "x", /\.xls/],
    ["c.csv", "", /empty/i],
  ])("rejects %s", async (name, content, msg) => {
    await expect(readContactFile(fakeFile(name, content))).rejects.toThrow(msg);
  });

  it("rejects oversized files and too many contacts", async () => {
    await expect(readContactFile(fakeFile("c.csv", "Name\nA", 6 * 1024 * 1024))).rejects.toThrow(/5 MB/);
    const many = "Name,Phone\n" + Array.from({ length: 2001 }, (_, i) => `G${i},`).join("\n");
    await expect(readContactFile(fakeFile("c.csv", many))).rejects.toThrow(/limit is 2000/);
  });
});

// ---------------------------------------------------------------------------
// Preview: duplicates, selection defaults, payload
// ---------------------------------------------------------------------------
describe("import preview", () => {
  const existing = [guest("Arjun", "+91 91234 56789"), guest("Kavya")];

  it("flags duplicates in the file and against existing guests", () => {
    const rows = buildPreview(
      [
        { name: "Priya", phone: "98765 43210" },       // ready
        { name: "Priya S", phone: "+919876543210" },   // duplicate in file (same phone)
        { name: "Arjun K", phone: "091234 56789" },    // existing (same phone)
        { name: "kavya", phone: "" },                  // existing (same name, no phone)
        { name: "Kavya", phone: "9000000001" },        // possible duplicate (name)
        { name: "Old line", phone: "2345678" },        // invalid phone
        { name: "", phone: "9000000002" },             // missing name
        { name: "Lata", phone: "" },                   // no phone, ok
      ],
      existing
    );
    expect(rows.map((r) => r.status)).toEqual([
      "ready", "duplicate_file", "existing", "existing",
      "possible_duplicate", "invalid_phone", "missing_name", "no_phone",
    ]);
    // Skipped rows can't be ticked; "needs a look" rows are off by default.
    expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual(["Priya", "Lata"]);
    expect(rows.find((r) => r.status === "existing")!.selectable).toBe(false);
    expect(rows.find((r) => r.status === "invalid_phone")!.selectable).toBe(true);
    expect(summarizePreview(rows)).toEqual({ total: 8, ready: 2, attention: 2, skipped: 4, selected: 2 });
  });

  it("sends normalised numbers for valid phones and raw text otherwise", () => {
    const rows = buildPreview([{ name: "A", phone: "98765 43210" }, { name: "B", phone: "2345678" }], []);
    rows[1].selected = true; // user opts in to the invalid one
    expect(toImportPayload(rows)).toEqual([
      { name: "A", phone: "+919876543210" },
      { name: "B", phone: "2345678" },
    ]);
  });

  it("never sends rows the user deselected or that are not selectable", () => {
    const rows = buildPreview([{ name: "A", phone: "9876543210" }, { name: "A", phone: "9876543210" }], []);
    rows[0].selected = false;
    rows[1].selected = true; // a duplicate can't be forced in
    expect(toImportPayload(rows)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contact Picker: support detection, permissions, fallbacks
// ---------------------------------------------------------------------------
describe("contact picker", () => {
  it("reports unsupported when the API is missing (desktop, Firefox, iOS)", () => {
    expect(contactPickerSupport({}, true)).toEqual({ supported: false, reason: "unsupported" });
    expect(contactPickerSupport(undefined, true)).toEqual({ supported: false, reason: "unsupported" });
  });

  it("requires a secure context", () => {
    const nav = { contacts: { select: vi.fn() } };
    expect(contactPickerSupport(nav, false)).toEqual({ supported: false, reason: "insecure" });
    expect(contactPickerSupport(nav, true)).toEqual({ supported: true });
  });

  it("only asks for name + tel, with multiple selection", async () => {
    const select = vi.fn().mockResolvedValue([{ name: ["Priya"], tel: ["98765 43210", "0452 2345678"] }]);
    const out = await pickContacts({ contacts: { select, getProperties: async () => ["name", "email", "tel", "address"] } });
    expect(select).toHaveBeenCalledWith(["name", "tel"], { multiple: true });
    expect(out).toEqual([{ name: "Priya", phone: "98765 43210 / 0452 2345678" }]);
  });

  it("treats a cancelled picker as no contacts", async () => {
    const err = Object.assign(new Error("cancel"), { name: "AbortError" });
    await expect(pickContacts({ contacts: { select: vi.fn().mockRejectedValue(err) } })).resolves.toEqual([]);
    await expect(pickContacts({ contacts: { select: vi.fn().mockResolvedValue([]) } })).resolves.toEqual([]);
  });

  it("explains blocked or unavailable pickers", async () => {
    const sec = Object.assign(new Error("x"), { name: "SecurityError" });
    await expect(pickContacts({ contacts: { select: vi.fn().mockRejectedValue(sec) } })).rejects.toThrow(/blocked/);
    await expect(
      pickContacts({ contacts: { select: vi.fn(), getProperties: async () => ["name"] } })
    ).rejects.toThrow(PickerError);
    await expect(pickContacts({})).rejects.toThrow(/isn't available/);
  });

  it("maps picker results with missing fields", () => {
    expect(fromPicker([{ name: ["", "Ravi"] }, { tel: ["9876543210"] }])).toEqual([
      { name: "Ravi", phone: "" },
      { name: "", phone: "9876543210" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------
describe("import api", () => {
  afterEach(() => {
    setTokenProvider(async () => null);
    vi.restoreAllMocks();
  });

  it("POSTs only the selected contacts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ added: 1, skipped: [], guests: [], summary: {} }), { status: 200 }) as Response
    );
    await api.importGuests("evt-1", [{ name: "A", phone: "+919876543210" }], "Family", "vcf");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/events/evt-1/guests/import");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      contacts: [{ name: "A", phone: "+919876543210" }],
      group: "Family",
      source: "vcf",
    });
  });
});
