import { useEffect, useRef, useState } from "react";
import { Plus, Send, Square, Trash2 } from "lucide-react";
import { all, get, put, remove, useStore } from "../lib/store";
import { aiReady, chat, friendlyError, type StreamHandle } from "../lib/ai";
import { Empty, Markdown } from "../components/ui";
import { uid } from "../lib/util";
import type { ChatThread } from "../lib/types";

const STARTERS = [
  "Quiz me on the core topics – one hard question at a time, then grade my answer strictly.",
  "What are the 10 most exam-relevant results of this lecture? State them precisely with all assumptions.",
  "Which proof techniques come up repeatedly in the exercises?",
  "Make me a one-page cheat sheet of the key formulas.",
];

export function TutorPage({ courseId }: { courseId: string }) {
  useStore();
  const course = get("course", courseId)!;
  const threads = all("chat")
    .filter((t) => t.courseId === courseId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const [threadId, setThreadId] = useState<string | null>(threads[0]?.id ?? null);
  const [materialId, setMaterialId] = useState<string>("");
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [stream, setStream] = useState<StreamHandle | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const streamTextRef = useRef("");
  streamTextRef.current = streamText;
  const thread = threadId ? get("chat", threadId) : undefined;
  const mats = all("material").filter((m) => m.courseId === courseId);

  useEffect(() => {
    // (scrollIntoView returns a Promise in newer browsers – never return it from an effect)
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, streamText]);
  useEffect(() => () => stream?.abort(), [stream]);

  if (!aiReady()) {
    return (
      <div className="page">
        <h1>AI tutor · {course.name}</h1>
        <Empty icon="✨" title="The AI tutor is optional">
          <p>Add your own Anthropic API key in Settings. Material is only sent when you ask the tutor something.</p>
          <a className="btn primary" href="#/settings">
            Open Settings
          </a>
        </Empty>
      </div>
    );
  }

  const send = async (text: string) => {
    if (!text.trim() || stream) return;
    let t: ChatThread =
      thread ?? {
        id: uid(),
        courseId,
        materialId: materialId || undefined,
        title: text.slice(0, 60),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    t = { ...t, messages: [...t.messages, { role: "user", content: text.trim(), at: Date.now() }], updatedAt: Date.now() };
    put("chat", t);
    setThreadId(t.id);
    setInput("");
    setStreamText("");
    const mat = get("material", t.materialId);
    try {
      const h = chat(
        courseId,
        mat,
        t.messages.map((m) => ({ role: m.role, content: m.content })),
        setStreamText,
      );
      setStream(h);
      const reply = await h.done;
      put("chat", { ...t, messages: [...t.messages, { role: "assistant", content: reply, at: Date.now() }], updatedAt: Date.now() });
    } catch (e) {
      const partial = streamTextRef.current;
      put("chat", { ...t, messages: [...t.messages, { role: "assistant", content: (partial ? partial + "\n\n" : "") + `> ⚠️ ${friendlyError(e)}`, at: Date.now() }], updatedAt: Date.now() });
    } finally {
      setStream(null);
      setStreamText("");
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>AI tutor · {course.name}</h1>
          <p>Ask about your material, get quizzed, or let it explain a proof step by step. Answers are grounded in your uploaded files.</p>
        </div>
        <button className="btn" onClick={() => setThreadId(null)}>
          <Plus size={16} /> New chat
        </button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(200px, 260px) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="card" style={{ padding: 10 }}>
          <div className="list">
            {threads.map((t) => (
              <div key={t.id} className="list-item clickable" style={t.id === threadId ? { background: "var(--accent-2)" } : undefined} onClick={() => setThreadId(t.id)}>
                <span className="small ellipsis" style={{ flex: 1 }}>
                  {t.title}
                </span>
                <button
                  className="btn icon ghost sm"
                  aria-label="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove("chat", t.id);
                    if (threadId === t.id) setThreadId(null);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {!threads.length && <p className="small muted">No chats yet.</p>}
          </div>
        </div>
        <div className="card stack">
          {!thread && (
            <label className="field">
              Talk about
              <select className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                <option value="">The whole lecture (all files)</option>
                {mats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {thread?.materialId && <div className="small muted">About: {get("material", thread.materialId)?.title}</div>}
          <div className="chat">
            {thread?.messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="bubble user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="bubble assistant">
                  <Markdown text={m.content} />
                </div>
              ),
            )}
            {stream && (
              <div className="bubble assistant">
                <Markdown text={streamText || "…"} />
              </div>
            )}
            <div ref={bottom} />
          </div>
          {!thread && (
            <div className="stack" style={{ gap: 6 }}>
              {STARTERS.map((s) => (
                <button key={s} className="btn" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="row nowrap" style={{ alignItems: "flex-end" }}>
            <textarea
              className="input"
              rows={2}
              style={{ minHeight: 48 }}
              placeholder="Ask your tutor… (Enter to send, Shift+Enter for a new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            {stream ? (
              <button className="btn" onClick={() => stream.abort()} aria-label="Stop">
                <Square size={16} />
              </button>
            ) : (
              <button className="btn primary" onClick={() => send(input)} disabled={!input.trim()} aria-label="Send">
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
