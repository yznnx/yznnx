// "Study now": turns everything the app knows into a short, ranked to-do list
// for today – what matters most for your exams comes first, with the reason.
import { all, get, settings, today } from "./store";
import { cardStrength, countDue, setNewCardPriority } from "./srs";
import { TIER_VALUE, firstLine, tierOf, STUDY_KINDS } from "./importance";
import type { Course, Material, Tier } from "./types";
import { daysUntil } from "./util";

export type PlanKind = "review" | "weak" | "study" | "exercise" | "quiz" | "cards";

export interface PlanItem {
  id: string;
  kind: PlanKind;
  courseId?: string;
  title: string;
  reason: string;
  minutes: number;
  score: number;
  href: string;
}

/** How urgent a course is: exams coming up soon push it to the top. */
export function urgency(course: Course | undefined, now = Date.now()): { factor: number; label: string; days?: number } {
  if (!course?.examDate) return { factor: 0.8, label: "" };
  const d = daysUntil(course.examDate, now);
  if (d < 0) return { factor: 0.3, label: "exam is over" };
  if (d === 0) return { factor: 2, label: "exam today", days: d };
  if (d <= 3) return { factor: 1.9, label: `exam in ${d} day${d === 1 ? "" : "s"}`, days: d };
  if (d <= 14) return { factor: 1.6, label: `exam in ${d} days`, days: d };
  if (d <= 30) return { factor: 1.3, label: `exam in ${d} days`, days: d };
  if (d <= 60) return { factor: 1.05, label: `exam in ${Math.round(d / 7)} weeks`, days: d };
  return { factor: 0.9, label: "", days: d };
}

function pageRanges(pages: number[]): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j;
  }
  return parts.join(", ");
}

export { pageRanges };

/** Pages of a material that still need studying, most important first. */
export function unseenImportantPages(m: Material, minTier: Tier = "important"): number[] {
  const insight = get("insight", m.id);
  const seen = new Set(m.seenPages ?? []);
  const out: number[] = [];
  for (let p = 1; p <= m.pageCount; p++) {
    if (seen.has(p)) continue;
    const t = tierOf(insight, p) ?? "important";
    if (TIER_VALUE[t] >= TIER_VALUE[minTier]) out.push(p);
  }
  return out;
}

export function buildPlan(courseId?: string, now = Date.now()): PlanItem[] {
  const s = settings();
  const courses = all("course").filter((c) => !c.archived && (!courseId || c.id === courseId));
  const courseIds = new Set(courses.map((c) => c.id));
  const items: PlanItem[] = [];
  const t = today();
  const newLeft = Math.max(0, s.newCardsPerDay - t.newCards);

  // Make new cards from important pages come first in reviews.
  const prio = new Map<string, number>();
  for (const c of all("card")) {
    const tier = c.materialId && c.page ? tierOf(get("insight", c.materialId), c.page) : undefined;
    prio.set(c.id, tier ? TIER_VALUE[tier] / 3 : 0.5);
  }
  setNewCardPriority(prio);

  for (const course of courses) {
    const u = urgency(course, now);
    const exam = u.label ? ` · ${u.label}` : "";
    const cards = all("card").filter((c) => c.courseId === course.id);
    const materials = all("material").filter((m) => m.courseId === course.id);

    // 1. Spaced repetition – always the best use of the first minutes.
    const due = countDue(cards, newLeft, now);
    if (due.total > 0) {
      items.push({
        id: `review-${course.id}`,
        kind: "review",
        courseId: course.id,
        title: `Review ${due.due ? `${due.due} due` : ""}${due.due && due.fresh ? " + " : ""}${due.fresh ? `${due.fresh} new` : ""} flashcards`,
        reason: `Spaced repetition – reviewing on time is what makes it stick${exam}`,
        minutes: Math.max(2, Math.round(due.due * 0.25 + due.fresh * 0.6)),
        score: 100 * u.factor + Math.min(30, due.due),
        href: `#/c/${course.id}/review`,
      });
    }

    // 2. Weak spots: cards you keep forgetting, quiz questions you got wrong.
    const weakCards = cards.filter((c) => !c.suspended && c.srs.phase !== "new" && (c.srs.lapses >= 2 || cardStrength(c) < 0.25));
    const wrongQuiz = all("quiz").filter((q) => q.courseId === course.id && q.seen > 0 && q.right / q.seen < 0.6);
    if (weakCards.length >= 3 || wrongQuiz.length >= 2) {
      const parts = [];
      if (weakCards.length) parts.push(`${weakCards.length} hard cards`);
      if (wrongQuiz.length) parts.push(`${wrongQuiz.length} missed quiz questions`);
      items.push({
        id: `weak-${course.id}`,
        kind: "weak",
        courseId: course.id,
        title: `Fix weak spots: ${parts.join(" & ")}`,
        reason: `You got these wrong before – they are the most likely gaps${exam}`,
        minutes: Math.max(5, Math.round(weakCards.length * 0.5 + wrongQuiz.length * 0.7)),
        score: 70 * u.factor + weakCards.length + wrongQuiz.length * 2,
        href: wrongQuiz.length >= weakCards.length / 2 ? `#/c/${course.id}/quiz?mode=weak` : `#/c/${course.id}/review?mode=weak`,
      });
    }

    // 3. Exercises – solve what's open, redo what you marked for review.
    const tasks = all("task").filter((x) => x.courseId === course.id);
    const reviewTasks = tasks.filter((x) => x.status === "review" || (x.status === "solved" && x.confidence > 0 && x.confidence <= 2));
    const openTasks = tasks.filter((x) => x.status === "todo" || x.status === "attempted");
    if (reviewTasks.length) {
      items.push({
        id: `ex-review-${course.id}`,
        kind: "exercise",
        courseId: course.id,
        title: `Redo ${reviewTasks.length} exercise${reviewTasks.length === 1 ? "" : "s"} you marked as shaky`,
        reason: `Exercises are the closest thing to the exam${exam}`,
        minutes: Math.min(90, reviewTasks.length * 15),
        score: 75 * u.factor + reviewTasks.length * 2,
        href: `#/c/${course.id}/exercises?practice=1`,
      });
    }
    if (openTasks.length) {
      const first = openTasks.sort((a, b) => a.order - b.order)[0];
      const sheet = first.materialId ? get("material", first.materialId) : undefined;
      items.push({
        id: `ex-open-${course.id}`,
        kind: "exercise",
        courseId: course.id,
        title: `Solve ${openTasks.length} open exercise${openTasks.length === 1 ? "" : "s"}${sheet ? ` – start with ${sheet.title} ${first.title}` : ""}`,
        reason: `Not solved yet${exam}`,
        minutes: Math.min(120, openTasks.length * 15),
        score: 60 * u.factor + Math.min(20, openTasks.length),
        href: `#/c/${course.id}/exercises`,
      });
    }

    // 4. Study the most important unseen pages of each lecture.
    const examClose = (u.days ?? 99) <= 14;
    for (const m of materials.filter((x) => STUDY_KINDS.has(x.kind))) {
      const insight = get("insight", m.id);
      const corePages = unseenImportantPages(m, "core");
      const impPages = examClose ? [] : unseenImportantPages(m, "important").filter((p) => !corePages.includes(p));
      const pages = corePages.length ? corePages : impPages;
      if (!pages.length) continue;
      const pick = pages.slice(0, 12);
      const text = get("text", m.id);
      const topic = insight?.topics.find((tp) => tp.pages.includes(pick[0]))?.title || (text ? firstLine(text.pages[pick[0] - 1] ?? "") : "");
      const why = insight?.reasons[pick[0] - 1];
      const tierLabel = corePages.length ? "Core pages" : "Important pages";
      const age = m.number ?? 0;
      items.push({
        id: `study-${m.id}`,
        kind: "study",
        courseId: course.id,
        title: `${m.title}: ${tierLabel.toLowerCase()} ${pageRanges(pick)}${topic ? ` – ${topic}` : ""}`,
        reason: `${tierLabel} you haven't studied yet${why ? ` (${why})` : ""}${exam}`,
        minutes: Math.max(5, pick.length * 2),
        score: (corePages.length ? 65 : 40) * u.factor + Math.min(10, corePages.length) - age * 0.01,
        href: `#/m/${m.id}?page=${pick[0]}&focus=1`,
      });
    }

    // 5. Core pages without flashcards → make some (AI can do it for you).
    for (const m of materials.filter((x) => STUDY_KINDS.has(x.kind))) {
      const insight = get("insight", m.id);
      if (!insight) continue;
      const core = Array.from({ length: m.pageCount }, (_, i) => i + 1).filter((p) => tierOf(insight, p) === "core");
      if (core.length < 3) continue;
      const covered = new Set(cards.filter((c) => c.materialId === m.id && c.page).map((c) => c.page!));
      const missing = core.filter((p) => !covered.has(p));
      if (missing.length / core.length < 0.6) continue;
      const seen = new Set(m.seenPages ?? []);
      if (!missing.some((p) => seen.has(p))) continue; // study first, cards after
      items.push({
        id: `cards-${m.id}`,
        kind: "cards",
        courseId: course.id,
        title: `Make flashcards for the core pages of ${m.title}`,
        reason: `${missing.length} core pages have no flashcards yet – active recall beats re-reading`,
        minutes: 10,
        score: 35 * u.factor,
        href: `#/m/${m.id}?page=${missing[0]}&panel=ai`,
      });
    }

    // 6. Quiz yourself when the exam is getting close.
    const quiz = all("quiz").filter((q) => q.courseId === course.id);
    if (quiz.length >= 5 && (u.days ?? 99) <= 30) {
      items.push({
        id: `quiz-${course.id}`,
        kind: "quiz",
        courseId: course.id,
        title: `Take a practice quiz (${Math.min(10, quiz.length)} questions)`,
        reason: `Test yourself under exam conditions${exam}`,
        minutes: 10,
        score: 45 * u.factor,
        href: `#/c/${course.id}/quiz?start=1`,
      });
    }
  }

  // Unknown importance for materials without extracted text.
  for (const m of all("material").filter((x) => courseIds.has(x.courseId) && STUDY_KINDS.has(x.kind) && x.view === "image" && !(x.seenPages ?? []).length)) {
    items.push({
      id: `img-${m.id}`,
      kind: "study",
      courseId: m.courseId,
      title: `Look at ${m.title}`,
      reason: "Not studied yet",
      minutes: 3,
      score: 20,
      href: `#/m/${m.id}`,
    });
  }

  return items.sort((a, b) => b.score - a.score);
}
