import { BookOpen, CircleHelp, Layers, PenLine, Sparkles, Zap } from "lucide-react";
import type { PlanItem, PlanKind } from "../lib/planner";
import { get, all } from "../lib/store";
import { navigate } from "../lib/router";
import { dayKey, DAY } from "../lib/util";
import type { Activity } from "../lib/types";

const ICONS: Record<PlanKind, React.ReactNode> = {
  review: <Layers size={19} />,
  weak: <Zap size={19} />,
  study: <BookOpen size={19} />,
  exercise: <PenLine size={19} />,
  quiz: <CircleHelp size={19} />,
  cards: <Sparkles size={19} />,
};

export function PlanList({ items, showCourse, limit = 8 }: { items: PlanItem[]; showCourse?: boolean; limit?: number }) {
  if (!items.length) {
    return (
      <div className="empty" style={{ padding: 24 }}>
        <div className="big">🎉</div>
        <h3>Nothing urgent right now</h3>
        <p>Upload more material, add your exercises or take a practice quiz.</p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.slice(0, limit).map((it, i) => {
        const course = showCourse ? get("course", it.courseId) : undefined;
        return (
          <div key={it.id} className="plan-item" role="link" tabIndex={0} onClick={() => navigate(it.href)} onKeyDown={(e) => e.key === "Enter" && navigate(it.href)}>
            <span className="rank">{i + 1}</span>
            <span className="icon" style={course ? { background: course.color + "22", color: course.color } : undefined}>
              {ICONS[it.kind]}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="title">
                {course && (
                  <span className="muted" style={{ fontWeight: 600 }}>
                    {course.emoji} {course.name} ·{" "}
                  </span>
                )}
                {it.title}
              </div>
              <div className="reason">{it.reason}</div>
            </div>
            <span className="pill">≈ {it.minutes} min</span>
          </div>
        );
      })}
    </div>
  );
}

export function activityOf(a: Activity) {
  return a.reviews + a.quizAnswered + a.tasksSolved + a.minutes;
}

export function streak(now = Date.now()): number {
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const a = get("activity", dayKey(now - i * DAY));
    if (a && activityOf(a) > 0) n++;
    else if (i > 0) break;
  }
  return n;
}

export function Heatmap({ weeks = 20 }: { weeks?: number }) {
  const days: { key: string; value: number }[] = [];
  const now = new Date();
  const start = new Date(now.getTime() - (weeks * 7 - 1) * DAY);
  // align to Monday
  const offset = (start.getDay() + 6) % 7;
  for (let i = -offset; i < weeks * 7; i++) {
    const d = dayKey(start.getTime() + i * DAY);
    const a = get("activity", d);
    days.push({ key: d, value: a ? a.reviews + a.minutes / 2 + a.quizAnswered + a.tasksSolved * 3 : 0 });
  }
  const max = Math.max(10, ...days.map((d) => d.value));
  return (
    <div className="heatmap" aria-label="Study activity">
      {days.map((d) => (
        <div
          key={d.key}
          title={`${d.key}: ${Math.round(d.value)} activity`}
          style={d.value > 0 ? { background: "var(--good)", opacity: 0.25 + 0.75 * Math.min(1, d.value / max) } : undefined}
        />
      ))}
    </div>
  );
}

export function weekMinutes(courseId?: string) {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const a = get("activity", dayKey(Date.now() - i * DAY));
    if (!a) continue;
    total += courseId ? a.perCourseMinutes[courseId] ?? 0 : a.minutes;
  }
  return total;
}

export function totalCounts(courseId?: string) {
  const f = <T extends { courseId: string }>(arr: T[]) => (courseId ? arr.filter((x) => x.courseId === courseId) : arr);
  return {
    materials: f(all("material")).length,
    cards: f(all("card")).length,
    tasks: f(all("task")).length,
    quiz: f(all("quiz")).length,
  };
}
