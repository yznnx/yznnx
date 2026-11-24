// In-memory copy of your (decrypted) data + React hooks. Every change is
// written back to the encrypted vault in the background.
import { useSyncExternalStore } from "react";
import { COLLECTIONS, type Activity, type CollectionName, type Collections, type Settings } from "./types";
import { deleteBlob, deleteRecord, loadAllRecords, saveRecord, saveRecords } from "./vault";
import { dayKey } from "./util";

type Maps = { [K in CollectionName]: Map<string, Collections[K]> };

function emptyMaps(): Maps {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()])) as unknown as Maps;
}

let maps: Maps = emptyMaps();
let version = 0;
const listeners = new Set<() => void>();
let writeChain: Promise<unknown> = Promise.resolve();
let lastError: string | null = null;

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  name: "",
  theme: "system",
  newCardsPerDay: 20,
  autoLockMinutes: 30,
  pomodoroMinutes: 25,
  breakMinutes: 5,
  apiKey: "",
  aiModel: "claude-opus-5-5",
  aiLanguage: "auto",
  aiEnabled: false,
  examLevel: "eth",
  typeAnswers: true,
  negativeMarking: true,
};

function emit() {
  version++;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Re-renders the component whenever any data changes. */
export function useStore(): number {
  return useSyncExternalStore(subscribe, () => version);
}

function queue(fn: () => Promise<unknown>) {
  writeChain = writeChain
    .then(fn)
    .catch((e) => {
      console.error(e);
      lastError = e instanceof Error ? e.message : String(e);
      emit();
    });
  return writeChain;
}

export function takeSaveError(): string | null {
  const e = lastError;
  lastError = null;
  return e;
}

/** Wait until every pending write reached the disk. */
export function flushWrites() {
  return writeChain;
}

export async function loadStore() {
  const all = await loadAllRecords();
  const next = emptyMaps();
  for (const c of COLLECTIONS) {
    for (const item of all[c]) (next[c] as Map<string, unknown>).set(item.id, item);
  }
  maps = next;
  emit();
}

export function clearStore() {
  maps = emptyMaps();
  emit();
}

export function all<K extends CollectionName>(type: K): Collections[K][] {
  return Array.from(maps[type].values());
}

export function get<K extends CollectionName>(type: K, id: string | undefined): Collections[K] | undefined {
  if (!id) return undefined;
  return maps[type].get(id);
}

export function put<K extends CollectionName>(type: K, value: Collections[K]) {
  maps[type].set(value.id, value);
  emit();
  queue(() => saveRecord(type, value));
  return value;
}

export function putMany<K extends CollectionName>(type: K, values: Collections[K][]) {
  if (!values.length) return;
  for (const v of values) maps[type].set(v.id, v);
  emit();
  queue(() => saveRecords(type, values));
}

export function update<K extends CollectionName>(type: K, id: string, patch: Partial<Collections[K]>) {
  const cur = maps[type].get(id);
  if (!cur) return undefined;
  return put(type, { ...cur, ...patch });
}

export function remove(type: CollectionName, id: string) {
  maps[type].delete(id);
  emit();
  queue(() => deleteRecord(type, id));
}

export function removeBlob(id: string) {
  queue(() => deleteBlob(id));
}

export function settings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(maps.settings.get("settings") ?? {}) };
}

export function saveSettings(patch: Partial<Settings>) {
  put("settings", { ...settings(), ...patch, id: "settings" });
}

export function today(): Activity {
  const id = dayKey();
  return (
    maps.activity.get(id) ?? {
      id,
      reviews: 0,
      newCards: 0,
      minutes: 0,
      quizAnswered: 0,
      quizCorrect: 0,
      tasksSolved: 0,
      perCourseMinutes: {},
    }
  );
}

export function bumpActivity(patch: Partial<Omit<Activity, "id" | "perCourseMinutes">>, courseMinutes?: { courseId: string; minutes: number }) {
  const t = today();
  const next: Activity = { ...t, perCourseMinutes: { ...t.perCourseMinutes } };
  for (const [k, v] of Object.entries(patch) as [keyof typeof patch, number][]) {
    (next[k] as number) = ((t[k] as number) ?? 0) + v;
  }
  if (courseMinutes) {
    next.perCourseMinutes[courseMinutes.courseId] = (next.perCourseMinutes[courseMinutes.courseId] ?? 0) + courseMinutes.minutes;
  }
  put("activity", next);
}

/** Deletes a course and everything that belongs to it. */
export function deleteCourse(courseId: string) {
  for (const m of all("material").filter((m) => m.courseId === courseId)) deleteMaterial(m.id);
  for (const type of ["note", "card", "task", "quiz", "problem", "chat"] as const) {
    for (const item of all(type)) if (item.courseId === courseId) remove(type, item.id);
  }
  remove("course", courseId);
}

export function deleteMaterial(materialId: string) {
  const m = get("material", materialId);
  if (!m) return;
  removeBlob(m.blobId);
  remove("text", materialId);
  remove("insight", materialId);
  for (const other of all("material")) if (other.solutionId === materialId) update("material", other.id, { solutionId: undefined });
  // Keep cards/notes/tasks but detach them from the deleted file.
  for (const type of ["note", "card", "task", "quiz", "problem"] as const) {
    for (const item of all(type)) {
      if (item.materialId === materialId) put(type, { ...item, materialId: undefined, page: undefined } as never);
    }
  }
  remove("material", materialId);
}
