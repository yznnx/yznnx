export function uid(): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

export const DAY = 24 * 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

export function dayKey(t: number | Date = Date.now()): string {
  const d = typeof t === "number" ? new Date(t) : t;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function endOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days from today until a YYYY-MM-DD date (negative = past). */
export function daysUntil(dateStr: string, now = Date.now()): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  return Math.round((target - startOfDay(now)) / DAY);
}

export function formatInterval(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function relativeTime(t: number, now = Date.now()): string {
  const diff = now - t;
  if (diff < MINUTE) return "just now";
  if (diff < 60 * MINUTE) return `${Math.round(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.round(diff / (60 * MINUTE))} h ago`;
  if (diff < 2 * DAY) return "yesterday";
  return `${Math.round(diff / DAY)} days ago`;
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Lower-case and strip accents, for search. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function plural(n: number, word: string, pluralWord = word + "s") {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export const COURSE_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

export const COURSE_EMOJIS = ["📘", "📗", "📕", "📙", "🧮", "📊", "🧪", "💻", "⚖️", "🧠", "🌍", "🎨", "🔬", "📐", "🧬", "🏛️"];
