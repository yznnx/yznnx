import { useState } from "react";
import { Archive, Pencil, Trash2, Upload } from "lucide-react";
import { all, deleteCourse, get, update, useStore } from "../lib/store";
import { buildPlan, urgency, pageRanges } from "../lib/planner";
import { PlanList, weekMinutes } from "../components/Plan";
import { LectureForm } from "../components/LectureForm";
import { Progress, TierBadge } from "../components/ui";
import { isMature } from "../lib/srs";
import { coverage, STUDY_KINDS } from "../lib/importance";
import { navigate } from "../lib/router";
import { relativeTime } from "../lib/util";

export function LectureHome({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const [editing, setEditing] = useState(false);
  const plan = buildPlan(courseId);
  const u = urgency(course);
  const mats = all("material").filter((m) => m.courseId === courseId);
  const cards = all("card").filter((c) => c.courseId === courseId);
  const tasks = all("task").filter((t) => t.courseId === courseId);
  const quiz = all("quiz").filter((q) => q.courseId === courseId);
  const problems = all("problem").filter((p) => p.courseId === courseId);
  const quizSeen = quiz.reduce((n, q) => n + q.seen, 0);
  const quizRight = quiz.reduce((n, q) => n + q.right, 0);
  const examAttempts = problems.flatMap((p) => p.attempts);
  const examPct = examAttempts.length ? examAttempts.reduce((n, a) => n + a.score / a.maxScore, 0) / examAttempts.length : null;

  const cov = mats
    .filter((m) => STUDY_KINDS.has(m.kind))
    .reduce(
      (acc, m) => {
        const r = coverage(m, get("insight", m.id));
        return { done: acc.done + r.done, total: acc.total + r.total };
      },
      { done: 0, total: 0 },
    );

  const topics = mats
    .flatMap((m) => (get("insight", m.id)?.topics ?? []).map((t) => ({ ...t, material: m })))
    .filter((t) => t.importance === "core" && !t.mastered)
    .slice(0, 6);

  const recent = mats
    .filter((m) => m.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, 4);

  return (
    <div className="page">
      <div className="page-head">
        <span style={{ fontSize: "2.4rem", lineHeight: 1 }}>{course.emoji}</span>
        <div className="grow">
          <h1 style={{ marginBottom: 2 }}>{course.name}</h1>
          <p>
            {u.label ? <span className={`pill ${u.days !== undefined && u.days <= 14 ? "bad" : "warn"}`}>{u.label}</span> : <span className="muted">No exam date set</span>}{" "}
            {course.examDate && <span className="small muted">({new Date(course.examDate).toLocaleDateString()})</span>}
          </p>
        </div>
        <button className="btn" onClick={() => setEditing(true)}>
          <Pencil size={15} /> Edit
        </button>
        <button className="btn" onClick={() => update("course", courseId, { archived: !course.archived })} title={course.archived ? "Unarchive" : "Archive (hide from the list)"}>
          <Archive size={15} /> {course.archived ? "Unarchive" : "Archive"}
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Delete "${course.name}" with ALL its files, flashcards, exercises and notes? This cannot be undone.`)) {
              deleteCourse(courseId);
              navigate("#/");
            }
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {!mats.length && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--accent)" }}>
          <div className="row">
            <div className="grow" style={{ flex: 1 }}>
              <h2>Start by uploading your material</h2>
              <p className="muted" style={{ margin: 0 }}>
                Slides / script, exercise sheets, solutions and especially <b>past exams</b> – they tell the app what's important.
              </p>
            </div>
            <a className="btn primary lg" href={`#/c/${courseId}/files`}>
              <Upload size={17} /> Upload files
            </a>
          </div>
        </div>
      )}

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <span className="value">{cov.total ? Math.round((cov.done / cov.total) * 100) : 0}%</span>
          <span className="label">of the material studied (weighted)</span>
          <Progress value={cov.total ? cov.done / cov.total : 0} />
        </div>
        <div className="card stat">
          <span className="value">
            {cards.filter(isMature).length}/{cards.length}
          </span>
          <span className="label">flashcards mastered (≥ 21 days)</span>
        </div>
        <div className="card stat">
          <span className="value">
            {tasks.filter((t) => t.status === "solved").length}/{tasks.length}
          </span>
          <span className="label">exercises solved</span>
        </div>
        <div className="card stat">
          <span className="value">{examPct !== null ? `${Math.round(examPct * 100)}%` : quizSeen ? `${Math.round((quizRight / quizSeen) * 100)}%` : "–"}</span>
          <span className="label">{examPct !== null ? "avg. exam-practice score" : "quiz accuracy"}</span>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>Study now</h2>
          <p className="small muted">Ranked by what matters most for the exam. {weekMinutes(courseId) ? `${weekMinutes(courseId)} focus minutes this week.` : ""}</p>
          <PlanList items={plan} />
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <div className="row">
              <h2 style={{ margin: 0 }}>Core topics to master</h2>
              <span className="spacer" />
              <a className="btn sm" href={`#/c/${courseId}/topics`}>
                All topics
              </a>
            </div>
            {topics.length ? (
              <div className="list">
                {topics.map((t) => (
                  <a key={t.material.id + t.id} className="list-item clickable" href={`#/m/${t.material.id}?page=${t.pages[0] ?? 1}&focus=1`}>
                    <TierBadge tier={t.importance} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="ellipsis" style={{ fontWeight: 600 }}>
                        {t.title}
                      </div>
                      <div className="tiny muted ellipsis">
                        {t.material.title}
                        {t.pages.length ? ` · p. ${pageRanges(t.pages)}` : ""}
                        {t.why ? ` · ${t.why}` : ""}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="small muted" style={{ marginTop: 8 }}>
                {mats.length ? "All core topics marked as mastered – or no lecture slides yet." : "Upload slides to see the key topics."}
              </p>
            )}
          </div>
          {recent.length > 0 && (
            <div className="card">
              <h2>Continue where you left off</h2>
              <div className="list">
                {recent.map((m) => (
                  <a key={m.id} className="list-item clickable" href={`#/m/${m.id}?page=${m.lastPage ?? 1}`}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ellipsis" style={{ fontWeight: 600 }}>
                        {m.title}
                      </div>
                      <div className="tiny muted">
                        p. {m.lastPage ?? 1}/{m.pageCount} · {relativeTime(m.lastOpenedAt!)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {editing && <LectureForm course={course} onClose={() => setEditing(false)} />}
    </div>
  );
}
