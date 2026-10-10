import { seeded } from '../core/rng';
import type { CardInstance, CardModule, Country } from '../core/types';
import { add, choiceButtons, distractors, h, packCards, showFeedback, str } from './ui';

interface QuizData {
  question: string;
  answer: string;
  /** Wrong options. */
  options: string[];
  explanation?: string;
  credit?: string;
}

function capitalQuizzes(countries: Country[]): CardInstance<QuizData>[] {
  const withCapital = countries.filter((c) => c.independent && c.capital);
  return withCapital.map((c) => {
    const rng = seeded(`capital:${c.cca3}`);
    const wrong = distractors(
      [
        withCapital.filter((o) => o.subregion === c.subregion),
        withCapital.filter((o) => o.region === c.region),
        withCapital,
      ],
      (o) => o.cca3 === c.cca3 || o.capital === c.capital,
      3,
      rng,
      (o) => o.capital!,
    );
    return {
      id: `quiz:capital:${c.cca3}`,
      type: 'quiz',
      category: 'geography',
      data: {
        question: `What is the capital of ${c.name}?`,
        answer: c.capital!,
        options: wrong.map((o) => o.capital!),
      },
    };
  });
}

const quiz: CardModule<QuizData> = {
  type: 'quiz',
  label: 'Quiz',
  icon: '❓',

  build(sources) {
    const fromPacks = packCards<QuizData>(sources, 'quiz', (c) => {
      const question = str(c.question);
      const answer = str(c.answer);
      const options = Array.isArray(c.options) ? c.options.filter((o): o is string => typeof o === 'string') : [];
      if (!question || !answer || !options.length) return null;
      return {
        question,
        answer,
        options: options.filter((o) => o !== answer),
        explanation: str(c.explanation) ?? undefined,
      };
    });
    const fromTrivia: CardInstance<QuizData>[] = sources.trivia
      .filter((q) => q.kind === 'multiple')
      .map((q) => ({
        id: `quiz:otdb:${q.id}`,
        type: 'quiz',
        category: q.category,
        data: {
          question: q.question,
          answer: q.correct,
          options: q.incorrect,
          credit: `Open Trivia DB · ${q.sourceCategory}`,
        },
      }));
    return [...fromPacks, ...fromTrivia, ...capitalQuizzes(sources.countries)];
  },

  mount(root, card, ctx) {
    const { data } = card;
    add(
      root,
      h('h2', { class: 'card-question' }, data.question),
      choiceButtons([data.answer, ...data.options], data.answer, ctx.rng, (correct) => {
        ctx.answer(correct);
        showFeedback(root, correct, [correct ? null : `Answer: ${data.answer}`, data.explanation]);
      }),
      data.credit ? h('p', { class: 'credit' }, data.credit) : null,
    );
  },
};

export default quiz;
