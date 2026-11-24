import { describe, expect, it } from "vitest";
import { countDue, newSrs, pickNext, schedule } from "../src/lib/srs";
import type { Card, SrsState } from "../src/lib/types";

const DAY = 86_400_000;
const now = new Date(2026, 10, 19, 12, 0).getTime();
const card = (id: string, srs = newSrs(now)): Card => ({ id, courseId: "c", front: "q", back: "a", tags: [], createdAt: now, srs });

describe("spaced repetition", () => {
  it("walks a new card through the learning steps and graduates it", () => {
    let s = newSrs(now);
    s = schedule(s, 3, now);
    expect(s.phase).toBe("learning");
    expect(s.due - now).toBe(10 * 60_000);
    s = schedule(s, 3, s.due);
    expect(s.phase).toBe("review");
    expect(s.interval).toBe(1);
  });

  it("Easy on a new card skips learning", () => {
    const s = schedule(newSrs(now), 4, now);
    expect(s.phase).toBe("review");
    expect(s.interval).toBe(4);
  });

  it("grows intervals with Good and resets with Again", () => {
    let s: SrsState = { ...newSrs(now), phase: "review", interval: 10, ease: 2.5, lastReview: now - 10 * DAY };
    const good = schedule(s, 3, now);
    expect(good.interval).toBe(25);
    const again = schedule(s, 1, now);
    expect(again.phase).toBe("relearning");
    expect(again.lapses).toBe(1);
    expect(again.ease).toBeCloseTo(2.3);
    s = schedule(again, 3, again.due);
    expect(s.phase).toBe("review");
    expect(s.interval).toBe(5);
  });

  it("never lets ease drop below 1.3", () => {
    let s: SrsState = { ...newSrs(now), phase: "review", interval: 3, ease: 1.35, lastReview: now };
    for (let i = 0; i < 5; i++) s = schedule({ ...s, phase: "review" }, 2, now);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("limits new cards per day and prefers due learning cards", () => {
    const cards = [card("n1"), card("n2"), card("n3"), card("l", { ...newSrs(now), phase: "learning", due: now - 1000, step: 1 })];
    expect(countDue(cards, 2, now)).toEqual({ due: 1, fresh: 2, total: 3 });
    expect(pickNext(cards, 2, now)?.id).toBe("l");
    expect(pickNext(cards, 0, now, "l")?.id).toBe("l"); // only one left → shown again
  });
});
