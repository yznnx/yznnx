// Optional AI tutor (Claude). Only used when you add your own Anthropic API key
// in Settings. Then – and only when you press an AI button – the relevant text
// of your material is sent to Anthropic's API. Nothing is sent otherwise.
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { BetaContentBlockParam, BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { all, get, settings } from "./store";
import { loadBlob } from "./vault";
import type { AiModel, Material, QuizType, Tier } from "./types";

export const AI_MODELS: { id: AiModel; label: string; hint: string }[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "Best explanations and cards (recommended)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "Fast and about half the price" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "Fastest and cheapest" },
];

type Effort = "low" | "medium" | "high";

export class AiError extends Error {}

export function aiReady(): boolean {
  const s = settings();
  return s.aiEnabled && s.apiKey.trim().length > 10;
}

function client() {
  const s = settings();
  if (!s.apiKey) throw new AiError("Add your Anthropic API key in Settings first.");
  return new Anthropic({ apiKey: s.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2 });
}

/** Common request options: model, effort and automatic fallback if a request is declined. */
function base(effort: Effort) {
  const model = settings().aiModel;
  // Server-side fallbacks re-run a declined request on another model automatically.
  // Not available for Haiku.
  const fallback = model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  return { model, output_config: { effort }, ...fallback };
}

export function languageRule(): string {
  const l = settings().aiLanguage;
  if (l === "auto") return "Write in the same language as the course material (e.g. German material → German answers).";
  return `Always write in ${l}.`;
}

const TUTOR_STYLE_BASE = `You are a precise university tutor inside a private study app. The student uploaded their own lecture slides, scripts, exercise sheets (Serien) and past exams.
- Ground everything in the provided material. If something is not covered by it, say so briefly before using general knowledge.
- Use Markdown. Write maths in LaTeX with $…$ inline and $$…$$ for display equations.
- Refer to pages as "p. N" so the student can jump there.
- Be concise: short paragraphs, bullet points, worked steps where useful.`;

/** Difficulty / strictness, ETH Zürich level by default. */
function levelRule(): string {
  if (settings().examLevel === "eth") {
    return `Calibrate to ETH Zürich exam level: demanding, rigorous and precise. Prefer questions that require understanding, proofs, derivations, multi-step reasoning, knowing exact assumptions/conditions of theorems, edge cases and counterexamples, over plain recall. Never accept vague, hand-wavy or incomplete reasoning; correct notation and justification of every step matter.`;
  }
  return `Calibrate to a typical university exam: test understanding as well as recall.`;
}

export function tutorStyle() {
  return `${TUTOR_STYLE_BASE}\n- ${levelRule()}`;
}

export function friendlyError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key is not allowed to use this model.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limit reached – wait a minute and try again.";
  if (e instanceof Anthropic.BadRequestError) return `The request was rejected: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API. Are you online?";
  if (e instanceof Anthropic.APIUserAbortError) return "Stopped.";
  if (e instanceof Anthropic.APIError) return `API error ${e.status ?? ""}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

function checkStop(reason: string | null) {
  if (reason === "refusal") throw new AiError("The AI declined this request.");
  if (reason === "max_tokens") throw new AiError("The answer got too long and was cut off – try fewer items or a smaller page range.");
}

// ---------- building the material context ----------

export interface Scope {
  material: Material;
  /** 1-based pages; undefined = whole file. */
  pages?: number[];
  /** Send slides as images / the PDF itself (better for formulas & diagrams, costs more). */
  visual?: boolean;
}

export function textOfPages(materialId: string, pages?: number[]): string {
  const t = get("text", materialId);
  if (!t) return "";
  const list = pages ?? t.pages.map((_, i) => i + 1);
  return list
    .filter((p) => p >= 1 && p <= t.pages.length)
    .map((p) => `--- p. ${p} ---\n${t.pages[p - 1]}`)
    .join("\n\n");
}

/** True if the text layer is (nearly) empty, e.g. a scanned PDF. */
export function needsVisual(materialId: string, pages?: number[]): boolean {
  const t = get("text", materialId);
  if (!t) return true;
  const list = pages ?? t.pages.map((_, i) => i + 1);
  const chars = list.reduce((n, p) => n + (t.pages[p - 1]?.trim().length ?? 0), 0);
  return chars < 40 * list.length;
}

async function materialBlocks(scope: Scope): Promise<BetaContentBlockParam[]> {
  const m = scope.material;
  const label = `${kindLabel(m.kind)} "${m.title}" (${m.fileName})`;
  const visual = scope.visual || needsVisual(m.id, scope.pages);

  if (visual && m.view === "pdf") {
    const data = await loadBlob(m.blobId);
    if (data) {
      const whole = !scope.pages || scope.pages.length > 20;
      if (whole && data.byteLength < 25 * 1024 * 1024) {
        const blocks: BetaContentBlockParam[] = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: bufToB64(data) }, title: label },
        ];
        if (scope.pages) blocks.push({ type: "text", text: `Focus on pages ${scope.pages.join(", ")}.` });
        return blocks;
      }
      const { openPdf, renderPageImage } = await import("./pdf");
      const pdf = await openPdf(data);
      try {
        const blocks: BetaContentBlockParam[] = [{ type: "text", text: `${label}, pages as images with their extracted text:` }];
        for (const p of (scope.pages ?? []).slice(0, 20)) {
          const img = await renderPageImage(pdf.doc, p);
          blocks.push({ type: "text", text: `--- p. ${p} ---\n${get("text", m.id)?.pages[p - 1] ?? ""}` });
          blocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
        }
        return blocks;
      } finally {
        pdf.destroy();
      }
    }
  }
  if (m.view === "image") {
    const data = await loadBlob(m.blobId);
    const mt = (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(m.mimeType) ? m.mimeType : "image/png") as "image/png";
    if (data) return [{ type: "text", text: label }, { type: "image", source: { type: "base64", media_type: mt, data: bufToB64(data) } }];
  }
  return [{ type: "text", text: `<material title="${label}">\n${textOfPages(m.id, scope.pages)}\n</material>` }];
}

export function kindLabel(kind: Material["kind"]) {
  return { lecture: "Lecture", exercise: "Exercise sheet", solution: "Solution", exam: "Past exam", notes: "Notes", other: "Material" }[kind];
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Text of the course's exercises and past exams – tells the AI what gets tested. */
export function evidenceText(courseId: string, maxChars = 60_000): string {
  const parts: string[] = [];
  for (const m of all("material").filter((x) => x.courseId === courseId && (x.kind === "exam" || x.kind === "exercise"))) {
    const t = get("text", m.id);
    if (!t) continue;
    parts.push(`<${m.kind === "exam" ? "past_exam" : "exercise_sheet"} title="${m.title}">\n${t.pages.join("\n\n")}\n</${m.kind === "exam" ? "past_exam" : "exercise_sheet"}>`);
  }
  let s = parts.join("\n\n");
  if (s.length > maxChars) s = s.slice(0, maxChars) + "\n[… more exercises omitted]";
  return s;
}

// ---------- structured generators ----------

const cardSchema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string", description: "Question / prompt side" },
          back: { type: "string", description: "Answer side, precise and complete but short" },
          page: { type: "integer", description: "Page number the card is based on" },
        },
        required: ["front", "back", "page"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
} as const;

export interface GeneratedCard {
  front: string;
  back: string;
  page: number;
}

export interface CardOpts {
  count: number;
  focus: "important" | "all";
  importantPages?: number[];
}

/** Instructions shared by the API tutor and the copy & paste bridge. */
export function cardPrompt(opts: CardOpts) {
  const focus =
    opts.focus === "important" && opts.importantPages?.length
      ? `Concentrate on what is most exam-relevant – especially pages ${opts.importantPages.join(", ")} (rated core/important). Skip organisational content, agendas and trivia.`
      : "Cover the key ideas evenly. Skip organisational content and trivia.";
  const eth =
    settings().examLevel === "eth"
      ? `Make them hard in the ETH sense: exact statements of definitions and theorems including ALL assumptions, "why does X fail without assumption Y?", key proof ideas, derivation steps, counterexamples, how to recognise which method applies, and common traps. Avoid trivial cards.`
      : "";
  return {
    system: `${tutorStyle()}\nYou write excellent spaced-repetition flashcards: one idea per card, precise question, short but complete answer (a few lines or a formula with the meaning of each symbol). No true/false cards. ${eth} ${languageRule()}`,
    ask: `Create about ${opts.count} flashcards from this material. ${focus} Set "page" to the page each card comes from.`,
  };
}

export async function generateCards(scope: Scope, opts: CardOpts): Promise<GeneratedCard[]> {
  const pr = cardPrompt(opts);
  const res = await client()
    .beta.messages.stream({
    ...base("medium"),
    max_tokens: 64000,
    system: pr.system,
    messages: [
      {
        role: "user",
        content: [...(await materialBlocks(scope)), { type: "text", text: pr.ask }],
      },
    ],
    output_config: { ...base("medium").output_config, format: betaJSONSchemaOutputFormat(cardSchema) },
  })
    .finalMessage();
  checkStop(res.stop_reason);
  return (res.parsed_output?.cards ?? []) as GeneratedCard[];
}

const quizSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["single", "multi", "truefalse"],
            description: "single = exactly one correct; multi = select all that apply (any number correct); truefalse = each option is a statement to judge true or false",
          },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, description: "3–6 options or statements" },
          correct: { type: "array", items: { type: "integer" }, description: "0-based indices of correct options (for truefalse: the TRUE statements; may be empty)" },
          explanation: { type: "string", description: "Why each option is right or wrong" },
          page: { type: "integer" },
        },
        required: ["type", "question", "options", "correct", "explanation", "page"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

export interface GeneratedQuestion {
  type: QuizType;
  question: string;
  options: string[];
  correct: number[];
  explanation: string;
  page: number;
}

export function quizPrompt(courseId: string, opts: { count: number; importantPages?: number[] }) {
  const evidence = evidenceText(courseId, 20_000);
  const eth =
    settings().examLevel === "eth"
      ? `Mix the formats like an ETH exam: mostly "truefalse" blocks (4–5 subtle statements each, e.g. about assumptions, limits of theorems, edge cases) and "multi" (select all that apply), some "single". Distractors must be subtle and based on typical misconceptions; statements should require careful reasoning or a short calculation.`
      : `Mostly "single" choice with some "multi" questions. Distractors must be plausible (typical mistakes).`;
  return {
    system: `${tutorStyle()}\nYou write exam-style multiple-choice questions that test understanding, not just recall. ${eth} ${languageRule()}`,
    extra: evidence ? `For calibration, this is how the course tests students:\n${evidence}` : "",
    ask: `Write ${opts.count} questions about the material.${opts.importantPages?.length ? ` Prioritise pages ${opts.importantPages.join(", ")}.` : ""} Vary which options are correct.`,
  };
}

/** Removes invalid indices and questions that can't be scored. */
export function normalizeQuestions(qs: GeneratedQuestion[]): GeneratedQuestion[] {
  return qs
    .map((q) => ({ ...q, correct: Array.from(new Set(q.correct.filter((i) => i >= 0 && i < q.options.length))).sort() }))
    .filter((q) => q.options.length >= 2 && (q.type !== "single" || q.correct.length === 1));
}

export async function generateQuiz(scope: Scope, opts: { count: number; importantPages?: number[] }): Promise<GeneratedQuestion[]> {
  const pr = quizPrompt(scope.material.courseId, opts);
  const res = await client()
    .beta.messages.stream({
    ...base("medium"),
    max_tokens: 64000,
    system: pr.system,
    messages: [
      {
        role: "user",
        content: [
          ...(await materialBlocks(scope)),
          ...(pr.extra ? [{ type: "text" as const, text: pr.extra }] : []),
          { type: "text", text: pr.ask },
        ],
      },
    ],
    output_config: { ...base("medium").output_config, format: betaJSONSchemaOutputFormat(quizSchema) },
  })
    .finalMessage();
  checkStop(res.stop_reason);
  return normalizeQuestions((res.parsed_output?.questions ?? []) as GeneratedQuestion[]);
}

const problemSchema = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short topic name" },
          statement: { type: "string", description: "Full problem statement in Markdown/LaTeX, with sub-parts (a), (b)… and points per part" },
          points: { type: "integer" },
          minutes: { type: "integer", description: "Realistic time needed under exam conditions" },
          solution: { type: "string", description: "Complete model solution with all steps" },
          rubric: { type: "string", description: "Strict grading scheme: what earns each point, typical deductions" },
          pages: { type: "array", items: { type: "integer" } },
        },
        required: ["title", "statement", "points", "minutes", "solution", "rubric", "pages"],
        additionalProperties: false,
      },
    },
  },
  required: ["problems"],
  additionalProperties: false,
} as const;

export interface GeneratedProblem {
  title: string;
  statement: string;
  points: number;
  minutes: number;
  solution: string;
  rubric: string;
  pages: number[];
}

/** Exam problems in the style of the course's past exams. */
export function problemPrompt(courseId: string, opts: { count: number; importantPages?: number[] }) {
  const evidence = evidenceText(courseId, 50_000);
  return {
    system: `${tutorStyle()}\nYou are an examiner writing a written exam. Problems are self-contained, unambiguous and solvable with the course content in the stated time. Include proofs, derivations, computations and "show that"/"decide and justify" parts. Each problem has sub-parts with points. ${languageRule()}`,
    extra: evidence ? `Exercises and past exams of this course – match their style and difficulty:\n${evidence}` : "",
    ask: `Write ${opts.count} exam problem(s) about this material.${opts.importantPages?.length ? ` Focus on the core pages ${opts.importantPages.join(", ")}.` : ""} Give a complete model solution and a strict rubric for each.`,
  };
}

export async function generateProblems(scope: Scope, opts: { count: number; importantPages?: number[] }): Promise<GeneratedProblem[]> {
  const pr = problemPrompt(scope.material.courseId, opts);
  const res = await client()
    .beta.messages.stream({
    ...base("high"),
    max_tokens: 64000,
    system: pr.system,
    messages: [
      {
        role: "user",
        content: [
          ...(await materialBlocks(scope)),
          ...(pr.extra ? [{ type: "text" as const, text: pr.extra }] : []),
          { type: "text", text: pr.ask },
        ],
      },
    ],
    output_config: { ...base("high").output_config, format: betaJSONSchemaOutputFormat(problemSchema) },
  })
    .finalMessage();
  checkStop(res.stop_reason);
  return (res.parsed_output?.problems ?? []) as GeneratedProblem[];
}

const gradeSchema = {
  type: "object",
  properties: {
    score: { type: "number", description: "Points awarded (may be fractional, e.g. 2.5)" },
    maxScore: { type: "number" },
    verdict: { type: "string", enum: ["correct", "partial", "wrong", "empty"] },
    feedback: {
      type: "string",
      description: "Markdown: per sub-part points awarded and why, the first wrong/missing step, notation/justification issues, and what a full-marks answer needed",
    },
  },
  required: ["score", "maxScore", "verdict", "feedback"],
  additionalProperties: false,
} as const;

export interface Grade {
  score: number;
  maxScore: number;
  verdict: "correct" | "partial" | "wrong" | "empty";
  feedback: string;
}

type ImageInput = { data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

type GradableProblem = { statement: string; points: number; solution: string; rubric: string };

export function gradePrompt(problem: GradableProblem, answer: string, hasImages: boolean) {
  return {
    system: `${tutorStyle()}\nYou are an exam corrector. Be exact and consistent with the rubric. ${languageRule()}`,
    parts: [
      `<problem points="${problem.points}">\n${problem.statement}\n</problem>`,
      `<model_solution>\n${problem.solution}\n</model_solution>\n<rubric>\n${problem.rubric}\n</rubric>`,
      `<student_answer>\n${answer || "(see images)"}\n</student_answer>`,
    ],
    ask: `Grade the student answer${hasImages ? " (including the handwritten pages in the images)" : ""} out of ${problem.points} points.${settings().examLevel === "eth" ? " Grade like a strict ETH corrector: points only for steps that are correct AND justified; a correct final result with wrong or missing reasoning earns little; missing assumptions, sign errors and imprecise notation cost points. Never round up out of kindness." : " Grade fairly and consistently with the rubric."}`,
  };
}

/** Grades your answer to an exam problem strictly against the rubric. */
export async function gradeProblem(problem: GradableProblem, attempt: { text: string; images: ImageInput[] }): Promise<Grade> {
  const pr = gradePrompt(problem, attempt.text, attempt.images.length > 0);
  const content: BetaContentBlockParam[] = pr.parts.map((text) => ({ type: "text" as const, text }));
  for (const img of attempt.images) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  content.push({ type: "text", text: pr.ask });
  const res = await client()
    .beta.messages.stream({
    ...base("high"),
    max_tokens: 64000,
    system: pr.system,
    messages: [{ role: "user", content }],
    output_config: { ...base("high").output_config, format: betaJSONSchemaOutputFormat(gradeSchema) },
  })
    .finalMessage();
  checkStop(res.stop_reason);
  const g = res.parsed_output as Grade | null;
  if (!g) throw new AiError("The AI returned an unexpected answer. Try again.");
  return { ...g, maxScore: problem.points, score: Math.max(0, Math.min(problem.points, g.score)) };
}

const importanceSchema = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page: { type: "integer" },
          tier: { type: "string", enum: ["core", "important", "optional", "skip"] },
          reason: { type: "string", description: "max ~8 words" },
        },
        required: ["page", "tier", "reason"],
        additionalProperties: false,
      },
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          importance: { type: "string", enum: ["core", "important", "optional"] },
          pages: { type: "array", items: { type: "integer" } },
          why: { type: "string", description: "One sentence: why this matters for the exam" },
          keyPoints: { type: "array", items: { type: "string" }, description: "2-5 things to be able to do/explain/prove" },
        },
        required: ["title", "importance", "pages", "why", "keyPoints"],
        additionalProperties: false,
      },
    },
  },
  required: ["pages", "topics"],
  additionalProperties: false,
} as const;

export interface AiImportance {
  pages: { page: number; tier: Tier; reason: string }[];
  topics: { title: string; importance: "core" | "important" | "optional"; pages: number[]; why: string; keyPoints: string[] }[];
}

export function importancePrompt(material: Material) {
  const evidence = evidenceText(material.courseId);
  const course = get("course", material.courseId);
  return {
    system: `${tutorStyle()}\nYou are an expert at exam preparation. You decide what in a lecture is worth studying and what is not, so the student spends time where it pays off. ${languageRule()}`,
    extra: evidence
      ? `Exercises and past exams of the course "${course?.name ?? ""}" (strong evidence of what will be tested):\n${evidence}`
      : `There are no exercise sheets or past exams uploaded yet for "${course?.name ?? ""}" – judge from the lecture itself.`,
    ask: `Rate EVERY page of the lecture (pages 1–${material.pageCount}):
- core = must know for the exam (definitions, central theorems/methods, anything the exercises/exams test)
- important = should know, supports core topics
- optional = background, examples, history, extras
- skip = title/agenda/organisation/references/empty
Then list the key topics of this lecture ordered by importance, each with its pages, why it matters and what the student must be able to do.`,
  };
}

export async function analyzeImportance(material: Material): Promise<AiImportance> {
  const pr = importancePrompt(material);
  const res = await client()
    .beta.messages.stream({
    ...base("medium"),
    max_tokens: 64000,
    system: pr.system,
    messages: [
      {
        role: "user",
        content: [...(await materialBlocks({ material })), { type: "text", text: pr.extra }, { type: "text", text: pr.ask }],
      },
    ],
    output_config: { ...base("medium").output_config, format: betaJSONSchemaOutputFormat(importanceSchema) },
  })
    .finalMessage();
  checkStop(res.stop_reason);
  const out = res.parsed_output as AiImportance | null;
  if (!out) throw new AiError("The AI returned an unexpected answer. Try again.");
  return out;
}

// ---------- streaming: explain, chat, check solution ----------

export interface StreamHandle {
  done: Promise<string>;
  abort: () => void;
}

function streamText(params: { system: string | BetaTextBlockParam[]; messages: BetaMessageParam[]; effort: Effort }, onText: (full: string) => void): StreamHandle {
  let full = "";
  const stream = client().beta.messages.stream({
    ...base(params.effort),
    max_tokens: 32000,
    system: params.system,
    messages: params.messages,
  });
  stream.on("text", (delta) => {
    full += delta;
    onText(full);
  });
  const done = stream.finalMessage().then((msg) => {
    if (msg.stop_reason === "refusal") throw new AiError("The AI declined this request.");
    return full;
  });
  return { done, abort: () => stream.abort() };
}

export async function explainPage(material: Material, page: number, question: string | undefined, onText: (t: string) => void): Promise<StreamHandle> {
  const blocks = await materialBlocks({ material, pages: [page], visual: material.view === "pdf" });
  return streamText(
    {
      system: `${tutorStyle()}\n${languageRule()}`,
      effort: "medium",
      messages: [
        {
          role: "user",
          content: [
            ...blocks,
            {
              type: "text",
              text: question?.trim()
                ? `About p. ${page}: ${question}`
                : `Explain p. ${page} so I really understand it: the core idea in plain words, then the details (define every symbol, state all assumptions), why it is true (proof idea), a small example, and finally "Exam tip:" – what I must be able to do with this and the typical traps.`,
            },
          ],
        },
      ],
    },
    onText,
  );
}

/** Chat with the tutor about one material (or the whole lecture). The material is cached between turns. */
export function chat(courseId: string, material: Material | undefined, history: { role: "user" | "assistant"; content: string }[], onText: (t: string) => void): StreamHandle {
  const course = get("course", courseId);
  let context: string;
  if (material) {
    context = `<material title="${material.title}" kind="${material.kind}">\n${textOfPages(material.id)}\n</material>`;
  } else {
    const parts = all("material")
      .filter((m) => m.courseId === courseId)
      .map((m) => `<material title="${m.title}" kind="${m.kind}">\n${textOfPages(m.id)}\n</material>`);
    context = parts.join("\n\n");
    if (context.length > 600_000) context = context.slice(0, 600_000) + "\n[… truncated – too much material for one chat; open a specific file to chat about it]";
  }
  return streamText(
    {
      system: [
        {
          type: "text",
          text: `${tutorStyle()}\nLecture: ${course?.name ?? ""}. ${languageRule()}\nWhen the student asks to be quizzed, ask one hard question at a time, wait for the answer, then grade it strictly before moving on.`,
        },
        { type: "text", text: context || "(no text material available)", cache_control: { type: "ephemeral" } },
      ],
      effort: "medium",
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    },
    onText,
  );
}

export async function checkSolution(
  task: { title: string; description: string; page?: number },
  sheet: Material | undefined,
  attempt: { text: string; images: ImageInput[] },
  onText: (t: string) => void,
): Promise<StreamHandle> {
  const blocks: BetaContentBlockParam[] = [];
  if (sheet) blocks.push(...(await materialBlocks({ material: sheet, pages: task.page ? [task.page] : undefined, visual: sheet.view === "pdf" && !!task.page })));
  const solution = sheet?.solutionId ? get("material", sheet.solutionId) : undefined;
  if (solution) {
    blocks.push({ type: "text", text: `Official solution (do NOT reveal it directly – use it to judge):\n${textOfPages(solution.id)}` });
  }
  blocks.push({ type: "text", text: `Exercise ${task.title}${task.page ? ` (p. ${task.page})` : ""}${task.description ? `: ${task.description}` : ""}` });
  if (attempt.text.trim()) blocks.push({ type: "text", text: `My solution:\n${attempt.text}` });
  for (const img of attempt.images) blocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  blocks.push({ type: "text", text: checkInstruction() });
  return streamText({ system: `${tutorStyle()}\n${languageRule()}`, effort: "high", messages: [{ role: "user", content: blocks }] }, onText);
}

export function checkInstruction() {
  const strict =
    settings().examLevel === "eth"
      ? "Grade like a strict ETH corrector: every step must be correct AND justified, assumptions must be checked, notation must be precise. A right final answer with gaps in the argument is NOT correct."
      : "Grade like a fair but careful tutor.";
  return `Check my solution. ${strict} Start with a verdict line: "✅ Correct", "🟡 Partly correct" or "❌ Not correct yet". Then point to the exact first step where something goes wrong or is unjustified and give a hint for fixing it – don't give me the full solution unless I'm completely stuck. End with "Score: x/10".`;
}

/** Quick check that the key works. */
export async function testKey(): Promise<string> {
  const res = await client().beta.messages.create({
    ...base("low"),
    max_tokens: 256,
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
  });
  const text = res.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text : "OK";
}

export type { ImageInput };
