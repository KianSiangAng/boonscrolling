import { describe, expect, it } from 'vitest';
import type { CategoryId } from '../src/core/categories';
import { applyAnswer, type ProgressRecord } from '../src/core/leitner';
import { seeded } from '../src/core/rng';
import { categoryWeight, pickNext } from '../src/core/scheduler';
import type { CardInstance } from '../src/core/types';

const T0 = 1_700_000_000_000;
const TYPES = ['fact', 'quiz', 'myth', 'flag', 'higher-lower'];
const CATS: CategoryId[] = ['geography', 'science', 'history', 'sports'];

function makePool(perCombo = 30): CardInstance[] {
  const pool: CardInstance[] = [];
  for (const type of TYPES)
    for (const category of CATS)
      for (let i = 0; i < perCombo; i++) pool.push({ id: `${type}:${category}:${i}`, type, category, data: null });
  return pool;
}

function simulate(pool: CardInstance[], progress: Map<string, ProgressRecord>, n: number, seed = 1) {
  const rng = seeded(seed);
  const picks: { card: CardInstance; isReview: boolean }[] = [];
  let lastType: string | null = null;
  const recent: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = pickNext({ pool, progress, now: T0, lastType, recentIds: new Set(recent), rng });
    if (!p) break;
    picks.push(p);
    lastType = p.card.type;
    recent.push(p.card.id);
    if (recent.length > 25) recent.shift();
  }
  return picks;
}

describe('pickNext', () => {
  it('never shows the same card type twice in a row', () => {
    const picks = simulate(makePool(), new Map(), 500);
    expect(picks).toHaveLength(500);
    for (let i = 1; i < picks.length; i++) expect(picks[i].card.type).not.toBe(picks[i - 1].card.type);
  });

  it('serves ~30% reviews when plenty of cards are due', () => {
    const pool = makePool();
    const progress = new Map<string, ProgressRecord>();
    // Half the pool was missed an hour ago, so it is due now.
    for (const c of pool.filter((_, i) => i % 2 === 0)) {
      progress.set(c.id, applyAnswer(undefined, c, false, T0 - 3_600_000));
    }
    const picks = simulate(pool, progress, 2000, 7);
    const ratio = picks.filter((p) => p.isReview).length / picks.length;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
  });

  it('only reviews cards that are actually due (when new cards exist)', () => {
    const pool = makePool(5);
    const progress = new Map<string, ProgressRecord>();
    const notDue = pool[0];
    progress.set(notDue.id, applyAnswer(undefined, notDue, true, T0)); // due in 3 days
    const picks = simulate(pool, progress, 60);
    expect(picks.some((p) => p.card.id === notDue.id)).toBe(false);
  });

  it('leans toward the weakest category', () => {
    const pool = makePool();
    const progress = new Map<string, ProgressRecord>();
    // A long history: history is mostly wrong, the rest mostly right. All far from due.
    for (const cat of CATS) {
      for (let i = 0; i < 40; i++) {
        const c: CardInstance = { id: `old:${cat}:${i}`, type: 'quiz', category: cat, data: null };
        const correct = cat === 'history' ? i % 5 === 0 : i % 10 !== 0;
        progress.set(c.id, { ...applyAnswer(undefined, c, correct, T0), due: T0 + 1e12 });
      }
    }
    const picks = simulate(pool, progress, 2000, 3);
    const share = (cat: CategoryId) => picks.filter((p) => p.card.category === cat).length / picks.length;
    expect(share('history')).toBeGreaterThan(share('geography') * 1.5);
    expect(share('geography')).toBeGreaterThan(0.1); // others still appear
  });

  it('balances types within a category instead of following pool size', () => {
    const pool: CardInstance[] = [
      ...Array.from({ length: 300 }, (_, i) => ({
        id: `flag:${i}`,
        type: 'flag',
        category: 'geography' as const,
        data: null,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `fact:${i}`,
        type: 'fact',
        category: 'geography' as const,
        data: null,
      })),
      ...Array.from({ length: 300 }, (_, i) => ({
        id: `quiz:${i}`,
        type: 'quiz',
        category: 'geography' as const,
        data: null,
      })),
    ];
    const picks = simulate(pool, new Map(), 30);
    expect(picks.filter((p) => p.card.type === 'fact').length).toBeGreaterThanOrEqual(5);
  });

  it('falls back gracefully when only one type exists', () => {
    const pool = makePool(3).filter((c) => c.type === 'quiz');
    const picks = simulate(pool, new Map(), 20);
    expect(picks).toHaveLength(20);
  });

  it('returns null for an empty pool', () => {
    expect(
      pickNext({ pool: [], progress: new Map(), now: T0, lastType: null, recentIds: new Set(), rng: Math.random }),
    ).toBeNull();
  });
});

describe('categoryWeight', () => {
  it('is higher for weaker categories', () => {
    expect(categoryWeight({ correct: 2, wrong: 18 })).toBeGreaterThan(categoryWeight(undefined));
    expect(categoryWeight(undefined)).toBeGreaterThan(categoryWeight({ correct: 18, wrong: 2 }));
  });
});
