import { shuffle } from '../core/rng';
import type { CardModule } from '../core/types';
import { h, packCards, showFeedback, str } from './ui';

interface DsMatchData {
  prompt: string;
  /** [structure, use] pairs. */
  pairs: [string, string][];
}

const dsMatch: CardModule<DsMatchData> = {
  type: 'ds-match',
  label: 'Data structure match',
  icon: '🧩',

  build(sources) {
    return packCards<DsMatchData>(sources, 'ds-match', (c) => {
      const pairs = Array.isArray(c.pairs)
        ? c.pairs.filter(
            (p): p is [string, string] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'string'),
          )
        : [];
      if (pairs.length < 2) return null;
      return { prompt: str(c.prompt) ?? 'Match each data structure to its best use', pairs };
    });
  },

  mount(root, card, ctx) {
    const { pairs } = card.data;
    const useOf = new Map(pairs);
    let selected: HTMLButtonElement | null = null;
    let matched = 0;
    let mistakes = 0;
    let n = 0;

    const tile = (text: string, side: 'left' | 'right') => {
      const b = h('button', { class: `match-tile match-${side}`, type: 'button', 'data-side': side, text });
      b.addEventListener('click', () => choose(b));
      return b;
    };
    const left = pairs.map(([s]) => tile(s, 'left'));
    const right = shuffle(pairs, ctx.rng).map(([, u]) => tile(u, 'right'));

    function choose(b: HTMLButtonElement) {
      if (b.disabled) return;
      if (!selected || selected === b || selected.dataset.side === b.dataset.side) {
        selected?.classList.remove('is-selected');
        selected = selected === b ? null : b;
        selected?.classList.add('is-selected');
        return;
      }
      const [l, r] = selected.dataset.side === 'left' ? [selected, b] : [b, selected];
      selected.classList.remove('is-selected');
      selected = null;
      const ok = useOf.get(l.textContent!) === r.textContent;
      n++;
      for (const t of [l, r]) {
        t.disabled = true;
        t.classList.add(ok ? 'is-correct' : 'is-wrong');
        t.prepend(h('span', { class: 'match-badge', 'aria-hidden': 'true' }, String(n)));
      }
      if (!ok) mistakes++;
      if (++matched === pairs.length) {
        ctx.answer(mistakes === 0);
        showFeedback(
          root,
          mistakes === 0,
          mistakes
            ? h('span', { class: 'match-answers' }, ...pairs.map(([s, u]) => h('span', null, `${s} → ${u}`)))
            : 'All pairs matched.',
        );
      }
    }

    root.append(
      h('h2', { class: 'card-question' }, card.data.prompt),
      h('p', { class: 'card-sub' }, 'Tap one on each side to pair them.'),
      h(
        'div',
        { class: 'match' },
        h('div', { class: 'match-col' }, ...left),
        h('div', { class: 'match-col' }, ...right),
      ),
    );
  },
};

export default dsMatch;
