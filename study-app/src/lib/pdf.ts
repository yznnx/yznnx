// PDF support via Mozilla's pdf.js – fully offline, the worker is bundled in.
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import workerCode from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  workerReady = true;
  // Browsers refuse *module* workers when the app is opened as a local file
  // (file://), but classic workers are fine. The pdf.js worker is an ES module
  // only because of a trailing `export` and two `import.meta.url` lookups, so
  // turn it into a classic script and hand pdf.js a ready-made worker port.
  const classic = workerCode.replace(/import\.meta\.url/g, "self.location.href").replace(/export\s*\{\s*WorkerMessageHandler\s*\};?\s*$/, "");
  const classicUrl = URL.createObjectURL(new Blob([classic], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerSrc = classicUrl;
  try {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(classicUrl);
  } catch (e) {
    console.warn("PDF worker unavailable, rendering on the main thread", e);
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
  }
}

export interface PdfHandle {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

export async function openPdf(data: ArrayBuffer): Promise<PdfHandle> {
  ensureWorker();
  // pdf.js takes ownership of the buffer, so hand it a copy.
  const copy = new Uint8Array(data.byteLength);
  copy.set(new Uint8Array(data));
  const task = pdfjs.getDocument({ data: copy });
  const doc = await task.promise;
  return { doc, destroy: () => task.destroy() };
}

export async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let s = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    s += item.str;
    if (item.hasEOL) s += "\n";
  }
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractPdfText(doc: PDFDocumentProxy, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pages.push(await pageText(page));
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  return pages;
}

/** Renders a page into a JPEG/PNG (base64, no prefix) – used to show slides to the AI tutor. */
export async function renderPageImage(doc: PDFDocumentProxy, pageNumber: number, maxSide = 1568): Promise<{ data: string; mediaType: "image/png" | "image/jpeg" }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.88);
  return { data: url.slice(url.indexOf(",") + 1), mediaType: "image/jpeg" };
}

export { pdfjs };
export type { PDFDocumentProxy, PDFPageProxy };
