import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { renderMarkdown } from "../lib/markdown";
import { TIER_HINT, TIER_LABEL } from "../lib/importance";
import type { Tier } from "../lib/types";

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function TierBadge({ tier, title }: { tier: Tier | undefined; title?: string }) {
  if (!tier) return null;
  return (
    <span className={`tier ${tier}`} title={title ?? TIER_HINT[tier]}>
      {TIER_LABEL[tier]}
    </span>
  );
}

export function Progress({ value, good }: { value: number; good?: boolean }) {
  return (
    <div className={`progress ${good ? "good" : ""}`}>
      <div style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Text area with a live preview for Markdown + LaTeX. */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className={`btn sm ${!preview ? "primary" : "ghost"}`} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" className={`btn sm ${preview ? "primary" : "ghost"}`} onClick={() => setPreview(true)}>
          Preview
        </button>
        <span className="tiny muted" style={{ marginLeft: "auto" }}>
          Markdown · maths with $x^2$ or $$\int f$$
        </span>
      </div>
      {preview ? (
        <div className="input" style={{ minHeight: rows * 22 }}>
          <Markdown text={value || "*Nothing yet*"} />
        </div>
      ) : (
        <textarea className="input" rows={rows} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ---------- toasts ----------

interface ToastMsg {
  id: number;
  text: string;
  error?: boolean;
}
let toasts: ToastMsg[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;

export function toast(text: string, error = false) {
  const t = { id: ++toastId, text, error };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  setTimeout(
    () => {
      toasts = toasts.filter((x) => x.id !== t.id);
      toastListeners.forEach((l) => l());
    },
    error ? 7000 : 3500,
  );
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Pick image files (e.g. photos of handwritten solutions) as base64. */
export function useImagePicker() {
  const [images, setImages] = useState<{ data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; url: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files) return;
    const next = [...images];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const { data, mediaType } = await downscaleImage(f);
      next.push({ data, mediaType, url: `data:${mediaType};base64,${data}` });
    }
    setImages(next.slice(0, 8));
  };
  const input = <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" hidden onChange={(e) => add(e.target.files).then(() => (e.target.value = ""))} />;
  return { images, setImages, open: () => inputRef.current?.click(), input };
}

/** Keeps photos small enough for the API (long side ≤ 1600px, JPEG). */
async function downscaleImage(file: File): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", 0.85);
    return { data: out.slice(out.indexOf(",") + 1), mediaType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageThumbs({ images, onRemove }: { images: { url: string }[]; onRemove: (i: number) => void }) {
  if (!images.length) return null;
  return (
    <div className="row" style={{ gap: 6 }}>
      {images.map((im, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img src={im.url} alt="" style={{ height: 64, borderRadius: 8, border: "1px solid var(--border)" }} />
          <button className="btn sm" style={{ position: "absolute", top: -6, right: -6, padding: "0 5px" }} onClick={() => onRemove(i)} aria-label="Remove image">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
