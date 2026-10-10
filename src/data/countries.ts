import { kvGet, kvSet } from '../core/db';
import type { Country } from '../core/types';
import snapshot from './countries.snapshot.json';

const CACHE_KEY = 'cache:restcountries';
const TTL = 14 * 24 * 60 * 60 * 1000;
const API = 'https://api.restcountries.com/countries/v5';
const FIELDS = [
  'names.common',
  'codes.alpha_2',
  'codes.alpha_3',
  'capitals',
  'region',
  'subregion',
  'population',
  'area.kilometers',
  'languages',
  'currencies',
  'landlocked',
  'borders',
  'classification.sovereign',
  'flag.url_svg',
].join(',');

/** Build-time key (GitHub Actions variable). Must allow the Pages hostname in REST Countries' dashboard. */
export const BUILD_TIME_KEY: string = import.meta.env.VITE_RESTCOUNTRIES_KEY ?? '';

export function flagUrl(c: Pick<Country, 'cca2' | 'flagUrl'>): string {
  return c.flagUrl ?? `https://flags.restcountries.com/v5/svg/${c.cca2.toLowerCase()}.svg`;
}

/** Regional-indicator emoji, used when the flag image can't load (offline, first run). */
export function flagEmoji(cca2: string): string {
  return [...cca2.toUpperCase()].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join('');
}

/** Bundled offline snapshot (mledoze/countries + Natural Earth population), see scripts/build-data.mjs. */
export function snapshotCountries(): Country[] {
  return snapshot as Country[];
}

interface CacheEntry {
  fetchedAt: number;
  countries: Country[];
}

export async function cachedCountries(): Promise<CacheEntry | undefined> {
  return kvGet<CacheEntry>(CACHE_KEY);
}

export function isStale(entry: CacheEntry | undefined, now = Date.now()): boolean {
  return !entry || now - entry.fetchedAt > TTL;
}

type V5Country = {
  names?: { common?: string };
  codes?: { alpha_2?: string; alpha_3?: string };
  capitals?: { name?: string; attributes?: { primary?: boolean } }[];
  region?: string;
  subregion?: string;
  population?: number;
  area?: { kilometers?: number };
  languages?: { name?: string }[];
  currencies?: { name?: string }[];
  landlocked?: boolean;
  borders?: string[];
  classification?: { sovereign?: boolean };
  flag?: { url_svg?: string };
};

export function fromV5(o: V5Country): Country | null {
  const cca2 = o.codes?.alpha_2;
  const cca3 = o.codes?.alpha_3;
  const name = o.names?.common;
  if (!cca2 || !cca3 || !name) return null;
  const capital = o.capitals?.find((c) => c.attributes?.primary)?.name ?? o.capitals?.[0]?.name ?? null;
  return {
    cca2,
    cca3,
    name,
    capital,
    region: o.region ?? '',
    subregion: o.subregion || null,
    population: o.population && o.population > 0 ? o.population : null,
    area: o.area?.kilometers && o.area.kilometers > 0 ? o.area.kilometers : null,
    languages: (o.languages ?? []).map((l) => l.name ?? '').filter(Boolean),
    currencies: (o.currencies ?? []).map((c) => c.name ?? '').filter(Boolean),
    landlocked: !!o.landlocked,
    borders: o.borders ?? [],
    independent: !!o.classification?.sovereign,
    flagUrl: o.flag?.url_svg,
  };
}

/** Fetch every country from REST Countries v5 (paginated, 100 per page on the free plan). */
export async function fetchCountries(apiKey: string): Promise<Country[]> {
  const out: Country[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const res = await fetch(`${API}?limit=100&offset=${offset}&response_fields=${FIELDS}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`REST Countries: HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { objects?: V5Country[]; meta?: { more?: boolean }; _demo?: unknown } };
    if (body.data?._demo) throw new Error('REST Countries: demo key returns sample data only');
    for (const o of body.data?.objects ?? []) {
      const c = fromV5(o);
      if (c) out.push(c);
    }
    if (!body.data?.meta?.more) break;
  }
  if (out.length < 100) throw new Error(`REST Countries: only ${out.length} countries returned`);
  return out;
}

/** Live data wins field by field; the snapshot fills gaps (e.g. countries the API omits). */
export function mergeCountries(base: Country[], fresh: Country[]): Country[] {
  const byCode = new Map(base.map((c) => [c.cca3, c]));
  for (const f of fresh) {
    const b = byCode.get(f.cca3);
    byCode.set(f.cca3, b ? { ...b, ...stripEmpty(f) } : f);
  }
  return [...byCode.values()];
}

function stripEmpty(c: Country): Partial<Country> {
  return Object.fromEntries(
    Object.entries(c).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)),
  ) as Partial<Country>;
}

export async function refreshCountries(apiKey: string): Promise<Country[]> {
  const countries = await fetchCountries(apiKey);
  await kvSet<CacheEntry>(CACHE_KEY, { fetchedAt: Date.now(), countries });
  return countries;
}
