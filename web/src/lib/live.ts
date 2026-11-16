// AI-assisted (Claude Code); reviewed by the author.
/** Pure helpers behind the Explore cards: ranks, per-zone statistics, the rank of a known site, and the rank-versus-weight sweep.
 *  No DOM and no imports, so node --test loads it directly. Scores are compared rounded to 0.1, the precision the exported ranks use
 *  (ties then break by file order, like pandas rank(method="first")). */

export const round1 = (v: number) => Math.round(v * 10) / 10;

export interface Ranks { order: Int32Array; rank: Int32Array }
/** Best first. rank[k] is the 1-based position of window k. */
export function rankScores(s: ArrayLike<number>): Ranks {
  const n = s.length, r = new Float64Array(n), order = new Int32Array(n), rank = new Int32Array(n);
  for (let i = 0; i < n; i++) { r[i] = round1(s[i]); order[i] = i; }
  order.sort((a, b) => r[b] - r[a] || a - b);
  for (let i = 0; i < n; i++) rank[order[i]] = i + 1;
  return { order, rank };
}

/** Window counts per 2-point score bin (50 bins over 0..100). */
export function histogram(s: ArrayLike<number>, bins = 50): number[] {
  const out = new Array<number>(bins).fill(0), w = 100 / bins;
  for (let i = 0; i < s.length; i++) out[Math.min(bins - 1, Math.max(0, Math.floor(s[i] / w)))]++;
  return out;
}

export interface ZoneStat { zone: number; n: number; best: number; bi: number; above: number; bins: number[]; rank: number }
/** One row per zone (index = zone id): best window, windows at or above `min`, histogram, and the zone's rank by best score. */
export function zoneStats(s: ArrayLike<number>, site: ArrayLike<number>, nZones: number, min: number): ZoneStat[] {
  const z: ZoneStat[] = Array.from({ length: nZones }, (_, zone) => ({ zone, n: 0, best: -1, bi: -1, above: 0, bins: new Array<number>(50).fill(0), rank: 0 }));
  for (let i = 0; i < s.length; i++) {
    const g = z[site[i]], v = s[i];
    g.n++; if (v >= min) g.above++; if (v > g.best) { g.best = v; g.bi = i; }
    g.bins[Math.min(49, Math.max(0, Math.floor(v / 2)))]++;
  }
  [...z].sort((a, b) => round1(b.best) - round1(a.best) || a.zone - b.zone).forEach((g, k) => { g.rank = k + 1; });
  return z;
}

/** Rank of a site: its best window decides, and the rank counts the windows that score strictly higher. */
export function siteRank(s: ArrayLike<number>, windows: number[]): { rank: number; best: number } {
  let best = -1;
  for (const w of windows) { const v = round1(s[w]); if (v > best) best = v; }
  let rank = 1;
  for (let i = 0; i < s.length; i++) if (round1(s[i]) > best) rank++;
  return { rank, best };
}

/** Windows (6 km squares around their centre) that contain a point. Coordinates in degrees. */
export function windowsAt(lon: ArrayLike<number>, lat: ArrayLike<number>, siteLon: number, siteLat: number, km: number): number[] {
  const out: number[] = [], dlat = (km / 2) / 111.32;
  for (let i = 0; i < lon.length; i++) {
    const dlon = dlat / Math.max(Math.cos(lat[i] * Math.PI / 180), 0.05);
    if (Math.abs(lat[i] - siteLat) <= dlat && Math.abs(lon[i] - siteLon) <= dlon) out.push(i);
  }
  return out;
}

/** D² per dimension from per-dimension scores (0..100): D = -ln(score / 100), the term the combined score squares. */
export function d2Arrays(dim: ArrayLike<number>[]): Float32Array[] {
  return dim.map(a => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { const d = -Math.log(Math.max(a[i], 0.1) / 100); o[i] = d * d; } return o; });
}

/** S = 100 * exp(-sqrt(sum_dim W n D² / sum_dim W n)): the formula of score.ts, over precomputed D² arrays. All zero weights give 0. */
export function combineAll(d2: Float32Array[], w: number[], counts: number[]): Float32Array {
  const n = d2[0].length, out = new Float32Array(n);
  let den = 0; for (let x = 0; x < d2.length; x++) den += w[x] * counts[x];
  if (den <= 0) return out;
  for (let i = 0; i < n; i++) { let num = 0; for (let x = 0; x < d2.length; x++) num += w[x] * counts[x] * d2[x][i]; out[i] = 100 * Math.exp(-Math.sqrt(num / den)); }
  return out;
}

/** Rank of a site while one dimension's weight goes from 0 to 2 in 21 steps and the others stay as given. */
export function sweepRank(d2: Float32Array[], counts: number[], weights: number[], vary: number, windows: number[]): { w: number; rank: number }[] {
  const out: { w: number; rank: number }[] = [], w = weights.slice();
  for (let k = 0; k <= 20; k++) {
    w[vary] = k / 10;
    const s = combineAll(d2, w, counts);
    out.push({ w: k / 10, rank: s.some(v => v > 0) ? siteRank(s, windows).rank : s.length });
  }
  return out;
}
