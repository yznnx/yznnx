import type { QuizQuestion } from "./types";

export interface Answer {
  picked: number[]; // single/multi: chosen indices
  tf: (boolean | null)[]; // truefalse: per statement
}

/** Strict scoring. Returns 0..1 and whether it was fully correct. */
export function scoreAnswer(q: QuizQuestion, a: Answer, negative: boolean): { score: number; correct: boolean } {
  if (q.type === "truefalse") {
    let pts = 0;
    let allRight = true;
    q.options.forEach((_, i) => {
      const truth = q.correct.includes(i);
      const ans = a.tf[i];
      if (ans === null || ans === undefined) {
        allRight = false;
        return;
      }
      if (ans === truth) pts += 1;
      else {
        allRight = false;
        if (negative) pts -= 1;
      }
    });
    return { score: Math.max(0, pts) / q.options.length, correct: allRight };
  }
  const want = [...q.correct].sort().join(",");
  const got = [...a.picked].sort().join(",");
  return { score: want === got ? 1 : 0, correct: want === got };
}
