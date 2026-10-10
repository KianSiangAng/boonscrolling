import { clear, getAll, kvGet, kvSet, put, putMany } from './db';
import { applyAnswer, applySeen, type ProgressRecord } from './leitner';
import type { CardInstance } from './types';

/** In-memory mirror of the progress store, written through to IndexedDB. */
const progress = new Map<string, ProgressRecord>();

export interface Activity {
  /** Local date (YYYY-MM-DD) of the last answer. */
  lastDay: string;
  streak: number;
  today: number;
  todayCorrect: number;
  total: number;
}

const EMPTY_ACTIVITY: Activity = { lastDay: '', streak: 0, today: 0, todayCorrect: 0, total: 0 };
let activity: Activity = { ...EMPTY_ACTIVITY };
const listeners = new Set<() => void>();

export function localDay(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export async function loadProgress(): Promise<void> {
  progress.clear();
  for (const rec of await getAll<ProgressRecord>('progress')) progress.set(rec.id, rec);
  activity = { ...EMPTY_ACTIVITY, ...((await kvGet<Activity>('activity')) ?? {}) };
}

export function getProgress(): ReadonlyMap<string, ProgressRecord> {
  return progress;
}

export function getActivity(): Activity {
  const today = localDay();
  if (activity.lastDay !== today) {
    const gap = activity.lastDay ? daysBetween(activity.lastDay, today) : Infinity;
    return { ...activity, today: 0, todayCorrect: 0, streak: gap <= 1 ? activity.streak : 0 };
  }
  return activity;
}

export function onProgressChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

/** Any study counts toward the streak; only graded answers count toward the daily score. */
async function bumpActivity(correct: boolean, graded: boolean) {
  const today = localDay();
  const a = getActivity();
  activity = {
    lastDay: today,
    streak: a.lastDay === today ? a.streak : a.streak + 1,
    today: a.today + (graded ? 1 : 0),
    todayCorrect: a.todayCorrect + (graded && correct ? 1 : 0),
    total: a.total + (graded ? 1 : 0),
  };
  await kvSet('activity', activity);
}

export async function recordAnswer(
  card: CardInstance,
  correct: boolean,
  graded = true,
  now = Date.now(),
): Promise<ProgressRecord> {
  const rec = applyAnswer(progress.get(card.id), card, correct, now, graded);
  progress.set(card.id, rec);
  await put('progress', rec);
  await bumpActivity(correct, graded);
  emit();
  return rec;
}

export async function recordSeen(card: CardInstance, now = Date.now()): Promise<ProgressRecord> {
  const rec = applySeen(progress.get(card.id), card, now);
  progress.set(card.id, rec);
  await put('progress', rec);
  emit();
  return rec;
}

/** Merge imported records: the most recently studied version of each card wins. */
export async function mergeProgress(records: ProgressRecord[], importedActivity?: Activity): Promise<number> {
  const changed: ProgressRecord[] = [];
  for (const rec of records) {
    const mine = progress.get(rec.id);
    if (!mine || rec.lastSeen > mine.lastSeen) {
      progress.set(rec.id, rec);
      changed.push(rec);
    }
  }
  await putMany('progress', changed);
  if (importedActivity) {
    const a = getActivity();
    const newer = importedActivity.lastDay > a.lastDay ? importedActivity : a;
    activity = { ...newer, total: Math.max(a.total, importedActivity.total) };
    await kvSet('activity', activity);
  }
  emit();
  return changed.length;
}

export async function resetProgress(): Promise<void> {
  progress.clear();
  activity = { ...EMPTY_ACTIVITY };
  await clear('progress');
  await kvSet('activity', activity);
  emit();
}
