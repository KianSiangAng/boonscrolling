/**
 * Executes every code-output snippet, spot-the-bug fix and regex-match pattern in /content and
 * checks it against the answer the card states, so no wrong answer can ship.
 * Needs `node` (always present) and `python3` (with its built-in sqlite3) on PATH.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPLEXITIES } from '../src/cards/big-o.card';
import { codeLines } from '../src/cards/code';
import { OSI_LAYERS } from '../src/cards/osi-sort.card';
import { isTopic, topicInfo } from '../src/core/categories';
import type { Pack, PackCard } from '../src/core/types';

/** Phone-width budget: ~38 monospace characters fit a 360px-wide screen without scrolling. */
const MAX_LINES = 8;
const MAX_COLS = 38;

const packs: Pack[] = readdirSync('content')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`content/${f}`, 'utf8')) as Pack);

function cardsOf(type: string): [string, PackCard][] {
  return packs.flatMap((p) =>
    p.cards.filter((c) => c.type === type).map((c): [string, PackCard] => [`${p.id}/${c.id}`, c]),
  );
}

const SQL_RUNNER = `
import sqlite3, sys
stmts = [s.strip() for s in sys.argv[1].split(';') if s.strip()]
con = sqlite3.connect(':memory:')
for s in stmts[:-1]:
    con.execute(s)
rows = con.execute(stmts[-1]).fetchall()
print('\\n'.join(', '.join('NULL' if v is None else str(v) for v in r) for r in rows))
`;

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function run(lang: string, source: string): RunResult {
  const [cmd, args] =
    lang === 'js'
      ? [process.execPath, ['-e', source]]
      : lang === 'python'
        ? ['python3', ['-I', '-c', source]]
        : ['python3', ['-I', '-c', SQL_RUNNER, source]];
  const r = spawnSync(cmd, args as string[], { encoding: 'utf8', timeout: 10_000 });
  if (r.error) throw r.error;
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr };
}

/** stdout with trailing whitespace removed from each line and the end. */
const normalize = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trimEnd();

function evaluate(lang: string, code: string, call: string): { ok: true; value: unknown } | { ok: false; why: string } {
  const source =
    lang === 'js'
      ? `${code}\nconsole.log(JSON.stringify(${call}));`
      : `${code}\nimport json\nprint(json.dumps(${call}))`;
  const r = run(lang, source);
  if (!r.ok) return { ok: false, why: r.stderr.trim().split('\n').pop() ?? 'error' };
  try {
    return { ok: true, value: JSON.parse(r.stdout.trim()) };
  } catch {
    return { ok: false, why: `unparseable output: ${r.stdout}` };
  }
}

function expectFits(id: string, lines: string[]) {
  expect(lines.length, `${id}: ${lines.length} lines`).toBeLessThanOrEqual(MAX_LINES);
  for (const l of lines) expect(l.length, `${id}: line too wide for a phone: "${l}"`).toBeLessThanOrEqual(MAX_COLS);
}

describe('code-output cards print exactly their stated answer', () => {
  const cards = cardsOf('code-output');
  it('exist', () => expect(cards.length).toBeGreaterThan(10));
  it.each(cards)('%s', (id, c) => {
    const lines = codeLines(c.code)!;
    expectFits(id, lines);
    const r = run(c.lang as string, lines.join('\n'));
    expect(r.ok, `${id} failed to run: ${r.stderr}`).toBe(true);
    expect(normalize(r.stdout)).toBe(c.answer);
    const options = c.options as string[];
    expect(options, `${id}: an option duplicates the answer`).not.toContain(c.answer);
    expect(new Set(options).size).toBe(options.length);
    for (const o of options) expectFits(`${id} option`, o.split('\n'));
  });
});

describe('spot-the-bug cards: the stated line is the bug and the fix fixes it', () => {
  const cards = cardsOf('spot-the-bug');
  it('exist', () => expect(cards.length).toBeGreaterThan(4));
  it.each(cards)('%s', (id, c) => {
    const lines = codeLines(c.code)!;
    const bugLine = c.bugLine as number;
    const fix = c.fix as string;
    const checks = c.checks as { call: string; expect: unknown }[];
    expectFits(id, lines);
    expectFits(`${id} fix`, [fix]);
    expect(bugLine).toBeGreaterThanOrEqual(1);
    expect(bugLine).toBeLessThanOrEqual(lines.length);
    expect(fix).not.toBe(lines[bugLine - 1]);
    // Same indentation as the line it replaces, so the fixed code still parses (Python!).
    expect(fix.match(/^\s*/)![0]).toBe(lines[bugLine - 1].match(/^\s*/)![0]);

    const lang = c.lang as string;
    const original = lines.join('\n');
    const fixed = lines.map((l, i) => (i === bugLine - 1 ? fix : l)).join('\n');

    const failures = checks.filter((k) => {
      const r = evaluate(lang, original, k.call);
      return !r.ok || !deepEqual(r.value, k.expect);
    });
    expect(failures.length, `${id}: the buggy code passes every check, so the bug isn't demonstrated`).toBeGreaterThan(
      0,
    );

    for (const k of checks) {
      const r = evaluate(lang, fixed, k.call);
      expect(r.ok, `${id}: fixed code errors on ${k.call}: ${r.ok ? '' : r.why}`).toBe(true);
      if (r.ok) expect(r.value, `${id}: fixed code, ${k.call}`).toEqual(k.expect);
    }
  });
});

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    expect(a).toEqual(b);
    return true;
  } catch {
    return false;
  }
}

describe('regex-match cards: stated matches are exactly what the pattern matches', () => {
  const cards = cardsOf('regex-match');
  it('exist', () => expect(cards.length).toBeGreaterThan(5));
  it.each(cards)('%s', (id, c) => {
    const re = new RegExp(c.pattern as string, (c.flags as string | undefined) ?? '');
    const candidates = c.candidates as string[];
    const actual = candidates.filter((s) => re.test(s)).sort();
    expect(actual, `${id}: /${c.pattern}/`).toEqual([...(c.matches as string[])].sort());
    expect(new Set(candidates).size).toBe(candidates.length);
    expect((c.pattern as string).length).toBeLessThanOrEqual(MAX_COLS - 4);
    for (const s of candidates) expect(s.length, `${id}: "${s}" too wide for a 2-column grid`).toBeLessThanOrEqual(16);
  });
});

describe('other Computer Science card data', () => {
  it('big-o answers and options come from the known scale and code fits a phone', () => {
    for (const [id, c] of cardsOf('big-o')) {
      expect(COMPLEXITIES, id).toContain(c.answer);
      for (const o of (c.options as string[] | undefined) ?? []) expect(COMPLEXITIES, id).toContain(o);
      if (c.code) expectFits(id, codeLines(c.code)!);
    }
  });

  it('osi-sort items sit on real layers', () => {
    for (const [id, c] of cardsOf('osi-sort')) {
      const items = c.items as { label: string; layer: number }[];
      expect(items.length, id).toBeGreaterThanOrEqual(3);
      for (const i of items) expect(OSI_LAYERS[i.layer - 1], `${id}: ${i.label}`).toBeDefined();
      expect(new Set(items.map((i) => i.label)).size).toBe(items.length);
    }
  });

  it('ds-match pairs are unique on both sides', () => {
    for (const [id, c] of cardsOf('ds-match')) {
      const pairs = c.pairs as [string, string][];
      expect(new Set(pairs.map((p) => p[0])).size, id).toBe(pairs.length);
      expect(new Set(pairs.map((p) => p[1])).size, id).toBe(pairs.length);
    }
  });

  it('port-protocol entries are unique and valid', () => {
    const ports = cardsOf('port-protocol').map(([, c]) => c);
    expect(ports.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ports.map((p) => p.port)).size).toBe(ports.length);
    expect(new Set(ports.map((p) => p.protocol)).size).toBe(ports.length);
    for (const p of ports)
      expect(Number.isInteger(p.port) && (p.port as number) > 0 && (p.port as number) < 65536).toBe(true);
  });

  it('every Computer Science pack has a valid sub-topic and 15–20 cards', () => {
    const cs = packs.filter((p) => p.category === 'computing');
    expect(cs.length).toBeGreaterThanOrEqual(7);
    for (const p of cs) {
      expect(isTopic(p.topic), p.id).toBe(true);
      expect(topicInfo(p.topic!)?.category).toBe('computing');
      expect(p.cards.length, p.id).toBeGreaterThanOrEqual(15);
      expect(p.cards.length, p.id).toBeLessThanOrEqual(20);
    }
  });
});
