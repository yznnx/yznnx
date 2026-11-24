import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  ChevronsUpDown,
  CircleHelp,
  FolderOpen,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Library,
  Lock,
  Pause,
  PenLine,
  Play,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  StickyNote,
  Target,
} from "lucide-react";
import { navigate, useRoute } from "../lib/router";
import { all, bumpActivity, get, settings, today, useStore } from "../lib/store";
import { countDue } from "../lib/srs";
import { urgency } from "../lib/planner";
import { toast } from "./ui";

export function Sidebar({ open, courseId, onLock }: { open: boolean; courseId?: string; onLock: () => void }) {
  useStore();
  const route = useRoute();
  const course = get("course", courseId);
  const [switcher, setSwitcher] = useState(false);
  const s = settings();
  const newLeft = Math.max(0, s.newCardsPerDay - today().newCards);
  const courseCards = all("card").filter((c) => c.courseId === courseId);
  const due = countDue(courseCards, newLeft).total;
  const allDue = countDue(all("card"), newLeft).total;
  const openTasks = all("task").filter((t) => t.courseId === courseId && t.status !== "solved").length;
  const u = urgency(course);

  const path = route.parts.join("/");
  const item = (href: string, icon: React.ReactNode, label: string, count?: number, match?: string) => {
    const target = href.replace(/^#\//, "");
    const active = match ? path === match : path === target || (target !== "" && path.startsWith(target + "/") && !target.startsWith("c/") );
    return (
      <a className={`nav-item ${active ? "active" : ""}`} href={href} key={href}>
        {icon}
        <span>{label}</span>
        {!!count && <span className="count">{count}</span>}
      </a>
    );
  };

  return (
    <nav className={`sidebar ${open ? "open" : ""}`} aria-label="Main">
      <div className="brand">
        <span>📚</span>
        <span>
          Study Vault
          <br />
          <small>private · encrypted · offline</small>
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <button className="lecture-switch" onClick={() => setSwitcher((v) => !v)} aria-haspopup="listbox" aria-expanded={switcher}>
          <span className="emoji">{course?.emoji ?? "🎓"}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <div className="name">{course?.name ?? "Choose a lecture"}</div>
            <div className="sub">{course ? u.label || "Current lecture" : "Switch environment"}</div>
          </span>
          <ChevronsUpDown size={16} className="muted" />
        </button>
        {switcher && <LectureSwitcher currentId={courseId} onClose={() => setSwitcher(false)} />}
      </div>

      {course && (
        <>
          <div className="nav-section">This lecture</div>
          {item(`#/c/${course.id}`, <LayoutDashboard size={18} />, "Overview & plan", undefined, `c/${course.id}`)}
          {item(`#/c/${course.id}/files`, <FolderOpen size={18} />, "Files", undefined, `c/${course.id}/files`)}
          {item(`#/c/${course.id}/topics`, <Target size={18} />, "What's important", undefined, `c/${course.id}/topics`)}
          {item(`#/c/${course.id}/cards`, <Layers size={18} />, "Flashcards", due, `c/${course.id}/cards`)}
          {item(`#/c/${course.id}/exercises`, <PenLine size={18} />, "Exercises", openTasks, `c/${course.id}/exercises`)}
          {item(`#/c/${course.id}/quiz`, <CircleHelp size={18} />, "Quiz", undefined, `c/${course.id}/quiz`)}
          {item(`#/c/${course.id}/exam`, <GraduationCap size={18} />, "Exam practice", undefined, `c/${course.id}/exam`)}
          {item(`#/c/${course.id}/notes`, <StickyNote size={18} />, "Notes", undefined, `c/${course.id}/notes`)}
          {item(`#/c/${course.id}/tutor`, <Sparkles size={18} />, "AI tutor", undefined, `c/${course.id}/tutor`)}
          {item(`#/c/${course.id}/search`, <Search size={18} />, "Search", undefined, `c/${course.id}/search`)}
        </>
      )}

      <div className="nav-section">Everything</div>
      {item("#/", <Library size={18} />, "My lectures", undefined, "")}
      {item("#/today", <CalendarCheck size={18} />, "Today (all lectures)", undefined, "today")}
      {item("#/review", <BookOpen size={18} />, "Review all cards", allDue, "review")}
      {item("#/search", <Search size={18} />, "Search everything", undefined, "search")}

      <div className="sidebar-foot">
        <StudyTimer courseId={courseId} />
        {item("#/settings", <SettingsIcon size={18} />, "Settings", undefined, "settings")}
        <button className="nav-item" onClick={onLock}>
          <Lock size={18} /> <span>Lock</span>
        </button>
      </div>
    </nav>
  );
}

function LectureSwitcher({ currentId, onClose }: { currentId?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => window.addEventListener("mousedown", h));
    return () => window.removeEventListener("mousedown", h);
  }, [onClose]);
  const courses = all("course")
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div
      ref={ref}
      role="listbox"
      className="card"
      style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, padding: 6, boxShadow: "var(--shadow-lg)" }}
    >
      {courses.map((c) => (
        <button
          key={c.id}
          role="option"
          aria-selected={c.id === currentId}
          className={`nav-item ${c.id === currentId ? "active" : ""}`}
          onClick={() => {
            onClose();
            navigate(`#/c/${c.id}`);
          }}
        >
          <span>{c.emoji}</span>
          <span className="ellipsis">{c.name}</span>
        </button>
      ))}
      {!courses.length && <div className="small muted" style={{ padding: 8 }}>No lectures yet.</div>}
      <hr style={{ margin: "6px 0" }} />
      <button
        className="nav-item"
        onClick={() => {
          onClose();
          navigate("#/?new=1");
        }}
      >
        ＋ New lecture
      </button>
      <button
        className="nav-item"
        onClick={() => {
          onClose();
          navigate("#/");
        }}
      >
        <Library size={16} /> All my lectures
      </button>
    </div>
  );
}

// ---------- Pomodoro study timer ----------

interface TimerState {
  mode: "idle" | "focus" | "break";
  endsAt: number;
  pausedLeft: number | null;
  startedAt: number;
  courseId?: string;
}
let timer: TimerState = { mode: "idle", endsAt: 0, pausedLeft: null, startedAt: 0 };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    o.start();
    o.stop(ctx.currentTime + 0.8);
  } catch {
    /* no audio */
  }
}

function logFocus(minutes: number, courseId?: string) {
  if (minutes < 1) return;
  bumpActivity({ minutes: Math.round(minutes) }, courseId ? { courseId, minutes: Math.round(minutes) } : undefined);
}

function StudyTimer({ courseId }: { courseId?: string }) {
  const [, force] = useState(0);
  const s = settings();
  useEffect(() => {
    const iv = setInterval(() => {
      if (timer.mode !== "idle" && timer.pausedLeft === null && Date.now() >= timer.endsAt) {
        beep();
        if (timer.mode === "focus") {
          logFocus(s.pomodoroMinutes, timer.courseId);
          toast(`Focus session done (${s.pomodoroMinutes} min) – take a ${s.breakMinutes} min break.`);
          timer = { ...timer, mode: "break", endsAt: Date.now() + s.breakMinutes * 60_000, startedAt: Date.now() };
        } else {
          toast("Break over – ready for the next round?");
          timer = { mode: "idle", endsAt: 0, pausedLeft: null, startedAt: 0 };
        }
      }
      force((x) => x + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [s.pomodoroMinutes, s.breakMinutes]);

  const left = timer.pausedLeft ?? Math.max(0, timer.endsAt - Date.now());
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  if (timer.mode === "idle") {
    return (
      <button
        className="nav-item"
        onClick={() => {
          timer = { mode: "focus", endsAt: Date.now() + s.pomodoroMinutes * 60_000, pausedLeft: null, startedAt: Date.now(), courseId };
          force((x) => x + 1);
        }}
      >
        <Play size={18} /> <span>Start {s.pomodoroMinutes}-min focus</span>
      </button>
    );
  }
  return (
    <div className="timer">
      <div className="row nowrap">
        <div>
          <div className="tiny muted">{timer.mode === "focus" ? `Focus${timer.courseId ? ` · ${get("course", timer.courseId)?.name ?? ""}` : ""}` : "Break"}</div>
          <div className="time">
            {mm}:{ss}
          </div>
        </div>
        <span className="spacer" />
        <button
          className="btn icon sm"
          aria-label={timer.pausedLeft !== null ? "Resume" : "Pause"}
          onClick={() => {
            timer =
              timer.pausedLeft !== null
                ? { ...timer, endsAt: Date.now() + timer.pausedLeft, pausedLeft: null }
                : { ...timer, pausedLeft: Math.max(0, timer.endsAt - Date.now()) };
            force((x) => x + 1);
          }}
        >
          {timer.pausedLeft !== null ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          className="btn icon sm"
          aria-label="Stop"
          onClick={() => {
            if (timer.mode === "focus") {
              const total = s.pomodoroMinutes * 60_000;
              const done = (total - (timer.pausedLeft ?? Math.max(0, timer.endsAt - Date.now()))) / 60_000;
              logFocus(done, timer.courseId);
            }
            timer = { mode: "idle", endsAt: 0, pausedLeft: null, startedAt: 0 };
            force((x) => x + 1);
          }}
        >
          <Square size={15} />
        </button>
      </div>
    </div>
  );
}
