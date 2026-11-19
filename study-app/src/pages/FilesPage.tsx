import { useRef, useState } from "react";
import { Download, FileText, Pencil, Trash2, UploadCloud } from "lucide-react";
import { all, deleteMaterial, get, update, useStore } from "../lib/store";
import { importFiles, recomputeInsights, type ImportProgress } from "../lib/library";
import { coverage, STUDY_KINDS } from "../lib/importance";
import { Modal, Progress, toast } from "../components/ui";
import type { Material, MaterialKind } from "../lib/types";
import { downloadBlob, formatBytes } from "../lib/util";
import { loadBlob } from "../lib/vault";

export const KIND_LABEL: Record<MaterialKind, string> = {
  lecture: "Slides / script",
  exercise: "Exercise sheet",
  solution: "Solution",
  exam: "Past exam",
  notes: "Notes / summary",
  other: "Other",
};

const KIND_ORDER: MaterialKind[] = ["lecture", "exercise", "solution", "exam", "notes", "other"];
const ACCEPT = ".pdf,.pptx,.docx,.txt,.md,.markdown,.rmd,.qmd,.tex,.csv,.ipynb,.r,.py,.m,.jl,.sql,.json,image/*";

export async function downloadMaterial(m: Material) {
  const data = await loadBlob(m.blobId);
  if (!data) return toast("File data not found.", true);
  downloadBlob(new Blob([data], { type: m.mimeType }), m.fileName);
}

export function FilesPage({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [kind, setKind] = useState<MaterialKind | "auto">("auto");
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mats = all("material").filter((m) => m.courseId === courseId);

  const upload = async (files: FileList | File[] | null) => {
    if (!files || !files.length || progress) return;
    const list = Array.from(files);
    const res = await importFiles(courseId, list, setProgress, kind === "auto" ? undefined : kind);
    setProgress(null);
    if (res.added.length) toast(`Added ${res.added.length} file${res.added.length === 1 ? "" : "s"} – importance analysed.`);
    for (const f of res.failed) toast(`${f.name}: ${f.error}`, true);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Files · {course.name}</h1>
          <p>Everything is encrypted and stored only on this device. The file type is detected from the name ("Serie 3", "Musterlösung", "Basisprüfung 2023"…) – you can change it any time.</p>
        </div>
      </div>

      <div
        className={`dropzone ${over ? "over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={34} />
        {progress ? (
          <div style={{ maxWidth: 420, margin: "8px auto 0" }}>
            <b>
              {progress.file} ({progress.index + 1}/{progress.total})
            </b>
            <div className="small">{progress.detail}</div>
            <Progress value={(progress.index + 0.5) / progress.total} />
          </div>
        ) : (
          <>
            <h3 style={{ margin: "6px 0 2px", color: "var(--text)" }}>Drop files here or click to upload</h3>
            <div className="small">PDF, PowerPoint (.pptx), Word (.docx), images, Jupyter notebooks, Markdown, R / Python files</div>
          </>
        )}
        <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => upload(e.target.files).then(() => (e.target.value = ""))} />
      </div>
      <div className="row small" style={{ margin: "8px 0 20px" }}>
        <span className="muted">Upload as:</span>
        <select className="input" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value as MaterialKind | "auto")} aria-label="Upload as">
          <option value="auto">Detect automatically</option>
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {KIND_ORDER.map((k) => {
        const list = mats.filter((m) => m.kind === k).sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.title.localeCompare(b.title));
        if (!list.length) return null;
        return (
          <div className="card" key={k}>
            <h2>
              {KIND_LABEL[k]} <span className="pill">{list.length}</span>
            </h2>
            <div className="list">
              {list.map((m) => {
                const ins = get("insight", m.id);
                const cov = coverage(m, ins);
                const core = ins ? ins.tiers.filter((t, i) => (ins.overrides[i + 1] ?? t) === "core").length : 0;
                const sol = m.solutionId ? get("material", m.solutionId) : undefined;
                return (
                  <div className="list-item" key={m.id}>
                    <FileText size={20} className="muted" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={`#/m/${m.id}`} style={{ fontWeight: 650, color: "var(--text)" }} className="ellipsis">
                        {m.title}
                      </a>
                      <div className="tiny muted">
                        {m.pageCount} {m.view === "slides" ? "slides" : "pages"} · {formatBytes(m.size)}
                        {STUDY_KINDS.has(m.kind) && ins ? ` · ${core} core pages${ins.source === "ai" ? " (AI-rated)" : ""}` : ""}
                        {sol ? ` · solution: ${sol.title}` : ""}
                      </div>
                      {STUDY_KINDS.has(m.kind) && (
                        <div style={{ maxWidth: 260, marginTop: 4 }}>
                          <Progress value={cov.total ? cov.done / cov.total : 0} />
                        </div>
                      )}
                    </div>
                    <button className="btn icon ghost" title="Edit" aria-label="Edit" onClick={() => setEditing(m)}>
                      <Pencil size={16} />
                    </button>
                    <button className="btn icon ghost" title="Download original" aria-label="Download" onClick={() => downloadMaterial(m)}>
                      <Download size={16} />
                    </button>
                    <button
                      className="btn icon ghost danger"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => {
                        if (confirm(`Delete "${m.title}"? Flashcards and notes made from it are kept.`)) {
                          deleteMaterial(m.id);
                          recomputeInsights(courseId);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {editing && <EditMaterial material={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditMaterial({ material, onClose }: { material: Material; onClose: () => void }) {
  const [title, setTitle] = useState(material.title);
  const [kind, setKind] = useState<MaterialKind>(material.kind);
  const [number, setNumber] = useState(material.number?.toString() ?? "");
  const [solutionId, setSolutionId] = useState(material.solutionId ?? "");
  const solutions = all("material").filter((m) => m.courseId === material.courseId && m.kind === "solution");
  const save = () => {
    update("material", material.id, { title: title.trim() || material.title, kind, number: number ? Number(number) : undefined, solutionId: solutionId || undefined });
    if (kind !== material.kind) recomputeInsights(material.courseId);
    onClose();
  };
  return (
    <Modal
      title="Edit file"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          Title
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="grid cols-2">
          <label className="field">
            Type
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Number <span className="hint">Lecture 3, Serie 5…</span>
            <input className="input" type="number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
        </div>
        {kind === "exercise" && (
          <label className="field">
            Matching solution <span className="hint">Used to check your answers (never shown directly).</span>
            <select className="input" value={solutionId} onChange={(e) => setSolutionId(e.target.value)}>
              <option value="">– none –</option>
              {solutions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          File: {material.fileName}
        </p>
      </div>
    </Modal>
  );
}
