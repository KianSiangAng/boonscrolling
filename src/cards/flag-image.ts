import type { Country } from '../core/types';
import { flagEmoji, flagUrl } from '../data/countries';
import { h } from './ui';

/** Flag <img> that degrades to the emoji flag when offline and not yet cached. */
export function flagImage(country: Country, alt: string, size: 'small' | 'large' = 'small'): HTMLElement {
  const wrap = h('div', { class: `flag-wrap flag-${size}` });
  const img = h('img', { class: 'flag', src: flagUrl(country), alt, decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => {
    wrap.replaceChildren(
      h('div', { class: 'flag flag-emoji', role: 'img', 'aria-label': alt }, flagEmoji(country.cca2)),
    );
  });
  wrap.append(img);
  return wrap;
}
