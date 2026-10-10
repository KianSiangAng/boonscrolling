import { seeded, shuffle } from '../core/rng';
import type { CardInstance, CardModule, Country } from '../core/types';
import { flagEmoji } from '../data/countries';
import { formatNumber, h, packCards, showFeedback, str } from './ui';

interface Side {
  label: string;
  value: number;
  emoji?: string;
}

interface HigherLowerData {
  /** e.g. "population" — reads as "a higher or lower population than…" */
  metric: string;
  unit?: string;
  format?: 'compact' | 'number' | 'plain';
  a: Side;
  b: Side;
  explanation?: string;
}

function side(x: unknown): Side | null {
  const s = x as Partial<Side> | null;
  const label = str(s?.label);
  if (!label || typeof s?.value !== 'number' || !Number.isFinite(s.value)) return null;
  return { label, value: s.value, emoji: str(s.emoji) ?? undefined };
}

const METRICS = [
  { key: 'population', metric: 'population', unit: '', format: 'compact' as const, get: (c: Country) => c.population },
  { key: 'area', metric: 'area', unit: 'km²', format: 'number' as const, get: (c: Country) => c.area },
];

/**
 * Deterministic country pairs (seeded per metric) so card ids stay stable between visits.
 * Each country appears once as the mystery side, against a partner 1.15–6× apart: close
 * enough to be interesting, far enough that rounding never decides it.
 */
function countryPairs(countries: Country[]): CardInstance<HigherLowerData>[] {
  const out: CardInstance<HigherLowerData>[] = [];
  for (const m of METRICS) {
    const rows = countries
      .filter((c) => c.independent && (m.get(c) ?? 0) > 0)
      .sort((a, b) => a.cca3.localeCompare(b.cca3));
    const rng = seeded(`higher-lower:${m.key}`);
    for (const b of rows) {
      const bv = m.get(b)!;
      const partner = shuffle(rows, rng).find((a) => {
        const ratio = Math.max(m.get(a)!, bv) / Math.min(m.get(a)!, bv);
        return a.cca3 !== b.cca3 && ratio >= 1.15 && ratio <= 6;
      });
      if (!partner) continue;
      out.push({
        id: `higher-lower:${m.key}:${partner.cca3}:${b.cca3}`,
        type: 'higher-lower',
        category: 'geography',
        data: {
          metric: m.metric,
          unit: m.unit,
          format: m.format,
          a: { label: partner.name, value: m.get(partner)!, emoji: flagEmoji(partner.cca2) },
          b: { label: b.name, value: bv, emoji: flagEmoji(b.cca2) },
        },
      });
    }
  }
  return out;
}

function countUp(el: HTMLElement, to: number, fmt: (n: number) => string) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const dur = 700;
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const higherLower: CardModule<HigherLowerData> = {
  type: 'higher-lower',
  label: 'Higher or lower',
  icon: '↕️',

  build(sources) {
    const fromPacks = packCards<HigherLowerData>(sources, 'higher-lower', (c) => {
      const metric = str(c.metric);
      const a = side(c.a);
      const b = side(c.b);
      if (!metric || !a || !b || a.value === b.value) return null;
      return {
        metric,
        a,
        b,
        unit: str(c.unit) ?? undefined,
        format: c.format === 'compact' || c.format === 'plain' ? c.format : 'number',
        explanation: str(c.explanation) ?? undefined,
      };
    });
    return [...fromPacks, ...countryPairs(sources.countries)];
  },

  mount(root, card, ctx) {
    const { data } = card;
    const fmt = (n: number) =>
      `${formatNumber(Math.round(n * 100) / 100, data.format)}${data.unit ? ` ${data.unit}` : ''}`;
    const bValue = h('div', { class: 'hl-value hl-unknown' }, '?');
    const panel = (s: Side, value: HTMLElement) =>
      h(
        'div',
        { class: 'hl-side' },
        s.emoji ? h('div', { class: 'hl-emoji', 'aria-hidden': 'true' }, s.emoji) : null,
        h('div', { class: 'hl-label' }, s.label),
        value,
      );

    const higher = h('button', { class: 'choice', type: 'button', onclick: () => decide(true) }, '▲ Higher');
    const lower = h('button', { class: 'choice', type: 'button', onclick: () => decide(false) }, '▼ Lower');
    let done = false;
    function decide(saysHigher: boolean) {
      if (done) return;
      done = true;
      const isHigher = data.b.value > data.a.value;
      const correct = saysHigher === isHigher;
      higher.disabled = lower.disabled = true;
      (isHigher ? higher : lower).classList.add('is-correct');
      if (!correct) (saysHigher ? higher : lower).classList.add('is-wrong');
      bValue.classList.remove('hl-unknown');
      countUp(bValue, data.b.value, fmt);
      ctx.answer(correct);
      const ratio = Math.max(data.a.value, data.b.value) / Math.min(data.a.value, data.b.value);
      showFeedback(root, correct, [
        `${data.b.label} is ${ratio.toFixed(1)}× ${isHigher ? 'higher' : 'lower'}.`,
        data.explanation,
      ]);
    }

    root.append(
      h('h2', { class: 'card-question' }, `${data.b.label}: higher or lower?`),
      h(
        'div',
        { class: 'hl' },
        panel(data.a, h('div', { class: 'hl-value' }, fmt(data.a.value))),
        h('div', { class: 'hl-vs', 'aria-hidden': 'true' }, 'vs'),
        panel(data.b, bValue),
      ),
      h('p', { class: 'hl-prompt' }, `Comparing ${data.metric}`),
      h('div', { class: 'choices choices-row' }, higher, lower),
    );
  },
};

export default higherLower;
