import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { all, get, useStore } from "../lib/store";
import { normalize } from "../lib/util";
import { TierBadge } from "../components/ui";
import { tierOf } from "../lib/importance";

interface Hit {
  key: string;
  kind: string;
  title: string;
  snippet: string;
  href: string;
  courseId: string;
  score: number;
  tier?: ReturnType<typeof tierOf>;
}

function snippetOf(text: string, terms: string[]): string {
  const norm = normalize(text);
  const idx = Math.max(0, norm.indexOf(terms[0]));
  const start = Math.max(0, idx - 70);
  return (start > 0 ? "…" : "") + text.slice(start, start + 220).replace(/\s+/g, " ") + (start + 220 < text.length ? "…" : "");
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const norm = normalize(text);
  // normalize() keeps the length except for "ß" → "ss"; fall back to plain text then.
  if (norm.length !== text.length) return <>{text}</>;
  const marks: [number, number][] = [];
  for (const t of terms) {
    let i = norm.indexOf(t);
    while (i >= 0 && t) {
      marks.push([i, i + t.length]);
      i = norm.indexOf(t, i + t.length);
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  marks.forEach(([s, e], k) => {
    if (s < pos) return;
    out.push(text.slice(pos, s));
    out.push(<mark key={k}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  out.push(text.slice(pos));
  return <>{out}</>;
}

export function SearchPage({ courseId }: { courseId?: string }) {
  useStore();
  const [q, setQ] = useState("");
  const course = get("course", courseId);
  const terms = normalize(q).split(/\s+/).filter((t) => t.length >= 2);

  const hits = useMemo(() => {
    if (!terms.length) return [];
    const out: Hit[] = [];
    const inScope = (c: string) => !courseId || c === courseId;
    const matches = (text: string) => {
      const n = normalize(text);
      let score = 0;
      for (const t of terms) {
        const c = n.split(t).length - 1;
        if (!c) return 0;
        score += c;
      }
      return score;
    };
    for (const m of all("material").filter((x) => inScope(x.courseId))) {
      const t = get("text", m.id);
      const titleScore = matches(m.title);
      if (titleScore) out.push({ key: m.id, kind: "File", title: m.title, snippet: m.fileName, href: `#/m/${m.id}`, courseId: m.courseId, score: titleScore + 50 });
      t?.pages.forEach((p, i) => {
        const s = matches(p);
        if (s) {
          const tier = tierOf(get("insight", m.id), i + 1);
          const boost = tier === "core" ? 3 : tier === "important" ? 2 : 1;
          out.push({ key: `${m.id}:${i}`, kind: `${m.title} · p. ${i + 1}`, title: "", snippet: snippetOf(p, terms), href: `#/m/${m.id}?page=${i + 1}`, courseId: m.courseId, score: s * boost, tier });
        }
      });
    }
    for (const n of all("note").filter((x) => inScope(x.courseId))) {
      const s = matches(n.title + " " + n.body);
      if (s) out.push({ key: n.id, kind: "Note", title: n.title, snippet: snippetOf(n.body, terms), href: n.materialId ? `#/m/${n.materialId}?page=${n.page ?? 1}&panel=notes` : `#/c/${n.courseId}/notes`, courseId: n.courseId, score: s + 5 });
    }
    for (const c of all("card").filter((x) => inScope(x.courseId))) {
      const s = matches(c.front + " " + c.back);
      if (s) out.push({ key: c.id, kind: "Flashcard", title: c.front.slice(0, 120), snippet: snippetOf(c.back, terms), href: `#/c/${c.courseId}/cards`, courseId: c.courseId, score: s + 3 });
    }
    for (const t of all("task").filter((x) => inScope(x.courseId))) {
      const s = matches(`${t.title} ${t.description} ${t.solution}`);
      if (s) out.push({ key: t.id, kind: "Exercise", title: `${get("material", t.materialId)?.title ?? ""} ${t.title}`, snippet: snippetOf(t.description + " " + t.solution, terms), href: `#/c/${t.courseId}/exercises`, courseId: t.courseId, score: s + 3 });
    }
    for (const p of all("problem").filter((x) => inScope(x.courseId))) {
      const s = matches(p.title + " " + p.statement);
      if (s) out.push({ key: p.id, kind: "Exam problem", title: p.title, snippet: snippetOf(p.statement, terms), href: `#/c/${p.courseId}/exam`, courseId: p.courseId, score: s + 3 });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, courseId]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Search{course ? ` · ${course.name}` : " everything"}</h1>
          <p>Full-text search through every page of your files, notes, flashcards and exercises. Results on core pages rank higher.</p>
        </div>
      </div>
      <div className="row nowrap" style={{ marginBottom: 16 }}>
        <Search size={20} className="muted" />
        <input className="input" style={{ fontSize: "1.05rem", padding: "11px 14px" }} autoFocus placeholder="e.g. Eigenwert, Cauchy-Folge, p-value…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {terms.length > 0 && <p className="small muted">{hits.length === 200 ? "200+" : hits.length} results</p>}
      <div className="stack" style={{ gap: 8 }}>
        {hits.map((h) => {
          const c = !courseId ? get("course", h.courseId) : undefined;
          return (
            <a key={h.key} className="card" href={h.href} style={{ padding: 12, color: "var(--text)" }}>
              <div className="row tiny muted">
                {c && (
                  <span>
                    {c.emoji} {c.name} ·
                  </span>
                )}
                <span>{h.kind}</span>
                <TierBadge tier={h.tier} />
              </div>
              {h.title && (
                <div style={{ fontWeight: 650 }}>
                  <Highlight text={h.title} terms={terms} />
                </div>
              )}
              <div className="small">
                <Highlight text={h.snippet} terms={terms} />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
