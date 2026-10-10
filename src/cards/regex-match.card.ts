import { shuffle } from '../core/rng';
import type { CardModule } from '../core/types';
import { regexView } from './code';
import { h, packCards, showFeedback, str } from './ui';

export interface RegexMatchData {
  pattern: string;
  flags: string;
  candidates: string[];
  /** The candidates the pattern matches (verified by the test suite with RegExp#test). */
  matches: string[];
  explanation?: string;
}

const show = (s: string) => (s === '' ? '‹empty›' : s);

const regexMatch: CardModule<RegexMatchData> = {
  type: 'regex-match',
  label: 'Regex match',
  icon: '🔍',

  build(sources) {
    return packCards<RegexMatchData>(sources, 'regex-match', (c) => {
      const pattern = str(c.pattern);
      const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
      const candidates = strings(c.candidates);
      const matches = strings(c.matches);
      if (!pattern || candidates.length < 2 || !matches.every((m) => candidates.includes(m))) return null;
      return { pattern, flags: str(c.flags) ?? '', candidates, matches, explanation: str(c.explanation) ?? undefined };
    });
  },

  mount(root, card, ctx) {
    const { data } = card;
    const shouldMatch = new Set(data.matches);
    let done = false;
    const toggles = shuffle(data.candidates, ctx.rng).map((s) => {
      const box = h('span', { class: 'regex-box', 'aria-hidden': 'true' }, '☐');
      const b = h(
        'button',
        { class: 'choice regex-candidate', type: 'button', 'aria-pressed': 'false' },
        h('span', null, box, ' ', show(s)),
      );
      b.addEventListener('click', () => {
        if (done) return;
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        box.textContent = on ? '☑' : '☐';
      });
      return { b, s };
    });
    const check = h('button', { class: 'button regex-check', type: 'button' }, 'Check');
    check.addEventListener('click', () => {
      if (done) return;
      done = true;
      check.disabled = true;
      let allRight = true;
      for (const { b, s } of toggles) {
        const picked = b.getAttribute('aria-pressed') === 'true';
        const matches = shouldMatch.has(s);
        b.disabled = true;
        b.classList.add(picked === matches ? 'is-correct' : 'is-wrong');
        b.append(h('span', { class: 'regex-verdict' }, matches ? 'match' : 'no match'));
        if (picked !== matches) allRight = false;
      }
      ctx.answer(allRight);
      showFeedback(root, allRight, [
        `Matches: ${data.matches.length ? data.matches.map((m) => `“${show(m)}”`).join(', ') : 'none'}`,
        data.explanation,
      ]);
    });

    root.append(
      h('h2', { class: 'card-question' }, 'Which strings match?'),
      h('div', { class: 'regex-pattern' }, regexView(data.pattern, data.flags)),
      h('p', { class: 'card-sub' }, 'Select every string this pattern matches (JavaScript regex, test()).'),
      h('div', { class: 'choices choices-grid choices-code' }, ...toggles.map((t) => t.b)),
      check,
    );
  },
};

export default regexMatch;
