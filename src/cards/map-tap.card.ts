import { geoAzimuthalEqualArea, geoBounds, geoCentroid, geoCircle, geoContains, geoGraticule10, geoPath } from 'd3-geo';
import type { CardModule } from '../core/types';
import { type CountryFeature, destination, displayName, featureById, mainland, quizFeatures } from './geo-utils';
import { h, showFeedback, svg } from './ui';

interface MapTapData {
  iso3: string;
}

const W = 400;
const H = 400;
/** Taps this close (in SVG units) to a tiny target still count. */
const TOLERANCE = 14;

/** Angular "radius" (degrees) of the view: wide enough for context, tight enough to tap. */
function viewRadius(f: CountryFeature): number {
  const [[x0, y0], [x1, y1]] = geoBounds(f);
  const span = Math.max(Math.abs(y1 - y0), Math.abs(((x1 - x0 + 540) % 360) - 180));
  return Math.min(40, Math.max(14, span * 1.6));
}

const mapTap: CardModule<MapTapData> = {
  type: 'map-tap',
  label: 'Map tap',
  icon: '📍',

  build(sources) {
    return quizFeatures(sources).map((f) => ({
      id: `map-tap:${f.id}`,
      type: 'map-tap',
      category: 'geography',
      data: { iso3: f.id },
    }));
  },

  mount(root, card, ctx) {
    const geo = ctx.sources.geo;
    const target = featureById(geo, card.data.iso3);
    if (!geo || !target) {
      root.append(h('p', null, 'Map data is not available.'));
      return;
    }
    const land = mainland(target);
    const name = displayName(ctx.sources, target);

    // Centre the view near — but not on — the target, so its position isn't a giveaway.
    const radius = viewRadius(land);
    const center = destination(geoCentroid(land), ctx.rng() * 360, radius * (0.2 + ctx.rng() * 0.35));
    const projection = geoAzimuthalEqualArea()
      .rotate([-center[0], -center[1]])
      .fitExtent(
        [
          [4, 4],
          [W - 4, H - 4],
        ],
        geoCircle().center(center).radius(radius)(),
      )
      .clipAngle(Math.min(170, radius * 2.5))
      .clipExtent([
        [0, 0],
        [W, H],
      ]);
    const path = geoPath(projection);

    const map = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map', role: 'img', 'aria-label': `Map: tap ${name}` });
    map.append(svg('rect', { x: 0, y: 0, width: W, height: H, class: 'map-ocean' }));
    map.append(svg('path', { d: path(geoGraticule10()) ?? '', class: 'map-graticule' }));
    const features = geo.features as CountryFeature[];
    const shapes = new Map<string, SVGPathElement>();
    for (const f of features) {
      const d = path(f);
      if (!d) continue;
      const p = svg('path', { d, class: 'map-land' });
      shapes.set(f.id, p);
      map.append(p);
    }

    let done = false;
    map.addEventListener('click', (e) => {
      if (done) return;
      const ctm = map.getScreenCTM();
      if (!ctm) return;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      const lonLat = projection.invert?.([pt.x, pt.y]);
      if (!lonLat) return;
      const tapped = features.find((f) => shapes.has(f.id) && geoContains(f, lonLat));
      const [[bx0, by0], [bx1, by1]] = path.bounds(land);
      const near =
        pt.x >= bx0 - TOLERANCE && pt.x <= bx1 + TOLERANCE && pt.y >= by0 - TOLERANCE && pt.y <= by1 + TOLERANCE;
      // A neighbour hit beats bbox proximity: tapping Bolivia is wrong even if it's next to Peru.
      const correct = tapped ? tapped.id === target.id : near && Math.abs(bx1 - bx0) * Math.abs(by1 - by0) < 900;
      done = true;
      reveal(correct, tapped, pt);
    });

    function reveal(correct: boolean, tapped: CountryFeature | undefined, pt: DOMPoint) {
      shapes.get(target!.id)?.classList.add('map-target');
      if (tapped && tapped.id !== target!.id) shapes.get(tapped.id)?.classList.add('map-miss');
      map.append(svg('circle', { cx: pt.x, cy: pt.y, r: 5, class: 'map-tap-dot' }));
      const [cx, cy] = path.centroid(land);
      if (Number.isFinite(cx)) map.append(svg('circle', { cx, cy, r: 16, class: 'map-ring' }));
      ctx.answer(correct);
      showFeedback(root, correct, [
        correct ? null : tapped ? `You tapped ${displayName(ctx.sources, tapped)}.` : 'That was open water.',
        `${name} is highlighted in green.`,
      ]);
    }

    root.append(
      h('h2', { class: 'card-question' }, 'Tap ', h('span', { class: 'highlight' }, name)),
      h('div', { class: 'map-wrap' }, map),
      h('p', { class: 'credit' }, 'Map: Natural Earth'),
    );
  },
};

export default mapTap;
