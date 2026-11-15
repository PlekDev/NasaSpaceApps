import { combine } from './score.ts';
import type { Manifest, TargetData } from './types';

export interface Scored {
  n: number; lon: Float64Array; lat: Float64Array; s: Float32Array; dim: Float32Array[]; site: Uint8Array;
  shown: number[];                 // indices with s >= min and region active, best first
  byRegion: Map<number, number[]>; // region index -> shown indices, best first
  regionOrder: number[];           // region indices, best window first
  zeroWeights: boolean;
}

/** Recombine per-dimension scores with the given weights (live), filter by minimum score and active regions. */
export function score(m: Manifest, d: TargetData, weights: Record<string, number>, min: number, active: Set<string>): Scored {
  const dims = Object.keys(m.dims), counts = dims.map(k => m.dims[k].length), w = dims.map(k => weights[k] ?? 1);
  const sc = m.scale.score, ll = m.scale.lonlat, n = d.n;
  const dimArr = dims.map(k => d[`score_${k}`] as number[]);
  const lon = new Float64Array(n), lat = new Float64Array(n), s = new Float32Array(n), site = new Uint8Array(n);
  const dim = dims.map(() => new Float32Array(n));
  const zeroWeights = w.every((x, i) => x * counts[i] === 0);
  const on = m.regions.map(r => active.has(r.id));
  const shown: number[] = [];
  const ds = new Array<number>(dims.length);
  for (let k = 0; k < n; k++) {
    lon[k] = d.lon[k] / ll; lat[k] = d.lat[k] / ll; site[k] = d.site[k];
    for (let x = 0; x < dims.length; x++) { ds[x] = dimArr[x][k] / sc; dim[x][k] = ds[x]; }
    s[k] = zeroWeights ? 0 : combine(ds, w, counts);
    if (s[k] >= min && on[site[k]] && !zeroWeights) shown.push(k);
  }
  shown.sort((a, b) => s[b] - s[a]);
  const byRegion = new Map<number, number[]>();
  for (const k of shown) { const r = site[k]; (byRegion.get(r) ?? byRegion.set(r, []).get(r)!).push(k); }
  const regionOrder = [...byRegion.keys()].sort((a, b) => s[byRegion.get(b)![0]] - s[byRegion.get(a)![0]]);
  return { n, lon, lat, s, dim, site, shown, byRegion, regionOrder, zeroWeights };
}

/** Axis-aligned square of side `km` around a window centre (display only; the real window is a projected square). */
export function squareRing(lon: number, lat: number, km: number): [number, number][] {
  const dlat = (km / 2) / 111.32, dlon = dlat / Math.max(Math.cos(lat * Math.PI / 180), 0.05);
  return [[lon - dlon, lat - dlat], [lon + dlon, lat - dlat], [lon + dlon, lat + dlat], [lon - dlon, lat + dlat], [lon - dlon, lat - dlat]];
}
export const distKm = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dφ = (b[1] - a[1]) * r, dλ = (b[0] - a[0]) * r;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dλ / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
