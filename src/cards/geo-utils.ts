import { geoArea, geoCentroid, geoDistance } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { Country, GeoData, GeoProps, Sources } from '../core/types';

export type CountryFeature = Feature<Polygon | MultiPolygon, GeoProps> & { id: string };

/**
 * Natural Earth includes overseas territories in a country's geometry (France → French Guiana,
 * USA → Hawaii). For recognisable shapes we keep only polygons near the largest landmass.
 */
export function mainland(f: CountryFeature, maxDegrees = 18): CountryFeature {
  if (f.geometry.type === 'Polygon') return f;
  const polys = f.geometry.coordinates;
  const areas = polys.map((p) => geoArea({ type: 'Polygon', coordinates: p }));
  const main = polys[areas.indexOf(Math.max(...areas))];
  const center = geoCentroid({ type: 'Polygon', coordinates: main });
  const maxRad = (maxDegrees * Math.PI) / 180;
  const kept = polys.filter((p) => geoDistance(center, geoCentroid({ type: 'Polygon', coordinates: p })) <= maxRad);
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: kept } };
}

/** Geo features that correspond to independent countries (falls back to all if none match). */
export function quizFeatures(sources: Sources): CountryFeature[] {
  const geo = sources.geo;
  if (!geo) return [];
  const independent = new Set(sources.countries.filter((c) => c.independent).map((c) => c.cca3));
  const features = geo.features as CountryFeature[];
  const matched = features.filter((f) => independent.has(f.id));
  return matched.length ? matched : features;
}

export function featureById(geo: GeoData | null, id: string): CountryFeature | undefined {
  return (geo?.features as CountryFeature[] | undefined)?.find((f) => f.id === id);
}

export function countryFor(sources: Sources, iso3: string): Country | undefined {
  return sources.countries.find((c) => c.cca3 === iso3);
}

export function displayName(sources: Sources, f: CountryFeature): string {
  return countryFor(sources, f.id)?.name ?? f.properties.name;
}

/** Point reached by travelling `distance` degrees from `start` on initial `bearing` (degrees). */
export function destination([lon, lat]: [number, number], bearing: number, distance: number): [number, number] {
  const rad = Math.PI / 180;
  const φ1 = lat * rad;
  const λ1 = lon * rad;
  const θ = bearing * rad;
  const δ = distance * rad;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((λ2 / rad + 540) % 360) - 180, φ2 / rad];
}
