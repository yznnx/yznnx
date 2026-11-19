// Decides what is important to study – fully offline, no AI needed.
//
// Each lecture page gets a score from several signals:
//   • Exercise & past-exam overlap – pages whose vocabulary matches your
//     exercise sheets / old exams are what you will actually be tested on.
//   • Cue words – "Definition", "Theorem", "Satz", "wichtig", "klausurrelevant" …
//   • Centrality – concepts that come up again and again in the course.
//   • Formulas – slides dense with maths are usually worth knowing.
//   • Skip signals – title, agenda, organisation and reference slides.
// The score is turned into a tier: core / important / optional / skip.
// If you run the AI analysis its ratings replace these, and your own
// overrides always win.
import type { Insight, Material, MaterialText, Tier, Topic } from "./types";
import { normalize } from "./util";

const STOP = new Set(
  (
    "the and for are but not you all any can had her was one our out has have this that with from they will would there their what about which when your said each she how into them than then these some its also more other such only over very just may were been being who whom where why does did doing done both few most own same too here those under again further once because while above below between through during before after off until upon per via let lets use used using get got make made like see seen show shows shown thus hence given give gives therefore however example examples e.g i.e etc page slide slides lecture chapter section figure table note" +
    " der die das und oder aber nicht ein eine einer eines einem einen ist sind war waren wird werden wurde wurden hat haben hatte mit von zu zum zur auf aus bei nach vor für fur fuer über uber ueber unter durch als auch noch nur schon sehr wie was wer wo wann warum dass daß den dem des sich sie er es wir ihr ich du man kann können koennen muss müssen soll sollen darf dürfen im in an am um so dann wenn weil also bzw z.b dh d.h usw sowie hier dort dies diese dieser dieses diesen jede jeder jedes alle allem allen kein keine keiner beispiel folie vorlesung kapitel abschnitt seite siehe gilt ergibt somit daher dabei damit"
  ).split(/\s+/),
);

const STRONG_CUES = /\b(definition|def\.|theorem|theorems|satz|lemma|korollar|corollary|proposition|axiom|formel|formula|wichtig|important|merke|klausur\w*|exam\w*|pr(?:u|ue)fung\w*|remember|key (?:idea|concept|point)|take-?away|achtung|caution|zusammenfassung|summary|recap|algorithmus|algorithm|eigenschaft(?:en)?|properties|regel|rule|beweis|proof)\b/g;
const SKIP_START = /^\s*(agenda|outline|overview|inhalt|inhaltsverzeichnis|gliederung|table of contents|contents|literatur\w*|references|bibliography|quellen|questions\??|fragen\??|thank you|thanks|danke\w*|vielen dank|organisatorisches|organisation\w*|organizational|administrative|contact|kontakt|sprechstunde|office hours|termine|dates|schedule|lernziele|learning objectives|disclaimer|copyright)\b/;
const MATH = /[=∑∫√≤≥≠≈∈∉⊂⊆∀∃→⇒⇔∞±×÷∂∇λμσπθαβγδε^]|\b(?:lim|log|exp|sin|cos|argmax|argmin|var|cov|e\[)\b/g;

function stem(w: string): string {
  if (w.length > 6) {
    for (const suf of ["ungen", "ung", "ions", "ion", "ies", "ing", "en", "es", "er", "s", "e"]) {
      if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
    }
  }
  return w;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

type Vec = Map<string, number>;

function tf(tokens: string[]): Vec {
  const m: Vec = new Map();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function weight(v: Vec, idf: Map<string, number>): Vec {
  const out: Vec = new Map();
  for (const [t, c] of v) out.set(t, (1 + Math.log(c)) * (idf.get(t) ?? 0));
  return out;
}

function norm(v: Vec) {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

function cosine(a: Vec, b: Vec, nb = norm(b)): number {
  const na = norm(a);
  if (!na || !nb) return 0;
  let dot = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, x] of small) {
    const y = big.get(t);
    if (y) dot += x * y;
  }
  return dot / (na * nb);
}

function addInto(target: Vec, v: Vec, factor = 1) {
  for (const [t, x] of v) target.set(t, (target.get(t) ?? 0) + x * factor);
}

/** Percentile rank (0..1) of each value inside its array. */
function ranks(values: number[]): number[] {
  if (values.length <= 1) return values.map((v) => (v > 0 ? 1 : 0));
  const sorted = values.slice().sort((a, b) => a - b);
  return values.map((v) => {
    if (v <= 0) return 0;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / (sorted.length - 1);
  });
}

export const STUDY_KINDS = new Set(["lecture", "notes", "other"]);
export const EVIDENCE_KINDS: Record<string, number> = { exam: 2, exercise: 1, solution: 0.5 };

export interface CourseDoc {
  material: Material;
  text: MaterialText | undefined;
}

export function firstLine(text: string): string {
  const line = text
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length >= 3 && !/^\d+$/.test(s));
  return (line ?? "").slice(0, 80);
}

/** Computes automatic importance for every study material of one course. */
export function analyzeCourse(docs: CourseDoc[], previous: Map<string, Insight | undefined> = new Map()): Insight[] {
  const studyDocs = docs.filter((d) => STUDY_KINDS.has(d.material.kind) && d.text);
  if (!studyDocs.length) return [];

  // Document frequency over all pages of the course.
  const df = new Map<string, number>();
  let nPages = 0;
  const pageTf = new Map<string, Vec[]>();
  for (const d of docs) {
    if (!d.text) continue;
    const vecs = d.text.pages.map((p) => tf(tokenize(p)));
    pageTf.set(d.material.id, vecs);
    for (const v of vecs) {
      nPages++;
      for (const t of v.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log((nPages + 1) / (n + 0.5)));

  // Evidence = exercises + past exams (+ solutions) of this course.
  const evidence: Vec = new Map();
  let hasEvidence = false;
  for (const d of docs) {
    const w = EVIDENCE_KINDS[d.material.kind];
    if (!w || !pageTf.has(d.material.id)) continue;
    for (const v of pageTf.get(d.material.id)!) {
      if (v.size) hasEvidence = true;
      addInto(evidence, weight(v, idf), w);
    }
  }
  const evidenceNorm = norm(evidence);

  // Centroid of all lecture pages = "what this course is about".
  const centroid: Vec = new Map();
  for (const d of studyDocs) for (const v of pageTf.get(d.material.id) ?? []) addInto(centroid, weight(v, idf));
  const centroidNorm = norm(centroid);

  const out: Insight[] = [];
  for (const d of studyDocs) {
    const pages = d.text!.pages;
    const vecs = (pageTf.get(d.material.id) ?? []).map((v) => weight(v, idf));
    const evid = vecs.map((v) => (hasEvidence ? cosine(v, evidence, evidenceNorm) : 0));
    const cent = vecs.map((v) => cosine(v, centroid, centroidNorm));
    const cues = pages.map((p) => Math.min(3, (normalize(p).match(STRONG_CUES) ?? []).length));
    const math = pages.map((p) => Math.min(1, (p.match(MATH) ?? []).length / 12));
    const evidR = ranks(evid);
    const centR = ranks(cent);

    const scores: number[] = [];
    const skip: boolean[] = [];
    const reasons: string[] = [];
    pages.forEach((p, i) => {
      const words = tokenize(p).length;
      const head = normalize(p.slice(0, 160));
      const skipCue = SKIP_START.test(head);
      // Almost empty = title/section slide – unless it states a theorem or formula.
      const thin = words < 4 || (words < 8 && cues[i] === 0 && math[i] < 0.25);
      const isSkip = skipCue || thin;
      const cue = cues[i] / 3;
      let s = hasEvidence
        ? 0.45 * evidR[i] + 0.25 * cue + 0.18 * centR[i] + 0.12 * math[i]
        : 0.4 * cue + 0.4 * centR[i] + 0.2 * math[i];
      if (words < 25) s *= 0.75; // thin slides carry less
      if (isSkip) s *= 0.2;
      scores.push(Math.round(s * 1000) / 1000);
      skip.push(isSkip);

      const why: string[] = [];
      if (isSkip) why.push(skipCue ? "agenda / organisation / references" : "title / almost empty");
      else {
        if (hasEvidence && evidR[i] >= 0.7 && evid[i] > 0.05) why.push("matches your exercises");
        if (cues[i] >= 1) why.push(cueLabel(p));
        if (math[i] >= 0.5) why.push("formulas");
        if (centR[i] >= 0.8) why.push("central concept");
      }
      reasons.push(why.join(" · "));
    });

    // Tiers: relative within the file, but never "core" for weak pages.
    const ranked = ranks(scores);
    const tiers: Tier[] = scores.map((s, i) => {
      if (skip[i]) return "skip";
      if (ranked[i] >= 0.72 && s >= 0.3) return "core";
      if (ranked[i] >= 0.35 && s >= 0.15) return "important";
      return "optional";
    });

    const prev = previous.get(d.material.id);
    out.push({
      id: d.material.id,
      scores,
      tiers,
      reasons,
      overrides: prev?.overrides ?? {},
      // Keep AI topics if they exist; otherwise derive topics from slide titles.
      topics: prev?.source === "ai" ? prev.topics : autoTopics(pages, tiers, reasons, prev?.topics),
      source: prev?.source === "ai" ? "ai" : "auto",
      updatedAt: Date.now(),
    });
  }
  return out;
}

function cueLabel(p: string): string {
  const n = normalize(p);
  if (/\b(klausur\w*|exam\w*|pr(?:u|ue)fung\w*)\b/.test(n)) return "mentions exam";
  if (/\b(definition|def\.)\b/.test(n)) return "definition";
  if (/\b(theorem|satz|lemma|korollar|corollary|proposition)\b/.test(n)) return "theorem";
  if (/\b(wichtig|important|merke|remember|achtung)\b/.test(n)) return "marked important";
  if (/\b(zusammenfassung|summary|recap|take-?away)\b/.test(n)) return "summary";
  return "key concept";
}

const TIER_RANK: Record<Tier, number> = { core: 3, important: 2, optional: 1, skip: 0 };

/** Groups consecutive pages with the same slide title into topics. */
function autoTopics(pages: string[], tiers: Tier[], reasons: string[], previous?: Topic[]): Topic[] {
  const topics: Topic[] = [];
  let cur: { title: string; pages: number[] } | null = null;
  pages.forEach((p, i) => {
    if (tiers[i] === "skip") {
      cur = null;
      return;
    }
    const title = firstLine(p) || `Page ${i + 1}`;
    const key = normalize(title).replace(/\(?\s*(\d+|cont\.?|fortsetzung|ff\.?)\s*\)?$/, "").trim();
    if (cur && normalize(cur.title).replace(/\(?\s*(\d+|cont\.?|fortsetzung|ff\.?)\s*\)?$/, "").trim() === key) {
      cur.pages.push(i + 1);
    } else {
      cur = { title, pages: [i + 1] };
      topics.push({ id: "", title, importance: "optional", pages: cur.pages, why: "", keyPoints: [] });
    }
  });
  const prevMastered = new Set((previous ?? []).filter((t) => t.mastered).map((t) => normalize(t.title)));
  return topics.map((t, idx) => {
    const best = t.pages.reduce((m, p) => Math.max(m, TIER_RANK[tiers[p - 1]]), 0);
    const why = Array.from(new Set(t.pages.flatMap((p) => reasons[p - 1].split(" · ").filter(Boolean)))).slice(0, 3).join(" · ");
    return {
      ...t,
      id: `auto-${idx}`,
      importance: best >= 3 ? "core" : best === 2 ? "important" : "optional",
      why,
      mastered: prevMastered.has(normalize(t.title)),
    };
  });
}

export function tierOf(insight: Insight | undefined, page: number): Tier | undefined {
  if (!insight) return undefined;
  return insight.overrides[page] ?? insight.tiers[page - 1];
}

export const TIER_LABEL: Record<Tier, string> = { core: "Core", important: "Important", optional: "Optional", skip: "Skip" };
export const TIER_HINT: Record<Tier, string> = {
  core: "Must know for the exam",
  important: "Should know",
  optional: "Nice to know – only if you have time",
  skip: "Not exam material (title, agenda, organisation…)",
};
export const TIER_VALUE = TIER_RANK;

/** Average importance (0..1) of the pages you have seen vs. all pages, weighted by tier. */
export function coverage(material: Material, insight: Insight | undefined): { done: number; total: number } {
  const seen = new Set(material.seenPages ?? []);
  let done = 0;
  let total = 0;
  for (let p = 1; p <= material.pageCount; p++) {
    const t = tierOf(insight, p) ?? "important";
    const w = TIER_RANK[t];
    total += w;
    if (seen.has(p)) done += w;
  }
  return { done, total };
}
