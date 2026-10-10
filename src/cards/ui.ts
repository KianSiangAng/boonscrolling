import type { Rng } from '../core/rng';
import { shuffle } from '../core/rng';
import type { CardInstance, PackCard, Sources } from '../core/types';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; text?: string };

/** Tiny DOM builder: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children)
    if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Shows the verdict + optional explanation under a card. */
export function showFeedback(root: HTMLElement, correct: boolean, detail?: Child | Child[]): void {
  root.querySelector('.feedback')?.remove();
  const details = Array.isArray(detail) ? detail : [detail];
  root.append(
    h(
      'div',
      { class: `feedback ${correct ? 'is-correct' : 'is-wrong'}`, role: 'status' },
      h('strong', null, correct ? '✓ Correct!' : '✗ Not quite'),
      ...details.map((d) => (d ? h('p', null, d) : null)),
      h('span', { class: 'next-hint', 'aria-hidden': 'true' }, 'Swipe up for the next card ↑'),
    ),
  );
  root.classList.add('answered', correct ? 'answered-correct' : 'answered-wrong');
}

/**
 * Multiple-choice buttons. Calls `onPick` once with whether the pick was right,
 * then locks the buttons and highlights the right answer.
 */
export function choiceButtons(
  options: string[],
  correct: string,
  rng: Rng,
  onPick: (correct: boolean, picked: string) => void,
): HTMLElement {
  const wrap = h('div', { class: 'choices' });
  const buttons = shuffle(options, rng).map((opt) =>
    h('button', { class: 'choice', type: 'button', text: opt, onclick: () => choose(opt) }),
  );
  let done = false;
  function choose(opt: string) {
    if (done) return;
    done = true;
    for (const b of buttons) {
      b.disabled = true;
      if (b.textContent === correct) b.classList.add('is-correct');
      else if (b.textContent === opt) b.classList.add('is-wrong');
    }
    onPick(opt === correct, opt);
  }
  wrap.append(...buttons);
  return wrap;
}

/** Pick `n` distinct distractors, preferring the earlier (closer) groups. */
export function distractors<T>(groups: T[][], exclude: (t: T) => boolean, n: number, rng: Rng, key: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const t of shuffle(group, rng)) {
      if (out.length >= n) return out;
      const k = key(t);
      if (exclude(t) || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/** All cards of a given type from /content packs, with stable ids and inherited categories. */
export function packCards<D>(sources: Sources, type: string, toData: (c: PackCard) => D | null): CardInstance<D>[] {
  const out: CardInstance<D>[] = [];
  for (const pack of sources.packs) {
    for (const c of pack.cards) {
      if (c.type !== type) continue;
      const data = toData(c);
      if (data) out.push({ id: `${type}:${pack.id}:${c.id}`, type, category: c.category ?? pack.category, data });
    }
  }
  return out;
}

export const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);

export function formatNumber(value: number, style: 'compact' | 'number' = 'number'): string {
  if (style === 'compact' && Math.abs(value) >= 1e6) {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/** Element.append that skips null/false children. */
export function add(parent: Element, ...children: Child[]): void {
  for (const c of children)
    if (c !== null && c !== undefined && c !== false) parent.append(c instanceof Node ? c : String(c));
}
