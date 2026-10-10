import { CATEGORY_IDS, type CategoryId, isCategory, isTopic, type TopicId } from './categories';
import { kvGet, kvSet } from './db';

export interface Settings {
  /** Disabled categories (everything else is on), so new categories default to enabled. */
  disabledCategories: CategoryId[];
  /** Disabled card types, by module `type`. */
  disabledTypes: string[];
  /** Disabled sub-topics (see TOPICS). */
  disabledTopics: TopicId[];
  /** Optional REST Countries v5 API key (overrides the build-time key). */
  restCountriesKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  disabledCategories: [],
  disabledTypes: [],
  disabledTopics: [],
  restCountriesKey: '',
};

const KEY = 'settings';
let current: Settings = { ...DEFAULT_SETTINGS };
const listeners = new Set<(s: Settings) => void>();

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  return {
    disabledCategories: Array.isArray(r.disabledCategories) ? r.disabledCategories.filter(isCategory) : [],
    disabledTypes: Array.isArray(r.disabledTypes) ? r.disabledTypes.filter((t) => typeof t === 'string') : [],
    disabledTopics: Array.isArray(r.disabledTopics) ? r.disabledTopics.filter(isTopic) : [],
    restCountriesKey: typeof r.restCountriesKey === 'string' ? r.restCountriesKey.trim() : '',
  };
}

export async function loadSettings(): Promise<Settings> {
  current = sanitizeSettings(await kvGet(KEY));
  return current;
}

export function getSettings(): Settings {
  return current;
}

export async function saveSettings(next: Settings): Promise<void> {
  current = sanitizeSettings(next);
  await kvSet(KEY, current);
  for (const fn of listeners) fn(current);
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function enabledCategories(s: Settings = current): CategoryId[] {
  return CATEGORY_IDS.filter((c) => !s.disabledCategories.includes(c));
}
