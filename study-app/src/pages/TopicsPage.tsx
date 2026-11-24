import { useState } from "react";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { all, get, useStore } from "../lib/store";
import { STUDY_KINDS, TIER_HINT, TIER_LABEL, tierOf } from "../lib/importance";
import { applyAiImportance, recomputeInsights, resetToAutoImportance, toggleTopicMastered } from "../lib/library";
import { aiReady, analyzeImportance, friendlyError } from "../lib/ai";
import { pageRanges } from "../lib/planner";
import { Empty, Modal, Seg, TierBadge, toast } from "../components/ui";
import { ClaudeBridgePanel } from "../components/ClaudeBridge";
import { navigate } from "../lib/router";
import type { Material, Tier } from "../lib/types";

export function TopicsPage({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const [filter, setFilter] = useState<"core" | "all">("core");
  const [busy, setBusy] = useState<string | null>(null);
  const [bridgeFor, setBridgeFor] = useState<Material | null>(null);
  const mats = all("material")
    .filter((m) => m.courseId === courseId && STUDY_KINDS.has(m.kind))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.title.localeCompare(b.title));
  const exercises = all("material").filter((m) => m.courseId === courseId && m.kind === "exercise").length;
  const exams = all("material").filter((m) => m.courseId === courseId && m.kind === "exam").length;

  const runAi = async (list: Material[]) => {
    for (const m of list) {
      setBusy(m.id);
      try {
        const res = await analyzeImportance(m);
        applyAiImportance(m, res);
        toast(`AI rated "${m.title}".`);
      } catch (e) {
        toast(`${m.title}: ${friendlyError(e)}`, true);
        break;
      }
    }
    setBusy(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>What's important · {course.name}</h1>
          <p>Every page is rated so you spend your time where it pays off in the exam. Click a page bar to open it; you can override any rating in the viewer.</p>
        </div>
        <Seg
          value={filter}
          onChange={setFilter}
          options={[
            { value: "core", label: "Core topics" },
            { value: "all", label: "All topics" },
          ]}
        />
        {aiReady() && mats.length > 0 && (
          <button className="btn primary" disabled={!!busy} onClick={() => runAi(mats)}>
            <Sparkles size={16} /> {busy ? "Analysing…" : "Analyse all with AI"}
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3>How the rating works</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Without AI, pages are scored offline: overlap with your <b>exercise sheets ({exercises})</b> and <b>past exams ({exams})</b> counts most, then words like
              Definition/Satz/Theorem/klausurrelevant, formulas and how central a concept is across the lecture. Title, agenda and organisation slides are marked as skip.
              {!exams && " Tip: upload old exams – they are the best predictor of what is tested."}
              {aiReady() ? " With AI, Claude reads the lecture together with your exercises and exams and rates every page." : " You can let Claude rate every page and name the key topics with your normal Claude subscription (\"Rate with Claude\") or with an API key in Settings."}
            </p>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {(["core", "important", "optional", "skip"] as Tier[]).map((t) => (
              <div key={t} className="row small nowrap">
                <TierBadge tier={t} /> <span className="muted">{TIER_HINT[t]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!mats.length && (
        <Empty icon="🎯" title="No slides or scripts yet">
          <a className="btn primary" href={`#/c/${courseId}/files`}>
            Upload files
          </a>
        </Empty>
      )}

      {mats.map((m) => {
        const ins = get("insight", m.id);
        const tiers = Array.from({ length: m.pageCount }, (_, i) => tierOf(ins, i + 1) ?? "important");
        const seen = new Set(m.seenPages ?? []);
        const counts = { core: 0, important: 0, optional: 0, skip: 0 } as Record<Tier, number>;
        tiers.forEach((t) => counts[t]++);
        const topics = (ins?.topics ?? []).filter((t) => filter === "all" || t.importance === "core");
        return (
          <div className="card" key={m.id}>
            <div className="row">
              <a href={`#/m/${m.id}`} style={{ color: "var(--text)" }}>
                <h2 style={{ margin: 0 }}>{m.title}</h2>
              </a>
              {ins?.source === "ai" && <span className="pill accent">AI-rated</span>}
              <span className="spacer" />
              <span className="small muted">
                {(["core", "important", "optional", "skip"] as Tier[]).map((t) => `${counts[t]} ${TIER_LABEL[t].toLowerCase()}`).join(" · ")}
              </span>
              {!aiReady() && (
                <button className="btn sm" onClick={() => setBridgeFor(m)}>
                  <Sparkles size={14} /> {ins?.source === "ai" ? "Re-rate with Claude" : "Rate with Claude"}
                </button>
              )}
              {aiReady() && (
                <button className="btn sm" disabled={!!busy} onClick={() => runAi([m])}>
                  <Sparkles size={14} /> {busy === m.id ? "Analysing…" : ins?.source === "ai" ? "Re-analyse" : "Analyse with AI"}
                </button>
              )}
              {ins?.source === "ai" && (
                <button className="btn sm ghost" title="Back to the automatic rating" onClick={() => resetToAutoImportance(m)}>
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
            <div className="tier-strip" style={{ padding: "10px 0 4px", height: 22, border: "none", background: "none" }}>
              {tiers.map((t, i) => (
                <button
                  key={i}
                  className={`${t} ${seen.has(i + 1) ? "seen" : ""}`}
                  title={`p. ${i + 1}: ${TIER_LABEL[t]}${ins?.reasons[i] ? ` – ${ins.reasons[i]}` : ""}${seen.has(i + 1) ? " · studied" : ""}`}
                  onClick={() => navigate(`#/m/${m.id}?page=${i + 1}`)}
                />
              ))}
            </div>
            {topics.length ? (
              <div className="list">
                {topics.map((t) => (
                  <div key={t.id} className="list-item" style={{ alignItems: "flex-start", opacity: t.mastered ? 0.55 : 1 }}>
                    <TierBadge tier={t.importance} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={`#/m/${m.id}?page=${t.pages[0] ?? 1}&focus=1`} style={{ fontWeight: 650, color: "var(--text)" }}>
                        {t.title}
                      </a>
                      {t.pages.length > 0 && <span className="tiny muted"> · p. {pageRanges(t.pages)}</span>}
                      {t.why && <div className="small muted">{t.why}</div>}
                      {t.keyPoints.length > 0 && (
                        <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                          {t.keyPoints.map((k, i) => (
                            <li key={i}>{k}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button className={`btn sm ${t.mastered ? "primary" : ""}`} onClick={() => toggleTopicMastered(m.id, t.id)} title="Mark as mastered">
                      <Check size={14} /> {t.mastered ? "Mastered" : "Mark mastered"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">{ins ? "No topics in this filter." : "Not analysed yet."}</p>
            )}
          </div>
        );
      })}
      {bridgeFor && (
        <Modal title={`Rate "${bridgeFor.title}" with Claude`} onClose={() => setBridgeFor(null)} wide>
          <ClaudeBridgePanel material={bridgeFor} page={1} initialTask="importance" />
        </Modal>
      )}
      {mats.length > 0 && (
        <button className="btn sm ghost" onClick={() => recomputeInsights(courseId)}>
          <RotateCcw size={14} /> Recalculate automatic ratings
        </button>
      )}
    </div>
  );
}
