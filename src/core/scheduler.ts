import type { CategoryId } from './categories';
import { isDue, type ProgressRecord } from './leitner';
import { pick, weightedPick, type Rng } from './rng';
import type { CardInstance } from './types';

export const REVIEW_RATIO = 0.3;

export interface ScheduleInput {
  /** Candidate cards, already filtered to the enabled categories and card types. */
  pool: CardInstance[];
  progress: ReadonlyMap<string, ProgressRecord>;
  now: number;
  /** Type of the card currently at the end of the feed. Never repeated. */
  lastType: string | null;
  /** Ids already placed in the feed this session. */
  recentIds: ReadonlySet<string>;
  rng: Rng;
  reviewRatio?: number;
}

export interface Pick {
  card: CardInstance;
  isReview: boolean;
}

export interface CategoryStat {
  correct: number;
  wrong: number;
}

export function categoryStats(progress: ReadonlyMap<string, ProgressRecord>): Map<CategoryId, CategoryStat> {
  const stats = new Map<CategoryId, CategoryStat>();
  for (const rec of progress.values()) {
    const s = stats.get(rec.category) ?? { correct: 0, wrong: 0 };
    s.correct += rec.correct;
    s.wrong += rec.wrong;
    stats.set(rec.category, s);
  }
  return stats;
}

/**
 * Weight for a category: lower (smoothed) accuracy → higher weight, so the feed leans
 * toward whatever you are weakest at without starving the rest.
 * Unseen categories sit at 50% accuracy; a 90% category gets ~0.4 the weight of a 20% one.
 */
export function categoryWeight(stat: CategoryStat | undefined): number {
  const c = stat?.correct ?? 0;
  const w = stat?.wrong ?? 0;
  const accuracy = (c + 2) / (c + w + 4);
  return 0.2 + (1 - accuracy);
}

function chooseFrom(cards: CardInstance[], stats: Map<CategoryId, CategoryStat>, rng: Rng): CardInstance[] {
  // 1. Category, weighted toward the weakest.
  const categories = [...new Set(cards.map((c) => c.category))];
  const category = weightedPick(categories, (cat) => categoryWeight(stats.get(cat)), rng);
  const inCategory = cards.filter((c) => c.category === category);
  // 2. Card type, uniformly, so big generated pools (e.g. 200 flags) don't drown small ones.
  const type = pick([...new Set(inCategory.map((c) => c.type))], rng);
  return inCategory.filter((c) => c.type === type);
}

export function pickNext(input: ScheduleInput): Pick | null {
  const { pool, progress, now, lastType, recentIds, rng } = input;
  const reviewRatio = input.reviewRatio ?? REVIEW_RATIO;
  if (!pool.length) return null;

  // Never the same type twice in a row; only relaxed if nothing else exists at all.
  let eligible = pool.filter((c) => c.type !== lastType && !recentIds.has(c.id));
  if (!eligible.length) eligible = pool.filter((c) => c.type !== lastType);
  if (!eligible.length) eligible = pool.filter((c) => !recentIds.has(c.id));
  if (!eligible.length) eligible = pool;

  const due: CardInstance[] = [];
  const fresh: CardInstance[] = [];
  for (const card of eligible) {
    const rec = progress.get(card.id);
    if (!rec) fresh.push(card);
    else if (isDue(rec, now)) due.push(card);
  }

  const stats = categoryStats(progress);
  const wantReview = rng() < reviewRatio;

  if (due.length && (wantReview || !fresh.length)) {
    const group = chooseFrom(due, stats, rng);
    // Most overdue first, with a little jitter among the top few.
    group.sort((a, b) => progress.get(a.id)!.due - progress.get(b.id)!.due);
    return { card: pick(group.slice(0, 3), rng), isReview: true };
  }
  if (fresh.length) {
    return { card: pick(chooseFrom(fresh, stats, rng), rng), isReview: false };
  }
  // Everything has been seen and nothing is due: pull the next-soonest review forward.
  const ahead = eligible.filter((c) => progress.has(c.id));
  ahead.sort((a, b) => progress.get(a.id)!.due - progress.get(b.id)!.due);
  const card = ahead[0] ?? pick(eligible, rng);
  return { card, isReview: progress.has(card.id) };
}
