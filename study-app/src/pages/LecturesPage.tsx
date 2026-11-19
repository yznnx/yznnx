import { useState } from "react";
import { Plus } from "lucide-react";
import { all, settings, today, useStore } from "../lib/store";
import { navigate, useRoute } from "../lib/router";
import { LectureForm } from "../components/LectureForm";
import { Progress } from "../components/ui";
import { countDue } from "../lib/srs";
import { urgency } from "../lib/planner";
import { coverage } from "../lib/importance";
import { get } from "../lib/store";
import { plural } from "../lib/util";
import { streak } from "../components/Plan";

export function LecturesPage() {
  useStore();
  const route = useRoute();
  const [creating, setCreating] = useState(route.query.get("new") === "1");
  const courses = all("course").filter((c) => !c.archived);
  const archived = all("course").filter((c) => c.archived);
  const s = settings();
  const newLeft = Math.max(0, s.newCardsPerDay - today().newCards);
  const days = streak();

  const sorted = courses.sort((a, b) => {
    const ua = a.examDate ?? "9999";
    const ub = b.examDate ?? "9999";
    return ua.localeCompare(ub) || a.name.localeCompare(b.name);
  });

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{s.name ? `Hi ${s.name} 👋` : "My lectures"}</h1>
          <p>Choose the lecture you want to study. Each lecture is its own environment with its files, plan, flashcards, exercises and exam practice.</p>
        </div>
        {days > 0 && <span className="pill good">🔥 {plural(days, "day")} streak</span>}
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New lecture
        </button>
      </div>

      <div className="grid auto">
        {sorted.map((c) => {
          const mats = all("material").filter((m) => m.courseId === c.id);
          const cov = mats.reduce(
            (acc, m) => {
              if (!["lecture", "notes", "other"].includes(m.kind)) return acc;
              const r = coverage(m, get("insight", m.id));
              return { done: acc.done + r.done, total: acc.total + r.total };
            },
            { done: 0, total: 0 },
          );
          const due = countDue(
            all("card").filter((x) => x.courseId === c.id),
            newLeft,
          );
          const tasks = all("task").filter((t) => t.courseId === c.id);
          const solved = tasks.filter((t) => t.status === "solved").length;
          const u = urgency(c);
          return (
            <div key={c.id} className="lecture-tile" role="link" tabIndex={0} onClick={() => navigate(`#/c/${c.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`#/c/${c.id}`)}>
              <div className="stripe" style={{ background: c.color }} />
              <div className="row nowrap">
                <span className="emoji">{c.emoji}</span>
                <span className="spacer" />
                {u.label && <span className={`pill ${u.days !== undefined && u.days <= 14 ? "bad" : "warn"}`}>{u.label}</span>}
              </div>
              <h2 style={{ margin: 0 }}>{c.name}</h2>
              <div className="small muted">
                {plural(mats.length, "file")} · {plural(tasks.length, "exercise")} · {due.total ? `${plural(due.total, "card")} to review` : "no cards due"}
              </div>
              <div className="spacer" />
              <div>
                <div className="row tiny muted" style={{ justifyContent: "space-between" }}>
                  <span>Studied (weighted by importance)</span>
                  <span>{cov.total ? Math.round((cov.done / cov.total) * 100) : 0}%</span>
                </div>
                <Progress value={cov.total ? cov.done / cov.total : 0} />
              </div>
              {tasks.length > 0 && (
                <div>
                  <div className="row tiny muted" style={{ justifyContent: "space-between" }}>
                    <span>Exercises solved</span>
                    <span>
                      {solved}/{tasks.length}
                    </span>
                  </div>
                  <Progress value={solved / tasks.length} good />
                </div>
              )}
            </div>
          );
        })}
        <div className="lecture-tile new" role="button" tabIndex={0} onClick={() => setCreating(true)} onKeyDown={(e) => e.key === "Enter" && setCreating(true)}>
          <Plus size={28} />
          <b>Add a lecture</b>
          <span className="small">e.g. Analysis I, Physik, Informatik…</span>
        </div>
      </div>

      {!courses.length && (
        <div className="card" style={{ marginTop: 22 }}>
          <h2>How it works</h2>
          <ol className="md" style={{ margin: 0 }}>
            <li>
              <b>Create a lecture</b> and set the exam date.
            </li>
            <li>
              <b>Upload</b> slides/scripts, exercise sheets (Serien), solutions and past exams – PDF, PowerPoint, Word, images, notebooks, Markdown.
            </li>
            <li>
              The app works out <b>what's important</b> (exercises and old exams are the strongest signal) and builds your <b>study plan</b>.
            </li>
            <li>
              Study with the viewer, <b>flashcards</b> (spaced repetition), <b>exercise tracker</b>, <b>quizzes</b> and strict <b>exam practice</b>.
            </li>
          </ol>
        </div>
      )}

      {archived.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 className="muted">Archived</h3>
          <div className="row">
            {archived.map((c) => (
              <a key={c.id} className="btn sm" href={`#/c/${c.id}`}>
                {c.emoji} {c.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <LectureForm
          onClose={() => {
            setCreating(false);
            if (route.query.get("new")) navigate("#/", true);
          }}
          onSaved={(c) => setTimeout(() => navigate(`#/c/${c.id}/files`))}
        />
      )}
    </div>
  );
}
