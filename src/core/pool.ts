import { CARD_MODULES } from '../cards/registry';
import { enabledCategories, type Settings } from './settings';
import type { CardInstance, Sources } from './types';

/** Every card any module can build from the current sources, before category/type filtering. */
export function buildAllCards(sources: Sources): CardInstance[] {
  const seen = new Set<string>();
  const out: CardInstance[] = [];
  for (const m of CARD_MODULES) {
    let cards: CardInstance[];
    try {
      cards = m.build(sources);
    } catch (err) {
      console.error(`[cards] ${m.type}.build failed`, err);
      continue;
    }
    for (const c of cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function filterPool(all: CardInstance[], settings: Settings): CardInstance[] {
  const cats = new Set(enabledCategories(settings));
  const types = new Set(settings.disabledTypes);
  const topics = new Set<string>(settings.disabledTopics);
  return all.filter((c) => cats.has(c.category) && !types.has(c.type) && !(c.topic && topics.has(c.topic)));
}
