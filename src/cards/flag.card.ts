import type { CardModule } from '../core/types';
import { flagImage } from './flag-image';
import { choiceButtons, distractors, h, showFeedback } from './ui';

interface FlagData {
  cca3: string;
}

const flag: CardModule<FlagData> = {
  type: 'flag',
  label: 'Flag guess',
  icon: '🏳️',

  build(sources) {
    return sources.countries
      .filter((c) => c.independent)
      .map((c) => ({ id: `flag:${c.cca3}`, type: 'flag', category: 'geography', data: { cca3: c.cca3 } }));
  },

  mount(root, card, ctx) {
    const all = ctx.sources.countries.filter((c) => c.independent);
    const country = all.find((c) => c.cca3 === card.data.cca3);
    if (!country) {
      root.append(h('p', null, 'This flag is no longer available.'));
      return;
    }
    // Neighbours make for harder, more educational distractors (e.g. Chad vs Romania).
    const wrong = distractors(
      [
        all.filter((c) => country.borders.includes(c.cca3)),
        all.filter((c) => c.subregion === country.subregion),
        all.filter((c) => c.region === country.region),
        all,
      ],
      (c) => c.cca3 === country.cca3 || c.name === country.name,
      3,
      ctx.rng,
      (c) => c.cca3,
    );
    root.append(
      h('h2', { class: 'card-question' }, 'Whose flag is this?'),
      flagImage(country, 'Mystery flag', 'large'),
      choiceButtons([country.name, ...wrong.map((c) => c.name)], country.name, ctx.rng, (correct) => {
        ctx.answer(correct);
        showFeedback(root, correct, [
          correct ? null : `It’s ${country.name}.`,
          country.capital ? `Capital: ${country.capital} · ${country.subregion ?? country.region}` : null,
        ]);
      }),
    );
  },
};

export default flag;
