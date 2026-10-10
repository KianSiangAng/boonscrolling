export const CATEGORIES = [
  { id: 'geography', label: 'Geography', icon: '🌍', hue: 200 },
  { id: 'science', label: 'Science & Tech', icon: '🔬', hue: 160 },
  { id: 'history', label: 'History & Myth', icon: '🏛️', hue: 30 },
  { id: 'nature', label: 'Nature & Animals', icon: '🐾', hue: 110 },
  { id: 'arts', label: 'Art & Literature', icon: '🎨', hue: 300 },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬', hue: 340 },
  { id: 'sports', label: 'Sports', icon: '⚽', hue: 50 },
  { id: 'general', label: 'General', icon: '💡', hue: 250 },
  { id: 'computing', label: 'Computer Science', icon: '💻', hue: 270 },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export function isCategory(x: unknown): x is CategoryId {
  return typeof x === 'string' && (CATEGORY_IDS as string[]).includes(x);
}

export function categoryInfo(id: CategoryId) {
  return CATEGORIES.find((c) => c.id === id)!;
}

/**
 * Sub-topics: optional finer-grained toggles inside a category. Pack cards inherit their
 * pack's `topic`; cards without a topic are governed by the category toggle alone.
 */
export const TOPICS = [
  { id: 'cs-dsa', category: 'computing', label: 'Data structures & algorithms', short: 'Algorithms', icon: '🧮' },
  { id: 'cs-networking', category: 'computing', label: 'Networking', short: 'Networking', icon: '🌐' },
  { id: 'cs-os', category: 'computing', label: 'Operating systems', short: 'OS', icon: '🖥️' },
  { id: 'cs-databases', category: 'computing', label: 'Databases & SQL', short: 'Databases', icon: '🗄️' },
  { id: 'cs-numbers', category: 'computing', label: 'Number systems', short: 'Number systems', icon: '🔢' },
  { id: 'cs-security', category: 'computing', label: 'Security', short: 'Security', icon: '🔐' },
  { id: 'cs-history', category: 'computing', label: 'Computing history', short: 'CS history', icon: '📟' },
  { id: 'cs-programming', category: 'computing', label: 'Code reading & regex', short: 'Code', icon: '⌨️' },
  { id: 'cs-trivia', category: 'computing', label: 'Computer trivia (Open Trivia DB)', short: 'CS trivia', icon: '❔' },
] as const satisfies readonly { id: string; category: CategoryId; label: string; short: string; icon: string }[];

export type TopicId = (typeof TOPICS)[number]['id'];

export function isTopic(x: unknown): x is TopicId {
  return typeof x === 'string' && TOPICS.some((t) => t.id === x);
}

export function topicInfo(id: string) {
  return TOPICS.find((t) => t.id === id);
}

export function topicsFor(category: CategoryId) {
  return TOPICS.filter((t) => t.category === category);
}

/** Open Trivia DB category names → our categories. Unknown names fall back to "general". */
const OPENTDB_MAP: [RegExp, CategoryId][] = [
  [/^Science: Computers/, 'computing'],
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

/** Open Trivia DB's own id for "Science: Computers", fetched as its own stream. */
export const OPENTDB_COMPUTERS = 18;

export function mapOpenTdbTopic(name: string): TopicId | undefined {
  return mapOpenTdbCategory(name) === 'computing' ? 'cs-trivia' : undefined;
}
