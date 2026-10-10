import { describe, expect, it } from 'vitest';
import { mapOpenTdbCategory } from '../src/core/categories';
import { flagEmoji, fromV5, mergeCountries, snapshotCountries } from '../src/data/countries';
import { validatePack } from '../src/data/packs';
import { normalizeResult } from '../src/data/trivia';

describe('Open Trivia DB', () => {
  it('decodes url3986 results and maps categories', () => {
    const q = normalizeResult({
      type: 'multiple',
      difficulty: 'easy',
      category: 'Entertainment%3A%20Books',
      question: 'Who%20wrote%20%22Dracula%22%3F',
      correct_answer: 'Bram%20Stoker',
      incorrect_answers: ['Mary%20Shelley', 'Edgar%20Allan%20Poe', 'H.%20G.%20Wells'],
    });
    expect(q.question).toBe('Who wrote "Dracula"?');
    expect(q.correct).toBe('Bram Stoker');
    expect(q.category).toBe('arts');
    expect(q.id).toMatch(/^[0-9a-z]+$/);
  });

  it('maps every documented category to one of ours', () => {
    expect(mapOpenTdbCategory('Science: Computers')).toBe('science');
    expect(mapOpenTdbCategory('Entertainment: Video Games')).toBe('entertainment');
    expect(mapOpenTdbCategory('Animals')).toBe('nature');
    expect(mapOpenTdbCategory('Mythology')).toBe('history');
    expect(mapOpenTdbCategory('Vehicles')).toBe('general');
  });
});

describe('REST Countries v5', () => {
  it('maps the v5 shape', () => {
    const c = fromV5({
      names: { common: 'Canada' },
      codes: { alpha_2: 'CA', alpha_3: 'CAN' },
      capitals: [{ name: 'Ottawa', attributes: { primary: true } }],
      region: 'Americas',
      subregion: 'North America',
      population: 41798407,
      area: { kilometers: 9984670 },
      languages: [{ name: 'English' }, { name: 'French' }],
      currencies: [{ name: 'Canadian dollar' }],
      borders: ['USA'],
      classification: { sovereign: true },
      flag: { url_svg: 'https://flags.restcountries.com/v5/svg/ca.svg' },
    });
    expect(c).toMatchObject({
      cca3: 'CAN',
      capital: 'Ottawa',
      area: 9984670,
      independent: true,
      languages: ['English', 'French'],
    });
    expect(fromV5({ names: { common: 'Nowhere' } })).toBeNull();
  });

  it('merges live data over the snapshot without losing fields', () => {
    const base = snapshotCountries();
    const fra = base.find((c) => c.cca3 === 'FRA')!;
    const merged = mergeCountries(base, [{ ...fra, population: 1, capital: null, languages: [] }]);
    const out = merged.find((c) => c.cca3 === 'FRA')!;
    expect(out.population).toBe(1);
    expect(out.capital).toBe(fra.capital);
    expect(out.languages).toEqual(fra.languages);
    expect(merged).toHaveLength(base.length);
  });

  it('builds flag emoji from alpha-2 codes', () => {
    expect(flagEmoji('fr')).toBe('🇫🇷');
  });
});

describe('content packs', () => {
  it('validates pack shape', () => {
    expect(
      validatePack(
        { id: 'x', title: 'X', category: 'science', cards: [{ id: '1', type: 'fact' }, { nope: 1 }] },
        'x.json',
      )?.cards,
    ).toHaveLength(1);
    expect(validatePack({ id: 'x', title: 'X', category: 'cooking', cards: [] }, 'x.json')).toBeNull();
  });
});
