import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { all, get, put, remove, useStore } from "../lib/store";
import { Empty, Markdown, MarkdownEditor } from "../components/ui";
import { normalize, relativeTime, uid } from "../lib/util";
import type { Note } from "../lib/types";

export function NotesPage({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const nq = normalize(q);
  const notes = all("note")
    .filter((n) => n.courseId === courseId)
    .filter((n) => !nq || normalize(n.title + " " + n.body).includes(nq))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const current = selected ? get("note", selected) : undefined;

  const create = () => {
    const n: Note = { id: uid(), courseId, title: "New note", body: "", createdAt: Date.now(), updatedAt: Date.now() };
    put("note", n);
    setSelected(n.id);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Notes · {course.name}</h1>
          <p>Your own summaries, cheat sheets and page notes. Markdown and LaTeX maths supported.</p>
        </div>
        <button className="btn primary" onClick={create}>
          <Plus size={16} /> New note
        </button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="card" style={{ padding: 10 }}>
          <input className="input" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="list">
            {notes.map((n) => {
              const m = get("material", n.materialId);
              return (
                <div key={n.id} className={`list-item clickable ${selected === n.id ? "active" : ""}`} style={selected === n.id ? { background: "var(--accent-2)" } : undefined} onClick={() => setSelected(n.id)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 600 }}>
                      {n.title}
                    </div>
                    <div className="tiny muted ellipsis">
                      {m ? `${m.title}${n.page ? ` p. ${n.page}` : ""} · ` : ""}
                      {relativeTime(n.updatedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
            {!notes.length && <p className="small muted">No notes yet.</p>}
          </div>
        </div>
        <div>{current ? <NoteEditor key={current.id} note={current} onDeleted={() => setSelected(null)} /> : <Empty icon="📝" title="Pick or create a note" />}</div>
      </div>
    </div>
  );
}

function NoteEditor({ note, onDeleted }: { note: Note; onDeleted: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const timer = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const cur = get("note", note.id);
      if (cur && (cur.title !== title || cur.body !== body)) put("note", { ...cur, title, body, updatedAt: Date.now() });
    }, 400);
    return () => clearTimeout(timer.current);
  }, [title, body, note.id]);
  const m = get("material", note.materialId);
  return (
    <div className="card stack">
      <div className="row nowrap">
        <input className="input" style={{ fontWeight: 700, fontSize: "1.1rem" }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        <button
          className="btn icon ghost danger"
          aria-label="Delete note"
          onClick={() => {
            if (confirm("Delete this note?")) {
              remove("note", note.id);
              onDeleted();
            }
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {m && (
        <a className="small" href={`#/m/${m.id}?page=${note.page ?? 1}&panel=notes`}>
          ↗ {m.title}
          {note.page ? `, p. ${note.page}` : ""}
        </a>
      )}
      <MarkdownEditor value={body} onChange={setBody} rows={18} />
      {body && (
        <details>
          <summary className="small muted">Preview</summary>
          <Markdown text={body} />
        </details>
      )}
    </div>
  );
}
