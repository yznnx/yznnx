import { useState } from "react";
import { Pause, Pencil, Play, Plus, Trash2, Zap } from "lucide-react";
import { all, get, put, remove, settings, today, update, useStore } from "../lib/store";
import { cardStrength, countDue, isDue, isMature } from "../lib/srs";
import { makeCard } from "../lib/library";
import { Empty, Markdown, MarkdownEditor, Modal, Seg, TierBadge } from "../components/ui";
import { tierOf } from "../lib/importance";
import { formatInterval, normalize } from "../lib/util";
import type { Card } from "../lib/types";

type Filter = "all" | "due" | "new" | "hard" | "suspended";

export function CardsPage({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Card | "new" | null>(null);
  const cards = all("card").filter((c) => c.courseId === courseId);
  const newLeft = Math.max(0, settings().newCardsPerDay - today().newCards);
  const due = countDue(cards, newLeft);
  const hard = cards.filter((c) => !c.suspended && c.srs.phase !== "new" && (c.srs.lapses >= 2 || cardStrength(c) < 0.25));

  const nq = normalize(q);
  const shown = cards
    .filter((c) => {
      if (filter === "due" && !isDue(c)) return false;
      if (filter === "new" && c.srs.phase !== "new") return false;
      if (filter === "hard" && !hard.includes(c)) return false;
      if (filter === "suspended" && !c.suspended) return false;
      if (nq && !normalize(c.front + " " + c.back).includes(nq)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Flashcards · {course.name}</h1>
          <p>Spaced repetition: each card comes back just before you would forget it. New cards from core pages are introduced first.</p>
        </div>
        <button className="btn" onClick={() => setEditing("new")}>
          <Plus size={16} /> New card
        </button>
        {hard.length > 0 && (
          <a className="btn" href={`#/c/${courseId}/review?mode=weak`}>
            <Zap size={16} /> Drill {hard.length} hard cards
          </a>
        )}
        <a className={`btn primary ${due.total ? "" : "disabled"}`} href={`#/c/${courseId}/review`} aria-disabled={!due.total}>
          <Play size={16} /> Review {due.total || ""}
        </a>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <span className="value">{due.due}</span>
          <span className="label">due today</span>
        </div>
        <div className="card stat">
          <span className="value">{cards.filter((c) => c.srs.phase === "new").length}</span>
          <span className="label">new ({due.fresh} today)</span>
        </div>
        <div className="card stat">
          <span className="value">{cards.filter(isMature).length}</span>
          <span className="label">mastered</span>
        </div>
        <div className="card stat">
          <span className="value">{hard.length}</span>
          <span className="label">hard (forgot often)</span>
        </div>
      </div>

      {!cards.length ? (
        <Empty icon="🃏" title="No flashcards yet">
          <p>
            Open a file and use the <b>Cards</b> tab, select text on a slide → "Flashcard", or let the <b>AI tutor</b> write ETH-level cards for the core pages.
          </p>
        </Empty>
      ) : (
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <Seg
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All ${cards.length}` },
                { value: "due", label: "Due" },
                { value: "new", label: "New" },
                { value: "hard", label: "Hard" },
                { value: "suspended", label: "Paused" },
              ]}
            />
            <input className="input" style={{ maxWidth: 280, marginLeft: "auto" }} placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="list">
            {shown.map((c) => {
              const m = get("material", c.materialId);
              return (
                <div key={c.id} className="list-item" style={{ alignItems: "flex-start", opacity: c.suspended ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Markdown text={c.front} />
                    <div className="tiny muted" style={{ marginTop: 2 }}>
                      {c.srs.phase === "new" ? "new" : `${c.srs.phase} · every ${formatInterval(c.srs.interval || 0.007)} · forgot ${c.srs.lapses}×`}
                      {m && (
                        <>
                          {" · "}
                          <a href={`#/m/${m.id}?page=${c.page ?? 1}`}>
                            {m.title}
                            {c.page ? ` p. ${c.page}` : ""}
                          </a>{" "}
                          <TierBadge tier={c.page ? tierOf(get("insight", m.id), c.page) : undefined} />
                        </>
                      )}
                    </div>
                  </div>
                  <button className="btn icon ghost" aria-label="Edit" onClick={() => setEditing(c)}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn icon ghost" aria-label={c.suspended ? "Resume" : "Pause"} title={c.suspended ? "Resume" : "Pause (don't show in reviews)"} onClick={() => update("card", c.id, { suspended: !c.suspended })}>
                    {c.suspended ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                  <button className="btn icon ghost danger" aria-label="Delete" onClick={() => confirm("Delete this card?") && remove("card", c.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {editing && <CardEditor courseId={courseId} card={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function CardEditor({ courseId, card, onClose }: { courseId: string; card?: Card; onClose: () => void }) {
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const save = () => {
    if (!front.trim() || !back.trim()) return;
    if (card) update("card", card.id, { front: front.trim(), back: back.trim() });
    else put("card", makeCard(courseId, front, back));
    onClose();
  };
  return (
    <Modal
      title={card ? "Edit card" : "New card"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!front.trim() || !back.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          Question
          <MarkdownEditor value={front} onChange={setFront} rows={3} autoFocus />
        </div>
        <div className="field">
          Answer
          <MarkdownEditor value={back} onChange={setBack} rows={5} />
        </div>
      </div>
    </Modal>
  );
}
