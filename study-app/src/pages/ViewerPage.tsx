import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Crosshair, Download, Layers, MessageSquare, PanelRightClose, PanelRightOpen, PenLine, Sparkles, StickyNote, ZoomIn, ZoomOut } from "lucide-react";
import { get, update, useStore } from "../lib/store";
import { navigate, useRoute } from "../lib/router";
import { loadBlob } from "../lib/vault";
import { openPdf, pdfjs, type PdfHandle } from "../lib/pdf";
import { TIER_LABEL, TIER_VALUE, tierOf } from "../lib/importance";
import { markPageSeenSoon, setPageOverride, setPagesSeen } from "../lib/library";
import { Markdown, TierBadge } from "../components/ui";
import { AiPanel, CardsPanel, NotesPanel, TasksPanel } from "../components/ViewerPanels";
import { downloadMaterial } from "./FilesPage";
import type { Material, Tier } from "../lib/types";

type Panel = "notes" | "cards" | "tasks" | "ai";

export function ViewerPage({ materialId }: { materialId: string }) {
  useStore();
  const route = useRoute();
  const material = get("material", materialId);
  const insight = get("insight", materialId);
  const text = get("text", materialId);
  const initialPage = Number(route.query.get("page")) || material?.lastPage || 1;
  const [page, setPage] = useState(initialPage);
  const [focus, setFocus] = useState(route.query.get("focus") === "1");
  const [panel, setPanel] = useState<Panel>((route.query.get("panel") as Panel) || (material?.kind === "exercise" ? "tasks" : "notes"));
  const [sideOpen, setSideOpen] = useState(window.innerWidth > 720);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ kind: "card" | "note" | "ask"; text: string; n: number } | null>(null);

  // Jump when the URL page changes (e.g. clicking a search result).
  useEffect(() => {
    const p = Number(route.query.get("page"));
    if (p) setPage(p);
    const pn = route.query.get("panel") as Panel | null;
    if (pn) {
      setPanel(pn);
      setSideOpen(true);
    }
  }, [route.raw]);

  useEffect(() => {
    if (!material) return;
    update("material", material.id, { lastPage: page, lastOpenedAt: Date.now() });
    markPageSeenSoon(material.id, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, material?.id]);

  const total = material?.pageCount ?? 1;
  const tiers = useMemo(() => Array.from({ length: total }, (_, i) => tierOf(insight, i + 1)), [insight, total]);
  const focusable = (p: number) => !focus || TIER_VALUE[tiers[p - 1] ?? "important"] >= TIER_VALUE.important;

  const go = useCallback(
    (dir: 1 | -1) => {
      let p = page + dir;
      while (p >= 1 && p <= total && !focusable(p)) p += dir;
      if (p >= 1 && p <= total) setPage(p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, total, focus, tiers],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!material) {
    return (
      <div className="page">
        <p>This file no longer exists.</p>
        <a className="btn" href="#/">
          Back
        </a>
      </div>
    );
  }

  const tier = tiers[page - 1];
  const override = insight?.overrides[page];
  const seen = (material.seenPages ?? []).includes(page);

  const onMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    const s = sel?.toString().trim() ?? "";
    if (s.length > 2) setSelection({ text: s, x: Math.min(e.clientX, window.innerWidth - 300), y: Math.max(10, e.clientY - 52) });
    else setSelection(null);
  };

  const applySelection = (kind: "card" | "note" | "ask") => {
    if (!selection) return;
    setDraft({ kind, text: selection.text, n: Date.now() });
    setPanel(kind === "card" ? "cards" : kind === "note" ? "notes" : "ai");
    setSideOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="page wide">
      <div className="viewer">
        <div className="viewer-main">
          <div className="viewer-bar">
            <button className="btn ghost icon" onClick={() => navigate(`#/c/${material.courseId}/files`)} aria-label="Back to files">
              <ArrowLeft size={18} />
            </button>
            <span className="title ellipsis" title={material.title}>
              {material.title}
            </span>
            {total > 1 && (
              <div className="row nowrap" style={{ gap: 4 }}>
                <button className="btn icon sm" onClick={() => go(-1)} disabled={page <= 1} aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <input
                  className="input"
                  style={{ width: 46, padding: "3px 4px", textAlign: "center" }}
                  value={page}
                  aria-label="Page"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= total) setPage(n);
                  }}
                />
                <span className="small muted">/ {total}</span>
                <button className="btn icon sm" onClick={() => go(1)} disabled={page >= total} aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            {insight && (
              <button
                className={`btn sm ${focus ? "primary" : ""}`}
                onClick={() => setFocus((f) => !f)}
                title="Focus mode: skip optional and unimportant pages when paging"
              >
                <Crosshair size={14} /> Focus
              </button>
            )}
            {insight && (
              <span className="row nowrap" style={{ gap: 4 }}>
                <TierBadge tier={tier} title={insight.reasons[page - 1] || undefined} />
                <select
                  className="input"
                  style={{ width: "auto", padding: "2px 6px", fontSize: "0.8rem" }}
                  value={override ?? ""}
                  aria-label="Override importance of this page"
                  title="Override importance of this page"
                  onChange={(e) => setPageOverride(material.id, page, (e.target.value || null) as Tier | null)}
                >
                  <option value="">{override ? "Auto" : "Rate…"}</option>
                  {(["core", "important", "optional", "skip"] as Tier[]).map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABEL[t]}
                    </option>
                  ))}
                </select>
              </span>
            )}
            <button
              className={`btn sm ${seen ? "" : "ghost"}`}
              onClick={() => setPagesSeen(material.id, [page], !seen)}
              title={seen ? "Studied – click to mark as not studied" : "Mark as studied"}
            >
              {seen ? "✓ Studied" : "Studied?"}
            </button>
            <button className="btn icon ghost" onClick={() => downloadMaterial(material)} aria-label="Download original" title="Download original">
              <Download size={16} />
            </button>
            <button className="btn icon ghost" onClick={() => setSideOpen((v) => !v)} aria-label="Toggle side panel">
              {sideOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
          {insight && total > 1 && (
            <div className="tier-strip" aria-label="Importance of each page">
              {tiers.map((t, i) => (
                <button
                  key={i}
                  className={`${t ?? "important"} ${i + 1 === page ? "current" : ""} ${(material.seenPages ?? []).includes(i + 1) ? "seen" : ""}`}
                  title={`p. ${i + 1}: ${t ? TIER_LABEL[t] : ""}${insight.reasons[i] ? ` – ${insight.reasons[i]}` : ""}`}
                  onClick={() => setPage(i + 1)}
                />
              ))}
            </div>
          )}
          <div className="viewer-scroll" onMouseUp={onMouseUp}>
            <MaterialView material={material} page={page} pageText={text?.pages[page - 1] ?? ""} />
            {focus && tier && TIER_VALUE[tier] < TIER_VALUE.important && (
              <div className="pill warn" style={{ marginTop: 10 }}>
                This page is rated "{TIER_LABEL[tier]}" – focus mode skips pages like this.
              </div>
            )}
          </div>
        </div>
        {sideOpen && (
          <aside className="viewer-side">
            <div className="tabs" role="tablist">
              <button className={`tab ${panel === "notes" ? "active" : ""}`} onClick={() => setPanel("notes")}>
                <StickyNote size={14} /> Notes
              </button>
              <button className={`tab ${panel === "cards" ? "active" : ""}`} onClick={() => setPanel("cards")}>
                <Layers size={14} /> Cards
              </button>
              {(material.kind === "exercise" || material.kind === "exam") && (
                <button className={`tab ${panel === "tasks" ? "active" : ""}`} onClick={() => setPanel("tasks")}>
                  <PenLine size={14} /> Tasks
                </button>
              )}
              <button className={`tab ${panel === "ai" ? "active" : ""}`} onClick={() => setPanel("ai")}>
                <Sparkles size={14} /> AI tutor
              </button>
            </div>
            <div className="side-body">
              {panel === "notes" && <NotesPanel material={material} page={page} draft={draft?.kind === "note" ? draft : undefined} />}
              {panel === "cards" && <CardsPanel material={material} page={page} draft={draft?.kind === "card" ? draft : undefined} />}
              {panel === "tasks" && <TasksPanel material={material} page={page} />}
              {panel === "ai" && <AiPanel material={material} page={page} draft={draft?.kind === "ask" ? draft : undefined} />}
            </div>
          </aside>
        )}
      </div>
      {selection && (
        <div className="sel-toolbar" style={{ left: selection.x, top: selection.y }} onMouseDown={(e) => e.preventDefault()}>
          <button onClick={() => applySelection("card")}>
            <Layers size={14} /> Flashcard
          </button>
          <button onClick={() => applySelection("note")}>
            <StickyNote size={14} /> Note
          </button>
          <button onClick={() => applySelection("ask")}>
            <MessageSquare size={14} /> Ask AI
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- rendering the file ----------

function useMaterialData(material: Material) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setData(null);
    loadBlob(material.blobId)
      .then((d) => {
        if (!alive) return;
        if (!d) setError("File data missing.");
        else setData(d);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [material.blobId]);
  return { data, error };
}

function MaterialView({ material, page, pageText }: { material: Material; page: number; pageText: string }) {
  const { data, error } = useMaterialData(material);
  if (error) return <div className="pill bad">{error}</div>;
  if (!data) return <div className="muted">Decrypting…</div>;
  switch (material.view) {
    case "pdf":
      return <PdfView data={data} page={page} />;
    case "image":
      return <ImageView data={data} mime={material.mimeType} />;
    case "text":
      return (
        <div className="text-page">
          <Markdown text={pageText} />
        </div>
      );
    case "slides":
    case "doc":
      return (
        <div className="text-page plain">
          <div className="tiny muted" style={{ marginBottom: 10 }}>
            {material.view === "slides" ? `Slide ${page} – text only. Export the slides to PDF to see the full layout.` : `Section ${page}`}
          </div>
          {pageText || <span className="muted">(no text on this slide)</span>}
        </div>
      );
    default:
      return (
        <div className="empty">
          <div className="big">📦</div>
          <p>This file type can't be previewed. Use the download button to open it.</p>
        </div>
      );
  }
}

function ImageView({ data, mime }: { data: ArrayBuffer; mime: string }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([data], { type: mime })), [data, mime]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" style={{ maxWidth: "100%", boxShadow: "var(--shadow-lg)", background: "white" }} />;
}

function PdfView({ data, page }: { data: ArrayBuffer; page: number }) {
  const [pdf, setPdf] = useState<PdfHandle | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let handle: PdfHandle | null = null;
    let alive = true;
    openPdf(data)
      .then((h) => {
        handle = h;
        if (alive) setPdf(h);
        else h.destroy();
      })
      .catch((e) => setError(`Could not open PDF: ${e?.message ?? e}`));
    return () => {
      alive = false;
      handle?.destroy();
    };
  }, [data]);

  useEffect(() => {
    const el = outerRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 40));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let textLayer: InstanceType<typeof pdfjs.TextLayer> | null = null;
    (async () => {
      const p = await pdf.doc.getPage(Math.min(Math.max(1, page), pdf.doc.numPages));
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const scale = zoom === "fit" ? Math.max(0.3, Math.min(3, width / base.width)) : zoom;
      const viewport = p.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const wrap = wrapRef.current!;
      wrap.style.width = `${Math.floor(viewport.width)}px`;
      wrap.style.height = `${Math.floor(viewport.height)}px`;
      wrap.style.setProperty("--total-scale-factor", String(scale));
      wrap.style.setProperty("--scale-round-x", "1px");
      wrap.style.setProperty("--scale-round-y", "1px");
      const render = p.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task = render;
      await render.promise.catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "RenderingCancelledException") throw e;
      });
      if (cancelled) return;
      const tdiv = textRef.current!;
      tdiv.replaceChildren();
      textLayer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: tdiv, viewport });
      await textLayer.render().catch(() => {});
    })().catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, zoom, width]);

  const cur = zoom === "fit" ? null : zoom;
  return (
    <div ref={outerRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
      {error && <div className="pill bad">{error}</div>}
      <div className="row nowrap" style={{ gap: 4, alignSelf: "flex-end" }}>
        <button className="btn icon sm" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.4, (cur ?? width / 800) - 0.2))}>
          <ZoomOut size={15} />
        </button>
        <button className={`btn sm ${zoom === "fit" ? "primary" : ""}`} onClick={() => setZoom("fit")}>
          Fit
        </button>
        <button className="btn icon sm" aria-label="Zoom in" onClick={() => setZoom(Math.min(4, (cur ?? width / 800) + 0.2))}>
          <ZoomIn size={15} />
        </button>
      </div>
      <div ref={wrapRef} className="page-wrap">
        <canvas ref={canvasRef} />
        <div ref={textRef} className="textLayer" />
      </div>
    </div>
  );
}
