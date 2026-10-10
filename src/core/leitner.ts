import type { CategoryId } from './categories';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/**
 * Leitner boxes. A card's box decides how long until it is due again.
 * Missed cards drop to box 1 and come back within the session; each correct
 * review promotes the card one box, so the gaps grow: 10m → 1d → 3d → 7d → 21d → 60d.
 */
export const BOX_INTERVALS: Record<number, number> = {
  1: 10 * MIN,
  2: 1 * DAY,
  3: 3 * DAY,
  4: 7 * DAY,
  5: 21 * DAY,
  6: 60 * DAY,
};
export const MAX_BOX = 6;
/** A brand-new card answered correctly already "knew it": skip the 1-day box. */
export const FIRST_CORRECT_BOX = 3;
/** A passive card (fact) scrolled past without rating. */
export const SEEN_BOX = 2;

export interface ProgressRecord {
  id: string;
  type: string;
  category: CategoryId;
  box: number;
  /** Epoch ms when the card is due for review. */
  due: number;
  seen: number;
  correct: number;
  wrong: number;
  lastSeen: number;
  lastResult: 'correct' | 'wrong' | 'seen';
}

interface CardRef {
  id: string;
  type: string;
  category: CategoryId;
}

function base(card: CardRef, prev: ProgressRecord | undefined): ProgressRecord {
  return (
    prev ?? {
      id: card.id,
      type: card.type,
      category: card.category,
      box: 0,
      due: 0,
      seen: 0,
      correct: 0,
      wrong: 0,
      lastSeen: 0,
      lastResult: 'seen',
    }
  );
}

/**
 * `graded: false` is a self-rating (a fact's "knew it" / "new to me"): it moves the card
 * between boxes exactly like an answer but doesn't count toward accuracy.
 */
export function applyAnswer(
  prev: ProgressRecord | undefined,
  card: CardRef,
  correct: boolean,
  now: number,
  graded = true,
): ProgressRecord {
  const rec = { ...base(card, prev) };
  let box: number;
  if (!correct) box = 1;
  else if (!prev || prev.box === 0) box = FIRST_CORRECT_BOX;
  else box = Math.min(prev.box + 1, MAX_BOX);
  rec.box = box;
  rec.due = now + BOX_INTERVALS[box];
  rec.seen += 1;
  rec.lastSeen = now;
  rec.lastResult = correct ? 'correct' : 'wrong';
  if (graded) {
    if (correct) rec.correct += 1;
    else rec.wrong += 1;
  }
  return rec;
}

/** Passive exposure: schedules the card without counting towards accuracy. */
export function applySeen(prev: ProgressRecord | undefined, card: CardRef, now: number): ProgressRecord {
  const rec = { ...base(card, prev) };
  // Re-reading a fact you were due to review counts as a light promotion.
  const box = prev && prev.box > 0 ? (prev.due <= now ? Math.min(prev.box + 1, MAX_BOX) : prev.box) : SEEN_BOX;
  rec.box = box;
  rec.due = prev && prev.box > 0 && prev.due > now ? prev.due : now + BOX_INTERVALS[box];
  rec.seen += 1;
  rec.lastSeen = now;
  rec.lastResult = 'seen';
  return rec;
}

export function isDue(rec: ProgressRecord | undefined, now: number): boolean {
  return !!rec && rec.box > 0 && rec.due <= now;
}
