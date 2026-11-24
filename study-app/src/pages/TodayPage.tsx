import { all, today, useStore } from "../lib/store";
import { buildPlan } from "../lib/planner";
import { Heatmap, PlanList, streak, weekMinutes } from "../components/Plan";
import { Empty } from "../components/ui";

export function TodayPage() {
  useStore();
  const plan = buildPlan();
  const t = today();
  const courses = all("course").filter((c) => !c.archived);
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>Today – all lectures</h1>
          <p>Your most important study tasks across every lecture, ranked by exam date, importance and what you keep getting wrong.</p>
        </div>
      </div>
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <span className="value">🔥 {streak()}</span>
          <span className="label">day streak</span>
        </div>
        <div className="card stat">
          <span className="value">{t.minutes}</span>
          <span className="label">focus minutes today</span>
        </div>
        <div className="card stat">
          <span className="value">{t.reviews}</span>
          <span className="label">cards reviewed today</span>
        </div>
        <div className="card stat">
          <span className="value">{Math.round(weekMinutes() / 6) / 10}h</span>
          <span className="label">studied this week</span>
        </div>
      </div>
      <div className="card">
        <h2>Study now</h2>
        {courses.length ? <PlanList items={plan} showCourse limit={12} /> : <Empty icon="📚" title="No lectures yet">Create a lecture on the "My lectures" page.</Empty>}
      </div>
      <div className="card">
        <h2>Activity</h2>
        <Heatmap />
      </div>
    </div>
  );
}
