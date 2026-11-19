import { useState } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { all, bumpActivity, get, put, remove, settings, update, useStore } from "../lib/store";
import { navigate, useRoute } from "../lib/router";
import { Empty, Markdown, Modal, Seg, TierBadge } from "../components/ui";
import { tierOf, TIER_VALUE } from "../lib/importance";
import { shuffle, uid } from "../lib/util";
import type { QuizQuestion, QuizType } from "../lib/types";
import { scoreAnswer, type Answer } from "../lib/quiz";

const TYPE_LABEL: Record<QuizType, string> = { single: "Single choice", multi: "Select all that apply", truefalse: "True / false" };

export function QuizPage({ courseId }: { courseId: string }) {
  useStore();
  const route = useRoute();
  const course = get("course", courseId)!;
  const [adding, setAdding] = useState(false);
  const [size, setSize] = useState(10);
  const all_ = all("quiz").filter((q) => q.courseId === courseId);
  const mode = route.query.get("mode");
  const [session, setSession] = useState<string[] | null>(() => (route.query.get("start") === "1" || mode === "weak" ? pickQuestions(all_, size, mode === "weak") : null));

  if (session) return <QuizRun ids={session} courseId={courseId} onExit={() => (setSession(null), navigate(`#/c/${courseId}/quiz`, true))} />;

  const seen = all_.reduce((n, q) => n + q.seen, 0);
  const right = all_.reduce((n, q) => n + q.right, 0);
  const wrong = all_.filter((q) => q.seen > 0 && q.right / q.seen < 0.6);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Quiz · {course.name}</h1>
          <p>
            Exam-style multiple choice. Scoring is strict: "select all" questions are all-or-nothing{settings().negativeMarking ? " and wrong true/false answers cost points (negative marking)" : ""}.
          </p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add question
        </button>
        {wrong.length > 0 && (
          <button className="btn" onClick={() => setSession(pickQuestions(all_, size, true))}>
            Retry {wrong.length} missed
          </button>
        )}
        <select className="input" style={{ width: "auto" }} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Number of questions">
          {[5, 10, 20, 40].map((n) => (
            <option key={n} value={n}>
              {n} questions
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!all_.length} onClick={() => setSession(pickQuestions(all_, size, false))}>
          <Play size={16} /> Start quiz
        </button>
      </div>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <span className="value">{all_.length}</span>
          <span className="label">questions</span>
        </div>
        <div className="card stat">
          <span className="value">{seen ? Math.round((right / seen) * 100) : 0}%</span>
          <span className="label">fully correct ({seen} answered)</span>
        </div>
        <div className="card stat">
          <span className="value">{wrong.length}</span>
          <span className="label">weak questions (&lt; 60%)</span>
        </div>
      </div>
      {!all_.length ? (
        <Empty icon="❓" title="No quiz questions yet">
          <p>
            Open a file → <b>AI tutor</b> → "Quiz questions" to get ETH-style questions, or add your own.
          </p>
        </Empty>
      ) : (
        <div className="card">
          <div className="list">
            {all_
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((q) => {
                const m = get("material", q.materialId);
                return (
                  <div key={q.id} className="list-item" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Markdown text={q.question} />
                      <div className="tiny muted">
                        {TYPE_LABEL[q.type]} · {q.seen ? `${q.right}/${q.seen} correct` : "not answered yet"}
                        {m && ` · ${m.title}${q.page ? ` p. ${q.page}` : ""}`} <TierBadge tier={m && q.page ? tierOf(get("insight", m.id), q.page) : undefined} />
                      </div>
                    </div>
                    <button className="btn icon ghost danger" aria-label="Delete question" onClick={() => confirm("Delete this question?") && remove("quiz", q.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      {adding && <QuestionEditor courseId={courseId} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Weak, unseen and important questions first. */
function pickQuestions(qs: QuizQuestion[], n: number, weakOnly: boolean): string[] {
  const pool = weakOnly ? qs.filter((q) => q.seen > 0 && q.right / q.seen < 0.6) : qs;
  const prio = (q: QuizQuestion) => {
    const acc = q.seen ? q.right / q.seen : 0.4;
    const tier = q.materialId && q.page ? tierOf(get("insight", q.materialId), q.page) : undefined;
    const imp = tier ? TIER_VALUE[tier] / 3 : 0.6;
    return (1 - acc) * 2 + imp + Math.random() * 0.8;
  };
  return shuffle(pool)
    .sort((a, b) => prio(b) - prio(a))
    .slice(0, n)
    .map((q) => q.id);
}

function QuizRun({ ids, courseId, onExit }: { ids: string[]; courseId: string; onExit: () => void }) {
  useStore();
  const s = settings();
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<Answer>({ picked: [], tf: [] });
  const [result, setResult] = useState<{ score: number; correct: boolean } | null>(null);
  const [total, setTotal] = useState({ score: 0, correct: 0, wrong: [] as string[] });
  const q = get("quiz", ids[i]);

  if (!q) {
    const pct = ids.length ? Math.round((total.score / ids.length) * 100) : 0;
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "3rem" }}>{pct >= 85 ? "🏆" : pct >= 60 ? "👍" : "📚"}</div>
          <h1>{pct}% points</h1>
          <p className="muted">
            {total.correct}/{ids.length} questions fully correct.{" "}
            {pct < 60 ? "Below the pass mark – go back to the core pages of the missed topics." : pct < 85 ? "Solid, but at ETH level you want > 85%." : "Excellent."}
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={onExit}>
              Back
            </button>
            <a className="btn primary" href={`#/c/${courseId}`}>
              Study plan
            </a>
          </div>
        </div>
      </div>
    );
  }

  const submit = () => {
    const r = scoreAnswer(q, answer, s.negativeMarking);
    setResult(r);
    update("quiz", q.id, { seen: q.seen + 1, right: q.right + (r.correct ? 1 : 0), lastWrong: r.correct ? q.lastWrong : Date.now() });
    bumpActivity({ quizAnswered: 1, quizCorrect: r.correct ? 1 : 0 });
    setTotal((t) => ({ score: t.score + r.score, correct: t.correct + (r.correct ? 1 : 0), wrong: r.correct ? t.wrong : [...t.wrong, q.id] }));
  };

  const next = () => {
    setI(i + 1);
    setAnswer({ picked: [], tf: [] });
    setResult(null);
  };

  const letter = (k: number) => String.fromCharCode(65 + k);
  const m = get("material", q.materialId);
  const canSubmit = q.type === "truefalse" ? answer.tf.some((x) => x !== null && x !== undefined) : answer.picked.length > 0 || q.type === "multi";

  return (
    <div className="page">
      <div className="flash">
        <div className="row" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Quiz</h1>
          <span className="pill">
            {i + 1}/{ids.length}
          </span>
          <span className="pill accent">{TYPE_LABEL[q.type]}</span>
          <span className="spacer" />
          <button className="btn ghost" onClick={onExit}>
            Exit
          </button>
        </div>
        <div className="flash-card">
          <Markdown text={q.question} />
          <p className="tiny muted">
            {q.type === "multi" && "Select ALL correct options – any number (including none) may be correct. All-or-nothing."}
            {q.type === "truefalse" && `Decide for each statement.${s.negativeMarking ? " A wrong answer costs a point – leave it open if you are unsure." : ""}`}
          </p>
          <div className="stack" style={{ marginTop: 12 }}>
            {q.type !== "truefalse" &&
              q.options.map((o, k) => {
                const picked = answer.picked.includes(k);
                const cls = result ? (q.correct.includes(k) ? "right" : picked ? "wrong" : "") : picked ? "selected" : "";
                return (
                  <button
                    key={k}
                    className={`option ${cls}`}
                    disabled={!!result}
                    onClick={() =>
                      setAnswer({
                        ...answer,
                        picked: q.type === "single" ? [k] : picked ? answer.picked.filter((x) => x !== k) : [...answer.picked, k],
                      })
                    }
                  >
                    <span className="letter">{q.type === "multi" ? (picked ? "☑" : "☐") : letter(k)}</span>
                    <Markdown text={o} />
                  </button>
                );
              })}
            {q.type === "truefalse" &&
              q.options.map((o, k) => {
                const a = answer.tf[k] ?? null;
                const truth = q.correct.includes(k);
                const cls = result ? (a === null ? "" : a === truth ? "right" : "wrong") : "";
                return (
                  <div key={k} className={`tf-row ${cls}`}>
                    <div style={{ flex: 1 }}>
                      <Markdown text={o} />
                      {result && <div className="tiny" style={{ fontWeight: 700, color: truth ? "var(--good)" : "var(--bad)" }}>{truth ? "TRUE" : "FALSE"}</div>}
                    </div>
                    <Seg
                      value={a === null ? "open" : a ? "true" : "false"}
                      onChange={(v) => {
                        if (result) return;
                        const tf = [...answer.tf];
                        while (tf.length < q.options.length) tf.push(null);
                        tf[k] = v === "open" ? null : v === "true";
                        setAnswer({ ...answer, tf });
                      }}
                      options={[
                        { value: "true", label: "True" },
                        { value: "false", label: "False" },
                        { value: "open", label: "?" },
                      ]}
                    />
                  </div>
                );
              })}
          </div>
          {result && (
            <>
              <div className="divider" />
              <div className={`pill ${result.correct ? "good" : result.score > 0 ? "warn" : "bad"}`} style={{ fontSize: "0.9rem", marginBottom: 8 }}>
                {result.correct ? "Correct" : result.score > 0 ? `Partly – ${Math.round(result.score * 100)}% points` : "Wrong – 0 points"}
              </div>
              <Markdown text={q.explanation} />
              {m && (
                <div className="tiny muted" style={{ marginTop: 10 }}>
                  Source:{" "}
                  <a href={`#/m/${m.id}?page=${q.page ?? 1}`}>
                    {m.title}
                    {q.page ? `, p. ${q.page}` : ""}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          {!result ? (
            <button className="btn primary lg" onClick={submit} disabled={!canSubmit}>
              Submit answer
            </button>
          ) : (
            <button className="btn primary lg" onClick={next}>
              {i + 1 < ids.length ? "Next question" : "See result"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [type, setType] = useState<QuizType>("single");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState<number[]>([]);
  const [explanation, setExplanation] = useState("");
  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2 && (type !== "single" || correct.length === 1);
  const save = () => {
    const kept = options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
    const remap = kept.map((x) => x.i);
    put("quiz", {
      id: uid(),
      courseId,
      type,
      question: question.trim(),
      options: kept.map((x) => x.o),
      correct: correct.filter((c) => remap.includes(c)).map((c) => remap.indexOf(c)),
      explanation: explanation.trim(),
      createdAt: Date.now(),
      seen: 0,
      right: 0,
    });
    onClose();
  };
  return (
    <Modal
      title="New quiz question"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <Seg
          value={type}
          onChange={(t) => {
            setType(t);
            setCorrect([]);
          }}
          options={(Object.keys(TYPE_LABEL) as QuizType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
        />
        <label className="field">
          Question
          <textarea className="input" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        <div className="field">
          {type === "truefalse" ? "Statements – tick the TRUE ones" : "Options – tick the correct one(s)"}
          {options.map((o, i) => (
            <div key={i} className="row nowrap">
              <input
                type={type === "single" ? "radio" : "checkbox"}
                name="correct"
                checked={correct.includes(i)}
                onChange={() => setCorrect(type === "single" ? [i] : correct.includes(i) ? correct.filter((c) => c !== i) : [...correct, i])}
                aria-label={`Option ${i + 1} correct`}
              />
              <input className="input" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} />
            </div>
          ))}
          {options.length < 6 && (
            <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setOptions([...options, ""])}>
              + option
            </button>
          )}
        </div>
        <label className="field">
          Explanation
          <textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
