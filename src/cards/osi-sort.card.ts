import { shuffle } from '../core/rng';
import type { CardModule } from '../core/types';
import { h, packCards, showFeedback, str } from './ui';

/** Index = layer number − 1. */
export const OSI_LAYERS = ['Physical', 'Data link', 'Network', 'Transport', 'Session', 'Presentation', 'Application'];

interface OsiItem {
  label: string;
  layer: number;
}

interface OsiSortData {
  items: OsiItem[];
  explanation?: string;
}

const osiSort: CardModule<OsiSortData> = {
  type: 'osi-sort',
  label: 'OSI sort',
  icon: '🥞',

  build(sources) {
    return packCards<OsiSortData>(sources, 'osi-sort', (c) => {
      const items = Array.isArray(c.items)
        ? (c.items as OsiItem[]).filter(
            (i) => typeof i?.label === 'string' && Number.isInteger(i.layer) && i.layer >= 1 && i.layer <= 7,
          )
        : [];
      return items.length >= 2 ? { items, explanation: str(c.explanation) ?? undefined } : null;
    });
  },

  mount(root, card, ctx) {
    const { items } = card.data;
    let selected: HTMLButtonElement | null = null;
    let done = false;
    let suppressClick = false;

    const tray = h('div', { class: 'osi-tray', 'aria-label': 'Items to place' });
    const check = h('button', { class: 'button osi-check', type: 'button', disabled: true }, 'Check');
    const slots = new Map<number, HTMLElement>();
    const rows = [7, 6, 5, 4, 3, 2, 1].map((n) => {
      const slot = h('div', { class: 'osi-slot' });
      slots.set(n, slot);
      const row = h(
        'div',
        {
          class: 'osi-layer',
          'data-layer': String(n),
          role: 'button',
          tabindex: '0',
          'aria-label': `Layer ${n}, ${OSI_LAYERS[n - 1]}`,
        },
        h('span', { class: 'osi-name' }, h('b', null, String(n)), ` ${OSI_LAYERS[n - 1]}`),
        slot,
      );
      const drop = () => selected && place(selected, n);
      row.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.osi-chip')) drop();
      });
      row.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), drop()));
      return row;
    });

    const chips = shuffle(items, ctx.rng).map((item) => {
      const chip = h('button', { class: 'osi-chip', type: 'button', text: item.label });
      chip.addEventListener('click', () => {
        if (suppressClick) return void (suppressClick = false);
        if (done) return;
        if (chip.dataset.layer) unplace(chip);
        select(selected === chip ? null : chip);
      });
      enableDrag(chip);
      tray.append(chip);
      return { chip, item };
    });

    function select(chip: HTMLButtonElement | null) {
      selected?.classList.remove('is-selected');
      selected = chip;
      selected?.classList.add('is-selected');
    }

    function place(chip: HTMLButtonElement, layer: number) {
      if (done) return;
      chip.dataset.layer = String(layer);
      slots.get(layer)!.append(chip);
      select(null);
      check.disabled = tray.children.length > 0;
    }

    function unplace(chip: HTMLButtonElement) {
      delete chip.dataset.layer;
      tray.append(chip);
      check.disabled = true;
    }

    // Drag a chip onto a layer. `touch-action: none` on chips keeps the feed from scrolling.
    function enableDrag(chip: HTMLButtonElement) {
      let start: { x: number; y: number; id: number } | null = null;
      let dragging = false;
      chip.addEventListener('pointerdown', (e) => {
        if (done) return;
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        dragging = false;
      });
      chip.addEventListener('pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!dragging && Math.hypot(dx, dy) > 6) {
          dragging = true;
          chip.setPointerCapture(e.pointerId);
          chip.classList.add('dragging');
        }
        if (dragging) chip.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      const end = (e: PointerEvent) => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        if (!dragging) return;
        dragging = false;
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        chip.classList.remove('dragging');
        chip.style.visibility = 'hidden';
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.osi-layer');
        chip.style.visibility = '';
        chip.style.transform = '';
        // Dropped anywhere else: the chip simply stays where it was.
        if (target && root.contains(target)) place(chip, Number(target.dataset.layer));
      };
      chip.addEventListener('pointerup', end);
      chip.addEventListener('pointercancel', end);
    }

    check.addEventListener('click', () => {
      if (done || tray.children.length) return;
      done = true;
      check.disabled = true;
      const wrong = chips.filter(({ chip, item }) => {
        const ok = Number(chip.dataset.layer) === item.layer;
        chip.classList.add(ok ? 'is-correct' : 'is-wrong');
        chip.disabled = true;
        return !ok;
      });
      ctx.answer(wrong.length === 0);
      showFeedback(root, wrong.length === 0, [
        wrong.length
          ? h(
              'span',
              { class: 'match-answers' },
              ...wrong.map(({ item }) =>
                h('span', null, `${item.label} → ${item.layer} ${OSI_LAYERS[item.layer - 1]}`),
              ),
            )
          : 'Every item is on the right layer.',
        card.data.explanation,
      ]);
    });

    root.append(
      h('h2', { class: 'card-question' }, 'Sort onto the OSI layers'),
      h('p', { class: 'card-sub' }, 'Drag each item to its layer, or tap an item then a layer.'),
      h('div', { class: 'osi' }, ...rows),
      tray,
      check,
    );
  },
};

export default osiSort;
