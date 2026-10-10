import { describe, expect, it } from 'vitest';
import { formatIn, nearMisses, parseIn } from '../src/cards/base-convert.card';
import { tokenize } from '../src/cards/code';
import { seeded } from '../src/core/rng';

describe('base conversion helpers', () => {
  it('formats and parses every base', () => {
    expect(formatIn(10, 'bin')).toBe('0000 1010');
    expect(formatIn(300, 'bin')).toBe('0001 0010 1100');
    expect(formatIn(255, 'hex')).toBe('0xFF');
    expect(formatIn(5, 'hex')).toBe('0x05');
    for (const v of [0, 1, 15, 16, 200, 255, 256, 4095]) {
      for (const b of ['bin', 'dec', 'hex'] as const) expect(parseIn(formatIn(v, b), b)).toBe(v);
    }
  });

  it('near misses are distinct, wrong, and the same width in binary', () => {
    const rng = seeded(1);
    for (const v of [1, 7, 100, 255, 256, 1000, 4095]) {
      const misses = nearMisses(v, rng);
      expect(misses).toHaveLength(3);
      expect(new Set(misses).size).toBe(3);
      expect(misses).not.toContain(v);
      const bits = v.toString(2).length;
      const width = formatIn(v, 'bin', bits).length;
      for (const m of misses) expect(formatIn(m, 'bin', bits).length, `${v} vs ${m}`).toBe(width);
    }
  });
});

describe('syntax highlighter', () => {
  const kinds = (line: string, lang: 'js' | 'python' | 'sql') =>
    tokenize(line, lang)
      .filter((t) => t.kind)
      .map((t) => `${t.kind}:${t.text}`);

  it('round-trips the source text', () => {
    for (const line of ['const x = "a // b"; // c', "print(f'{x}', 0x1F)  # hi", 'SELECT COUNT(x) FROM t;']) {
      for (const lang of ['js', 'python', 'sql'] as const) {
        expect(
          tokenize(line, lang)
            .map((t) => t.text)
            .join(''),
        ).toBe(line);
      }
    }
  });

  it('classifies JavaScript', () => {
    expect(kinds('const s = "x"; // note', 'js')).toEqual(['kw:const', 'op:=', 'str:"x"', 'com:// note']);
    expect(kinds('console.log(max(1))', 'js')).toEqual(['bi:console', 'fn:log', 'fn:max', 'num:1']);
  });

  it('classifies Python, including prefixed strings and comments', () => {
    expect(kinds("def f(x): return f'{x}'  # c", 'python')).toEqual([
      'kw:def',
      'fn:f',
      'op::',
      'kw:return',
      "str:f'{x}'",
      'com:# c',
    ]);
  });

  it('treats SQL keywords case-insensitively', () => {
    expect(kinds('select count(x) from t', 'sql')).toEqual(['kw:select', 'bi:count', 'kw:from']);
  });
});
