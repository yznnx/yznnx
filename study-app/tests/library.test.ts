import { describe, expect, it } from "vitest";
import { parseTaskSpec } from "../src/lib/library";
import { guessKind, pptxSlides } from "../src/lib/extract";
import { scoreAnswer } from "../src/lib/quiz";
import { zipSync, strToU8 } from "fflate";
import type { QuizQuestion } from "../src/lib/types";

describe("exercise spec parser", () => {
  it("expands ranges", () => {
    expect(parseTaskSpec("1a-c, 2, 3 (b), 4.1-4.3")).toEqual(["1a", "1b", "1c", "2", "3b", "4.1", "4.2", "4.3"]);
    expect(parseTaskSpec("5-7")).toEqual(["5", "6", "7"]);
  });
});

describe("file kind detection (ETH names)", () => {
  it.each([
    ["Serie_03.pdf", "exercise", 3],
    ["Musterlösung Serie 3.pdf", "solution", 3],
    ["Basisprüfung_2023.pdf", "exam", 2023],
    ["Vorlesung_05.pdf", "lecture", 5],
    ["Time Series Analysis 2.pdf", "lecture", 2],
    ["Examples_Lecture3.pdf", "lecture", 3],
    ["Skript_Lineare_Algebra.pdf", "lecture", undefined],
  ])("%s → %s", (name, kind, number) => {
    expect(guessKind(name)).toEqual({ kind, number });
  });
});

describe("pptx text extraction", () => {
  it("reads slides in numeric order and decodes entities", () => {
    const slide = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p><a:p><a:r><a:t xml:space="preserve">x &lt; y &amp; z</a:t></a:r></a:p></p:sld>`;
    const zip = zipSync({ "ppt/slides/slide10.xml": strToU8(slide("ten")), "ppt/slides/slide2.xml": strToU8(slide("two")) });
    expect(pptxSlides(zip)).toEqual(["two\nx < y & z", "ten\nx < y & z"]);
  });
});

describe("strict quiz scoring", () => {
  const q = (type: QuizQuestion["type"], correct: number[]): QuizQuestion => ({ id: "q", courseId: "c", type, question: "", options: ["a", "b", "c", "d"], correct, explanation: "", createdAt: 0, seen: 0, right: 0 });
  it("true/false uses negative marking, never below 0", () => {
    const tf = q("truefalse", [0, 2]);
    expect(scoreAnswer(tf, { picked: [], tf: [true, true, true, null] }, true)).toEqual({ score: 0.25, correct: false });
    expect(scoreAnswer(tf, { picked: [], tf: [false, true, false, true] }, true)).toEqual({ score: 0, correct: false });
    expect(scoreAnswer(tf, { picked: [], tf: [true, false, true, false] }, true)).toEqual({ score: 1, correct: true });
    expect(scoreAnswer(tf, { picked: [], tf: [true, true, true, null] }, false).score).toBe(0.5);
  });
  it("select-all is all-or-nothing", () => {
    const m = q("multi", [1, 3]);
    expect(scoreAnswer(m, { picked: [3, 1], tf: [] }, true).correct).toBe(true);
    expect(scoreAnswer(m, { picked: [1], tf: [] }, true).score).toBe(0);
  });
});
