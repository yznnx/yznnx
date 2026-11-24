import { describe, expect, it } from "vitest";
import { extractJson, parseCards, parseGrade, parseImportance, parseProblems, parseQuiz, parseScore10, repairLatexEscapes } from "../src/lib/bridge";

describe("reading Claude's pasted answer", () => {
  it("finds the JSON inside a fenced block with chatter around it", () => {
    const text = 'Here you go!\n\n```json\n{"cards": [{"front": "Q?", "back": "A", "page": 3}]}\n```\nGood luck!';
    expect(parseCards(text)).toEqual([{ front: "Q?", back: "A", page: 3 }]);
  });

  it("repairs unescaped LaTeX backslashes (\\frac would become a form feed)", () => {
    const raw = String.raw`{"cards": [{"front": "Define $\frac{a}{b}$ and $\alpha$", "back": "$\nabla f$, $\theta$, $\to$", "page": 1}]}`;
    const [c] = parseCards(raw);
    expect(c.front).toBe(String.raw`Define $\frac{a}{b}$ and $\alpha$`);
    expect(c.back).toBe(String.raw`$\nabla f$, $\theta$, $\to$`);
  });

  it("keeps correctly escaped JSON and real newlines untouched", () => {
    const ok = String.raw`{"x": "line1\nline2 $\\frac{1}{2}$"}`;
    expect(extractJson(ok)).toEqual({ x: "line1\nline2 $\\frac{1}{2}$" });
    expect(repairLatexEscapes(String.raw`"\\frac"`)).toBe(String.raw`"\\frac"`);
  });

  it("normalises quiz questions and drops broken ones", () => {
    const qs = parseQuiz(
      JSON.stringify({
        questions: [
          { type: "truefalse", question: "Decide", options: ["a", "b", "c"], correct: [2, 0, 7], explanation: "", page: 2 },
          { type: "single", question: "bad", options: ["x", "y"], correct: [0, 1], explanation: "", page: 1 },
          { type: "weird", question: "Q", options: ["x", "y"], correct: 1, explanation: "e", page: "3" },
        ],
      }),
    );
    expect(qs).toHaveLength(2);
    expect(qs[0].correct).toEqual([0, 2]);
    expect(qs[1]).toMatchObject({ type: "single", correct: [1], page: 3 });
  });

  it("parses problems, page ratings and grades", () => {
    expect(parseProblems('{"problems":[{"title":"T","statement":"Prove X","points":8,"minutes":15,"solution":"S","rubric":"R","pages":[2]}]}')[0]).toMatchObject({ points: 8, pages: [2] });
    const imp = parseImportance('{"pages":[{"page":1,"tier":"skip","reason":"title"},{"page":2,"tier":"core","reason":"def"}],"topics":[{"title":"Limits","importance":"core","pages":[2],"why":"w","keyPoints":["k"]}]}');
    expect(imp.pages[1].tier).toBe("core");
    expect(parseGrade('```json\n{"score": 9, "maxScore": 6, "verdict": "partial", "feedback": "f"}\n```', 6)).toEqual({ score: 6, maxScore: 6, verdict: "partial", feedback: "f" });
    expect(parseScore10("✅ Correct ... Score: 8,5/10")).toBe(8.5);
  });

  it("explains when nothing usable was pasted", () => {
    expect(() => parseCards("Sorry, I can't see the file.")).toThrow(/Couldn't find/);
  });
});
