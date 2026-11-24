import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { all, bumpActivity, get, put, settings, today, useStore } from "../lib/store";
import { cardStrength, pickNext, previewIntervals, schedule, type Rating } from "../lib/srs";
import { buildPlan } from "../lib/planner";
import { useRoute } from "../lib/router";
import { Empty, Markdown, TierBadge } from "../components/ui";
import { tierOf } from "../lib/importance";
import { formatInterval } from "../lib/util";
import { CardEditor } from "./CardsPage";

const LABELS: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
const CLASSES: Record<Rating, string> = { 1: "again", 2: "hard", 3: "good", 4: "easy" };

export function ReviewPage({ courseId }: { courseId?: string }) {
  useStore();
  const route = useRoute();
  const weakMode = route.query.get("mode") === "weak";
  const s = settings();
  const course = get("course", courseId);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [lastId, setLastId] = useState<string | undefined>();
  const [stats, setStats] = useState({ done: 0, again: 0 });
  const [editing, setEditing] = useState(false);
  const [weakQueue] = useState(() =>
    all("card")
      .filter((c) => (!courseId || c.courseId === courseId) && !c.suspended && c.srs.phase !== "new" && (c.srs.lapses >= 2 || cardStrength(c) < 0.25))
      .map((c) => c.id),
  );
  const [weakIndex, setWeakIndex] = useState(0);
  const typeRef = useRef<HTMLTextAreaElement>(null);

  // Makes sure "new card priority" (important pages first) is up to date.
  useMemo(() => buildPlan(courseId), [courseId]);

  const pool = all("card").filter((c) => !courseId || c.courseId === courseId);
  const newLeft = Math.max(0, s.newCardsPerDay - today().newCards);
  const card = weakMode ? get("card", weakQueue[weakIndex]) : pickNext(pool, newLeft, Date.now(), lastId);
  const previews = card ? previewIntervals(card.srs) : null;

  useEffect(() => {
    setRevealed(false);
    setTyped("");
    setTimeout(() => typeRef.current?.focus());
  }, [card?.id, stats.done]);

  const rate = (r: Rating) => {
    if (!card || !revealed) return;
    const wasNew = card.srs.phase === "new";
    put("card", { ...card, srs: schedule(card.srs, r) });
    bumpActivity({ reviews: 1, newCards: wasNew ? 1 : 0 });
    setStats((x) => ({ done: x.done + 1, again: x.again + (r === 1 ? 1 : 0) }));
    setLastId(card.id);
    if (weakMode) setWeakIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      const inText = (e.target as HTMLElement).closest("textarea, input");
      if (!revealed) {
        if ((e.key === "Enter" && (e.ctrlKey || e.metaKey || !inText)) || (e.key === " " && !inText)) {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (inText) return;
      if (["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        rate(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title = weakMode ? "Drill hard cards" : "Review";
  const scope = course ? `${course.emoji} ${course.name}` : "All lectures";

  if (!card) {
    return (
      <div className="page">
        <h1>
          {title} · {scope}
        </h1>
        <Empty icon="✅" title={stats.done ? `Done – ${stats.done} cards reviewed` : "Nothing to review right now"}>
          <p>{stats.done ? `You forgot ${stats.again} of them – they come back soon.` : "Come back later, or add more cards from your material."}</p>
          <a className="btn primary" href={course ? `#/c/${course.id}` : "#/today"}>
            Back to the plan
          </a>
        </Empty>
      </div>
    );
  }

  const m = get("material", card.materialId);
  const tier = m && card.page ? tierOf(get("insight", m.id), card.page) : undefined;
  const cardCourse = get("course", card.courseId);

  return (
    <div className="page">
      <div className="flash">
        <div className="row" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <span className="muted">· {scope}</span>
          <span className="spacer" />
          <span className="pill">{stats.done} done</span>
          {weakMode && (
            <span className="pill">
              {weakIndex + 1}/{weakQueue.length}
            </span>
          )}
        </div>
        <div className="flash-card">
          <div className="row tiny muted" style={{ marginBottom: 12 }}>
            {!courseId && cardCourse && (
              <span>
                {cardCourse.emoji} {cardCourse.name}
              </span>
            )}
            <span className="pill">{card.srs.phase === "new" ? "New" : card.srs.phase === "review" ? `Review · ${formatInterval(card.srs.interval)}` : "Learning"}</span>
            <TierBadge tier={tier} />
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setEditing(true)} aria-label="Edit card">
              <Pencil size={13} />
            </button>
          </div>
          <Markdown text={card.front} />
          {s.typeAnswers && (
            <textarea
              ref={typeRef}
              className="input"
              rows={3}
              style={{ marginTop: 16 }}
              placeholder={revealed ? "" : "Type your answer first – be precise (Ctrl+Enter to reveal)"}
              value={typed}
              readOnly={revealed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
          {revealed && (
            <>
              <div className="divider" />
              <Markdown text={card.back} />
              {m && (
                <div className="tiny muted" style={{ marginTop: 14 }}>
                  Source:{" "}
                  <a href={`#/m/${m.id}?page=${card.page ?? 1}`}>
                    {m.title}
                    {card.page ? `, p. ${card.page}` : ""}
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {!revealed ? (
          <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
            <button className="btn primary lg" onClick={() => setRevealed(true)}>
              Show answer <kbd>Space</kbd>
            </button>
          </div>
        ) : (
          <>
            {s.examLevel === "eth" && (
              <p className="small muted" style={{ textAlign: "center", margin: "14px 0 0" }}>
                Be strict: only press <b>Good</b> if your answer was complete and precise – all assumptions, correct notation. Missing details = <b>Hard</b> or <b>Again</b>.
              </p>
            )}
            <div className="rate-row">
              {([1, 2, 3, 4] as Rating[]).map((r) => (
                <button key={r} className={`rate-btn ${CLASSES[r]}`} onClick={() => rate(r)}>
                  {LABELS[r]}
                  <small>
                    {formatInterval(previews![r])} · <kbd>{r}</kbd>
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {editing && <CardEditor courseId={card.courseId} card={card} onClose={() => setEditing(false)} />}
    </div>
  );
}
