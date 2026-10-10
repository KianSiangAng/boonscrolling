import type { CardModule, Country } from '../core/types';
import { flagImage } from './flag-image';
import { formatNumber, h, packCards, str } from './ui';

interface FactData {
  title: string;
  text: string;
  emoji?: string;
  source?: string;
  /** For generated country spotlights. */
  cca3?: string;
}

function spotlight(c: Country): FactData | null {
  if (!c.independent || !c.capital) return null;
  const bits = [`The capital of ${c.name} is ${c.capital}.`];
  if (c.population) bits.push(`About ${formatNumber(c.population, 'compact')} people live there.`);
  if (c.area) bits.push(`It covers ${formatNumber(Math.round(c.area))} km².`);
  if (c.languages.length)
    bits.push(`Language${c.languages.length > 1 ? 's' : ''}: ${c.languages.slice(0, 3).join(', ')}.`);
  if (c.currencies.length) bits.push(`Currency: ${c.currencies[0]}.`);
  if (c.landlocked) bits.push('It is landlocked.');
  return { title: `Spotlight: ${c.name}`, text: bits.join(' '), cca3: c.cca3 };
}

const fact: CardModule<FactData> = {
  type: 'fact',
  label: 'Fact',
  icon: '💡',
  passive: true,

  build(sources) {
    const fromPacks = packCards<FactData>(sources, 'fact', (c) => {
      const text = str(c.text);
      if (!text) return null;
      return {
        title: str(c.title) ?? 'Did you know?',
        text,
        emoji: str(c.emoji) ?? undefined,
        source: str(c.source) ?? undefined,
      };
    });
    const spotlights = sources.countries.flatMap((c) => {
      const data = spotlight(c);
      return data ? [{ id: `fact:country:${c.cca3}`, type: 'fact', category: 'geography' as const, data }] : [];
    });
    return [...fromPacks, ...spotlights];
  },

  mount(root, card, ctx) {
    const { data } = card;
    const country = data.cca3 ? ctx.sources.countries.find((c) => c.cca3 === data.cca3) : undefined;
    const visual = country
      ? flagImage(country, `Flag of ${country.name}`)
      : data.emoji
        ? h('div', { class: 'fact-emoji', 'aria-hidden': 'true' }, data.emoji)
        : null;

    const rate = (knew: boolean) => {
      ctx.answer(knew);
      buttons.replaceWith(
        h(
          'p',
          { class: 'fact-thanks' },
          knew ? 'Nice — we’ll check back in a few days.' : 'Now you know! It’ll come back soon.',
        ),
      );
    };
    const buttons = h(
      'div',
      { class: 'choices choices-row' },
      h('button', { class: 'choice', type: 'button', onclick: () => rate(false) }, '🤯 New to me'),
      h('button', { class: 'choice', type: 'button', onclick: () => rate(true) }, '👍 Knew it'),
    );

    root.append(
      h(
        'div',
        { class: 'fact' },
        visual,
        h('h2', { class: 'card-title' }, data.title),
        h('p', { class: 'fact-text' }, data.text),
        data.source ? h('p', { class: 'fact-source' }, `Source: ${data.source}`) : null,
      ),
      buttons,
    );
  },
};

export default fact;
