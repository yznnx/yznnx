import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, Square, Trash2 } from "lucide-react";
import { all, get, put, remove, useStore } from "../lib/store";
import { addTasks, makeCard, parseTaskSpec } from "../lib/library";
import { aiReady, explainPage, friendlyError, generateCards, generateProblems, generateQuiz, needsVisual, type StreamHandle } from "../lib/ai";
import { GeneratedPreview, keepAll, type Generated } from "./Generated";
import { ClaudeBridgePanel } from "./ClaudeBridge";
import { Markdown, MarkdownEditor, toast } from "./ui";
import type { Material, Note, TaskStatus } from "../lib/types";
import { tierOf, TIER_VALUE } from "../lib/importance";
import { uid } from "../lib/util";
import { STATUS_LABEL, StatusPicker, setTaskStatus } from "../pages/ExercisesPage";

type Draft = { text: string; n: number };

// ---------- notes ----------

export function NotesPanel({ material, page, draft }: { material: Material; page: number; draft?: Draft }) {
  useStore();
  const existing = all("note").find((n) => n.materialId === material.id && n.page === page);
  const [body, setBody] = useState(existing?.body ?? "");
  const noteId = useRef(existing?.id ?? uid());
  const timer = useRef<number>(0);

  useEffect(() => {
    const n = all("note").find((x) => x.materialId === material.id && x.page === page);
    setBody(n?.body ?? "");
    noteId.current = n?.id ?? uid();
  }, [material.id, page]);

  useEffect(() => {
    if (draft) save((body ? body + "\n\n" : "") + `> ${draft.text.replace(/\n/g, "\n> ")}\n\n`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.n]);

  const save = (v: string) => {
    setBody(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const cur = get("note", noteId.current);
      if (!v.trim()) {
        if (cur) remove("note", cur.id);
        return;
      }
      const note: Note = cur
        ? { ...cur, body: v, updatedAt: Date.now() }
        : { id: noteId.current, courseId: material.courseId, materialId: material.id, page, title: `${material.title} – p. ${page}`, body: v, createdAt: Date.now(), updatedAt: Date.now() };
      put("note", note);
    }, 500);
  };

  const others = all("note")
    .filter((n) => n.materialId === material.id && n.page !== page)
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>Your notes for p. {page}</h3>
      <MarkdownEditor value={body} onChange={save} rows={10} placeholder="Write what you understood, questions, formulas… (saved automatically)" />
      {others.length > 0 && (
        <>
          <h3 style={{ margin: "8px 0 0" }}>Other pages</h3>
          <div className="list">
            {others.map((n) => (
              <a key={n.id} className="list-item clickable" href={`#/m/${material.id}?page=${n.page}&panel=notes`}>
                <b className="small">p. {n.page}</b>
                <span className="small muted ellipsis">{n.body.slice(0, 80)}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- flashcards ----------

export function CardsPanel({ material, page, draft }: { material: Material; page: number; draft?: Draft }) {
  useStore();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  useEffect(() => {
    if (draft) {
      setBack(draft.text);
      setFront("");
    }
  }, [draft?.n]);
  const cards = all("card").filter((c) => c.materialId === material.id);
  const here = cards.filter((c) => c.page === page);

  const add = () => {
    if (!front.trim() || !back.trim()) return;
    put("card", makeCard(material.courseId, front, back, material.id, page));
    setFront("");
    setBack("");
    toast("Flashcard added.");
  };

  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>New flashcard from p. {page}</h3>
      <label className="field">
        Question
        <textarea className="input" rows={2} value={front} onChange={(e) => setFront(e.target.value)} placeholder="e.g. State the Mean Value Theorem with all assumptions." />
      </label>
      <label className="field">
        Answer
        <textarea className="input" rows={4} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Markdown and $LaTeX$ work." />
      </label>
      <button className="btn primary" onClick={add} disabled={!front.trim() || !back.trim()}>
        <Plus size={15} /> Add card
      </button>
      <p className="tiny muted" style={{ margin: 0 }}>
        Tip: select text on the slide and press "Flashcard" to prefill the answer.
      </p>
      <hr />
      <h3 style={{ margin: 0 }}>
        Cards on this page ({here.length}) · whole file: {cards.length}
      </h3>
      {here.map((c) => (
        <div key={c.id} className="card" style={{ padding: 12 }}>
          <Markdown text={c.front} />
          <div className="divider" style={{ borderTop: "1px dashed var(--border)", margin: "8px 0" }} />
          <Markdown text={c.back} className="small" />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn sm ghost danger" onClick={() => remove("card", c.id)} aria-label="Delete card">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- exercise tasks ----------

export function TasksPanel({ material, page }: { material: Material; page: number }) {
  useStore();
  const [spec, setSpec] = useState("");
  const tasks = all("task")
    .filter((t) => t.materialId === material.id)
    .sort((a, b) => a.order - b.order);
  const add = () => {
    const titles = parseTaskSpec(spec);
    if (!titles.length) return;
    addTasks(material.courseId, material.id, titles, page);
    setSpec("");
  };
  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>Exercises on this sheet</h3>
      <div className="row nowrap">
        <input className="input" placeholder="e.g. 1a-c, 2, 3" value={spec} onChange={(e) => setSpec(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn primary" onClick={add} disabled={!spec.trim()}>
          Add
        </button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        New tasks are linked to p. {page}. Ranges like "1a-c" or "4.1-4.3" are expanded.
      </p>
      <div className="list">
        {tasks.map((t) => (
          <div key={t.id} className="list-item" style={{ alignItems: "center" }}>
            <a href={`#/m/${material.id}?page=${t.page ?? page}&panel=tasks`} style={{ fontWeight: 700, minWidth: 40 }}>
              {t.title}
            </a>
            <span className="tiny muted">{t.page ? `p. ${t.page}` : ""}</span>
            <span className="spacer" />
            <StatusPicker value={t.status} onChange={(s: TaskStatus) => setTaskStatus(t, s)} />
          </div>
        ))}
      </div>
      {tasks.length > 0 && (
        <a className="btn" href={`#/c/${material.courseId}/exercises?sheet=${material.id}`}>
          Open exercise tracker – write & check solutions
        </a>
      )}
      {!tasks.length && <p className="small muted">No tasks yet. Add the exercise numbers from this sheet to track what you solved ({Object.values(STATUS_LABEL).join(" → ")}).</p>}
    </div>
  );
}

// ---------- AI tutor ----------

type Scope = "page" | "important" | "all";

export function AiPanel({ material, page, draft }: { material: Material; page: number; draft?: Draft }) {
  useStore();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState<StreamHandle | null>(null);
  const [scope, setScope] = useState<Scope>("important");
  const [count, setCount] = useState(10);
  const [visual, setVisual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gen, setGen] = useState<Generated | null>(null);
  const [bridge, setBridge] = useState(false);

  useEffect(() => {
    if (draft) setQuestion(`Explain this: "${draft.text.slice(0, 600)}"`);
  }, [draft?.n]);

  useEffect(() => () => streaming?.abort(), [streaming]);

  if (!aiReady()) {
    return (
      <div className="stack">
        <ClaudeBridgePanel material={material} page={page} />
        <hr />
        <p className="tiny muted" style={{ margin: 0 }}>
          Want it in one click instead of copy & paste (explanations, chat, automatic grading)? Add an Anthropic API key in <a href="#/settings">Settings</a>.
        </p>
      </div>
    );
  }

  const ins = get("insight", material.id);
  const importantPages = Array.from({ length: material.pageCount }, (_, i) => i + 1).filter((p) => TIER_VALUE[tierOf(ins, p) ?? "important"] >= TIER_VALUE.important);
  const scopePages = scope === "page" ? [page] : scope === "important" ? importantPages : undefined;
  const autoVisual = needsVisual(material.id, scopePages);

  const ask = async () => {
    setAnswer("");
    try {
      const h = await explainPage(material, page, question, setAnswer);
      setStreaming(h);
      await h.done;
    } catch (e) {
      setAnswer((a) => a + `\n\n> ⚠️ ${friendlyError(e)}`);
    } finally {
      setStreaming(null);
    }
  };

  const generate = async (what: "cards" | "quiz" | "problems") => {
    setBusy(what);
    try {
      const sc = { material, pages: scopePages, visual: visual || undefined };
      if (what === "cards") setGen({ kind: "cards", items: keepAll(await generateCards(sc, { count, focus: scope === "all" ? "all" : "important", importantPages })) });
      if (what === "quiz") setGen({ kind: "quiz", items: keepAll(await generateQuiz(sc, { count, importantPages: scope === "all" ? importantPages : undefined })) });
      if (what === "problems") setGen({ kind: "problems", items: keepAll(await generateProblems(sc, { count: Math.max(1, Math.min(5, Math.round(count / 4))), importantPages })) });
    } catch (e) {
      toast(friendlyError(e), true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>Understand p. {page}</h3>
      <textarea className="input" rows={2} placeholder="Ask anything about this page… (empty = full explanation)" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <div className="row">
        {streaming ? (
          <button className="btn" onClick={() => streaming.abort()}>
            <Square size={14} /> Stop
          </button>
        ) : (
          <button className="btn primary" onClick={ask}>
            <Sparkles size={15} /> {question.trim() ? "Ask" : "Explain this page"}
          </button>
        )}
        {answer && !streaming && (
          <button
            className="btn sm ghost"
            onClick={() => {
              const n: Note = {
                id: uid(),
                courseId: material.courseId,
                materialId: material.id,
                page,
                title: `AI: ${material.title} p. ${page}`,
                body: (question ? `**Q:** ${question}\n\n` : "") + answer,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              const existing = all("note").find((x) => x.materialId === material.id && x.page === page);
              if (existing) put("note", { ...existing, body: existing.body + "\n\n---\n\n" + n.body, updatedAt: Date.now() });
              else put("note", n);
              toast("Saved to your notes for this page.");
            }}
          >
            Save to notes
          </button>
        )}
      </div>
      {answer && (
        <div className="card" style={{ padding: 12 }}>
          <Markdown text={answer} />
        </div>
      )}

      <hr />
      <h3 style={{ margin: 0 }}>Generate study material</h3>
      <div className="grid cols-2" style={{ gap: 8 }}>
        <label className="field">
          From
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="page">This page</option>
            <option value="important">Core & important pages ({importantPages.length})</option>
            <option value="all">Whole file</option>
          </select>
        </label>
        <label className="field">
          How many
          <input className="input" type="number" min={1} max={40} value={count} onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
        </label>
      </div>
      {material.view === "pdf" && (
        <label className="check small">
          <input type="checkbox" checked={visual || autoVisual} disabled={autoVisual} onChange={(e) => setVisual(e.target.checked)} />
          <span>
            Let the AI see the slides as images (better for formulas & diagrams, costs more)
            {autoVisual && <span className="muted"> – on automatically: these pages have little extractable text</span>}
          </span>
        </label>
      )}
      <div className="row">
        <button className="btn" disabled={!!busy} onClick={() => generate("cards")}>
          {busy === "cards" ? "Writing cards…" : "Flashcards"}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => generate("quiz")}>
          {busy === "quiz" ? "Writing questions…" : "Quiz questions"}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => generate("problems")}>
          {busy === "problems" ? "Writing exam problems…" : "Exam problems"}
        </button>
      </div>
      {gen && <GeneratedPreview material={material} gen={gen} onChange={setGen} onDone={() => setGen(null)} />}

      <hr />
      {bridge ? (
        <ClaudeBridgePanel material={material} page={page} />
      ) : (
        <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setBridge(true)}>
          Use the Claude app instead (copy & paste, no API cost)
        </button>
      )}
    </div>
  );
}
