import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, parseBackup, validateRecord } from '../src/core/backup';

const rec = {
  id: 'flag:FRA',
  type: 'flag',
  category: 'geography',
  box: 2,
  due: 1,
  seen: 3,
  correct: 2,
  wrong: 1,
  lastSeen: 5,
  lastResult: 'correct',
};

describe('backup parsing', () => {
  it('accepts a valid export and drops invalid records', () => {
    const text = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-01-01T00:00:00Z',
      settings: { disabledCategories: ['sports', 'nope'], disabledTypes: ['map-tap'], restCountriesKey: 'secret' },
      activity: { lastDay: '2026-01-01', streak: 3, today: 1, todayCorrect: 1, total: 10 },
      progress: [rec, { ...rec, id: 'bad', category: 'astrology' }, { ...rec, id: 'bad2', box: 99 }, null],
    });
    const parsed = parseBackup(text);
    expect(parsed.progress).toHaveLength(1);
    expect(parsed.rejected).toBe(3);
    expect(parsed.settings?.disabledCategories).toEqual(['sports']);
    expect(parsed.activity?.streak).toBe(3);
  });

  it('rejects other files', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/not a boonscrolling/);
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }))).toThrow(/newer version/);
  });

  it('fills defaults for missing optional counters', () => {
    const r = validateRecord({ id: 'x', type: 'quiz', category: 'science', box: 1, due: 0 });
    expect(r).toMatchObject({ seen: 0, correct: 0, wrong: 0, lastResult: 'seen' });
  });
});
