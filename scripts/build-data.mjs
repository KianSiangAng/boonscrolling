#!/usr/bin/env node
// Regenerates the bundled offline datasets:
//   src/geo/countries-geo.json        Natural Earth 1:50m admin-0 countries, slimmed for D3 (phase 2 map cards)
//   src/data/countries.snapshot.json  Offline country facts (mledoze/countries + Natural Earth population)
//
// Usage: npm run data   (behind a proxy on Node 22: NODE_USE_ENV_PROXY=1 npm run data)
import { writeFile, mkdir } from 'node:fs/promises';
import { geoArea } from 'd3-geo';

const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const MLEDOZE_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';

const PRECISION = 100; // 2 decimal places ≈ 1 km, plenty for a phone screen
const TOLERANCE = 0.05; // Douglas–Peucker tolerance in degrees
const MIN_ISLAND = 0.003; // drop polygons smaller than this (deg²) unless it is the country's largest

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const round = (n) => Math.round(n * PRECISION) / PRECISION;

function segDist([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function douglasPeucker(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i], points[a], points[b]);
      if (d > max) [max, idx] = [d, i];
    }
    if (max > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const planarArea = (ring) =>
  Math.abs(
    ring.reduce((s, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return s + x * ny - nx * y;
    }, 0),
  ) / 2;

function slimRing(ring) {
  const simplified = douglasPeucker(ring, TOLERANCE).map(([x, y]) => [round(x), round(y)]);
  const out = simplified.filter((p, i) => i === 0 || p[0] !== simplified[i - 1][0] || p[1] !== simplified[i - 1][1]);
  return out.length >= 4 ? out : null;
}

function slimPolygon(rings) {
  const out = [];
  for (const [i, ring] of rings.entries()) {
    const r = slimRing(ring);
    if (r) out.push(r);
    else if (i === 0) return null; // exterior collapsed: drop the polygon
  }
  return out.length ? out : null;
}

/** d3-geo uses spherical winding: exteriors must be clockwise. RFC 7946 files are the opposite. */
function rewind(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const fixed = polys.map((rings) => {
    const area = geoArea({ type: 'Polygon', coordinates: rings });
    return area > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings;
  });
  return fixed.length === 1 ? { type: 'Polygon', coordinates: fixed[0] } : { type: 'MultiPolygon', coordinates: fixed };
}

function slimGeometry(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largest = Math.max(...polys.map((rings) => planarArea(rings[0])));
  const kept = polys
    .filter((rings) => {
      const a = planarArea(rings[0]);
      return a === largest || a >= MIN_ISLAND;
    })
    .map(slimPolygon)
    .filter(Boolean);
  if (!kept.length) return null;
  return rewind(
    kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept },
  );
}

const iso3Of = (p) => (p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3);

async function main() {
  console.log('Fetching Natural Earth…');
  const ne = await getJson(NE_URL);
  console.log('Fetching mledoze/countries…');
  const mledoze = await getJson(MLEDOZE_URL);

  const population = new Map();
  const features = [];
  for (const f of ne.features) {
    const p = f.properties;
    const iso3 = iso3Of(p);
    if (p.POP_EST > 0) population.set(iso3, Math.round(p.POP_EST));
    if (p.CONTINENT === 'Antarctica' || p.TYPE === 'Indeterminate') continue;
    const geometry = slimGeometry(f.geometry);
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      id: iso3,
      properties: { name: p.NAME_EN || p.NAME, continent: p.CONTINENT, subregion: p.SUBREGION },
      geometry,
    });
  }
  features.sort((a, b) => a.id.localeCompare(b.id));

  const countries = mledoze
    .map((c) => ({
      cca2: c.cca2,
      cca3: c.cca3,
      name: c.name.common,
      capital: c.capital?.[0] ?? null,
      region: c.region,
      subregion: c.subregion || null,
      population: population.get(c.cca3) ?? null,
      area: c.area > 0 ? c.area : null,
      languages: Object.values(c.languages ?? {}),
      currencies: Object.values(c.currencies ?? {}).map((x) => x.name),
      landlocked: !!c.landlocked,
      borders: c.borders ?? [],
      independent: !!c.independent,
    }))
    .sort((a, b) => a.cca3.localeCompare(b.cca3));

  await mkdir('src/geo', { recursive: true });
  await mkdir('src/data', { recursive: true });
  const geoJson = JSON.stringify({ type: 'FeatureCollection', features });
  await writeFile('src/geo/countries-geo.json', geoJson);
  await writeFile('src/data/countries.snapshot.json', JSON.stringify(countries));
  console.log(`geo: ${features.length} features, ${(geoJson.length / 1024).toFixed(0)} KB`);
  console.log(
    `snapshot: ${countries.length} countries, ${countries.filter((c) => c.population).length} with population`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
