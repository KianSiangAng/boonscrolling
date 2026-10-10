import { seeded, shuffle } from '../core/rng';
import type { CardInstance, CardModule } from '../core/types';
import { h, packCards, showFeedback } from './ui';

export type Base = 'bin' | 'dec' | 'hex';
const BASES: Base[] = ['bin', 'dec', 'hex'];
const BASE_LABEL: Record<Base, string> = { bin: 'binary', dec: 'decimal', hex: 'hex' };

interface BaseConvertData {
  value: number;
  from: Base;
  to: Base;
}

/** Seconds allowed; long binary strings get a little more. */
export function timeLimit(d: BaseConvertData): number {
  return d.value > 255 && (d.from === 'bin' || d.to === 'bin') ? 30 : 20;
}

export function formatIn(value: number, base: Base, bits = 0): string {
  if (base === 'dec') return String(value);
  if (base === 'hex') return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
  const width = Math.max(8, bits, Math.ceil(value.toString(2).length / 4) * 4);
  return value
    .toString(2)
    .padStart(width, '0')
    .replace(/(.{4})(?=.)/g, '$1 ');
}

export function parseIn(text: string, base: Base): number {
  const t = text.replace(/\s/g, '');
  return base === 'dec' ? Number(t) : parseInt(base === 'hex' ? t.replace(/^0x/i, '') : t, base === 'hex' ? 16 : 2);
}

/** Plausible wrong answers: single-bit flips, off-by-ones, swapped nibbles. */
export function nearMisses(value: number, rng: () => number): number[] {
  const bits = Math.max(8, value.toString(2).length);
  const cands = new Set<number>([value + 1, value - 1, value * 2, value >> 1, value + 16, value - 16]);
  for (let k = 0; k < bits; k++) cands.add(value ^ (1 << k));
  if (value < 256) cands.add(((value & 0xf) << 4) | (value >> 4));
  const max = 2 ** bits - 1;
  return shuffle(
    [...cands].filter((n) => n >= 0 && n <= max && n !== value),
    rng,
  ).slice(0, 3);
}

function generated(): CardInstance<BaseConvertData>[] {
  const rng = seeded('base-convert');
  const pairs: [Base, Base][] = BASES.flatMap((a) => BASES.filter((b) => b !== a).map((b): [Base, Base] => [a, b]));
  const out: CardInstance<BaseConvertData>[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < 48; i++) {
    const value = i % 4 === 3 ? 256 + Math.floor(rng() * 3840) : 1 + Math.floor(rng() * 255);
    const [from, to] = pairs[i % pairs.length];
    const id = `base-convert:gen:${from}-${to}:${value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, type: 'base-convert', category: 'computing', topic: 'cs-numbers', data: { value, from, to } });
  }
  return out;
}

const isBase = (x: unknown): x is Base => typeof x === 'string' && (BASES as string[]).includes(x);

const baseConvert: CardModule<BaseConvertData> = {
  type: 'base-convert',
  label: 'Base convert',
  icon: '⏱️',

  build(sources) {
    const fromPacks = packCards<BaseConvertData>(sources, 'base-convert', (c) =>
      typeof c.value === 'number' &&
      Number.isInteger(c.value) &&
      c.value >= 0 &&
      isBase(c.from) &&
      isBase(c.to) &&
      c.from !== c.to
        ? { value: c.value, from: c.from, to: c.to }
        : null,
    );
    return [...fromPacks, ...generated()];
  },

  mount(root, card, ctx) {
    const { data } = card;
    const bits = data.value.toString(2).length;
    const answer = formatIn(data.value, data.to, bits);
    const options = shuffle(
      [answer, ...nearMisses(data.value, ctx.rng).map((n) => formatIn(n, data.to, bits))],
      ctx.rng,
    );
    const limit = timeLimit(data);

    const bar = h('div', { class: 'timer-bar' });
    const clock = h('span', { class: 'timer-text', 'aria-live': 'off' }, `${limit}s`);
    const buttons = options.map((o) =>
      h('button', { class: 'choice', type: 'button', text: o, onclick: () => finish(o) }),
    );

    let remaining = limit * 1000;
    let last = 0;
    let raf = 0;
    let done = false;
    const tick = (t: number) => {
      if (last) remaining -= t - last;
      last = t;
      bar.style.transform = `scaleX(${Math.max(0, remaining / (limit * 1000))})`;
      clock.textContent = `${Math.max(0, Math.ceil(remaining / 1000))}s`;
      bar.classList.toggle('timer-low', remaining < 5000);
      if (remaining <= 0) finish(null);
      else raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (done || raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    function finish(picked: string | null) {
      if (done) return;
      done = true;
      pause();
      const correct = picked === answer;
      for (const b of buttons) {
        b.disabled = true;
        if (b.textContent === answer) b.classList.add('is-correct');
        else if (b.textContent === picked) b.classList.add('is-wrong');
      }
      ctx.answer(correct);
      showFeedback(root, correct, [
        picked === null ? '⏰ Time’s up!' : null,
        `${formatIn(data.value, data.from, bits)} = ${answer}${data.to !== 'dec' && data.from !== 'dec' ? ` (${data.value})` : ''}`,
      ]);
    }

    // The clock only runs while the card is on screen (cards are mounted ahead of time).
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : pause()), { threshold: 0.6 });
    io.observe(root);

    root.append(
      h('h2', { class: 'card-question' }, `Convert to ${BASE_LABEL[data.to]}`),
      h(
        'div',
        { class: 'convert' },
        h('span', { class: 'convert-base' }, BASE_LABEL[data.from]),
        h('span', { class: 'convert-value mono' }, formatIn(data.value, data.from)),
      ),
      h('div', { class: 'timer', role: 'timer' }, h('div', { class: 'timer-track' }, bar), clock),
      h('div', { class: 'choices choices-grid choices-code' }, ...buttons),
    );
    return () => {
      pause();
      io.disconnect();
    };
  },
};

export default baseConvert;
