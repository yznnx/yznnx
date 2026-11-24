// Use Claude with your normal subscription (no API key): copy the prompt the
// app writes, paste it into Claude, paste Claude's answer back.
import { useMemo, useState } from "react";
import { ClipboardCopy, Download, ExternalLink, Import } from "lucide-react";
import { buildBridgePrompt, copyText, openClaude, parseCards, parseImportance, parseProblems, parseQuiz, type BridgeTask } from "../lib/bridge";
import { applyAiImportance } from "../lib/library";
import { tierOf, TIER_VALUE } from "../lib/importance";
import { get, useStore } from "../lib/store";
import type { Material } from "../lib/types";
import { GeneratedPreview, keepAll, type Generated } from "./Generated";
import { toast } from "./ui";
import { downloadMaterial } from "../pages/FilesPage";

type Scope = "page" | "important" | "all";

const TASKS: { value: BridgeTask; label: string }[] = [
  { value: "quiz", label: "Hard quiz questions (ETH-style)" },
  { value: "problems", label: "Exam problems (graded later)" },
  { value: "cards", label: "Flashcards" },
  { value: "importance", label: "Rate what's important (every page)" },
];

function Steps({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="row nowrap" style={{ alignItems: "flex-start", gap: 10 }}>
      <span className="pill accent" style={{ marginTop: 2 }}>
        {n}
      </span>
      <div style={{ flex: 1, minWidth: 0 }} className="stack">
        {children}
      </div>
    </div>
  );
}

export function ClaudeBridgePanel({ material, page, initialTask = "quiz" }: { material: Material; page: number; initialTask?: BridgeTask }) {
  useStore();
  const [task, setTask] = useState<BridgeTask>(initialTask);
  const [scope, setScope] = useState<Scope>("important");
  const [count, setCount] = useState(8);
  const [attachPdf, setAttachPdf] = useState(false);
  const [copied, setCopied] = useState(0);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [gen, setGen] = useState<Generated | null>(null);

  const ins = get("insight", material.id);
  const importantPages = Array.from({ length: material.pageCount }, (_, i) => i + 1).filter((p) => TIER_VALUE[tierOf(ins, p) ?? "important"] >= TIER_VALUE.important);
  const pages = scope === "page" ? [page] : scope === "important" ? importantPages : undefined;
  const effectiveCount = task === "problems" ? Math.min(count, 5) : count;

  const prompt = useMemo(
    () => buildBridgePrompt({ task, material, pages, count: effectiveCount, importantPages, attachPdf }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task, scope, effectiveCount, attachPdf, page, material.id, ins?.updatedAt],
  );

  const copy = async () => {
    const ok = await copyText(prompt);
    if (ok) {
      setCopied(prompt.length);
      toast("Prompt copied – paste it into a new Claude chat.");
    } else toast("Copying failed – select the text in the box and copy it manually.", true);
  };

  const importReply = () => {
    setError("");
    try {
      if (task === "cards") setGen({ kind: "cards", items: keepAll(parseCards(reply)) });
      else if (task === "quiz") setGen({ kind: "quiz", items: keepAll(parseQuiz(reply)) });
      else if (task === "problems") setGen({ kind: "problems", items: keepAll(parseProblems(reply)) });
      else {
        applyAiImportance(material, parseImportance(reply));
        toast(`Claude's ratings applied to "${material.title}".`);
      }
      setReply("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="stack">
      <div>
        <h3 style={{ margin: "0 0 4px" }}>Ask Claude – no API key needed</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Uses your normal Claude subscription (Claude app or claude.ai). The app writes a strict ETH-level prompt from this file; you paste it into Claude and paste the answer
          back. Nothing is sent automatically.
        </p>
      </div>
      <label className="field">
        What should Claude make?
        <select className="input" value={task} onChange={(e) => (setTask(e.target.value as BridgeTask), setGen(null))}>
          {TASKS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {task !== "importance" && (
        <div className="grid cols-2" style={{ gap: 8 }}>
          <label className="field">
            From
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="page">This page (p. {page})</option>
              <option value="important">Core & important pages ({importantPages.length})</option>
              <option value="all">Whole file</option>
            </select>
          </label>
          <label className="field">
            How many
            <input className="input" type="number" min={1} max={task === "problems" ? 5 : 40} value={effectiveCount} onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
          </label>
        </div>
      )}
      {material.view === "pdf" && (
        <label className="check small">
          <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
          <span>
            I'll attach the PDF in Claude instead of pasting its text <span className="muted">(best for formulas, diagrams and scanned slides)</span>
          </span>
        </label>
      )}

      <Steps n={1}>
        <div className="row">
          <button className="btn primary" onClick={copy}>
            <ClipboardCopy size={15} /> Copy prompt
          </button>
          <button className="btn" onClick={openClaude}>
            <ExternalLink size={15} /> Open Claude
          </button>
          {attachPdf && (
            <button className="btn" onClick={() => downloadMaterial(material)}>
              <Download size={15} /> Save PDF to attach
            </button>
          )}
        </div>
        <span className="tiny muted">
          {copied ? `Copied (${Math.round(copied / 1000)}k characters). ` : ""}Paste it into a new chat{attachPdf ? " and attach the PDF" : ""}. For the hardest questions choose
          Claude's most capable model.
        </span>
        <details>
          <summary className="tiny muted">Show the prompt</summary>
          <textarea className="input" readOnly rows={6} value={prompt} style={{ fontSize: "0.75rem" }} onFocus={(e) => e.currentTarget.select()} />
        </details>
      </Steps>

      <Steps n={2}>
        <textarea className="input" rows={5} placeholder="Paste Claude's complete answer here (the ```json block)" value={reply} onChange={(e) => setReply(e.target.value)} />
        {error && <div className="pill bad" style={{ whiteSpace: "normal" }}>{error}</div>}
        <div>
          <button className="btn primary" disabled={!reply.trim()} onClick={importReply}>
            <Import size={15} /> Import
          </button>
        </div>
      </Steps>

      {gen && <GeneratedPreview material={material} gen={gen} onChange={setGen} onDone={() => setGen(null)} />}
    </div>
  );
}

/** Copy a grading prompt, paste Claude's verdict back. */
export function ClaudeGrader({
  buildPrompt,
  onImport,
  label = "Grade with Claude (no API key)",
  placeholder = "Paste Claude's complete answer here",
  hint,
}: {
  buildPrompt: () => string;
  /** Return an error message if the answer could not be used. */
  onImport: (text: string) => string | void;
  label?: string;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="card stack" style={{ padding: 12 }}>
      <b className="small">{label}</b>
      <div className="row">
        <button
          className="btn primary sm"
          onClick={async () => {
            const ok = await copyText(buildPrompt());
            toast(ok ? "Prompt copied – paste it into Claude." : "Copying failed.", !ok);
          }}
        >
          <ClipboardCopy size={14} /> 1. Copy prompt
        </button>
        <button className="btn sm" onClick={openClaude}>
          <ExternalLink size={14} /> Open Claude
        </button>
      </div>
      {hint && <span className="tiny muted">{hint}</span>}
      <textarea className="input" rows={4} placeholder={placeholder} value={reply} onChange={(e) => setReply(e.target.value)} />
      {error && <div className="pill bad" style={{ whiteSpace: "normal" }}>{error}</div>}
      <div className="row">
        <button
          className="btn sm primary"
          disabled={!reply.trim()}
          onClick={() => {
            const err = onImport(reply);
            if (err) setError(err);
            else {
              setError("");
              setReply("");
              setOpen(false);
            }
          }}
        >
          2. Import Claude's answer
        </button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}
