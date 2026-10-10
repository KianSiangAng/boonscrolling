import { mapOpenTdbCategory } from '../core/categories';
import { kvGet, kvSet } from '../core/db';
import { hash } from '../core/rng';
import type { TriviaQuestion } from '../core/types';

const CACHE_KEY = 'cache:opentdb';
const API = 'https://opentdb.com';
const BATCH = 50;
const MAX_STORED = 3000;
/** Open Trivia DB allows one request per IP every 5 seconds. */
const RATE_LIMIT_MS = 5500;

interface TriviaCache {
  token: string | null;
  lastFetch: number;
  exhausted: boolean;
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

const EMPTY: TriviaCache = { token: null, lastFetch: 0, exhausted: false, questions: [] };

export async function cachedTrivia(): Promise<TriviaCache> {
  return { ...EMPTY, ...((await kvGet<TriviaCache>(CACHE_KEY)) ?? {}) };
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
  return {
    id: hash(question).toString(36),
    kind: r.type,
    category: mapOpenTdbCategory(sourceCategory),
    sourceCategory,
    difficulty: r.difficulty,
    question,
    correct: decode(r.correct_answer),
    incorrect: r.incorrect_answers.map(decode),
  };
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

/**
 * Fetch up to `batches` new batches, de-duplicated by a session token that is persisted
 * so later visits keep receiving unseen questions. Returns the full cached list.
 */
export async function refreshTrivia(batches = 2): Promise<TriviaQuestion[]> {
  const cache = await cachedTrivia();
  if (cache.exhausted) return cache.questions;
  const known = new Set(cache.questions.map((q) => q.id));

  for (let i = 0; i < batches; i++) {
    const wait = cache.lastFetch + RATE_LIMIT_MS - Date.now();
    if (wait > 0) await sleep(wait);
    if (!cache.token) {
      cache.token = await newToken();
      await sleep(RATE_LIMIT_MS);
    }
    const tokenParam = cache.token ? `&token=${cache.token}` : '';
    const body = await getJson<{ response_code: number; results: OpenTdbResult[] }>(
      `${API}/api.php?amount=${BATCH}&encode=url3986${tokenParam}`,
    );
    cache.lastFetch = Date.now();

    if (body.response_code === 3) {
      cache.token = null; // token expired (6h idle): get a new one next round
      continue;
    }
    if (body.response_code === 4 || (body.response_code === 1 && cache.token)) {
      cache.exhausted = true; // we've seen every question in the database
      break;
    }
    if (body.response_code === 5) continue; // rate limited: the next loop waits
    if (body.response_code !== 0) break;

    for (const r of body.results) {
      const q = normalizeResult(r);
      if (!known.has(q.id)) {
        known.add(q.id);
        cache.questions.push(q);
      }
    }
  }
  cache.questions = cache.questions.slice(-MAX_STORED);
  await kvSet(CACHE_KEY, cache);
  return cache.questions;
}
