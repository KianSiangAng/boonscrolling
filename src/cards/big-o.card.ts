import type { CardModule } from '../core/types';
import { codeBlock, codeLines, isLang, type Lang } from './code';
import { add, choiceButtons, h, packCards, showFeedback, str } from './ui';

/** Ordered by growth, which is also the order the buttons are shown in. */
export const COMPLEXITIES = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)', 'O(n!)'];

interface BigOData {
  prompt: string;
  code?: string[];
  lang?: Lang;
  answer: string;
  options: string[];
  explanation?: string;
}

const bigO: CardModule<BigOData> = {
  type: 'big-o',
  label: 'Big O',
  icon: '📈',

  build(sources) {
    return packCards<BigOData>(sources, 'big-o', (c) => {
      const answer = str(c.answer);
      const prompt = str(c.prompt);
      const code = codeLines(c.code) ?? undefined;
      if (!answer || !prompt || (code && !isLang(c.lang))) return null;
      // Default distractors: the answer's neighbours on the growth scale.
      let options = Array.isArray(c.options) ? c.options.filter((o): o is string => typeof o === 'string') : [];
      if (!options.length) {
        const i = Math.max(0, COMPLEXITIES.indexOf(answer));
        const start = Math.min(Math.max(0, i - 2), COMPLEXITIES.length - 4);
        options = COMPLEXITIES.slice(start, start + 4);
      }
      return {
        prompt,
        code,
        lang: code ? (c.lang as Lang) : undefined,
        answer,
        options: options.filter((o) => o !== answer).slice(0, 3),
        explanation: str(c.explanation) ?? undefined,
      };
    });
  },

  mount(root, card, ctx) {
    const { data } = card;
    const all = [data.answer, ...data.options];
    const rank = (x: string) => (COMPLEXITIES.includes(x) ? COMPLEXITIES.indexOf(x) : 99);
    all.sort((a, b) => rank(a) - rank(b));
    add(
      root,
      h('h2', { class: 'card-question' }, data.prompt),
      data.code && data.lang ? codeBlock(data.code, data.lang) : null,
      h('p', { class: 'card-sub' }, 'Time complexity?'),
      choiceButtons(
        all,
        data.answer,
        ctx.rng,
        (correct) => {
          ctx.answer(correct);
          showFeedback(root, correct, [correct ? null : `It’s ${data.answer}.`, data.explanation]);
        },
        { shuffle: false, className: 'choices-grid choices-code' },
      ),
    );
  },
};

export default bigO;
