// All data the app stores. Every record is encrypted before it touches the disk.

export type MaterialKind = "lecture" | "exercise" | "solution" | "exam" | "notes" | "other";

/** How important a page / topic is for the exam. */
export type Tier = "core" | "important" | "optional" | "skip";

export interface Topic {
  id: string;
  title: string;
  importance: Exclude<Tier, "skip">;
  pages: number[]; // 1-based page numbers in the material
  why: string;
  keyPoints: string[];
  mastered?: boolean;
}

/** What the app thinks is important in a material (auto heuristics and/or AI). */
export interface Insight {
  id: string; // = material id
  /** 0..1 importance score per page (index 0 = page 1). */
  scores: number[];
  tiers: Tier[];
  /** Short machine reason per page, e.g. "definition · in exercises". */
  reasons: string[];
  /** Your own overrides – always win over the automatic rating. */
  overrides: Record<number, Tier>;
  topics: Topic[];
  source: "auto" | "ai";
  updatedAt: number;
}

export interface Course {
  id: string;
  name: string;
  color: string;
  emoji: string;
  examDate?: string; // YYYY-MM-DD
  createdAt: number;
  archived?: boolean;
}

export interface Material {
  id: string;
  courseId: string;
  title: string;
  kind: MaterialKind;
  fileName: string;
  mimeType: string;
  size: number;
  blobId: string;
  /** Number of pages (PDF) / slides (PPTX) / sections. */
  pageCount: number;
  /** "pdf" | "image" | "text" | "slides" | "doc" | "binary" – how the viewer shows it. */
  view: ViewKind;
  createdAt: number;
  lastOpenedAt?: number;
  lastPage?: number;
  studied?: boolean;
  /** For exercise sheets: optional link to the matching solution file. */
  solutionId?: string;
  /** Optional ordering number (Lecture 3, Sheet 5 …). */
  number?: number;
  /** Pages you have actually looked at (1-based). */
  seenPages?: number[];
}

export type ViewKind = "pdf" | "image" | "text" | "slides" | "doc" | "binary";

/** Extracted plain text per page – used for search and the AI tutor. */
export interface MaterialText {
  id: string; // same as material id
  pages: string[];
}

export interface Note {
  id: string;
  courseId: string;
  materialId?: string;
  page?: number;
  title: string;
  body: string; // markdown
  createdAt: number;
  updatedAt: number;
}

export type SrsPhase = "new" | "learning" | "review" | "relearning";

export interface SrsState {
  phase: SrsPhase;
  due: number; // epoch ms
  interval: number; // days
  ease: number;
  reps: number;
  lapses: number;
  step: number;
  lastReview?: number;
}

export interface Card {
  id: string;
  courseId: string;
  materialId?: string;
  page?: number;
  front: string; // markdown + math
  back: string;
  tags: string[];
  createdAt: number;
  suspended?: boolean;
  srs: SrsState;
}

export type TaskStatus = "todo" | "attempted" | "review" | "solved";

export interface Task {
  id: string;
  courseId: string;
  materialId?: string; // exercise sheet
  page?: number;
  title: string; // e.g. "1a"
  description: string;
  status: TaskStatus;
  confidence: number; // 0..5 (0 = not rated)
  solution: string; // your own solution / notes (markdown)
  attempts: number;
  lastPracticed?: number;
  createdAt: number;
  order: number;
}

/**
 * single    – exactly one correct option
 * multi     – "select all that apply" (0…n correct), all-or-nothing
 * truefalse – decide true/false for every statement (ETH style, negative marking)
 */
export type QuizType = "single" | "multi" | "truefalse";

export interface QuizQuestion {
  id: string;
  courseId: string;
  materialId?: string;
  page?: number;
  type: QuizType;
  question: string;
  options: string[];
  /** Indices of the correct options (for truefalse: the TRUE statements). */
  correct: number[];
  explanation: string;
  createdAt: number;
  seen: number;
  right: number;
  lastWrong?: number;
}

/** One record per day for streaks, heatmap and statistics. */
export interface Activity {
  id: string; // YYYY-MM-DD
  reviews: number;
  newCards: number;
  minutes: number;
  quizAnswered: number;
  quizCorrect: number;
  tasksSolved: number;
  perCourseMinutes: Record<string, number>;
}

export interface ProblemAttempt {
  at: number;
  answer: string;
  imageCount: number;
  score: number;
  maxScore: number;
  feedback: string;
  minutes: number;
}

/** An exam-style problem (written by the AI or by you) that is graded strictly. */
export interface Problem {
  id: string;
  courseId: string;
  materialId?: string;
  pages: number[];
  title: string;
  statement: string; // markdown + LaTeX
  points: number;
  minutes: number; // suggested time
  /** Hidden until you finish: model solution & grading rubric. */
  solution: string;
  rubric: string;
  createdAt: number;
  attempts: ProblemAttempt[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
}

export interface ChatThread {
  id: string;
  courseId: string;
  materialId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type AiModel = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";

export interface Settings {
  id: "settings";
  name: string;
  theme: "system" | "light" | "dark";
  newCardsPerDay: number;
  autoLockMinutes: number; // 0 = never
  pomodoroMinutes: number;
  breakMinutes: number;
  apiKey: string;
  aiModel: AiModel;
  aiLanguage: "auto" | "English" | "German";
  aiEnabled: boolean;
  /** How hard questions are and how strictly answers are graded. */
  examLevel: "eth" | "standard";
  /** Type your answer before a flashcard is revealed. */
  typeAnswers: boolean;
  /** ETH-style negative marking for true/false questions. */
  negativeMarking: boolean;
  /** Lecture you worked on last. */
  lastCourseId?: string;
}

export interface Collections {
  course: Course;
  material: Material;
  text: MaterialText;
  insight: Insight;
  note: Note;
  card: Card;
  task: Task;
  quiz: QuizQuestion;
  problem: Problem;
  activity: Activity;
  chat: ChatThread;
  settings: Settings;
}

export type CollectionName = keyof Collections;

export const COLLECTIONS: CollectionName[] = [
  "course",
  "material",
  "text",
  "insight",
  "note",
  "card",
  "task",
  "quiz",
  "problem",
  "activity",
  "chat",
  "settings",
];
