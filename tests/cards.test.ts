import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_MODULES, getModule } from '../src/cards/registry';
import { buildAllCards } from '../src/core/pool';
import type { GeoData, Pack, Sources } from '../src/core/types';
import { snapshotCountries } from '../src/data/countries';
import { validatePack } from '../src/data/packs';

const packs = readdirSync('content')
  .filter((f) => f.endsWith('.json'))
  .map((f) => validatePack(JSON.parse(readFileSync(`content/${f}`, 'utf8')), f))
  .filter((p): p is Pack => !!p);
const geo = JSON.parse(readFileSync('src/geo/countries-geo.json', 'utf8')) as GeoData;

const sources: Sources = {
  countries: snapshotCountries(),
  packs,
  geo,
  trivia: [
    {
      id: 'a',
      kind: 'multiple',
      category: 'arts',
      sourceCategory: 'Art',
      difficulty: 'easy',
      question: 'Q?',
      correct: 'A',
      incorrect: ['B', 'C', 'D'],
    },
    {
      id: 'b',
      kind: 'boolean',
      category: 'science',
      sourceCategory: 'Science',
      difficulty: 'easy',
      question: 'S.',
      correct: 'True',
      incorrect: ['False'],
    },
  ],
};

describe('card registry', () => {
  it('discovers every card module, MVP and phase 2', () => {
    const types = CARD_MODULES.map((m) => m.type).sort();
    expect(types).toEqual(['fact', 'flag', 'higher-lower', 'map-tap', 'myth', 'quiz', 'silhouette']);
  });

  it('every pack card has a known type and every pack entry produces a card', () => {
    const cards = buildAllCards(sources);
    for (const pack of packs) {
      for (const c of pack.cards) {
        expect(getModule(c.type), `${pack.id}/${c.id}`).toBeDefined();
        expect(
          cards.some((x) => x.id === `${c.type}:${pack.id}:${c.id}`),
          `${pack.id}/${c.id} was rejected`,
        ).toBe(true);
      }
    }
  });

  it('builds unique, stable ids', () => {
    const a = buildAllCards(sources).map((c) => c.id);
    const b = buildAllCards(sources).map((c) => c.id);
    expect(new Set(a).size).toBe(a.length);
    expect(a).toEqual(b);
  });

  it('every module contributes cards from the bundled data', () => {
    const cards = buildAllCards(sources);
    for (const m of CARD_MODULES) expect(cards.filter((c) => c.type === m.type).length, m.type).toBeGreaterThan(0);
  });

  it('quiz options never include the answer twice', () => {
    for (const c of buildAllCards(sources).filter((c) => c.type === 'quiz')) {
      const d = c.data as { answer: string; options: string[] };
      expect(d.options, c.id).not.toContain(d.answer);
      expect(new Set(d.options).size, c.id).toBe(d.options.length);
    }
  });
});
