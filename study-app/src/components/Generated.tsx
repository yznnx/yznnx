// Preview of AI-generated cards / questions / problems before they are added.
import { putMany, get } from "../lib/store";
import { makeCard } from "../lib/library";
import type { GeneratedCard, GeneratedProblem, GeneratedQuestion } from "../lib/ai";
import type { Material, Problem, QuizQuestion } from "../lib/types";
import { plural, uid } from "../lib/util";
import { tierOf } from "../lib/importance";
import { Markdown, TierBadge, toast } from "./ui";

type Keep<T> = T & { keep: boolean };
export type Generated =
  | { kind: "cards"; items: Keep<GeneratedCard>[] }
  | { kind: "quiz"; items: Keep<GeneratedQuestion>[] }
  | { kind: "problems"; items: Keep<GeneratedProblem>[] };

export function keepAll<T>(items: T[]): Keep<T>[] {
  return items.map((x) => ({ ...x, keep: true }));
}

const pageIn = (m: Material, p: number) => (p >= 1 && p <= m.pageCount ? p : undefined);

function save(material: Material, gen: Generated) {
  if (gen.kind === "cards") {
    const keep = gen.items.filter((c) => c.keep);
    putMany(
      "card",
      keep.map((c) => makeCard(material.courseId, c.front, c.back, material.id, pageIn(material, c.page))),
    );
    toast(`Added ${plural(keep.length, "flashcard")}.`);
  } else if (gen.kind === "quiz") {
    const items: QuizQuestion[] = gen.items
      .filter((q) => q.keep)
      .map((q) => ({
        id: uid(),
        courseId: material.courseId,
        materialId: material.id,
        page: pageIn(material, q.page),
        type: q.type,
        question: q.question,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        createdAt: Date.now(),
        seen: 0,
        right: 0,
      }));
    putMany("quiz", items);
    toast(`Added ${plural(items.length, "quiz question")}.`);
  } else {
    const items: Problem[] = gen.items
      .filter((p) => p.keep)
      .map((p) => ({
        id: uid(),
        courseId: material.courseId,
        materialId: material.id,
        pages: p.pages.filter((x) => pageIn(material, x)),
        title: p.title,
        statement: p.statement,
        points: Math.max(1, p.points),
        minutes: Math.max(5, p.minutes),
        solution: p.solution,
        rubric: p.rubric,
        createdAt: Date.now(),
        attempts: [],
      }));
    putMany("problem", items);
    toast(`Added ${plural(items.length, "exam problem")} to Exam practice.`);
  }
}

export function GeneratedPreview({ material, gen, onChange, onDone }: { material: Material; gen: Generated; onChange: (g: Generated) => void; onDone: () => void }) {
  const ins = get("insight", material.id);
  const count = gen.items.filter((x) => x.keep).length;
  const toggle = (i: number) => onChange({ ...gen, items: gen.items.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)) } as Generated);
  const title = gen.kind === "cards" ? plural(gen.items.length, "flashcard") : gen.kind === "quiz" ? plural(gen.items.length, "question") : plural(gen.items.length, "exam problem");
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="spacer" />
        <button className="btn sm" onClick={onDone}>
          Discard
        </button>
        <button
          className="btn sm primary"
          disabled={!count}
          onClick={() => {
            save(material, gen);
            onDone();
          }}
        >
          Add {count}
        </button>
      </div>
      {gen.kind === "cards" &&
        gen.items.map((c, i) => (
          <label key={i} className="check card" style={{ padding: 10 }}>
            <input type="checkbox" checked={c.keep} onChange={() => toggle(i)} />
            <div style={{ minWidth: 0 }}>
              <Markdown text={c.front} />
              <Markdown text={c.back} className="small muted" />
              {c.page > 0 && (
                <span className="tiny muted">
                  p. {c.page} <TierBadge tier={tierOf(ins, c.page)} />
                </span>
              )}
            </div>
          </label>
        ))}
      {gen.kind === "quiz" &&
        gen.items.map((q, i) => (
          <label key={i} className="check card" style={{ padding: 10 }}>
            <input type="checkbox" checked={q.keep} onChange={() => toggle(i)} />
            <div style={{ minWidth: 0 }}>
              <span className="pill">{q.type === "truefalse" ? "True / false" : q.type === "multi" ? "Select all" : "Single choice"}</span>
              <Markdown text={q.question} />
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {q.options.map((o, k) => (
                  <li key={k} style={{ color: q.correct.includes(k) ? "var(--good)" : undefined }}>
                    <Markdown text={o} />
                  </li>
                ))}
              </ul>
            </div>
          </label>
        ))}
      {gen.kind === "problems" &&
        gen.items.map((p, i) => (
          <label key={i} className="check card" style={{ padding: 10 }}>
            <input type="checkbox" checked={p.keep} onChange={() => toggle(i)} />
            <div style={{ minWidth: 0 }}>
              <b>{p.title}</b>{" "}
              <span className="pill">
                {p.points} pts · {p.minutes} min
              </span>
              <Markdown text={p.statement} className="small" />
            </div>
          </label>
        ))}
    </div>
  );
}
