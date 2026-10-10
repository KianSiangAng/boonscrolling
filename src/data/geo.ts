import type { GeoData } from '../core/types';
// Emitted as a hashed static asset (precached by the service worker) instead of being inlined
// into the JS bundle, so it is only downloaded/parsed once, off the critical path.
import geoUrl from '../geo/countries-geo.json?url';

let promise: Promise<GeoData> | null = null;

export function loadGeo(): Promise<GeoData> {
  promise ??= fetch(geoUrl).then((r) => {
    if (!r.ok) throw new Error(`geo: HTTP ${r.status}`);
    return r.json() as Promise<GeoData>;
  });
  return promise;
}
