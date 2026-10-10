import { isCategory, isTopic, topicInfo } from '../core/categories';
import type { Pack, PackCard } from '../core/types';

/**
 * Every JSON file in /content is a card pack. Vite turns each into a lazily loaded chunk,
 * which the service worker precaches, so packs work offline from the first visit.
 */
const loaders = import.meta.glob('../../content/*.json', { import: 'default' });

export function validatePack(raw: unknown, file: string): Pack | null {
  const p = raw as Partial<Pack> | null;
  if (!p || typeof p.id !== 'string' || typeof p.title !== 'string' || !isCategory(p.category)) {
    console.warn(`[packs] ${file}: missing id/title/category, skipped`);
    return null;
  }
  const cards = (Array.isArray(p.cards) ? p.cards : []).filter(
    (c): c is PackCard => !!c && typeof c.id === 'string' && typeof c.type === 'string',
  );
  let topic = p.topic;
  if (topic !== undefined && (!isTopic(topic) || topicInfo(topic)?.category !== p.category)) {
    console.warn(`[packs] ${file}: topic "${topic}" doesn't belong to ${p.category}, ignored`);
    topic = undefined;
  }
  return { id: p.id, title: p.title, category: p.category, topic, cards };
}

export async function loadPacks(): Promise<Pack[]> {
  const entries = Object.entries(loaders);
  const packs = await Promise.all(
    entries.map(async ([file, load]) => {
      try {
        return validatePack(await load(), file);
      } catch (err) {
        console.warn(`[packs] failed to load ${file}`, err);
        return null;
      }
    }),
  );
  return packs.filter((p): p is Pack => !!p);
}
