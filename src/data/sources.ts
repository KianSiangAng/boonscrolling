import { getSettings } from '../core/settings';
import type { Sources } from '../core/types';
import {
  BUILD_TIME_KEY,
  cachedCountries,
  isStale,
  mergeCountries,
  refreshCountries,
  snapshotCountries,
} from './countries';
import { loadGeo } from './geo';
import { loadPacks } from './packs';
import { cachedTrivia, refreshTrivia } from './trivia';

/** Live view of every data source. Card pools are rebuilt whenever it changes. */
export const sources: Sources = {
  countries: snapshotCountries(),
  trivia: [],
  packs: [],
  geo: null,
};

export type SourceStatus = Record<'countries' | 'trivia' | 'geo', string>;
export const status: SourceStatus = {
  countries: 'Bundled snapshot',
  trivia: 'Not loaded yet',
  geo: 'Loading…',
};

type Listener = () => void;
const listeners = new Set<Listener>();
export function onSourcesChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

/** The trivia pool is topped up when fewer than this many questions remain unseen. */
const TRIVIA_LOW_WATER = 120;

export function restCountriesKey(): string {
  return getSettings().restCountriesKey || BUILD_TIME_KEY;
}

/** Load everything available offline. Resolves quickly so the feed can start. */
export async function loadLocalSources(): Promise<void> {
  const [packs, trivia, countries] = await Promise.all([loadPacks(), cachedTrivia(), cachedCountries()]);
  sources.packs = packs;
  sources.trivia = trivia.questions;
  status.trivia = trivia.questions.length ? `${trivia.questions.length} questions cached` : 'Not loaded yet';
  if (countries) {
    sources.countries = mergeCountries(snapshotCountries(), countries.countries);
    status.countries = `REST Countries, cached ${new Date(countries.fetchedAt).toLocaleDateString()}`;
  }
}

/** Kick off lazy and network sources; each one emits a change when it lands. */
export function loadRemoteSources(unseenTrivia: () => number): void {
  loadGeo()
    .then((geo) => {
      sources.geo = geo;
      status.geo = `${geo.features.length} Natural Earth shapes`;
      emit();
    })
    .catch((err) => {
      status.geo = `Unavailable (${err.message})`;
    });

  void refreshCountriesIfStale();
  void topUpTrivia(unseenTrivia);
}

export async function refreshCountriesIfStale(force = false): Promise<void> {
  const key = restCountriesKey();
  if (!key || !navigator.onLine) return;
  if (!force && !isStale(await cachedCountries())) return;
  try {
    const fresh = await refreshCountries(key);
    sources.countries = mergeCountries(snapshotCountries(), fresh);
    status.countries = `REST Countries, updated ${new Date().toLocaleDateString()}`;
    emit();
  } catch (err) {
    status.countries = `Bundled snapshot (REST Countries failed: ${(err as Error).message})`;
    emit();
  }
}

let triviaBusy = false;
export async function topUpTrivia(unseen: () => number): Promise<void> {
  if (triviaBusy || !navigator.onLine || unseen() >= TRIVIA_LOW_WATER) return;
  triviaBusy = true;
  try {
    sources.trivia = await refreshTrivia(2);
    status.trivia = `${sources.trivia.length} questions cached`;
    emit();
  } catch (err) {
    status.trivia = `${sources.trivia.length} cached (Open Trivia DB failed: ${(err as Error).message})`;
  } finally {
    triviaBusy = false;
  }
}
