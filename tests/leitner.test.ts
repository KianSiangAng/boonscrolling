import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  applySeen,
  BOX_INTERVALS,
  FIRST_CORRECT_BOX,
  isDue,
  MAX_BOX,
  SEEN_BOX,
} from '../src/core/leitner';

const card = { id: 'quiz:test:1', type: 'quiz', category: 'science' as const };
const T0 = 1_700_000_000_000;

describe('Leitner boxes', () => {
  it('sends a missed new card to box 1, due in 10 minutes', () => {
    const r = applyAnswer(undefined, card, false, T0);
    expect(r.box).toBe(1);
    expect(r.due).toBe(T0 + BOX_INTERVALS[1]);
    expect(r.wrong).toBe(1);
    expect(r.correct).toBe(0);
  });

  it('lets a new card answered correctly skip ahead', () => {
    const r = applyAnswer(undefined, card, true, T0);
    expect(r.box).toBe(FIRST_CORRECT_BOX);
    expect(r.due).toBe(T0 + BOX_INTERVALS[FIRST_CORRECT_BOX]);
  });

  it('promotes one box per correct review, with growing intervals', () => {
    let r = applyAnswer(undefined, card, false, T0);
    const intervals: number[] = [];
    for (let i = 0; i < 8; i++) {
      r = applyAnswer(r, card, true, r.due);
      intervals.push(r.due - r.lastSeen);
    }
    expect(r.box).toBe(MAX_BOX);
    for (let i = 1; i < MAX_BOX - 1; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it('drops back to box 1 on any miss', () => {
    let r = applyAnswer(undefined, card, true, T0);
    r = applyAnswer(r, card, true, r.due);
    r = applyAnswer(r, card, false, r.due);
    expect(r.box).toBe(1);
    expect(r.correct).toBe(2);
    expect(r.wrong).toBe(1);
  });

  it('ungraded self-ratings move boxes without touching accuracy', () => {
    const r = applyAnswer(undefined, card, false, T0, false);
    expect(r.box).toBe(1);
    expect(r.correct + r.wrong).toBe(0);
  });

  it('passive views schedule without scoring', () => {
    const r = applySeen(undefined, card, T0);
    expect(r.box).toBe(SEEN_BOX);
    expect(r.correct + r.wrong).toBe(0);
    // seeing it again before it's due doesn't reset the schedule
    const again = applySeen(r, card, T0 + 1000);
    expect(again.due).toBe(r.due);
  });

  it('isDue respects the due time', () => {
    const r = applyAnswer(undefined, card, false, T0);
    expect(isDue(r, T0)).toBe(false);
    expect(isDue(r, r.due)).toBe(true);
    expect(isDue(undefined, T0)).toBe(false);
  });
});
