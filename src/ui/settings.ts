import { CARD_MODULES } from '../cards/registry';
import { h } from '../cards/ui';
import { createBackup, importBackup } from '../core/backup';
import { CATEGORIES, topicsFor } from '../core/categories';
import { MAX_BOX } from '../core/leitner';
import { getActivity, getProgress, resetProgress } from '../core/progress';
import { categoryStats } from '../core/scheduler';
import { getSettings, saveSettings } from '../core/settings';
import type { CardInstance } from '../core/types';
import { BUILD_TIME_KEY } from '../data/countries';
import { refreshCountriesIfStale, restCountriesKey, status, topUpTrivia } from '../data/sources';

interface SettingsDeps {
  allCards: () => CardInstance[];
}

function toggle(label: Node | string, checked: boolean, onChange: (on: boolean) => void, hint?: string) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h(
    'label',
    { class: 'toggle' },
    h('span', { class: 'toggle-text' }, label, hint ? h('small', null, hint) : null),
    input,
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pct = (c: number, w: number) => (c + w ? `${Math.round((100 * c) / (c + w))}%` : '—');

export function renderSettings(root: HTMLElement, deps: SettingsDeps, note = ''): void {
  const settings = getSettings();
  const progress = getProgress();
  const stats = categoryStats(progress);
  const all = deps.allCards();
  const countBy = (key: 'category' | 'type') => {
    const m = new Map<string, number>();
    for (const c of all) m.set(c[key], (m.get(c[key]) ?? 0) + 1);
    return m;
  };
  const perCategory = countBy('category');
  // Sub-topic stats: card counts from the pool, accuracy from progress records of those cards.
  const topicStats = new Map<string, { cards: number; correct: number; wrong: number }>();
  for (const c of all) {
    if (!c.topic) continue;
    const t = topicStats.get(c.topic) ?? { cards: 0, correct: 0, wrong: 0 };
    t.cards++;
    const rec = progress.get(c.id);
    if (rec) {
      t.correct += rec.correct;
      t.wrong += rec.wrong;
    }
    topicStats.set(c.topic, t);
  }
  const perType = countBy('type');
  const message = h('p', { class: 'settings-message', role: 'status' }, note);
  const say = (text: string) => (message.textContent = text);

  // --- Categories ---------------------------------------------------------
  const categories = h(
    'section',
    { class: 'settings-section' },
    h('h2', null, 'Categories'),
    h('p', { class: 'muted' }, 'The feed leans toward the categories you get wrong most.'),
    ...CATEGORIES.flatMap((cat) => {
      const s = stats.get(cat.id);
      const hint = `${perCategory.get(cat.id) ?? 0} cards · accuracy ${pct(s?.correct ?? 0, s?.wrong ?? 0)}`;
      const topics = topicsFor(cat.id);
      const group = topics.length
        ? h(
            'div',
            {
              class: `subtoggles${settings.disabledCategories.includes(cat.id) ? ' is-off' : ''}`,
              role: 'group',
              'aria-label': `${cat.label} topics`,
            },
            ...topics.map((t) => {
              const ts = topicStats.get(t.id);
              return toggle(
                `${t.icon} ${t.label}`,
                !settings.disabledTopics.includes(t.id),
                (on) => {
                  const current = getSettings();
                  const set = new Set(current.disabledTopics);
                  if (on) set.delete(t.id);
                  else set.add(t.id);
                  void saveSettings({ ...current, disabledTopics: [...set] });
                },
                `${ts?.cards ?? 0} cards · accuracy ${pct(ts?.correct ?? 0, ts?.wrong ?? 0)}`,
              );
            }),
          )
        : null;
      const main = toggle(
        `${cat.icon} ${cat.label}`,
        !settings.disabledCategories.includes(cat.id),
        (on) => {
          group?.classList.toggle('is-off', !on);
          const current = getSettings();
          const set = new Set(current.disabledCategories);
          if (on) set.delete(cat.id);
          else set.add(cat.id);
          void saveSettings({ ...current, disabledCategories: [...set] });
        },
        hint,
      );
      return group ? [main, group] : [main];
    }),
  );

  // --- Card types ---------------------------------------------------------
  const types = h(
    'section',
    { class: 'settings-section' },
    h('h2', null, 'Card types'),
    ...CARD_MODULES.map((m) =>
      toggle(
        `${m.icon} ${m.label}`,
        !settings.disabledTypes.includes(m.type),
        (on) => {
          const current = getSettings();
          const set = new Set(current.disabledTypes);
          if (on) set.delete(m.type);
          else set.add(m.type);
          void saveSettings({ ...current, disabledTypes: [...set] });
        },
        `${perType.get(m.type) ?? 0} cards available`,
      ),
    ),
  );

  // --- Progress -----------------------------------------------------------
  const activity = getActivity();
  const boxes = Array.from({ length: MAX_BOX }, () => 0);
  let due = 0;
  const now = Date.now();
  for (const r of progress.values()) {
    if (r.box > 0) boxes[r.box - 1]++;
    if (r.box > 0 && r.due <= now) due++;
  }
  const maxBox = Math.max(1, ...boxes);
  const progressSection = h(
    'section',
    { class: 'settings-section' },
    h('h2', null, 'Your progress'),
    h(
      'div',
      { class: 'stat-row' },
      h('div', { class: 'stat' }, h('strong', null, String(activity.streak)), h('span', null, 'day streak')),
      h('div', { class: 'stat' }, h('strong', null, String(activity.today)), h('span', null, 'answered today')),
      h('div', { class: 'stat' }, h('strong', null, String(progress.size)), h('span', null, 'cards seen')),
      h('div', { class: 'stat' }, h('strong', null, String(due)), h('span', null, 'due for review')),
    ),
    h('h3', null, 'Leitner boxes'),
    h(
      'div',
      { class: 'boxes', role: 'img', 'aria-label': `Cards per box: ${boxes.join(', ')}` },
      ...boxes.map((n, i) =>
        h(
          'div',
          { class: 'box' },
          h('span', { class: 'box-count' }, String(n)),
          h('div', { class: 'box-bar', style: { height: `${Math.max(2, (n / maxBox) * 100)}%` } }),
          h('span', { class: 'box-label' }, String(i + 1)),
        ),
      ),
    ),
    h(
      'p',
      { class: 'muted' },
      'Box 1 returns in 10 min, then 1 day, 3 days, 1 week, 3 weeks, 2 months. A miss sends a card back to box 1.',
    ),
  );

  // --- Backup -------------------------------------------------------------
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const { merged, rejected } = await importBackup(await file.text());
      rerender(`Imported: ${merged} cards updated${rejected ? `, ${rejected} invalid entries skipped` : ''}.`);
    } catch (err) {
      say((err as Error).message);
    } finally {
      fileInput.value = '';
    }
  });
  const backup = h(
    'section',
    { class: 'settings-section' },
    h('h2', null, 'Backup'),
    h(
      'p',
      { class: 'muted' },
      'Progress lives only on this device. Export it to move devices or keep a copy; importing merges, keeping the most recent result for each card.',
    ),
    h(
      'div',
      { class: 'button-row' },
      h(
        'button',
        {
          class: 'button',
          type: 'button',
          onclick: () => {
            const b = createBackup();
            download(`boonscrolling-progress-${b.exportedAt.slice(0, 10)}.json`, JSON.stringify(b, null, 2));
            say(`Exported ${b.progress.length} cards.`);
          },
        },
        '⬇ Export JSON',
      ),
      h('button', { class: 'button', type: 'button', onclick: () => fileInput.click() }, '⬆ Import JSON'),
      fileInput,
      h(
        'button',
        {
          class: 'button button-danger',
          type: 'button',
          onclick: async () => {
            if (!confirm('Erase all progress on this device? Export first if you want a copy.')) return;
            await resetProgress();
            rerender('Progress reset.');
          },
        },
        'Reset progress',
      ),
    ),
  );

  // --- Data sources -------------------------------------------------------
  const keyInput = h('input', {
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: BUILD_TIME_KEY ? 'Using the built-in key' : 'rc_live_…',
    'aria-label': 'REST Countries API key',
  });
  keyInput.value = settings.restCountriesKey;
  const data = h(
    'section',
    { class: 'settings-section' },
    h('h2', null, 'Data'),
    h(
      'dl',
      { class: 'sources' },
      h('dt', null, 'Countries'),
      h('dd', null, status.countries),
      h('dt', null, 'Trivia'),
      h('dd', null, status.trivia),
      h('dt', null, 'Maps'),
      h('dd', null, status.geo),
    ),
    h(
      'label',
      { class: 'field' },
      h('span', null, 'REST Countries API key (optional)'),
      keyInput,
      h(
        'small',
        null,
        'Without a key the bundled snapshot is used. Keys must allow this site’s hostname. Stored only on this device and never exported.',
      ),
    ),
    h(
      'div',
      { class: 'button-row' },
      h(
        'button',
        {
          class: 'button',
          type: 'button',
          onclick: async () => {
            await saveSettings({ ...getSettings(), restCountriesKey: keyInput.value });
            if (!restCountriesKey()) return say('Key cleared; using the bundled snapshot.');
            say('Fetching countries…');
            await refreshCountriesIfStale(true);
            say(status.countries);
          },
        },
        'Save key & refresh',
      ),
      h(
        'button',
        {
          class: 'button',
          type: 'button',
          onclick: async () => {
            say('Fetching trivia… (Open Trivia DB allows one request every 5 s)');
            await topUpTrivia(() => ({ mixed: 0, computers: 0 }), true);
            say(status.trivia);
          },
        },
        'Fetch more trivia',
      ),
    ),
  );

  const about = h(
    'section',
    { class: 'settings-section about' },
    h('h2', null, 'About'),
    h(
      'p',
      { class: 'muted' },
      `boonscrolling v${__APP_VERSION__}. Trivia from Open Trivia DB (CC BY-SA 4.0). Country data from REST Countries and mledoze/countries (ODbL). Maps from Natural Earth (public domain). Flags via the REST Countries flag CDN.`,
    ),
  );

  function rerender(text?: string) {
    renderSettings(root, deps, text);
  }

  root.replaceChildren(
    h(
      'header',
      { class: 'settings-header' },
      h('a', { class: 'icon-button', href: '#/', 'aria-label': 'Back to feed' }, '←'),
      h('h1', null, 'Settings'),
    ),
    message,
    categories,
    types,
    progressSection,
    backup,
    data,
    about,
  );
}
