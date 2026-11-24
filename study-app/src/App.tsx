import { useCallback, useEffect, useState } from "react";
import { Toasts, toast } from "./components/ui";
import { Sidebar } from "./components/Sidebar";
import { useRoute, navigate } from "./lib/router";
import { clearStore, flushWrites, get, loadStore, saveSettings, settings, takeSaveError, useStore } from "./lib/store";
import { hasVault, isUnlocked, lockVault } from "./lib/vault";
import { SetupScreen, UnlockScreen } from "./pages/LockScreen";
import { LecturesPage } from "./pages/LecturesPage";
import { TodayPage } from "./pages/TodayPage";
import { LectureHome } from "./pages/LectureHome";
import { FilesPage } from "./pages/FilesPage";
import { TopicsPage } from "./pages/TopicsPage";
import { CardsPage } from "./pages/CardsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ExercisesPage } from "./pages/ExercisesPage";
import { QuizPage } from "./pages/QuizPage";
import { ExamPage } from "./pages/ExamPage";
import { NotesPage } from "./pages/NotesPage";
import { TutorPage } from "./pages/TutorPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ViewerPage } from "./pages/ViewerPage";
import { Menu } from "lucide-react";

type Phase = "loading" | "setup" | "locked" | "open";

export function App() {
  const [phase, setPhase] = useState<Phase>("loading");

  const refresh = useCallback(async () => {
    if (isUnlocked()) {
      await loadStore();
      setPhase("open");
    } else {
      setPhase((await hasVault()) ? "locked" : "setup");
    }
  }, []);

  useEffect(() => {
    refresh().catch((e) => {
      console.error(e);
      toast(`Could not open the local database: ${e instanceof Error ? e.message : e}`, true);
    });
  }, [refresh]);

  const lock = useCallback(async () => {
    await flushWrites();
    lockVault();
    clearStore();
    setPhase("locked");
  }, []);

  return (
    <>
      {phase === "loading" && <div className="lock" />}
      {phase === "setup" && <SetupScreen onDone={refresh} />}
      {phase === "locked" && <UnlockScreen onUnlock={refresh} />}
      {phase === "open" && <Shell onLock={lock} />}
      <Toasts />
    </>
  );
}

function useTheme() {
  useStore();
  const theme = settings().theme;
  useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

function useAutoLock(onLock: () => void) {
  useStore();
  const minutes = settings().autoLockMinutes;
  useEffect(() => {
    if (!minutes) return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    const events = ["mousemove", "keydown", "pointerdown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = window.setInterval(() => {
      if (Date.now() - last > minutes * 60_000) onLock();
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(iv);
    };
  }, [minutes, onLock]);
}

/** The lecture you are currently "inside" (from the URL, else the last one you used). */
export function useActiveCourseId(): string | undefined {
  useStore();
  const route = useRoute();
  const [a, b] = route.parts;
  if (a === "c" && b && get("course", b)) return b;
  if (a === "m" && b) return get("material", b)?.courseId;
  const last = settings().lastCourseId;
  return last && get("course", last) ? last : undefined;
}

function Shell({ onLock }: { onLock: () => void }) {
  useStore();
  useTheme();
  useAutoLock(onLock);
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeCourse = useActiveCourseId();

  // Remember which lecture you are in.
  useEffect(() => {
    if (activeCourse && activeCourse !== settings().lastCourseId) saveSettings({ lastCourseId: activeCourse });
  }, [activeCourse]);

  useEffect(() => {
    setMenuOpen(false);
  }, [route.raw]);

  useEffect(() => {
    const err = takeSaveError();
    if (err) toast(`Saving failed: ${err}`, true);
  });

  // Warn before closing the tab while writes are pending.
  useEffect(() => {
    const h = () => void flushWrites();
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, []);

  const [a, b, c] = route.parts;
  let page: React.ReactNode;
  if (!a || a === "lectures") page = <LecturesPage />;
  else if (a === "today") page = <TodayPage />;
  else if (a === "review") page = <ReviewPage />;
  else if (a === "search") page = <SearchPage />;
  else if (a === "settings") page = <SettingsPage onLock={onLock} />;
  else if (a === "m" && b) page = <ViewerPage materialId={b} />;
  else if (a === "c" && b && get("course", b)) {
    const props = { courseId: b };
    page =
      {
        files: <FilesPage {...props} />,
        topics: <TopicsPage {...props} />,
        cards: <CardsPage {...props} />,
        review: <ReviewPage {...props} />,
        exercises: <ExercisesPage {...props} />,
        quiz: <QuizPage {...props} />,
        exam: <ExamPage {...props} />,
        notes: <NotesPage {...props} />,
        tutor: <TutorPage {...props} />,
        search: <SearchPage {...props} />,
      }[c ?? ""] ?? <LectureHome {...props} />;
  } else {
    page = <LecturesPage />;
    if (a === "c") setTimeout(() => navigate("#/", true));
  }

  return (
    <div className="shell">
      <Sidebar open={menuOpen} courseId={activeCourse} onLock={onLock} />
      {menuOpen && <div className="backdrop" style={{ zIndex: 55 }} onClick={() => setMenuOpen(false)} />}
      <main className="main">
        <div className="mobile-top">
          <button className="btn ghost icon" onClick={() => setMenuOpen(true)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <b>Study Vault</b>
        </div>
        {page}
      </main>
    </div>
  );
}
