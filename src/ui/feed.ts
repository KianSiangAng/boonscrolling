import { getModule } from '../cards/registry';
import { h } from '../cards/ui';
import { categoryInfo } from '../core/categories';
import { getProgress, recordAnswer, recordSeen } from '../core/progress';
import { seeded } from '../core/rng';
import { pickNext } from '../core/scheduler';
import type { CardInstance, Sources } from '../core/types';

interface Slot {
  el: HTMLElement;
  card: CardInstance | null;
  isReview: boolean;
  answered: boolean;
  finalized: boolean;
  cleanup?: () => void;
}

/** Cards kept ready below the one on screen. */
const LOOKAHEAD = 3;
/** DOM cap: older cards above the viewport are pruned past this. */
const MAX_SLOTS = 24;
/** Don't re-show a card within this many placements (unless nothing else is left). */
const RECENT_WINDOW = 25;

export class Feed {
  private slots: Slot[] = [];
  private active = -1;
  private recent: string[] = [];
  private observer: IntersectionObserver;
  private rngSeed = Date.now();

  constructor(
    private readonly el: HTMLElement,
    private readonly sources: Sources,
    private readonly getPool: () => CardInstance[],
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = this.slots.findIndex((s) => s.el === e.target);
          if (i >= 0) this.activate(i);
        }
      },
      { root: el, threshold: 0.6 },
    );
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.next-hint')) this.go(1);
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
    // Pruning shifts scrollTop, so wait until scrolling (and snapping) has settled.
    let settle: ReturnType<typeof setTimeout> | undefined;
    el.addEventListener(
      'scroll',
      () => {
        clearTimeout(settle);
        settle = setTimeout(() => this.prune(), 300);
      },
      { passive: true },
    );
  }

  start(): void {
    this.fill();
  }

  /** Drop not-yet-seen cards below the current one (e.g. after settings change) and refill. */
  refreshUpcoming(): void {
    let keep = this.active + 1;
    // An "empty feed" placeholder on screen is replaced as soon as cards exist.
    if (this.slots[this.active] && !this.slots[this.active].card) keep = this.active;
    keep = Math.max(keep, 0);
    for (const s of this.slots.splice(keep)) {
      if (s.card) this.recent = this.recent.filter((id) => id !== s.card!.id);
      this.removeSlot(s);
    }
    if (this.active >= this.slots.length) this.active = this.slots.length - 1;
    this.fill();
  }

  /** New sources arrived. Upcoming cards stay put unless the feed was showing "nothing to show". */
  poolChanged(): void {
    if (this.slots.some((s) => !s.card)) this.refreshUpcoming();
    else this.fill();
  }

  go(delta: number): void {
    const target = this.slots[this.active + delta];
    target?.el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  private onKey(e: KeyboardEvent) {
    if (this.el.inert || (e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
      e.preventDefault();
      this.go(1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
      e.preventDefault();
      this.go(-1);
    }
  }

  private fill() {
    while (this.slots.length - Math.max(this.active, 0) <= LOOKAHEAD) {
      if (!this.append()) break;
    }
  }

  private append(): boolean {
    const last = this.slots[this.slots.length - 1];
    const pool = this.getPool();
    const picked = pickNext({
      pool,
      progress: getProgress(),
      now: Date.now(),
      lastType: last?.card?.type ?? null,
      recentIds: new Set(this.recent),
      rng: Math.random,
    });
    if (!picked) {
      if (!this.slots.length || last?.card) this.appendEmpty();
      return false;
    }
    this.recent.push(picked.card.id);
    if (this.recent.length > RECENT_WINDOW) this.recent.shift();
    this.appendCard(picked.card, picked.isReview);
    return true;
  }

  private appendEmpty() {
    const el = h(
      'section',
      { class: 'slot slot-empty' },
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'card-body' },
          h('h2', { class: 'card-title' }, 'Nothing to show'),
          h('p', null, 'All categories or card types are switched off.'),
          h('a', { class: 'button', href: '#/settings' }, 'Open settings'),
        ),
      ),
    );
    this.el.append(el);
    this.slots.push({ el, card: null, isReview: false, answered: true, finalized: true });
  }

  private appendCard(card: CardInstance, isReview: boolean) {
    const mod = getModule(card.type);
    const cat = categoryInfo(card.category);
    const body = h('div', { class: 'card-body' });
    const el = h(
      'section',
      {
        class: `slot type-${card.type}`,
        'aria-roledescription': 'card',
        'aria-label': `${mod?.label ?? card.type}, ${cat.label}`,
      },
      h(
        'div',
        { class: 'card' },
        h(
          'header',
          { class: 'card-meta' },
          h('span', { class: 'chip' }, `${cat.icon} ${cat.label}`),
          h('span', { class: 'chip chip-type' }, `${mod?.icon ?? ''} ${mod?.label ?? card.type}`),
          isReview ? h('span', { class: 'chip chip-review', title: 'Spaced-repetition review' }, '↻ Review') : null,
        ),
        body,
      ),
    );
    el.style.setProperty('--hue', String(cat.hue));
    this.el.append(el);

    const slot: Slot = { el, card, isReview, answered: false, finalized: false };
    this.slots.push(slot);
    this.observer.observe(el);
    if (!mod) {
      body.append(h('p', null, `Unknown card type “${card.type}”.`));
      return;
    }
    try {
      const cleanup = mod.mount(body, card, {
        sources: this.sources,
        isReview,
        rng: seeded(`${card.id}:${this.rngSeed++}`),
        answer: (correct) => {
          if (slot.answered) return;
          slot.answered = true;
          // Passive cards (facts) are self-rated: they schedule reviews but aren't scored.
          void recordAnswer(card, correct, !mod.passive);
        },
      });
      if (cleanup) slot.cleanup = cleanup;
    } catch (err) {
      console.error(`[cards] ${card.type}.mount failed`, err);
      body.append(h('p', null, 'This card failed to load. Swipe on!'));
      slot.answered = true;
    }
  }

  private activate(i: number) {
    if (i === this.active) return;
    const prev = this.slots[this.active];
    if (prev && i > this.active) this.finalize(prev);
    this.active = i;
    this.fill();
  }

  /** Called when the user moves past a card. Passive cards count as "seen"; others are skipped. */
  private finalize(slot: Slot) {
    if (slot.finalized || !slot.card) return;
    slot.finalized = true;
    if (!slot.answered && getModule(slot.card.type)?.passive) void recordSeen(slot.card);
  }

  private prune() {
    const excess = this.slots.length - MAX_SLOTS;
    const removable = Math.min(excess, this.active - 3);
    if (removable <= 0) return;
    const current = this.slots[this.active].el;
    for (const s of this.slots.splice(0, removable)) this.removeSlot(s);
    this.active -= removable;
    // Re-pin to the card on screen. (Browsers with scroll anchoring may already have
    // compensated, so set the position absolutely rather than subtracting a delta.)
    this.el.scrollTop = current.offsetTop;
  }

  private removeSlot(s: Slot) {
    this.observer.unobserve(s.el);
    s.cleanup?.();
    s.el.remove();
  }
}
