import { isCategory } from './categories';
import { MAX_BOX, type ProgressRecord } from './leitner';
import { type Activity, getActivity, getProgress, mergeProgress } from './progress';
import { getSettings, sanitizeSettings, saveSettings, type Settings } from './settings';

export const BACKUP_FORMAT = 'boonscrolling-progress';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  settings: Settings;
  activity: Activity;
  progress: ProgressRecord[];
}

export function createBackup(): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    // The API key is a credential: never written into an export file.
    settings: { ...getSettings(), restCountriesKey: '' },
    activity: getActivity(),
    progress: [...getProgress().values()],
  };
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function validateRecord(x: unknown): ProgressRecord | null {
  const r = x as Partial<ProgressRecord> | null;
  if (!r || typeof r !== 'object') return null;
  if (typeof r.id !== 'string' || typeof r.type !== 'string' || !isCategory(r.category)) return null;
  if (!num(r.box) || r.box < 0 || r.box > MAX_BOX || !num(r.due)) return null;
  return {
    id: r.id,
    type: r.type,
    category: r.category,
    box: Math.round(r.box),
    due: r.due,
    seen: num(r.seen) ? r.seen : 0,
    correct: num(r.correct) ? r.correct : 0,
    wrong: num(r.wrong) ? r.wrong : 0,
    lastSeen: num(r.lastSeen) ? r.lastSeen : 0,
    lastResult: r.lastResult === 'correct' || r.lastResult === 'wrong' ? r.lastResult : 'seen',
  };
}

export interface ParsedBackup {
  settings: Settings | null;
  activity: Activity | undefined;
  progress: ProgressRecord[];
  rejected: number;
}

export function parseBackup(text: string): ParsedBackup {
  let raw: Partial<Backup>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!raw || raw.format !== BACKUP_FORMAT) throw new Error('That file is not a boonscrolling progress export.');
  if (!num(raw.version) || raw.version > BACKUP_VERSION) {
    throw new Error('This export was made by a newer version of the app.');
  }
  const list = Array.isArray(raw.progress) ? raw.progress : [];
  const progress = list.map(validateRecord).filter((r): r is ProgressRecord => !!r);
  const a = raw.activity as Partial<Activity> | undefined;
  const activity =
    a && typeof a.lastDay === 'string' && num(a.streak) && num(a.total)
      ? { lastDay: a.lastDay, streak: a.streak, today: a.today ?? 0, todayCorrect: a.todayCorrect ?? 0, total: a.total }
      : undefined;
  return {
    settings: raw.settings ? sanitizeSettings(raw.settings) : null,
    activity,
    progress,
    rejected: list.length - progress.length,
  };
}

export async function importBackup(text: string): Promise<{ merged: number; rejected: number }> {
  const parsed = parseBackup(text);
  const merged = await mergeProgress(parsed.progress, parsed.activity);
  if (parsed.settings) {
    // Keep the local API key; exports never carry one.
    await saveSettings({ ...parsed.settings, restCountriesKey: getSettings().restCountriesKey });
  }
  return { merged, rejected: parsed.rejected };
}
