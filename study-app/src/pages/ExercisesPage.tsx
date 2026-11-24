import { useEffect, useState } from "react";
import { Camera, ChevronDown, ChevronRight, ExternalLink, Sparkles, Square, Star, Trash2 } from "lucide-react";
import { all, bumpActivity, get, remove, update, useStore } from "../lib/store";
import { addTasks, parseTaskSpec } from "../lib/library";
import { aiReady, checkSolution, friendlyError, type StreamHandle } from "../lib/ai";
import { buildCheckPrompt, parseScore10 } from "../lib/bridge";
import { ClaudeGrader } from "../components/ClaudeBridge";
import { Empty, ImageThumbs, Markdown, MarkdownEditor, useImagePicker } from "../components/ui";
import { navigate, useRoute } from "../lib/router";
import type { Task, TaskStatus } from "../lib/types";
import { shuffle } from "../lib/util";

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", attempted: "Tried", review: "Shaky", solved: "Solved" };
const STATUS_CLASS: Record<TaskStatus, string> = { todo: "", attempted: "warn", review: "bad", solved: "good" };

export function StatusPicker({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <select
      className={`input pill ${STATUS_CLASS[value]}`}
      style={{ width: "auto", padding: "2px 8px", border: "none" }}
      value={value}
      aria-label="Status"
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      onClick={(e) => e.stopPropagation()}
    >
      {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function setTaskStatus(t: Task, status: TaskStatus) {
  if (status === "solved" && t.status !== "solved") bumpActivity({ tasksSolved: 1 });
  update("task", t.id, { status, attempts: t.attempts + (status !== "todo" && status !== t.status ? 1 : 0), lastPracticed: Date.now() });
}

function Confidence({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="row nowrap" style={{ gap: 0 }} title="How confident are you? (1 = not at all, 5 = could do it in the exam)">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} className="btn ghost icon sm" style={{ padding: 2 }} onClick={() => onChange(i === value ? 0 : i)} aria-label={`Confidence ${i}`}>
          <Star size={14} fill={i <= value ? "var(--warn)" : "none"} color={i <= value ? "var(--warn)" : "var(--muted)"} />
        </button>
      ))}
    </span>
  );
}

export function ExercisesPage({ courseId }: { courseId: string }) {
  useStore();
  const route = useRoute();
  const course = get("course", courseId)!;
  const practice = route.query.get("practice") === "1";
  const sheetFilter = route.query.get("sheet");
  const [open, setOpen] = useState<string | null>(null);
  const [spec, setSpec] = useState<Record<string, string>>({});
  const tasks = all("task").filter((t) => t.courseId === courseId);
  const sheets = all("material")
    .filter((m) => m.courseId === courseId && (m.kind === "exercise" || m.kind === "exam"))
    .filter((m) => !sheetFilter || m.id === sheetFilter)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.title.localeCompare(b.title));
  const loose = tasks.filter((t) => !t.materialId || !get("material", t.materialId));

  if (practice) return <Practice courseId={courseId} />;

  const solved = tasks.filter((t) => t.status === "solved").length;
  const shaky = tasks.filter((t) => t.status === "review" || t.status === "attempted" || (t.status === "solved" && t.confidence > 0 && t.confidence <= 2)).length;

  const group = (key: string, title: React.ReactNode, list: Task[], materialId?: string) => (
    <div className="card" key={key}>
      <div className="row">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="pill">
          {list.filter((t) => t.status === "solved").length}/{list.length} solved
        </span>
        <span className="spacer" />
        <input
          className="input"
          style={{ width: 170 }}
          placeholder="Add: 1a-c, 2, 3"
          value={spec[key] ?? ""}
          onChange={(e) => setSpec({ ...spec, [key]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const titles = parseTaskSpec(spec[key] ?? "");
            if (titles.length) addTasks(courseId, materialId, titles);
            setSpec({ ...spec, [key]: "" });
          }}
        />
      </div>
      <div className="list" style={{ marginTop: 6 }}>
        {list
          .sort((a, b) => a.order - b.order)
          .map((t) => (
            <TaskRow key={t.id} task={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
          ))}
        {!list.length && <p className="small muted">Type the exercise numbers above and press Enter.</p>}
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Exercises · {course.name}</h1>
          <p>
            Track every exercise: solve it, rate your confidence and let the AI check your solution strictly. "Shaky" ones come back in practice mode and in your study plan.
          </p>
        </div>
        <span className="pill good">{solved} solved</span>
        {shaky > 0 && <span className="pill bad">{shaky} to redo</span>}
        <button className="btn primary" disabled={!tasks.length} onClick={() => navigate(`#/c/${courseId}/exercises?practice=1`)}>
          Practice mode
        </button>
      </div>
      {sheetFilter && (
        <a className="btn sm" href={`#/c/${courseId}/exercises`} style={{ marginBottom: 12 }}>
          ← All sheets
        </a>
      )}
      {!sheets.length && !loose.length && (
        <Empty icon="✏️" title="No exercise sheets yet">
          <p>Upload your Serien / exercise sheets, then add their exercise numbers.</p>
          <a className="btn primary" href={`#/c/${courseId}/files`}>
            Upload exercise sheets
          </a>
        </Empty>
      )}
      {sheets.map((m) =>
        group(
          m.id,
          <a href={`#/m/${m.id}?panel=tasks`} style={{ color: "var(--text)" }}>
            {m.title}
          </a>,
          tasks.filter((t) => t.materialId === m.id),
          m.id,
        ),
      )}
      {(loose.length > 0 || sheets.length === 0) && !sheetFilter && group("loose", "Other exercises", loose)}
    </div>
  );
}

function TaskRow({ task, open, onToggle }: { task: Task; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="list-item clickable" style={{ borderBottom: "none" }} onClick={onToggle}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <b style={{ minWidth: 36 }}>{task.title}</b>
        <span className="small muted ellipsis" style={{ flex: 1 }}>
          {task.description || (task.solution ? "✎ solution written" : "")}
        </span>
        {task.attempts > 0 && <span className="tiny muted">{task.attempts}×</span>}
        <span onClick={(e) => e.stopPropagation()}>
          <Confidence value={task.confidence} onChange={(v) => update("task", task.id, { confidence: v })} />
        </span>
        <StatusPicker value={task.status} onChange={(s) => setTaskStatus(task, s)} />
      </div>
      {open && <TaskWork task={task} />}
    </div>
  );
}

/** Write a solution, attach photos of handwritten work and let the AI grade it. */
function TaskWork({ task, onGraded }: { task: Task; onGraded?: () => void }) {
  useStore();
  const sheet = get("material", task.materialId);
  const solution = sheet?.solutionId ? get("material", sheet.solutionId) : undefined;
  const [text, setText] = useState(task.solution);
  const [feedback, setFeedback] = useState("");
  const [stream, setStream] = useState<StreamHandle | null>(null);
  const pics = useImagePicker();

  useEffect(() => {
    setText(task.solution);
  }, [task.id]);
  useEffect(() => () => stream?.abort(), [stream]);

  /** "Score: 9/10" → status. */
  const applyScore = (out: string) => {
    const score = parseScore10(out);
    if (score !== null) {
      const status: TaskStatus = score >= 9 ? "solved" : score >= 5 ? "review" : "attempted";
      setTaskStatus(task, status);
      if (score >= 9 && task.confidence < 4) update("task", task.id, { confidence: 4 });
    }
    onGraded?.();
  };

  const check = async () => {
    update("task", task.id, { solution: text });
    setFeedback("");
    try {
      const h = await checkSolution(task, sheet, { text, images: pics.images }, setFeedback);
      setStream(h);
      applyScore(await h.done);
    } catch (e) {
      setFeedback((f) => f + `\n\n> ⚠️ ${friendlyError(e)}`);
    } finally {
      setStream(null);
    }
  };

  return (
    <div className="stack" style={{ padding: "4px 8px 16px 34px" }}>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Short description (optional), e.g. 'Prove that f is uniformly continuous'"
          defaultValue={task.description}
          onBlur={(e) => update("task", task.id, { description: e.target.value })}
        />
        {sheet && (
          <a className="btn sm" href={`#/m/${sheet.id}?page=${task.page ?? 1}&panel=tasks`}>
            <ExternalLink size={14} /> Sheet{task.page ? ` p. ${task.page}` : ""}
          </a>
        )}
        {solution && (
          <button
            className="btn sm"
            onClick={() => {
              if (confirm("Look at the official solution? Try it yourself first – recall is what makes it stick.")) navigate(`#/m/${solution.id}`);
            }}
          >
            Official solution
          </button>
        )}
        <button
          className="btn sm ghost danger"
          aria-label="Delete exercise"
          onClick={() => {
            if (confirm(`Delete exercise ${task.title}?`)) remove("task", task.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <MarkdownEditor value={text} onChange={setText} rows={7} placeholder="Your solution – Markdown and LaTeX ($\int_0^1 f(x)\,dx$). Or attach photos of your handwritten solution." />
      {pics.input}
      <ImageThumbs images={pics.images} onRemove={(i) => pics.setImages(pics.images.filter((_, j) => j !== i))} />
      <div className="row">
        <button className="btn" onClick={() => update("task", task.id, { solution: text })}>
          Save
        </button>
        <button className="btn" onClick={pics.open}>
          <Camera size={15} /> Add photo
        </button>
        {aiReady() &&
          (stream ? (
            <button className="btn" onClick={() => stream.abort()}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn primary" onClick={check} disabled={!text.trim() && !pics.images.length}>
              <Sparkles size={15} /> Check strictly
            </button>
          ))}
      </div>
      {!aiReady() && (
        <ClaudeGrader
          label="Check strictly with Claude (no API key)"
          hint={pics.images.length ? "Also attach your photos in the Claude chat." : undefined}
          buildPrompt={() => {
            update("task", task.id, { solution: text });
            return buildCheckPrompt(task, text, pics.images.length > 0);
          }}
          onImport={(reply) => {
            setFeedback(reply.trim());
            applyScore(reply);
          }}
        />
      )}
      {feedback && (
        <div className="card" style={{ padding: 14 }}>
          <Markdown text={feedback} />
        </div>
      )}
    </div>
  );
}

function Practice({ courseId }: { courseId: string }) {
  useStore();
  const [queue] = useState(() => {
    const tasks = all("task").filter((t) => t.courseId === courseId);
    const score = (t: Task) => (t.status === "review" ? 0 : t.status === "attempted" ? 1 : t.status === "todo" ? 2 : t.confidence > 0 && t.confidence <= 2 ? 1.5 : 3 + t.confidence * 0.2);
    return shuffle(tasks)
      .sort((a, b) => score(a) - score(b))
      .slice(0, 10)
      .map((t) => t.id);
  });
  const [i, setI] = useState(0);
  const [start, setStart] = useState(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const task = get("task", queue[i]);
  const done = i >= queue.length || !task;
  const secs = Math.floor((Date.now() - start) / 1000);

  const next = (status?: TaskStatus) => {
    if (task && status) {
      setTaskStatus(task, status);
      bumpActivity({ minutes: Math.round(secs / 60) }, { courseId, minutes: Math.round(secs / 60) });
    }
    setI(i + 1);
    setStart(Date.now());
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Exercise practice</h1>
          <p>The exercises you are least sure about come first. Solve each one on paper or here – without looking at the solution.</p>
        </div>
        <a className="btn" href={`#/c/${courseId}/exercises`}>
          Exit
        </a>
      </div>
      {done ? (
        <Empty icon="💪" title="Practice round finished">
          <a className="btn primary" href={`#/c/${courseId}/exercises`}>
            Back to exercises
          </a>
        </Empty>
      ) : (
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>
              {get("material", task.materialId)?.title ?? "Exercise"} – {task.title}
            </h2>
            <span className="pill">
              {i + 1}/{queue.length}
            </span>
            <span className={`pill ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
            <span className="spacer" />
            <span className="pill accent" style={{ fontVariantNumeric: "tabular-nums" }}>
              ⏱ {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </span>
          </div>
          {task.description && <p className="muted">{task.description}</p>}
          <TaskWork task={task} />
          <hr />
          <div className="row">
            <span className="small muted">How did it go?</span>
            <button className="btn danger" onClick={() => next("attempted")}>
              Couldn't do it
            </button>
            <button className="btn" style={{ color: "var(--warn)" }} onClick={() => next("review")}>
              Shaky – redo later
            </button>
            <button className="btn" style={{ color: "var(--good)" }} onClick={() => next("solved")}>
              Solved it cleanly
            </button>
            <span className="spacer" />
            <button className="btn ghost" onClick={() => next()}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
