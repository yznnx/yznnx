// "Claude without an API key": the app writes the prompt, you paste it into the
// Claude app / claude.ai (your normal subscription), then paste Claude's answer
// back. Nothing is sent anywhere by the app itself.
import {
  cardPrompt,
  checkInstruction,
  gradePrompt,
  importancePrompt,
  kindLabel,
  normalizeQuestions,
  problemPrompt,
  quizPrompt,
  textOfPages,
  type AiImportance,
  type GeneratedCard,
  type GeneratedProblem,
  type GeneratedQuestion,
  type Grade,
} from "./ai";
import { get } from "./store";
import type { Material, Problem, Task, Tier } from "./types";

export type BridgeTask = "cards" | "quiz" | "problems" | "importance";

export const CLAUDE_URL = "https://claude.ai/new";

const FORMAT: Record<BridgeTask | "grade", string> = {
  cards: `{"cards": [{"front": "question (Markdown, maths as $...$)", "back": "precise answer", "page": 4}]}`,
  quiz: `{"questions": [{"type": "truefalse", "question": "...", "options": ["statement A", "statement B", "statement C", "statement D"], "correct": [0, 2], "explanation": "why each option is right or wrong", "page": 6}]}
"type" is "single" (exactly one correct option), "multi" (select all that apply, any number correct) or "truefalse" (each option is a statement; "correct" lists the TRUE ones). Indices start at 0.`,
  problems: `{"problems": [{"title": "short topic", "statement": "full problem with sub-parts (a), (b), ... and points per part", "points": 10, "minutes": 20, "solution": "complete model solution with all steps", "rubric": "strict grading scheme: what earns each point", "pages": [4, 5]}]}`,
  importance: `{"pages": [{"page": 1, "tier": "skip", "reason": "title slide"}, ... one entry for EVERY page ...], "topics": [{"title": "...", "importance": "core", "pages": [4, 5], "why": "why it matters for the exam", "keyPoints": ["what I must be able to do"]}]}
"tier" is core, important, optional or skip; topic "importance" is core, important or optional.`,
  grade: `{"score": 3.5, "maxScore": 6, "verdict": "partial", "feedback": "Markdown: points per sub-part and why, first wrong or missing step, what full marks needed"}
"verdict" is correct, partial, wrong or empty.`,
};

function outputRule(format: string) {
  return `OUTPUT FORMAT (important – my study app reads your answer automatically): reply with exactly ONE fenced code block \`\`\`json ... \`\`\` and nothing else, in this shape:
${format}
Inside JSON strings escape every backslash (write \\\\frac, \\\\alpha) and write line breaks as \\n.`;
}

function materialSection(material: Material, pages: number[] | undefined, attachPdf: boolean) {
  const label = `${kindLabel(material.kind)} "${material.title}"`;
  if (attachPdf) {
    return `The material is the attached file "${material.fileName}" (${label}).${pages ? ` Use pages ${pages.join(", ")}.` : ""}`;
  }
  return `<material title="${label}">\n${textOfPages(material.id, pages)}\n</material>`;
}

export interface BridgeRequest {
  task: BridgeTask;
  material: Material;
  /** undefined = whole file */
  pages?: number[];
  count: number;
  importantPages?: number[];
  /** You attach the PDF in Claude yourself instead of pasting its text. */
  attachPdf: boolean;
}

export function buildBridgePrompt(r: BridgeRequest): string {
  const pr =
    r.task === "cards"
      ? { extra: "", ...cardPrompt({ count: r.count, focus: r.pages ? "important" : "all", importantPages: r.importantPages }) }
      : r.task === "quiz"
        ? quizPrompt(r.material.courseId, { count: r.count, importantPages: r.importantPages })
        : r.task === "problems"
          ? problemPrompt(r.material.courseId, { count: r.count, importantPages: r.importantPages })
          : importancePrompt(r.material);
  const pages = r.task === "importance" ? undefined : r.pages;
  return [pr.system, materialSection(r.material, pages, r.attachPdf), pr.extra, pr.ask, outputRule(FORMAT[r.task])].filter(Boolean).join("\n\n");
}

export function buildGradePrompt(problem: Problem, answer: string, hasImages: boolean): string {
  const pr = gradePrompt(problem, answer, hasImages);
  return [
    pr.system,
    ...pr.parts,
    hasImages ? "My handwritten pages are attached as images." : "",
    pr.ask,
    outputRule(FORMAT.grade),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildCheckPrompt(task: Task, answer: string, hasImages: boolean): string {
  const sheet = get("material", task.materialId);
  const solution = sheet?.solutionId ? get("material", sheet.solutionId) : undefined;
  const parts: string[] = ["You are a precise university tutor. Use Markdown and LaTeX ($...$)."];
  if (sheet) parts.push(materialSection(sheet, task.page ? [task.page] : undefined, false));
  if (solution) parts.push(`Official solution (do NOT reveal it directly – use it to judge):\n${textOfPages(solution.id)}`);
  parts.push(`Exercise ${task.title}${task.page ? ` (p. ${task.page})` : ""}${task.description ? `: ${task.description}` : ""}`);
  if (answer.trim()) parts.push(`My solution:\n${answer}`);
  if (hasImages) parts.push("My handwritten solution is attached as photos.");
  parts.push(checkInstruction());
  return parts.join("\n\n");
}

// ---------- reading Claude's answer ----------

/** Doubles single backslashes in front of LaTeX commands that JSON would misread (\frac → form feed …). */
export function repairLatexEscapes(json: string): string {
  return json
    .replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, "\\\\")
    .replace(
      /(?<!\\)\\(frac|forall|beta|bar|binom|big[a-z]*|boldsymbol|bm|bf|nabla|neq|ne|nu|notin|not|newline|text[a-z]*|theta|tau|times|to|top|tilde|tfrac|rho|right[a-z]*|rangle|tan|tanh|b)(?![a-zA-Z])/g,
      "\\\\$1",
    );
}

function hasControlChars(v: unknown): boolean {
  if (typeof v === "string") return /[\b\f\t]/.test(v);
  if (Array.isArray(v)) return v.some(hasControlChars);
  if (v && typeof v === "object") return Object.values(v).some(hasControlChars);
  return false;
}

export function extractJson(text: string): unknown {
  const fences = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g), (m) => m[1]);
  const candidates = [...fences, text];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    const raw = c.slice(start, end + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined || hasControlChars(parsed)) {
      try {
        parsed = JSON.parse(repairLatexEscapes(raw));
      } catch {
        /* keep the first result if any */
      }
    }
    if (parsed !== undefined) return parsed;
  }
  throw new Error("Couldn't find the result in Claude's answer. Copy Claude's complete reply (including the ```json block) and paste it again.");
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const int = (v: unknown, fallback = 0) => (typeof v === "number" && isFinite(v) ? Math.round(v) : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseCards(text: string): GeneratedCard[] {
  const o = extractJson(text) as { cards?: unknown };
  const cards = arr(o.cards ?? o)
    .map((c) => c as Record<string, unknown>)
    .map((c) => ({ front: str(c.front ?? c.question), back: str(c.back ?? c.answer), page: int(c.page) }))
    .filter((c) => c.front && c.back);
  if (!cards.length) throw new Error("No flashcards found in the answer.");
  return cards;
}

export function parseQuiz(text: string): GeneratedQuestion[] {
  const o = extractJson(text) as { questions?: unknown };
  const qs = arr(o.questions ?? o).map((x) => {
    const q = x as Record<string, unknown>;
    const type = (["single", "multi", "truefalse"].includes(str(q.type)) ? str(q.type) : "single") as GeneratedQuestion["type"];
    const correct = Array.isArray(q.correct) ? q.correct.map((i) => int(i, -1)) : [int(q.correct, -1)];
    return { type, question: str(q.question), options: arr(q.options).map(str).filter(Boolean), correct, explanation: str(q.explanation), page: int(q.page) };
  });
  const valid = normalizeQuestions(qs.filter((q) => q.question));
  if (!valid.length) throw new Error("No usable quiz questions found in the answer.");
  return valid;
}

export function parseProblems(text: string): GeneratedProblem[] {
  const o = extractJson(text) as { problems?: unknown };
  const ps = arr(o.problems ?? o)
    .map((x) => x as Record<string, unknown>)
    .map((p) => ({
      title: str(p.title) || "Problem",
      statement: str(p.statement),
      points: Math.max(1, int(p.points, 10)),
      minutes: Math.max(5, int(p.minutes, 20)),
      solution: str(p.solution),
      rubric: str(p.rubric),
      pages: arr(p.pages).map((n) => int(n)).filter((n) => n > 0),
    }))
    .filter((p) => p.statement);
  if (!ps.length) throw new Error("No exam problems found in the answer.");
  return ps;
}

export function parseImportance(text: string): AiImportance {
  const o = extractJson(text) as { pages?: unknown; topics?: unknown };
  const tiers: Tier[] = ["core", "important", "optional", "skip"];
  const pages = arr(o.pages)
    .map((x) => x as Record<string, unknown>)
    .map((p) => ({ page: int(p.page), tier: (tiers.includes(str(p.tier) as Tier) ? str(p.tier) : "important") as Tier, reason: str(p.reason) }))
    .filter((p) => p.page > 0);
  const topics = arr(o.topics)
    .map((x) => x as Record<string, unknown>)
    .map((t) => ({
      title: str(t.title),
      importance: (["core", "important", "optional"].includes(str(t.importance)) ? str(t.importance) : "important") as "core" | "important" | "optional",
      pages: arr(t.pages).map((n) => int(n)).filter((n) => n > 0),
      why: str(t.why),
      keyPoints: arr(t.keyPoints).map(str).filter(Boolean),
    }))
    .filter((t) => t.title);
  if (!pages.length && !topics.length) throw new Error("No page ratings found in the answer.");
  return { pages, topics };
}

export function parseGrade(text: string, points: number): Grade {
  const o = extractJson(text) as Record<string, unknown>;
  const score = typeof o.score === "number" ? o.score : parseFloat(str(o.score));
  if (!isFinite(score)) throw new Error("No score found in the answer.");
  const verdict = (["correct", "partial", "wrong", "empty"].includes(str(o.verdict)) ? str(o.verdict) : score >= points ? "correct" : score > 0 ? "partial" : "wrong") as Grade["verdict"];
  return { score: Math.max(0, Math.min(points, score)), maxScore: points, verdict, feedback: str(o.feedback) };
}

/** "Score: 7/10" at the end of a free-text check. */
export function parseScore10(text: string): number | null {
  const m = text.match(/Score:\s*([\d.,]+)\s*\/\s*10/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function openClaude() {
  window.open(CLAUDE_URL, "_blank", "noopener");
}
