import './styles.css';
import { h } from './cards/ui';
import { openDb } from './core/db';
import { buildAllCards, filterPool } from './core/pool';
import { getActivity, getProgress, loadProgress, onProgressChange } from './core/progress';
import { getSettings, loadSettings, onSettingsChange } from './core/settings';
import type { CardInstance } from './core/types';
import { loadLocalSources, loadRemoteSources, onSourcesChange, sources, topUpTrivia } from './data/sources';
import { Feed } from './ui/feed';
import { renderSettings } from './ui/settings';

const app = document.getElementById('app')!;

let allCards: CardInstance[] = [];
let pool: CardInstance[] = [];

function rebuildPool(rebuildAll: boolean) {
  if (rebuildAll) allCards = buildAllCards(sources);
  pool = filterPool(allCards, getSettings());
}

const unseenTrivia = () => {
  const progress = getProgress();
  const counts = { mixed: 0, computers: 0 };
  for (const c of pool) {
    if (c.id.includes(':otdb:') && !progress.has(c.id)) counts[c.category === 'computing' ? 'computers' : 'mixed']++;
  }
  return counts;
};

function topBar() {
  const streak = h('span', { class: 'chip', title: 'Day streak' });
  const today = h('span', { class: 'chip', title: 'Answered today' });
  const update = () => {
    const a = getActivity();
    streak.textContent = `🔥 ${a.streak}`;
    today.textContent = `✓ ${a.todayCorrect}/${a.today}`;
  };
  update();
  onProgressChange(update);
  return h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, 'boon', h('span', null, 'scrolling')),
    h('div', { class: 'topbar-stats' }, streak, today),
    h('a', { class: 'icon-button', href: '#/settings', 'aria-label': 'Settings' }, '⚙'),
  );
}

async function main() {
  try {
    await openDb();
  } catch (err) {
    app.replaceChildren(
      h(
        'div',
        { class: 'fatal' },
        h('h1', null, 'Storage unavailable'),
        h('p', null, `boonscrolling needs IndexedDB to save progress. ${(err as Error).message}`),
      ),
    );
    return;
  }
  await Promise.all([loadSettings(), loadProgress()]);
  await loadLocalSources();
  rebuildPool(true);

  const feedEl = h('main', { class: 'feed', id: 'feed', tabindex: '-1' });
  const settingsEl = h('div', { class: 'settings', id: 'settings', hidden: true });
  app.replaceChildren(topBar(), feedEl, settingsEl);

  const feed = new Feed(feedEl, sources, () => pool);
  feed.start();

  onSourcesChange(() => {
    rebuildPool(true);
    feed.poolChanged();
  });
  onSettingsChange(() => {
    rebuildPool(false);
    feed.refreshUpcoming();
  });
  let answers = 0;
  onProgressChange(() => {
    if (++answers % 10 === 0) void topUpTrivia(unseenTrivia);
  });

  const route = () => {
    const inSettings = location.hash.startsWith('#/settings');
    settingsEl.hidden = !inSettings;
    feedEl.inert = inSettings;
    document.body.classList.toggle('in-settings', inSettings);
    if (inSettings) {
      renderSettings(settingsEl, { allCards: () => allCards });
      settingsEl.scrollTop = 0;
    } else feedEl.focus({ preventScroll: true });
  };
  addEventListener('hashchange', route);
  route();

  loadRemoteSources(unseenTrivia);
  addEventListener('online', () => loadRemoteSources(unseenTrivia));
}

void main();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
