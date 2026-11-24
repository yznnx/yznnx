import { describe, expect, it } from "vitest";
import { analyzeCourse } from "../src/lib/importance";
import type { Material, MaterialKind } from "../src/lib/types";

const mat = (id: string, kind: MaterialKind, pages: string[]) => ({
  material: { id, courseId: "c", title: id, kind, fileName: id, mimeType: "", size: 0, blobId: id, pageCount: pages.length, view: "pdf", createdAt: 0 } as Material,
  text: { id, pages },
});

describe("importance analysis", () => {
  const lecture = mat("lec", "lecture", [
    "Analysis I – Vorlesung 3\nProf. Example",
    "Agenda\nFolgen\nKonvergenz",
    "Definition: Eine Folge heisst konvergent gegen a, falls für alle ε > 0 ein N existiert mit |a_n − a| < ε für alle n ≥ N. Wichtig für die Klausur.",
    "Satz (Cauchy-Kriterium): Eine reelle Folge ist genau dann konvergent, wenn sie eine Cauchy-Folge ist. Vollständigkeit der reellen Zahlen.",
    "Historischer Exkurs: Bernard Bolzano war ein böhmischer Philosoph, Theologe und Mathematiker und lebte in Prag im neunzehnten Jahrhundert.",
    "Literatur: Forster, Analysis 1. Königsberger. Amann Escher.",
  ]);
  const exercise = mat("ex", "exercise", ["Aufgabe 1: Zeigen Sie mit der Definition der Konvergenz, dass die Folge konvergent ist. Ist jede Cauchy-Folge konvergent?"]);

  it("rates definitions/theorems tested in exercises as core and admin slides as skip", () => {
    const [ins] = analyzeCourse([lecture, exercise]);
    expect(ins.tiers[0]).toBe("skip"); // title
    expect(ins.tiers[1]).toBe("skip"); // agenda
    expect(ins.tiers[2]).toBe("core");
    expect(ins.tiers[3]).toBe("core");
    expect(ins.tiers[4]).toBe("optional"); // history
    expect(ins.tiers[5]).toBe("skip"); // literature
    expect(ins.reasons[2]).toContain("matches your exercises");
  });

  it("works without exercises and keeps manual overrides", () => {
    const prev = analyzeCourse([lecture])[0];
    const [ins] = analyzeCourse([lecture], new Map([["lec", { ...prev, overrides: { 5: "core" } }]]));
    expect(ins.overrides[5]).toBe("core");
    expect(ins.tiers[2]).not.toBe("skip");
  });

  it("groups slides into topics by title", () => {
    const [ins] = analyzeCourse([lecture, exercise]);
    expect(ins.topics.map((t) => t.importance)).toContain("core");
    expect(ins.topics.find((t) => t.pages.includes(3))?.title).toMatch(/^Definition/);
  });
});
