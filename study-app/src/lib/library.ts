// Higher-level actions: importing files, keeping the importance analysis up to
// date, exercises from a quick spec like "1a-c, 2, 3".
import type { AiImportance } from "./ai";
import { analyzeCourse } from "./importance";
import { extractFile, guessKind, prettyTitle } from "./extract";
import { newSrs } from "./srs";
import { all, get, put, putMany, update } from "./store";
import type { Card, Insight, Material, MaterialKind, Task } from "./types";
import { uid } from "./util";
import { saveBlob } from "./vault";

export interface ImportProgress {
  file: string;
  index: number;
  total: number;
  detail: string;
}

export const MAX_FILE_MB = 200;

export async function importFiles(
  courseId: string,
  files: File[],
  onProgress: (p: ImportProgress) => void,
  kindOverride?: MaterialKind,
): Promise<{ added: Material[]; failed: { name: string; error: string }[] }> {
  const added: Material[] = [];
  const failed: { name: string; error: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_FILE_MB} MB`);
      onProgress({ file: file.name, index: i, total: files.length, detail: "Reading…" });
      const data = await file.arrayBuffer();
      const ex = await extractFile(file, data, (d, t) =>
        onProgress({ file: file.name, index: i, total: files.length, detail: `Reading text – page ${d}/${t}` }),
      );
      onProgress({ file: file.name, index: i, total: files.length, detail: "Encrypting & saving…" });
      const blobId = uid();
      await saveBlob(blobId, data);
      const guess = guessKind(file.name);
      const m: Material = {
        id: uid(),
        courseId,
        title: prettyTitle(file.name),
        kind: kindOverride ?? guess.kind,
        number: guess.number,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        blobId,
        pageCount: ex.pageCount,
        view: ex.view,
        createdAt: Date.now(),
        seenPages: [],
      };
      put("text", { id: m.id, pages: ex.pages });
      put("material", m);
      added.push(m);
    } catch (e) {
      failed.push({ name: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  autoLinkSolutions(courseId);
  recomputeInsights(courseId);
  return { added, failed };
}

/** Pairs "Uebung 3" with "Loesung 3" automatically. */
export function autoLinkSolutions(courseId: string) {
  const mats = all("material").filter((m) => m.courseId === courseId);
  const solutions = mats.filter((m) => m.kind === "solution" && m.number !== undefined);
  for (const ex of mats.filter((m) => m.kind === "exercise" && !m.solutionId && m.number !== undefined)) {
    const sol = solutions.find((s) => s.number === ex.number);
    if (sol) update("material", ex.id, { solutionId: sol.id });
  }
}

/** Re-runs the offline importance analysis for a whole lecture (cheap, runs locally). */
export function recomputeInsights(courseId: string) {
  const mats = all("material").filter((m) => m.courseId === courseId);
  const prev = new Map(mats.map((m) => [m.id, get("insight", m.id)] as const));
  const insights = analyzeCourse(
    mats.map((m) => ({ material: m, text: get("text", m.id) })),
    prev,
  );
  // AI ratings, once made, are kept – only refresh the automatic ones.
  const next = insights.map((ins) => {
    const p = prev.get(ins.id);
    return p?.source === "ai" ? { ...p, overrides: p.overrides } : ins;
  });
  putMany("insight", next);
}

export function applyAiImportance(material: Material, ai: AiImportance) {
  const prev = get("insight", material.id);
  const tiers = Array.from({ length: material.pageCount }, (_, i) => prev?.tiers[i] ?? "important") as Insight["tiers"];
  const reasons = Array.from({ length: material.pageCount }, (_, i) => prev?.reasons[i] ?? "");
  const scores = Array.from({ length: material.pageCount }, (_, i) => prev?.scores[i] ?? 0.5);
  const value = { core: 1, important: 0.66, optional: 0.33, skip: 0 } as const;
  for (const p of ai.pages) {
    if (p.page < 1 || p.page > material.pageCount) continue;
    tiers[p.page - 1] = p.tier;
    reasons[p.page - 1] = `AI: ${p.reason}`;
    scores[p.page - 1] = value[p.tier];
  }
  const order = { core: 0, important: 1, optional: 2 } as const;
  const insight: Insight = {
    id: material.id,
    tiers,
    reasons,
    scores,
    overrides: prev?.overrides ?? {},
    topics: ai.topics
      .slice()
      .sort((a, b) => order[a.importance] - order[b.importance])
      .map((t, i) => ({
        id: `ai-${i}`,
        title: t.title,
        importance: t.importance,
        pages: t.pages.filter((p) => p >= 1 && p <= material.pageCount),
        why: t.why,
        keyPoints: t.keyPoints,
        mastered: prev?.topics.find((x) => x.title === t.title)?.mastered,
      })),
    source: "ai",
    updatedAt: Date.now(),
  };
  put("insight", insight);
}

export function resetToAutoImportance(material: Material) {
  const prev = get("insight", material.id);
  if (prev) put("insight", { ...prev, source: "auto", topics: [] });
  recomputeInsights(material.courseId);
}

export function setPageOverride(materialId: string, page: number, tier: Insight["tiers"][number] | null) {
  const ins = get("insight", materialId);
  if (!ins) return;
  const overrides = { ...ins.overrides };
  if (tier === null) delete overrides[page];
  else overrides[page] = tier;
  put("insight", { ...ins, overrides });
}

export function toggleTopicMastered(materialId: string, topicId: string) {
  const ins = get("insight", materialId);
  if (!ins) return;
  put("insight", { ...ins, topics: ins.topics.map((t) => (t.id === topicId ? { ...t, mastered: !t.mastered } : t)) });
}

const seenTimers = new Map<string, number>();
/** Counts a page as studied once you stayed on it for a few seconds. */
export function markPageSeenSoon(materialId: string, page: number, delayMs = 4000) {
  const key = materialId;
  const prev = seenTimers.get(key);
  if (prev) clearTimeout(prev);
  seenTimers.set(
    key,
    window.setTimeout(() => {
      const m = get("material", materialId);
      if (!m) return;
      const seen = new Set(m.seenPages ?? []);
      if (seen.has(page)) return;
      seen.add(page);
      update("material", materialId, { seenPages: Array.from(seen).sort((a, b) => a - b), studied: seen.size >= m.pageCount ? true : m.studied });
    }, delayMs),
  );
}

export function setPagesSeen(materialId: string, pages: number[], seen: boolean) {
  const m = get("material", materialId);
  if (!m) return;
  const set = new Set(m.seenPages ?? []);
  for (const p of pages) {
    if (seen) set.add(p);
    else set.delete(p);
  }
  update("material", materialId, { seenPages: Array.from(set).sort((a, b) => a - b), studied: set.size >= m.pageCount });
}

/**
 * Parses "1a-c, 2, 3 (b), 4.1-4.3" into task titles:
 * 1a 1b 1c 2 3b 4.1 4.2 4.3
 */
export function parseTaskSpec(spec: string): string[] {
  const out: string[] = [];
  for (const rawPart of spec.split(/[,;\n]+/)) {
    const part = rawPart.trim().replace(/[()]/g, "").replace(/\s+/g, "");
    if (!part) continue;
    let m = part.match(/^(\d+)([a-z])-([a-z])$/i);
    if (m) {
      const [, n, a, b] = m;
      for (let c = a.toLowerCase().charCodeAt(0); c <= b.toLowerCase().charCodeAt(0); c++) out.push(`${n}${String.fromCharCode(c)}`);
      continue;
    }
    m = part.match(/^(\d+)\.(\d+)-(?:\d+\.)?(\d+)$/);
    if (m) {
      const [, n, a, b] = m;
      for (let k = Number(a); k <= Number(b); k++) out.push(`${n}.${k}`);
      continue;
    }
    m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      for (let k = Number(m[1]); k <= Number(m[2]) && k - Number(m[1]) < 50; k++) out.push(String(k));
      continue;
    }
    // "3 (b)" → "3b"; free text like "Bonus task" stays as typed.
    out.push(/^[\w.]+$/.test(part) ? part : rawPart.trim());
  }
  return out;
}

export function addTasks(courseId: string, materialId: string | undefined, titles: string[], page?: number) {
  const existing = all("task").filter((t) => t.courseId === courseId);
  const base = existing.reduce((m, t) => Math.max(m, t.order), 0);
  const tasks: Task[] = titles.map((title, i) => ({
    id: uid(),
    courseId,
    materialId,
    page,
    title,
    description: "",
    status: "todo",
    confidence: 0,
    solution: "",
    attempts: 0,
    createdAt: Date.now(),
    order: base + i + 1,
  }));
  putMany("task", tasks);
  return tasks;
}

export function makeCard(courseId: string, front: string, back: string, materialId?: string, page?: number): Card {
  return {
    id: uid(),
    courseId,
    materialId,
    page,
    front: front.trim(),
    back: back.trim(),
    tags: [],
    createdAt: Date.now(),
    srs: newSrs(),
  };
}
