import type { CardInstance, CardModule } from '../core/types';
import { add, h, packCards, showFeedback, str } from './ui';

interface MythData {
  statement: string;
  isFact: boolean;
  explanation?: string;
  credit?: string;
}

/** Horizontal distance (px) a drag must cover to count as a swipe. */
const COMMIT_PX = 90;

const myth: CardModule<MythData> = {
  type: 'myth',
  label: 'Myth or fact',
  icon: '🤔',

  build(sources) {
    const fromPacks = packCards<MythData>(sources, 'myth', (c) => {
      const statement = str(c.statement);
      if (!statement || typeof c.isFact !== 'boolean') return null;
      return { statement, isFact: c.isFact, explanation: str(c.explanation) ?? undefined };
    });
    const fromTrivia: CardInstance<MythData>[] = sources.trivia
      .filter((q) => q.kind === 'boolean')
      .map((q) => ({
        id: `myth:otdb:${q.id}`,
        type: 'myth',
        category: q.category,
        data: { statement: q.question, isFact: q.correct === 'True', credit: `Open Trivia DB · ${q.sourceCategory}` },
      }));
    return [...fromPacks, ...fromTrivia];
  },

  mount(root, card, ctx) {
    const { data } = card;
    const statement = h(
      'div',
      {
        class: 'swipe-card',
        tabindex: '0',
        'aria-label': `Statement: ${data.statement}. Left arrow for myth, right arrow for fact.`,
      },
      h('span', { class: 'swipe-stamp stamp-myth', 'aria-hidden': 'true' }, 'MYTH'),
      h('span', { class: 'swipe-stamp stamp-fact', 'aria-hidden': 'true' }, 'FACT'),
      h('p', { class: 'swipe-text' }, data.statement),
    );
    const mythBtn = h(
      'button',
      { class: 'choice choice-myth', type: 'button', onclick: () => decide(false) },
      '← Myth',
    );
    const factBtn = h('button', { class: 'choice choice-fact', type: 'button', onclick: () => decide(true) }, 'Fact →');

    let done = false;
    function decide(saysFact: boolean) {
      if (done) return;
      done = true;
      const correct = saysFact === data.isFact;
      statement.classList.add(saysFact ? 'fly-right' : 'fly-left');
      statement.style.transform = '';
      mythBtn.disabled = factBtn.disabled = true;
      (data.isFact ? factBtn : mythBtn).classList.add('is-correct');
      if (!correct) (saysFact ? factBtn : mythBtn).classList.add('is-wrong');
      ctx.answer(correct);
      showFeedback(root, correct, [`It’s a ${data.isFact ? 'fact' : 'myth'}.`, data.explanation]);
    }

    // Drag horizontally to decide. `touch-action: pan-y` (CSS) keeps vertical feed scrolling native.
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;
    let pointer: number | null = null;
    const setTilt = (x: number) => {
      statement.style.transform = `translateX(${x}px) rotate(${x / 18}deg)`;
      statement.style.setProperty('--lean', String(Math.max(-1, Math.min(1, x / COMMIT_PX))));
    };
    statement.addEventListener('pointerdown', (e) => {
      if (done) return;
      pointer = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dragging = false;
    });
    statement.addEventListener('pointermove', (e) => {
      if (done || e.pointerId !== pointer) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        statement.setPointerCapture(e.pointerId);
        statement.classList.add('dragging');
      }
      if (dragging) setTilt(dx);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      statement.classList.remove('dragging');
      if (!dragging || done) return;
      dragging = false;
      if (Math.abs(dx) >= COMMIT_PX) decide(dx > 0);
      else setTilt(0);
    };
    statement.addEventListener('pointerup', end);
    statement.addEventListener('pointercancel', end);
    statement.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') decide(false);
      if (e.key === 'ArrowRight') decide(true);
    });

    add(
      root,
      h('h2', { class: 'card-question' }, 'Myth or fact?'),
      h('div', { class: 'swipe-area' }, statement),
      h('div', { class: 'choices choices-row' }, mythBtn, factBtn),
      data.credit ? h('p', { class: 'credit' }, data.credit) : null,
    );
  },
};

export default myth;
