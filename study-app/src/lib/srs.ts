// Spaced repetition (Anki-style SM-2). Cards you know well come back rarely,
// cards you struggle with come back often.
import type { Card, SrsState } from "./types";
import { DAY, MINUTE, endOfToday } from "./util";

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export const LEARN_STEPS = [1 * MINUTE, 10 * MINUTE];
export const RELEARN_STEPS = [10 * MINUTE];
const GRADUATING_INTERVAL = 1; // days
const EASY_INTERVAL = 4; // days
const MIN_EASE = 1.3;
const MAX_INTERVAL = 365 * 3;

export function newSrs(now = Date.now()): SrsState {
  return { phase: "new", due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 };
}

function reviewDue(now: number, days: number) {
  // Due at the start of the target day (so it shows up "that day").
  const d = new Date(now + days * DAY);
  d.setHours(4, 0, 0, 0);
  return d.getTime();
}

export function schedule(s: SrsState, rating: Rating, now = Date.now()): SrsState {
  const next: SrsState = { ...s, reps: s.reps + 1, lastReview: now };

  if (s.phase === "new" || s.phase === "learning") {
    const step = s.phase === "new" ? 0 : s.step;
    if (rating === 1) {
      return { ...next, phase: "learning", step: 0, due: now + LEARN_STEPS[0] };
    }
    if (rating === 2) {
      const cur = LEARN_STEPS[step] ?? LEARN_STEPS[LEARN_STEPS.length - 1];
      const nxt = LEARN_STEPS[step + 1] ?? cur * 1.5;
      return { ...next, phase: "learning", step, due: now + (step === 0 ? (cur + nxt) / 2 : cur) };
    }
    if (rating === 4) {
      return { ...next, phase: "review", step: 0, interval: EASY_INTERVAL, due: reviewDue(now, EASY_INTERVAL) };
    }
    // Good
    const nextStep = step + 1;
    if (nextStep >= LEARN_STEPS.length) {
      return { ...next, phase: "review", step: 0, interval: GRADUATING_INTERVAL, due: reviewDue(now, GRADUATING_INTERVAL) };
    }
    return { ...next, phase: "learning", step: nextStep, due: now + LEARN_STEPS[nextStep] };
  }

  if (s.phase === "relearning") {
    if (rating === 1) return { ...next, step: 0, due: now + RELEARN_STEPS[0] };
    if (rating === 2) return { ...next, due: now + RELEARN_STEPS[0] };
    const interval = rating === 4 ? s.interval + 1 : s.interval;
    return { ...next, phase: "review", step: 0, interval, due: reviewDue(now, interval) };
  }

  // review
  const elapsedDays = Math.max(0, (now - (s.lastReview ?? now)) / DAY);
  const base = Math.max(s.interval, Math.min(elapsedDays, s.interval * 2));
  if (rating === 1) {
    const interval = Math.max(1, Math.round(s.interval * 0.5));
    return {
      ...next,
      phase: "relearning",
      step: 0,
      lapses: s.lapses + 1,
      ease: Math.max(MIN_EASE, s.ease - 0.2),
      interval,
      due: now + RELEARN_STEPS[0],
    };
  }
  let interval: number;
  let ease = s.ease;
  if (rating === 2) {
    interval = Math.max(s.interval + 1, base * 1.2);
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (rating === 3) {
    interval = Math.max(s.interval + 1, base * ease);
  } else {
    interval = Math.max(s.interval + 2, base * ease * 1.3);
    ease = ease + 0.15;
  }
  interval = Math.min(MAX_INTERVAL, Math.round(interval));
  return { ...next, phase: "review", ease, interval, due: reviewDue(now, interval) };
}

/** Human-readable preview of the next interval for each button. */
export function previewIntervals(s: SrsState, now = Date.now()): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const n = schedule(s, r, now);
    out[r] = n.phase === "review" ? n.interval : (n.due - now) / DAY;
  }
  return out;
}

export function isDue(c: Card, now = Date.now()): boolean {
  if (c.suspended || c.srs.phase === "new") return false;
  if (c.srs.phase === "review") return c.srs.due <= endOfToday(now);
  return c.srs.due <= now;
}

export function isMature(c: Card) {
  return c.srs.phase === "review" && c.srs.interval >= 21;
}

/** 0..1 how well you know a card (used for "weak spots"). */
export function cardStrength(c: Card): number {
  if (c.srs.phase === "new") return 0;
  const intervalScore = Math.min(1, c.srs.interval / 30);
  const lapsePenalty = Math.min(0.6, c.srs.lapses * 0.15);
  const learningPenalty = c.srs.phase === "learning" || c.srs.phase === "relearning" ? 0.3 : 0;
  return Math.max(0, Math.min(1, 0.2 + intervalScore * 0.8 - lapsePenalty - learningPenalty));
}

export interface ReviewQueueInfo {
  dueReview: Card[];
  dueLearning: Card[];
  newCards: Card[];
}

/**
 * Picks the next card to show. Learning cards that are due come first, then
 * reviews, then new cards (limited per day), then learning cards that will be
 * due within the next 20 minutes.
 */
export function pickNext(cards: Card[], newLeft: number, now = Date.now(), avoidId?: string): Card | null {
  const active = cards.filter((c) => !c.suspended);
  const learningDue = active
    .filter((c) => (c.srs.phase === "learning" || c.srs.phase === "relearning") && c.srs.due <= now)
    .sort((a, b) => a.srs.due - b.srs.due);
  const reviewDueCards = active.filter((c) => c.srs.phase === "review" && c.srs.due <= endOfToday(now)).sort((a, b) => a.srs.due - b.srs.due);
  const fresh = newLeft > 0 ? active.filter((c) => c.srs.phase === "new").sort((a, b) => priorityOfNew(b) - priorityOfNew(a) || a.createdAt - b.createdAt) : [];
  const ahead = active
    .filter((c) => (c.srs.phase === "learning" || c.srs.phase === "relearning") && c.srs.due > now && c.srs.due <= now + 20 * MINUTE)
    .sort((a, b) => a.srs.due - b.srs.due);
  const lists = [learningDue, reviewDueCards, fresh, ahead];
  for (const list of lists) {
    const pick = list.find((c) => c.id !== avoidId);
    if (pick) return pick;
  }
  // Only the card we just saw is left – show it again.
  for (const list of lists) if (list.length) return list[0];
  return null;
}

// New cards from more important pages are introduced first (set by the planner).
const newPriority = new Map<string, number>();
export function setNewCardPriority(map: Map<string, number>) {
  newPriority.clear();
  for (const [k, v] of map) newPriority.set(k, v);
}
function priorityOfNew(c: Card) {
  return newPriority.get(c.id) ?? 0.5;
}

export function countDue(cards: Card[], newLeft: number, now = Date.now()) {
  const active = cards.filter((c) => !c.suspended);
  const due = active.filter((c) => isDue(c, now)).length;
  const fresh = Math.min(newLeft, active.filter((c) => c.srs.phase === "new").length);
  return { due, fresh, total: due + fresh };
}
