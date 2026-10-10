import type { CardModule } from '../core/types';
import { codeBlock, codeLines, isLang, type Lang } from './code';
import { add, choiceButtons, h, packCards, showFeedback, str } from './ui';

export interface CodeOutputData {
  lang: Lang;
  code: string[];
  /** Exact stdout (trailing whitespace trimmed). Multi-line output uses "\n". */
  answer: string;
  options: string[];
  prompt?: string;
  explanation?: string;
}

const codeOutput: CardModule<CodeOutputData> = {
  type: 'code-output',
  label: 'Code output',
  icon: '🖨️',

  build(sources) {
    return packCards<CodeOutputData>(sources, 'code-output', (c) => {
      const code = codeLines(c.code);
      const answer = typeof c.answer === 'string' ? c.answer : null;
      const options = Array.isArray(c.options) ? c.options.filter((o): o is string => typeof o === 'string') : [];
      if (!isLang(c.lang) || !code || answer === null || !options.length) return null;
      return {
        lang: c.lang,
        code,
        answer,
        options: options.filter((o) => o !== answer),
        prompt: str(c.prompt) ?? undefined,
        explanation: str(c.explanation) ?? undefined,
      };
    });
  },

  mount(root, card, ctx) {
    const { data } = card;
    add(
      root,
      h(
        'h2',
        { class: 'card-question' },
        data.prompt ?? (data.lang === 'sql' ? 'What does the query return?' : 'What does this print?'),
      ),
      codeBlock(data.code, data.lang),
      choiceButtons(
        [data.answer, ...data.options],
        data.answer,
        ctx.rng,
        (correct) => {
          ctx.answer(correct);
          showFeedback(root, correct, [
            correct ? null : h('span', null, 'Output: ', h('code', { class: 'inline-code' }, data.answer)),
            data.explanation,
          ]);
        },
        { className: 'choices-code' },
      ),
    );
  },
};

export default codeOutput;
