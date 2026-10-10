import type { CardModule } from '../core/types';

/**
 * Card types are discovered from `src/cards/*.card.ts`. Each file default-exports a
 * CardModule; adding a new type means adding a file — the feed never changes.
 */
const found = import.meta.glob<CardModule>('./*.card.ts', { eager: true, import: 'default' });

export const CARD_MODULES: CardModule[] = Object.values(found).sort((a, b) => a.label.localeCompare(b.label));

const byType = new Map(CARD_MODULES.map((m) => [m.type, m]));
if (byType.size !== CARD_MODULES.length) throw new Error('Two card modules share the same `type`');

export function getModule(type: string): CardModule | undefined {
  return byType.get(type);
}
