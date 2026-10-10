import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { CategoryId } from './categories';
import type { Rng } from './rng';

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

export interface Country {
  cca2: string;
  cca3: string;
  name: string;
  capital: string | null;
  region: string;
  subregion: string | null;
  population: number | null;
  area: number | null;
  languages: string[];
  currencies: string[];
  landlocked: boolean;
  borders: string[];
  independent: boolean;
  /** SVG flag URL; falls back to the REST Countries flag CDN. */
  flagUrl?: string;
}

export interface TriviaQuestion {
  id: string;
  kind: 'multiple' | 'boolean';
  category: CategoryId;
  sourceCategory: string;
  difficulty: string;
  question: string;
  correct: string;
  incorrect: string[];
}

/** One entry of a /content pack. `type` selects the card module; the rest is module-specific. */
export interface PackCard {
  id: string;
  type: string;
  category?: CategoryId;
  [key: string]: unknown;
}

export interface Pack {
  id: string;
  title: string;
  category: CategoryId;
  cards: PackCard[];
}

export interface GeoProps {
  name: string;
  continent: string;
  subregion: string;
}

export type GeoData = FeatureCollection<Polygon | MultiPolygon, GeoProps>;

export interface Sources {
  countries: Country[];
  trivia: TriviaQuestion[];
  packs: Pack[];
  /** Natural Earth countries; null until the (lazy) chunk has loaded. */
  geo: GeoData | null;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** A concrete, schedulable card. `id` must be stable across sessions: progress is keyed on it. */
export interface CardInstance<D = unknown> {
  id: string;
  type: string;
  category: CategoryId;
  data: D;
}

export interface CardContext {
  sources: Sources;
  /** True when the scheduler picked this card as a spaced-repetition review. */
  isReview: boolean;
  rng: Rng;
  /**
   * Report the result. Only the first call counts. For passive modules this is a
   * self-rating ("knew it" = true) that schedules the card without affecting accuracy.
   */
  answer(correct: boolean): void;
}

/**
 * A card type. Implementations live in `src/cards/*.card.ts` and are discovered automatically;
 * the feed and scheduler only ever talk to this interface.
 */
export interface CardModule<D = unknown> {
  /** Unique id, also the `type` field used by content packs. */
  type: string;
  label: string;
  icon: string;
  /**
   * Passive cards (facts) can be scrolled past without answering; that counts as "seen"
   * rather than "skipped". Their answer() calls are self-ratings and aren't scored.
   */
  passive?: boolean;
  /** Build every candidate card this module can make from the currently available sources. */
  build(sources: Sources): CardInstance<D>[];
  /** Render the card into `root`. May return a cleanup function. */
  mount(root: HTMLElement, card: CardInstance<D>, ctx: CardContext): void | (() => void);
}
