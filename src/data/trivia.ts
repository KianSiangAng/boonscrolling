import { mapOpenTdbCategory, mapOpenTdbTopic, OPENTDB_COMPUTERS } from '../core/categories';
import { kvGet, kvSet } from '../core/db';
import { hash } from '../core/rng';
import type { TriviaQuestion } from '../core/types';

const CACHE_KEY = 'cache:opentdb';
const API = 'https://opentdb.com';
const BATCH = 50;
const MAX_STORED = 3000;
/** Open Trivia DB allows one request per IP every 5 seconds. Mutable for tests. */
export const limits = { rateLimitMs: 5500 };

/**
 * Questions are fetched as separate streams: a mixed feed of every category, and
 * "Science: Computers" on its own so the Computer Science category isn't starved by
 * the mixed feed's ~3% share.
 */
export type TriviaStream = 'mixed' | 'computers';
const STREAM_CATEGORY: Record<TriviaStream, number | undefined> = { mixed: undefined, computers: OPENTDB_COMPUTERS };

interface TriviaCache {
  token: string | null;
  lastFetch: number;
  /** Streams with nothing left to give this token. */
  exhausted: Partial<Record<TriviaStream, boolean>>;
  questions: TriviaQuestion[];
}

interface OpenTdbResult {
  type: 'multiple' | 'boolean';
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

const EMPTY: TriviaCache = { token: null, lastFetch: 0, exhausted: {}, questions: [] };

export async function cachedTrivia(): Promise<TriviaCache> {
  const raw = (await kvGet<Partial<TriviaCache> & { exhausted?: unknown }>(CACHE_KEY)) ?? {};
  const exhausted =
    typeof raw.exhausted === 'boolean' ? { mixed: raw.exhausted } : ((raw.exhausted as TriviaCache['exhausted']) ?? {});
  // Re-derive categories so mapping changes (e.g. the new Computer Science category) apply to old caches.
  const questions = (raw.questions ?? []).map(withCategory);
  return { ...EMPTY, ...raw, exhausted, questions };
}

export function streamOf(q: Pick<TriviaQuestion, 'category'>): TriviaStream {
  return q.category === 'computing' ? 'computers' : 'mixed';
}

function withCategory<T extends { sourceCategory: string }>(
  q: T,
): Omit<T, 'topic'> & Pick<TriviaQuestion, 'category' | 'topic'> {
  const { topic: _stale, ...rest } = q as T & { topic?: unknown };
  const topic = mapOpenTdbTopic(q.sourceCategory);
  return { ...rest, category: mapOpenTdbCategory(q.sourceCategory), ...(topic ? { topic } : {}) };
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function normalizeResult(r: OpenTdbResult): TriviaQuestion {
  const question = decode(r.question);
  const sourceCategory = decode(r.category);
  return withCategory({
    id: hash(question).toString(36),
    kind: r.type,
    sourceCategory,
    difficulty: r.difficulty,
    question,
    correct: decode(r.correct_answer),
    incorrect: r.incorrect_answers.map(decode),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Trivia DB: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function newToken(): Promise<string | null> {
  const r = await getJson<{ response_code: number; token?: string }>(`${API}/api_token.php?command=request`);
  return r.response_code === 0 && r.token ? r.token : null;
}

/** Smaller requests to try when a category has fewer than BATCH unseen questions left. */
const FALLBACK_AMOUNTS = [BATCH, 20, 10];

/**
 * Fetch one batch for each requested stream, de-duplicated by a session token that is
 * persisted so later visits keep receiving unseen questions. Returns the full cached list.
 */
export async function refreshTrivia(streams: TriviaStream[]): Promise<TriviaQuestion[]> {
  const cache = await cachedTrivia();
  const known = new Set(cache.questions.map((q) => q.id));

  const request = async (url: string) => {
    const wait = cache.lastFetch + limits.rateLimitMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await getJson<{ response_code: number; results: OpenTdbResult[] }>(url);
    } finally {
      cache.lastFetch = Date.now();
    }
  };

  for (const stream of streams) {
    if (cache.exhausted[stream]) continue;
    if (!cache.token) {
      cache.token = await newToken();
      cache.lastFetch = Date.now();
    }
    const category = STREAM_CATEGORY[stream];
    for (const amount of FALLBACK_AMOUNTS) {
      const params = new URLSearchParams({ amount: String(amount), encode: 'url3986' });
      if (category) params.set('category', String(category));
      if (cache.token) params.set('token', cache.token);
      const body = await request(`${API}/api.php?${params}`);

      if (body.response_code === 0) {
        for (const r of body.results) {
          const q = normalizeResult(r);
          if (!known.has(q.id)) {
            known.add(q.id);
            cache.questions.push(q);
          }
        }
        break;
      }
      if (body.response_code === 3) {
        cache.token = null; // token expired (6h idle): a new one is fetched next time
        break;
      }
      // 1: fewer than `amount` unseen questions left; 4: none left for this token.
      if (body.response_code === 1 && amount !== FALLBACK_AMOUNTS.at(-1)) continue;
      if (body.response_code === 1 || body.response_code === 4) cache.exhausted[stream] = true;
      break; // 5 (rate limited) and anything unexpected: try again on the next top-up
    }
  }
  cache.questions = cache.questions.slice(-MAX_STORED);
  await kvSet(CACHE_KEY, cache);
  return cache.questions;
}
