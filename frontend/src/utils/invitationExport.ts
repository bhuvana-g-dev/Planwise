// Turn the invitation <svg> into a PNG in the browser. Nothing is uploaded.

import { CARD_H, CARD_W } from "../invitations/templates";

export function svgMarkup(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(CARD_W));
  clone.setAttribute("height", String(CARD_H));
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  return new XMLSerializer().serializeToString(clone);
}

export async function svgToPng(svg: SVGSVGElement): Promise<Blob> {
  const url = URL.createObjectURL(
    new Blob([svgMarkup(svg)], { type: "image/svg+xml;charset=utf-8" })
  );
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't draw the invitation image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't create images.");
    ctx.drawImage(img, 0, 0, CARD_W, CARD_H);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the PNG."))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The most recent download URL. It is NOT revoked right after click(): when
// the browser asks where to save (or scans the file) it reads the blob later,
// and a revoked URL makes it write an empty file ("nothing to show" in
// Photos). It's freed on the next download or when the page goes away.
let lastDownloadUrl: string | null = null;

function releaseDownloadUrl() {
  if (lastDownloadUrl) URL.revokeObjectURL(lastDownloadUrl);
  lastDownloadUrl = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", releaseDownloadUrl);
}

export function downloadBlob(blob: Blob, filename: string): void {
  releaseDownloadUrl();
  const url = URL.createObjectURL(blob);
  lastDownloadUrl = url;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function invitationFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "invitation"}-invitation.png`;
}
