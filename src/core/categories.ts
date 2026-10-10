export const CATEGORIES = [
  { id: 'geography', label: 'Geography', icon: '🌍', hue: 200 },
  { id: 'science', label: 'Science & Tech', icon: '🔬', hue: 160 },
  { id: 'history', label: 'History & Myth', icon: '🏛️', hue: 30 },
  { id: 'nature', label: 'Nature & Animals', icon: '🐾', hue: 110 },
  { id: 'arts', label: 'Art & Literature', icon: '🎨', hue: 300 },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬', hue: 340 },
  { id: 'sports', label: 'Sports', icon: '⚽', hue: 50 },
  { id: 'general', label: 'General', icon: '💡', hue: 250 },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export function isCategory(x: unknown): x is CategoryId {
  return typeof x === 'string' && (CATEGORY_IDS as string[]).includes(x);
}

export function categoryInfo(id: CategoryId) {
  return CATEGORIES.find((c) => c.id === id)!;
}

/** Open Trivia DB category names → our categories. Unknown names fall back to "general". */
const OPENTDB_MAP: [RegExp, CategoryId][] = [
  [/^Entertainment: Books/, 'arts'],
  [/^Entertainment|^Celebrities/, 'entertainment'],
  [/^Science|^Mathematics/, 'science'],
  [/^Animals/, 'nature'],
  [/^Geography/, 'geography'],
  [/^History|^Politics|^Mythology/, 'history'],
  [/^Art/, 'arts'],
  [/^Sports/, 'sports'],
];

export function mapOpenTdbCategory(name: string): CategoryId {
  for (const [re, id] of OPENTDB_MAP) if (re.test(name)) return id;
  return 'general';
}
