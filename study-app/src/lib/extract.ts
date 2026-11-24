// Reads uploaded files and pulls out their text (per page / slide) so you can
// search everything and the tutor can read it.
import { strFromU8, unzipSync } from "fflate";
import type { MaterialKind, ViewKind } from "./types";

export interface Extracted {
  view: ViewKind;
  pages: string[];
  pageCount: number;
}

const TEXT_EXT = ["txt", "md", "markdown", "rmd", "qmd", "tex", "csv", "tsv", "json", "r", "py", "m", "jl", "sql", "c", "cpp", "h", "java", "js", "ts", "html", "css", "xml", "yaml", "yml"];
const CODE_LANG: Record<string, string> = { r: "r", py: "python", m: "matlab", jl: "julia", sql: "sql", c: "c", cpp: "cpp", h: "c", java: "java", js: "javascript", ts: "typescript", html: "html", css: "css", xml: "xml", yaml: "yaml", yml: "yaml", json: "json", tex: "latex", csv: "", tsv: "" };

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function viewFor(name: string, mime: string): ViewKind {
  const ext = extOf(name);
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pptx") return "slides";
  if (ext === "docx") return "doc";
  if (ext === "ipynb" || TEXT_EXT.includes(ext) || mime.startsWith("text/")) return "text";
  return "binary";
}

export function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function paragraphs(xml: string, pTag: string, tTag: string): string[] {
  const tRe = new RegExp(`<${tTag}(?:\\s[^>]*)?>([^<]*)</${tTag}>`, "g");
  return xml
    .split(`</${pTag}>`)
    .map((p) => Array.from(p.matchAll(tRe), (m) => decodeXml(m[1])).join(""))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pptxSlides(data: Uint8Array): string[] {
  const files = unzipSync(data, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) });
  return Object.keys(files)
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
    .map((name) => paragraphs(strFromU8(files[name]), "a:p", "a:t").join("\n"));
}

export function docxSections(data: Uint8Array, maxChars = 3500): string[] {
  const files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) return [];
  const paras = paragraphs(strFromU8(xml), "w:p", "w:t");
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur.length + p.length > maxChars && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p + "\n\n";
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [""];
}

export function notebookToMarkdown(json: string): string {
  try {
    const nb = JSON.parse(json);
    const lang = nb?.metadata?.kernelspec?.language || nb?.metadata?.language_info?.name || "";
    return (nb.cells ?? [])
      .map((c: { cell_type: string; source: string | string[] }) => {
        const src = Array.isArray(c.source) ? c.source.join("") : c.source ?? "";
        return c.cell_type === "code" ? "```" + lang + "\n" + src + "\n```" : src;
      })
      .join("\n\n");
  } catch {
    return json;
  }
}

/** Text files: markdown stays markdown, code is shown as a code block. */
export function textToMarkdown(name: string, text: string): string {
  const ext = extOf(name);
  if (ext === "ipynb") return notebookToMarkdown(text);
  if (["md", "markdown", "rmd", "qmd", "txt", ""].includes(ext)) return text;
  return "```" + (CODE_LANG[ext] ?? "") + "\n" + text + "\n```";
}

/** Splits long text into ~pages so search results and the tutor can point at a part. */
export function splitText(text: string, maxChars = 4000): string[] {
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  let cur = "";
  for (const block of text.split(/\n{2,}/)) {
    if (cur.length + block.length > maxChars && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += block + "\n\n";
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function extractFile(file: File, data: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<Extracted> {
  const view = viewFor(file.name, file.type);
  switch (view) {
    case "pdf": {
      const { openPdf, extractPdfText } = await import("./pdf");
      const pdf = await openPdf(data);
      try {
        const pages = await extractPdfText(pdf.doc, onProgress);
        return { view, pages, pageCount: pdf.doc.numPages };
      } finally {
        pdf.destroy();
      }
    }
    case "slides": {
      const pages = pptxSlides(new Uint8Array(data));
      return { view, pages, pageCount: Math.max(1, pages.length) };
    }
    case "doc": {
      const pages = docxSections(new Uint8Array(data));
      return { view, pages, pageCount: pages.length };
    }
    case "text": {
      const text = new TextDecoder().decode(data);
      const pages = splitText(textToMarkdown(file.name, text));
      return { view, pages, pageCount: pages.length };
    }
    case "image":
      return { view, pages: [""], pageCount: 1 };
    default:
      return { view, pages: [""], pageCount: 1 };
  }
}

/** Guesses the kind and number from the file name ("Uebung_03.pdf" → exercise, 3). */
export function guessKind(name: string): { kind: MaterialKind; number?: number } {
  const n = name.toLowerCase();
  const num = n.match(/(?<!\d)(\d{1,4})(?!.*\d)/);
  const number = num ? Number(num[1]) : undefined;
  if (/(l(ö|oe|o)sung|solution|musterl|sol\b|_sol|answers?)/.test(n)) return { kind: "solution", number };
  if (/(klausur|exam(?!ple)|pr(ü|ue)fung|midterm|final|probeklausur|altklausur|basispr|sessionspr|endterm)/.test(n)) return { kind: "exam", number };
  if (/((ü|ue)bung|exercise|aufgabe|blatt|sheet|(?:^|[^a-z])serie(?:n)?(?:[^a-z]|$)|homework|hw\d|assignment|tutorium|tutorial|problem|uebungsblatt)/.test(n)) return { kind: "exercise", number };
  if (/(notiz|notes|mitschrift|summary|zusammenfassung|cheat)/.test(n)) return { kind: "notes", number };
  if (/(vorlesung|lecture|vl|folien|slides|skript|script|chapter|kapitel|kap|week|woche|session|einheit|lec)/.test(n)) return { kind: "lecture", number };
  return { kind: "lecture", number };
}

export function prettyTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
