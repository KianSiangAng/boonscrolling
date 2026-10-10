import type { CardModule } from '../core/types';
import { codeLines, highlightLine, isLang, LANG_LABEL, type Lang } from './code';
import { h, packCards, showFeedback, str } from './ui';

export interface BugCheck {
  /** Expression evaluated after the snippet, e.g. "max([3, 9, 2])". */
  call: string;
  /** Expected JSON-serialisable result. */
  expect: unknown;
}

export interface SpotTheBugData {
  lang: Exclude<Lang, 'sql'>;
  /** What the code is supposed to do. */
  goal: string;
  code: string[];
  /** 1-based line number of the faulty line. */
  bugLine: number;
  /** Corrected version of that line. */
  fix: string;
  /** Used by the test suite: the original must fail one, the fixed code must pass all. */
  checks: BugCheck[];
  explanation?: string;
}

const spotTheBug: CardModule<SpotTheBugData> = {
  type: 'spot-the-bug',
  label: 'Spot the bug',
  icon: '🐞',

  build(sources) {
    return packCards<SpotTheBugData>(sources, 'spot-the-bug', (c) => {
      const code = codeLines(c.code);
      const goal = str(c.goal);
      const fix = typeof c.fix === 'string' ? c.fix : null;
      const bugLine = typeof c.bugLine === 'number' ? c.bugLine : 0;
      const checks = Array.isArray(c.checks) ? (c.checks as BugCheck[]).filter((k) => typeof k?.call === 'string') : [];
      if (!isLang(c.lang) || c.lang === 'sql' || !code || !goal || fix === null) return null;
      if (bugLine < 1 || bugLine > code.length || !checks.length) return null;
      return { lang: c.lang, goal, code, bugLine, fix, checks, explanation: str(c.explanation) ?? undefined };
    });
  },

  mount(root, card, ctx) {
    const { data } = card;
    let done = false;
    const lines = data.code.map((line, i) =>
      h(
        'button',
        {
          class: 'code-row',
          type: 'button',
          'aria-label': `Line ${i + 1}: ${line.trim() || 'blank'}`,
          onclick: () => pick(i + 1),
        },
        h('span', { class: 'line-no', 'aria-hidden': 'true' }, String(i + 1)),
        highlightLine(line, data.lang),
      ),
    );

    function pick(n: number) {
      if (done) return;
      done = true;
      const correct = n === data.bugLine;
      lines.forEach((b, i) => {
        b.disabled = true;
        if (i + 1 === data.bugLine) b.classList.add('is-correct');
        else if (i + 1 === n) b.classList.add('is-wrong');
      });
      ctx.answer(correct);
      showFeedback(root, correct, [
        correct ? null : `The bug is on line ${data.bugLine}.`,
        h(
          'span',
          { class: 'fix' },
          'Fix: ',
          h('code', { class: 'inline-code' }, highlightLine(data.fix.trim(), data.lang)),
        ),
        data.explanation,
      ]);
    }

    root.append(
      h('h2', { class: 'card-question' }, 'Tap the buggy line'),
      h('p', { class: 'card-sub' }, data.goal),
      h(
        'figure',
        { class: 'code code-tappable', 'aria-label': `${LANG_LABEL[data.lang]} code` },
        h('figcaption', { class: 'code-lang' }, LANG_LABEL[data.lang]),
        h('div', { class: 'code-rows' }, ...lines),
      ),
    );
  },
};

export default spotTheBug;
