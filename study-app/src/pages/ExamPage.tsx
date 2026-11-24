import { useEffect, useState } from "react";
import { Camera, Eye, GraduationCap, Play, Plus, Trash2 } from "lucide-react";
import { all, bumpActivity, get, put, remove, update, useStore } from "../lib/store";
import { aiReady, friendlyError, gradeProblem, type Grade } from "../lib/ai";
import { buildGradePrompt, parseGrade } from "../lib/bridge";
import { ClaudeGrader } from "../components/ClaudeBridge";
import { Empty, ImageThumbs, Markdown, MarkdownEditor, Modal, toast, useImagePicker } from "../components/ui";
import { pageRanges } from "../lib/planner";
import { shuffle, uid } from "../lib/util";
import type { Problem } from "../lib/types";

export function ExamPage({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const problems = all("problem")
    .filter((p) => p.courseId === courseId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const [run, setRun] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [mockSize, setMockSize] = useState(3);

  if (run) return <ExamRun ids={run} onExit={() => setRun(null)} courseId={courseId} />;

  const attempts = problems.flatMap((p) => p.attempts);
  const avg = attempts.length ? attempts.reduce((n, a) => n + a.score / a.maxScore, 0) / attempts.length : null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Exam practice · {course.name}</h1>
          <p>Write full solutions under time pressure – typed or as photos of your handwritten pages – and get them graded strictly against a rubric, like in a real ETH exam.</p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add problem
        </button>
        <select className="input" style={{ width: "auto" }} value={mockSize} onChange={(e) => setMockSize(Number(e.target.value))} aria-label="Problems in mock exam">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} problem{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!problems.length} onClick={() => setRun(pickMock(problems, mockSize))}>
          <GraduationCap size={16} /> Start mock exam
        </button>
      </div>

      {!aiReady() && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p className="small" style={{ margin: 0 }}>
            Let Claude write exam problems: open a lecture file → <b>AI tutor</b> tab → "Exam problems". After you hand in, use "Grade strictly with Claude" – this works with your
            normal Claude subscription (copy & paste). With an <a href="#/settings">API key</a> it happens automatically. You can also add problems from past exams yourself.
          </p>
        </div>
      )}

      {avg !== null && (
        <div className="grid cols-3" style={{ marginBottom: 14 }}>
          <div className="card stat">
            <span className="value">{Math.round(avg * 100)}%</span>
            <span className="label">average score ({attempts.length} attempts)</span>
          </div>
          <div className="card stat">
            <span className="value">{problems.filter((p) => p.attempts.length && p.attempts[p.attempts.length - 1].score / p.attempts[p.attempts.length - 1].maxScore >= 0.8).length}</span>
            <span className="label">problems at ≥ 80% (last try)</span>
          </div>
          <div className="card stat">
            <span className="value">{problems.filter((p) => !p.attempts.length).length}</span>
            <span className="label">not attempted yet</span>
          </div>
        </div>
      )}

      {!problems.length ? (
        <Empty icon="🎓" title="No exam problems yet">
          <p>
            Open a lecture file → <b>AI tutor</b> → "Exam problems". They are calibrated to your exercise sheets and past exams.
          </p>
        </Empty>
      ) : (
        <div className="card">
          <div className="list">
            {problems.map((p) => {
              const last = p.attempts[p.attempts.length - 1];
              const m = get("material", p.materialId);
              return (
                <div key={p.id} className="list-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.title}</b>{" "}
                    <span className="pill">
                      {p.points} pts · {p.minutes} min
                    </span>
                    <div className="tiny muted">
                      {m ? `${m.title}${p.pages.length ? ` p. ${pageRanges(p.pages)}` : ""} · ` : ""}
                      {last ? `last: ${last.score}/${last.maxScore} · ${p.attempts.length} attempt${p.attempts.length > 1 ? "s" : ""}` : "not attempted"}
                    </div>
                  </div>
                  {last && <span className={`pill ${last.score / last.maxScore >= 0.8 ? "good" : last.score / last.maxScore >= 0.5 ? "warn" : "bad"}`}>{Math.round((last.score / last.maxScore) * 100)}%</span>}
                  <button className="btn sm" onClick={() => setRun([p.id])}>
                    <Play size={14} /> Solve
                  </button>
                  <button className="btn icon ghost danger" aria-label="Delete problem" onClick={() => confirm("Delete this problem?") && remove("problem", p.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {adding && <ProblemEditor courseId={courseId} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Least practised and lowest-scoring problems first. */
function pickMock(problems: Problem[], n: number) {
  const prio = (p: Problem) => {
    const last = p.attempts[p.attempts.length - 1];
    return (last ? 1 - last.score / last.maxScore : 1.2) + Math.random() * 0.5;
  };
  return shuffle(problems)
    .sort((a, b) => prio(b) - prio(a))
    .slice(0, n)
    .map((p) => p.id);
}

interface Work {
  text: string;
  images: { data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; url: string }[];
}

function ExamRun({ ids, onExit, courseId }: { ids: string[]; onExit: () => void; courseId: string }) {
  useStore();
  const problems = ids.map((id) => get("problem", id)).filter(Boolean) as Problem[];
  const totalMinutes = problems.reduce((n, p) => n + p.minutes, 0);
  const [start] = useState(Date.now());
  const [work, setWork] = useState<Record<string, Work>>({});
  const [phase, setPhase] = useState<"writing" | "grading" | "done">("writing");
  const [grades, setGrades] = useState<Record<string, Grade | string>>({});
  const [showSolution, setShowSolution] = useState<Record<string, boolean>>({});
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = totalMinutes * 60_000 - (Date.now() - start);
  const overtime = left < 0;
  const fmt = (ms: number) => {
    const t = Math.abs(Math.floor(ms / 1000));
    return `${overtime ? "-" : ""}${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };

  const [minutesUsed, setMinutesUsed] = useState(0);

  const saveGrade = (p: Problem, g: Grade, minutes = minutesUsed) => {
    const w = work[p.id] ?? { text: "", images: [] };
    setGrades((x) => ({ ...x, [p.id]: g }));
    const cur = get("problem", p.id);
    if (cur) {
      update("problem", p.id, {
        attempts: [...cur.attempts, { at: Date.now(), answer: w.text, imageCount: w.images.length, score: g.score, maxScore: g.maxScore, feedback: g.feedback, minutes: Math.round(minutes / problems.length) }],
      });
    }
  };

  const submit = async () => {
    const minutes = Math.round((Date.now() - start) / 60_000);
    setMinutesUsed(minutes);
    bumpActivity({ minutes }, { courseId, minutes });
    if (!aiReady()) {
      setPhase("done");
      return;
    }
    setPhase("grading");
    for (const p of problems) {
      const w = work[p.id] ?? { text: "", images: [] };
      try {
        saveGrade(p, await gradeProblem(p, { text: w.text, images: w.images }), minutes);
      } catch (e) {
        setGrades((x) => ({ ...x, [p.id]: friendlyError(e) }));
        toast(friendlyError(e), true);
      }
    }
    setPhase("done");
  };

  const totalScore = Object.values(grades).reduce((n, g) => n + (typeof g === "string" ? 0 : g.score), 0);
  const totalMax = problems.reduce((n, p) => n + p.points, 0);

  return (
    <div className="page">
      <div className="page-head" style={{ position: "sticky", top: 0, background: "var(--bg)", zIndex: 5, paddingTop: 6, paddingBottom: 6 }}>
        <div className="grow">
          <h1 style={{ margin: 0 }}>{problems.length > 1 ? "Mock exam" : problems[0]?.title}</h1>
          <p>
            {problems.length} problem{problems.length > 1 ? "s" : ""} · {totalMax} points · {totalMinutes} min
          </p>
        </div>
        {phase === "writing" ? (
          <>
            <span className={`pill ${overtime ? "bad" : left < 5 * 60_000 ? "warn" : "accent"}`} style={{ fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>
              ⏱ {fmt(left)}
            </span>
            <button className="btn ghost" onClick={() => confirm("Leave the exam? Your answers are lost.") && onExit()}>
              Exit
            </button>
            <button className="btn primary" onClick={() => confirm("Hand in your answers?") && submit()}>
              Hand in{aiReady() ? " & grade" : ""}
            </button>
          </>
        ) : (
          <>
            {phase === "grading" && <span className="pill warn">Grading strictly… {Object.keys(grades).length}/{problems.length}</span>}
            {phase === "done" && Object.keys(grades).length > 0 && (
              <span className={`pill ${totalScore / totalMax >= 0.8 ? "good" : totalScore / totalMax >= 0.5 ? "warn" : "bad"}`} style={{ fontSize: "1rem" }}>
                {Math.round(totalScore * 10) / 10}/{totalMax} points ({Math.round((totalScore / totalMax) * 100)}%)
              </span>
            )}
            <button className="btn" onClick={onExit}>
              Back
            </button>
          </>
        )}
      </div>
      {problems.map((p, idx) => {
        const g = grades[p.id];
        return (
          <div key={p.id} className="card">
            <div className="row">
              <h2 style={{ margin: 0 }}>
                Problem {idx + 1}: {p.title}
              </h2>
              <span className="pill">{p.points} pts</span>
            </div>
            <Markdown text={p.statement} />
            <hr />
            {phase === "writing" ? (
              <AnswerBox value={work[p.id] ?? { text: "", images: [] }} onChange={(w) => setWork({ ...work, [p.id]: w })} />
            ) : (
              <>
                {work[p.id]?.text && (
                  <details>
                    <summary className="small muted">Your answer</summary>
                    <Markdown text={work[p.id].text} />
                  </details>
                )}
                {g && typeof g !== "string" && (
                  <div className="card" style={{ padding: 14, marginTop: 10 }}>
                    <div className={`pill ${g.verdict === "correct" ? "good" : g.verdict === "partial" ? "warn" : "bad"}`} style={{ marginBottom: 8, fontSize: "0.9rem" }}>
                      {g.score}/{g.maxScore} points · {g.verdict}
                    </div>
                    <Markdown text={g.feedback} />
                  </div>
                )}
                {typeof g === "string" && <div className="pill bad">{g}</div>}
                {phase === "done" && !g && !aiReady() && (
                  <div style={{ marginTop: 10 }}>
                    <ClaudeGrader
                      label="Grade strictly with Claude (no API key)"
                      hint={work[p.id]?.images.length ? "Also attach the photos of your handwritten pages in the Claude chat." : undefined}
                      buildPrompt={() => buildGradePrompt(p, work[p.id]?.text ?? "", (work[p.id]?.images.length ?? 0) > 0)}
                      onImport={(reply) => {
                        try {
                          saveGrade(p, parseGrade(reply, p.points));
                        } catch (e) {
                          return e instanceof Error ? e.message : String(e);
                        }
                      }}
                    />
                  </div>
                )}
                {phase === "done" && (
                  <div style={{ marginTop: 10 }}>
                    <button className="btn sm" onClick={() => setShowSolution({ ...showSolution, [p.id]: !showSolution[p.id] })}>
                      <Eye size={14} /> {showSolution[p.id] ? "Hide" : "Show"} model solution & rubric
                    </button>
                    {showSolution[p.id] && (
                      <div className="stack" style={{ marginTop: 10 }}>
                        <Markdown text={p.solution || "*No model solution stored.*"} />
                        {p.rubric && (
                          <details>
                            <summary className="small muted">Grading rubric</summary>
                            <Markdown text={p.rubric} className="small" />
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnswerBox({ value, onChange }: { value: Work; onChange: (w: Work) => void }) {
  const pics = useImagePicker();
  useEffect(() => {
    if (pics.images.length !== value.images.length) onChange({ ...value, images: pics.images });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pics.images]);
  return (
    <div className="stack">
      <MarkdownEditor value={value.text} onChange={(t) => onChange({ ...value, text: t })} rows={10} placeholder="Your full solution. Justify every step. LaTeX: $\lim_{n\to\infty} a_n$" />
      {pics.input}
      <ImageThumbs images={pics.images} onRemove={(i) => pics.setImages(pics.images.filter((_, j) => j !== i))} />
      <div>
        <button className="btn sm" onClick={pics.open}>
          <Camera size={14} /> Add photos of handwritten pages
        </button>
      </div>
    </div>
  );
}

function ProblemEditor({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [points, setPoints] = useState(10);
  const [minutes, setMinutes] = useState(20);
  const [solution, setSolution] = useState("");
  const [rubric, setRubric] = useState("");
  const save = () => {
    put("problem", { id: uid(), courseId, pages: [], title: title.trim() || "Problem", statement, points, minutes, solution, rubric, createdAt: Date.now(), attempts: [] });
    onClose();
  };
  return (
    <Modal
      title="Add exam problem"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!statement.trim()} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          E.g. copy a problem from a past exam. With a model solution and rubric the AI can grade your answer strictly.
        </p>
        <div className="grid cols-3">
          <label className="field">
            Title
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            Points
            <input className="input" type="number" min={1} value={points} onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="field">
            Minutes
            <input className="input" type="number" min={1} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        </div>
        <div className="field">
          Problem statement
          <MarkdownEditor value={statement} onChange={setStatement} rows={6} />
        </div>
        <div className="field">
          Model solution (hidden until you hand in)
          <MarkdownEditor value={solution} onChange={setSolution} rows={5} />
        </div>
        <label className="field">
          Grading rubric (optional)
          <textarea className="input" rows={3} value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="(a) 3 pts: correct setup … (b) 4 pts: …" />
        </label>
      </div>
    </Modal>
  );
}
