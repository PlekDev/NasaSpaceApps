// AI-assisted (Claude Code); reviewed by the author.
/** Pure helpers behind the Statistics page: quantiles, per-region summaries, correlations, cross-target similarity and the
 *  generated one-line takeaways. No DOM and no imports, so node --test loads it directly. Scores are 0..100. */

/** Linear-interpolated quantile of an ascending array (q in 0..1). NaN for an empty array. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length; if (!n) return NaN;
  const p = Math.min(1, Math.max(0, q)) * (n - 1), lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

export interface RegionSummary { zone: number; n: number; p10: number; p50: number; p90: number; max: number; above: number }
/** One row per zone: quartiles of its windows' scores and how many windows reach `min`. Zones without windows keep n = 0 and NaN statistics. */
export function regionSummary(s: ArrayLike<number>, site: ArrayLike<number>, nZones: number, min = 0): RegionSummary[] {
  const by: number[][] = Array.from({ length: nZones }, () => []);
  for (let i = 0; i < s.length; i++) by[site[i]]?.push(s[i]);
  return by.map((a, zone) => {
    a.sort((x, y) => x - y);
    return { zone, n: a.length, p10: quantile(a, .1), p50: quantile(a, .5), p90: quantile(a, .9), max: a.length ? a[a.length - 1] : NaN, above: a.filter(v => v >= min).length };
  });
}

/** Share of windows (0..1) with a score at or above `t`. */
export function shareAtLeast(s: ArrayLike<number>, t: number): number {
  let k = 0; for (let i = 0; i < s.length; i++) if (s[i] >= t) k++;
  return s.length ? k / s.length : 0;
}

/** Cumulative counts per bin from a histogram: the share of windows at or below each bin's upper edge. */
export function cumulative(bins: number[]): number[] {
  const tot = bins.reduce((a, b) => a + b, 0) || 1; let acc = 0;
  return bins.map(b => (acc += b) / tot);
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length); if (n < 2) return NaN;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** Average ranks (ties share the mean rank), 1-based. */
export function ranks(a: ArrayLike<number>): Float64Array {
  const n = a.length, idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i] - a[j]), r = new Float64Array(n);
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++; const m = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = m; i = j + 1; }
  return r;
}
export const spearman = (a: ArrayLike<number>, b: ArrayLike<number>) => pearson(ranks(a), ranks(b));

/** Windows above a threshold on both axes / only one / neither. Used for the terrain-versus-illumination scatter. */
export function quadrants(x: ArrayLike<number>, y: ArrayLike<number>, tx: number, ty: number) {
  const q = { both: 0, onlyX: 0, onlyY: 0, neither: 0 };
  for (let i = 0; i < x.length; i++) { const a = x[i] >= tx, b = y[i] >= ty; if (a && b) q.both++; else if (a) q.onlyX++; else if (b) q.onlyY++; else q.neither++; }
  return q;
}

/** Target-by-target Spearman correlation of the region profiles (rows of `v`: region, columns: target). */
export function targetSimilarity(v: number[][]): number[][] {
  const nT = v[0]?.length ?? 0, cols = Array.from({ length: nT }, (_, t) => v.map(r => r[t]));
  return cols.map(a => cols.map(b => spearman(a, b)));
}

/** Index of the largest finite value, or -1. */
export function argmax(a: ArrayLike<number>): number {
  let k = -1; for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && (k < 0 || a[i] > a[k])) k = i;
  return k;
}

/** Mean of each key over a list of per-window rows, largest first. */
export function meanShares(rows: Record<string, number>[]): { key: string; share: number }[] {
  const acc: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (typeof v === 'number') acc[k] = (acc[k] ?? 0) + v;
  return Object.entries(acc).map(([key, s]) => ({ key, share: rows.length ? s / rows.length : 0 })).sort((a, b) => b.share - a.share);
}

/** Plain words for a correlation coefficient. */
export function corrWords(r: number): string {
  if (!Number.isFinite(r)) return 'not defined';
  const a = Math.abs(r), s = a < .2 ? 'almost no' : a < .4 ? 'a weak' : a < .6 ? 'a moderate' : a < .8 ? 'a strong' : 'a very strong';
  return `${s} ${r < 0 && a >= .2 ? 'negative' : a >= .2 ? 'positive' : ''} relation`.replace(/\s+/g, ' ');
}

export const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
export const nf = (n: number) => n.toLocaleString('en-US');
