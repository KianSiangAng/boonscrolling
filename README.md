# boonscrolling

Swipe to learn instead of doomscrolling. A mobile-first, installable PWA whose home screen is a
full-screen vertical feed of bite-sized learning cards, with Leitner-box spaced repetition so the
things you miss come back at growing intervals.

- **Feed:** full-screen cards with CSS snap scrolling, infinite, one swipe per card (keyboard: ↑/↓, j/k).
- **Card types:** fact, multiple-choice quiz, myth-or-fact swipe, higher-or-lower, flag guess, plus
  phase-2 **map tap** and **silhouette** cards drawn with D3 from bundled Natural Earth shapes.
- **Computer Science:** a category with sub-topics (algorithms, networking, OS, databases, number
  systems, security, history, code reading, Open Trivia DB computer questions) and its own card
  types: code output, spot the bug, Big O, ports & protocols, timed base conversion,
  data-structure matching, OSI drag-and-drop and regex matching.
- **Spaced repetition:** progress lives in IndexedDB. Misses drop to box 1 and return in 10 minutes,
  then 1 day → 3 days → 1 week → 3 weeks → 2 months as you keep getting them right.
- **Scheduler:** ~70% new cards and ~30% due reviews, never the same card type twice in a row, and
  weighted toward your weakest categories.
- **Offline & installable:** web manifest and a service worker that precaches the whole app,
  including content packs and map data. Flags are cached as you see them.
- **Settings:** category, sub-topic and card-type toggles, progress stats, export/import of progress as JSON.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # vitest; also executes every code/regex card's answer (needs python3 on PATH)
npm run build      # typecheck + production build into dist/ (includes sw.js)
npm run preview    # serve dist/ to try the PWA and offline mode
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main` (pull requests
only build and test).

1. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. The site is published at `https://<user>.github.io/<repo>/`.

The build uses a relative base (`./`) and hash routing, so it works from any sub-path with no
configuration.

## Data sources

| Source | Used for | Notes |
| --- | --- | --- |
| `/content/*.json` | All card types | Bundled card packs, precached for offline use. |
| [Open Trivia DB](https://opentdb.com) | Quiz and myth-or-fact cards | Fetched client-side in batches of 50 with a persisted session token (no repeats), cached in IndexedDB, topped up as you use them. “Science: Computers” is fetched as its own stream for the Computer Science category. CC BY-SA 4.0. |
| [REST Countries](https://restcountries.com) v5 | Flags, capitals, higher-or-lower, country spotlights | **Optional, needs an API key** (see below). Cached in IndexedDB for 14 days. |
| Bundled country snapshot | Same as above, offline | `src/data/countries.snapshot.json`, built from [mledoze/countries](https://github.com/mledoze/countries) (ODbL) and Natural Earth population estimates. |
| [Natural Earth](https://www.naturalearthdata.com) 1:50m | Map tap and silhouette cards | `src/geo/countries-geo.json`, simplified to 145 KB gzipped and lazy-loaded. Public domain. |
| REST Countries flag CDN | Flag images | No key needed; falls back to emoji flags when offline. |

### REST Countries API key

REST Countries retired its keyless v1–v4 endpoints; v5 requires an API key, and keys only work in a
browser for the hostnames you allow. The app runs fine without one by using the bundled snapshot.
To use live data:

1. Create a key at restcountries.com and add your Pages hostname (e.g. `<user>.github.io`) and
   `localhost` to its allowed hostnames.
2. Either add it as a repository **variable** (not a secret) named `RESTCOUNTRIES_KEY`, which the
   workflow passes to the build as `VITE_RESTCOUNTRIES_KEY`, or paste it into **Settings → Data**
   in the app (stored only on that device, never exported).

A build-time key ships in public JavaScript, and every visitor's refresh draws on that key's
monthly quota (three requests per visitor every 14 days; the free plan allows 1,000 requests a month).

### Regenerating bundled data

```sh
npm run data   # behind an HTTP proxy on Node 22: NODE_USE_ENV_PROXY=1 npm run data
```

## Architecture

```
src/
  core/
    types.ts        Card / CardModule / Sources interfaces
    leitner.ts      Pure Leitner box logic
    scheduler.ts    Pure next-card picker (new/review mix, type rule, weak-category weighting)
    progress.ts     In-memory progress mirror, written through to IndexedDB
    db.ts           Small IndexedDB wrapper (stores: progress, kv)
    settings.ts     Category/type toggles, optional API key
    backup.ts       Export/import JSON (validated, merged by most recent)
    pool.ts         Builds the candidate pool from every card module
  cards/
    registry.ts     Auto-discovers src/cards/*.card.ts
    *.card.ts       One file per card type
  data/             Content packs, Open Trivia DB, REST Countries, Natural Earth loaders
  ui/feed.ts        Snap-scrolling feed: append, observe, prune; knows nothing about card types
  ui/settings.ts    Settings screen
sw/sw.js            Service worker template (vite.config.ts injects the precache list)
content/            Card packs
```

### Adding a card type

Create `src/cards/<name>.card.ts` and default-export a `CardModule`. That's it: the registry picks
it up with `import.meta.glob`, and the feed, scheduler, settings and SRS work with it unchanged.

```ts
import type { CardModule } from '../core/types';
import { choiceButtons, h, packCards, showFeedback, str } from './ui';

interface RiddleData { riddle: string; answer: string; options: string[] }

const riddle: CardModule<RiddleData> = {
  type: 'riddle',          // also the `type` used in content packs
  label: 'Riddle',
  icon: '🧩',
  // Every candidate card, with ids that are stable across sessions (progress is keyed on them).
  build: (sources) =>
    packCards(sources, 'riddle', (c) => (str(c.riddle) ? (c as unknown as RiddleData) : null)),
  mount(root, card, ctx) {
    root.append(
      h('h2', { class: 'card-question' }, card.data.riddle),
      choiceButtons([card.data.answer, ...card.data.options], card.data.answer, ctx.rng, (correct) => {
        ctx.answer(correct);   // feeds spaced repetition and category stats
        showFeedback(root, correct);
      }),
    );
  },
};
export default riddle;
```

Set `passive: true` for cards that can be scrolled past without answering (like facts): a passive
card counts as "seen", and its `answer()` calls are self-ratings that schedule reviews without
affecting accuracy.

### Content pack format

Any `content/*.json` file is loaded as a pack. Cards inherit the pack's category unless they set
their own. Categories: `geography`, `science`, `history`, `nature`, `arts`, `entertainment`,
`sports`, `general`.

```jsonc
{
  "id": "science",                 // stable: card ids are "<type>:<pack id>:<card id>"
  "title": "Science essentials",
  "category": "science",
  "cards": [
    { "id": "ice", "type": "fact", "emoji": "🧊", "title": "Why ice floats", "text": "…", "source": "optional" },
    { "id": "au", "type": "quiz", "question": "Chemical symbol for gold?", "answer": "Au",
      "options": ["Ag", "Gd", "Go"], "explanation": "optional" },
    { "id": "brain", "type": "myth", "statement": "We only use 10% of our brains.", "isFact": false,
      "explanation": "optional" },
    { "id": "w", "type": "higher-lower", "metric": "melting point", "unit": "°C", "format": "number",
      "a": { "label": "Iron", "value": 1538, "emoji": "⚙️" },
      "b": { "label": "Tungsten", "value": 3422, "emoji": "💡" } },
    { "id": "tetris", "type": "myth", "category": "entertainment", "statement": "…", "isFact": true }
  ]
}
```

Don't change a card's `id` after release, or users lose its review history.

A pack may also set `"topic"` (a sub-topic id from `TOPICS` in `src/core/categories.ts`, which
must belong to the pack's category); every card inherits it and gets its own settings toggle.

#### Computer Science card types

Snippets are arrays of lines and must fit a phone: at most **8 lines of 38 characters**.

| `type` | Fields |
| --- | --- |
| `code-output` | `lang` (`js`, `python`, `sql`), `code`, `answer` (exact stdout, lines joined by `\n`), `options` (wrong answers) |
| `spot-the-bug` | `lang` (`js`, `python`), `goal`, `code`, `bugLine` (1-based), `fix` (the corrected line), `checks: [{ "call", "expect" }]` |
| `big-o` | `prompt`, `answer` (e.g. `"O(n log n)"`), optional `code` + `lang`, optional `options` |
| `port-protocol` | `port`, `protocol`, `transport`, optional `note`. Becomes two cards, one per direction. |
| `base-convert` | `value`, `from`, `to` (`bin`, `dec`, `hex`). 48 more are generated. 20 s timer (30 s for long binary). |
| `ds-match` | `pairs: [[structure, use], …]`, optional `prompt` |
| `osi-sort` | `items: [{ "label", "layer" }]` with layers 1–7 |
| `regex-match` | `pattern`, optional `flags`, `candidates`, `matches` (the candidates it matches) |

`tests/cs-content.test.ts` keeps these honest. It runs every `code-output` snippet (Node, Python,
or SQLite via Python) and compares stdout with `answer`. For every `spot-the-bug`, it checks
that the original code fails at least one `check` and that swapping `bugLine` for `fix` passes
all of them. For every `regex-match`, it runs the pattern against the candidates and compares
the result with `matches`. It also enforces the phone-width limits. A card with a wrong answer
fails CI and never deploys.

### Scheduling details

- **Review vs new:** each pick is a review with probability 0.3 when any card is due, otherwise new;
  if one side is empty the other is used, and when everything has been seen the soonest-due card is
  pulled forward.
- **Type rule:** the previous card's type is excluded. This only relaxes if a single type is enabled.
- **Weakest categories:** a category's weight is `0.2 + (1 − accuracy)`, using smoothed accuracy
  `(correct + 2) / (answered + 4)`, so a 20%-accuracy category comes up roughly 3× as often as a
  90% one. Within a category the card type is chosen uniformly, so large generated sets (200 flags)
  don't drown small ones.
- **Leitner:** a card answered correctly the first time starts in box 3 (you already knew it).
