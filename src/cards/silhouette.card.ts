import { geoAzimuthalEqualArea, geoCentroid, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { CardModule } from '../core/types';
import { type CountryFeature, displayName, featureById, mainland, quizFeatures } from './geo-utils';
import { choiceButtons, distractors, h, showFeedback, svg } from './ui';

interface SilhouetteData {
  iso3: string;
}

const S = 300;

function locator(features: CountryFeature[], targetId: string): SVGSVGElement {
  const w = 360;
  const hgt = 190;
  const projection = geoNaturalEarth1().fitSize([w, hgt], { type: 'Sphere' });
  const path = geoPath(projection);
  const el = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'locator', 'aria-hidden': 'true' });
  el.append(svg('path', { d: path({ type: 'Sphere' }) ?? '', class: 'map-ocean' }));
  let target: CountryFeature | undefined;
  for (const f of features) {
    if (f.id === targetId) target = f;
    el.append(svg('path', { d: path(f) ?? '', class: f.id === targetId ? 'map-land map-target' : 'map-land' }));
  }
  // Small countries vanish at world scale, so circle the spot.
  const [cx, cy] = target ? path.centroid(mainland(target)) : [NaN, NaN];
  if (Number.isFinite(cx)) el.append(svg('circle', { cx, cy, r: 9, class: 'map-ring' }));
  return el;
}

const silhouette: CardModule<SilhouetteData> = {
  type: 'silhouette',
  label: 'Silhouette',
  icon: '🗺️',

  build(sources) {
    return quizFeatures(sources).map((f) => ({
      id: `silhouette:${f.id}`,
      type: 'silhouette',
      category: 'geography',
      data: { iso3: f.id },
    }));
  },

  mount(root, card, ctx) {
    const target = featureById(ctx.sources.geo, card.data.iso3);
    if (!target) {
      root.append(h('p', null, 'Map data is not available.'));
      return;
    }
    const land = mainland(target);
    const [lon, lat] = geoCentroid(land);
    const projection = geoAzimuthalEqualArea()
      .rotate([-lon, -lat])
      .fitExtent(
        [
          [16, 16],
          [S - 16, S - 16],
        ],
        land,
      );
    const shape = svg('svg', {
      viewBox: `0 0 ${S} ${S}`,
      class: 'silhouette',
      role: 'img',
      'aria-label': 'Country outline',
    });
    shape.append(svg('path', { d: geoPath(projection)(land) ?? '', class: 'silhouette-shape' }));

    const pool = quizFeatures(ctx.sources);
    const name = displayName(ctx.sources, target);
    const wrong = distractors(
      [
        pool.filter((f) => f.properties.subregion === target.properties.subregion),
        pool.filter((f) => f.properties.continent === target.properties.continent),
        pool,
      ],
      (f) => f.id === target.id,
      3,
      ctx.rng,
      (f) => f.id,
    ).map((f) => displayName(ctx.sources, f));

    root.append(
      h('h2', { class: 'card-question' }, 'Which country has this shape?'),
      h('div', { class: 'silhouette-wrap' }, shape),
      choiceButtons([name, ...wrong], name, ctx.rng, (correct) => {
        ctx.answer(correct);
        showFeedback(root, correct, [
          correct ? null : `It’s ${name}.`,
          locator(ctx.sources.geo!.features as CountryFeature[], target.id),
        ]);
      }),
    );
  },
};

export default silhouette;
