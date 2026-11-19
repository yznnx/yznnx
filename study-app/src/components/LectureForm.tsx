import { useState } from "react";
import { Modal } from "./ui";
import { COURSE_COLORS, COURSE_EMOJIS, uid } from "../lib/util";
import { put } from "../lib/store";
import type { Course } from "../lib/types";

export function LectureForm({ course, onClose, onSaved }: { course?: Course; onClose: () => void; onSaved?: (c: Course) => void }) {
  const [name, setName] = useState(course?.name ?? "");
  const [emoji, setEmoji] = useState(course?.emoji ?? COURSE_EMOJIS[Math.floor(Math.random() * COURSE_EMOJIS.length)]);
  const [color, setColor] = useState(course?.color ?? COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)]);
  const [examDate, setExamDate] = useState(course?.examDate ?? "");

  const save = () => {
    if (!name.trim()) return;
    const c: Course = {
      id: course?.id ?? uid(),
      createdAt: course?.createdAt ?? Date.now(),
      archived: course?.archived,
      name: name.trim(),
      emoji,
      color,
      examDate: examDate || undefined,
    };
    put("course", c);
    onSaved?.(c);
    onClose();
  };

  return (
    <Modal
      title={course ? "Edit lecture" : "New lecture"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!name.trim()}>
            {course ? "Save" : "Create lecture"}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          Name
          <input className="input" autoFocus placeholder="e.g. Analysis I, Lineare Algebra, Statistik…" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Exam date <span className="hint">The study plan gets more focused as the exam comes closer.</span>
          <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </label>
        <div className="field">
          Icon
          <div className="row" style={{ gap: 4 }}>
            {COURSE_EMOJIS.map((e) => (
              <button type="button" key={e} className={`btn sm ${e === emoji ? "primary" : "ghost"}`} onClick={() => setEmoji(e)} style={{ fontSize: "1.1rem" }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          Colour
          <div className="row" style={{ gap: 6 }}>
            {COURSE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: c,
                  border: c === color ? "3px solid var(--text)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
        <button hidden />
      </form>
    </Modal>
  );
}
