/** Least-cost rover route on a terrain window, as scripts/extras/rover_twin.py plans it.
 *
 *   cost per cell = 1 + (slope / 10°)² + 3 × shadow fraction (Sun at 2°, 8 directions); slope > 20° is impassable
 *   (cost 1e6: a route that must cross it still exists and says so, like in Python)
 *   moving between neighbours (8-connected) costs the mean of both cells × the step length (skimage MCP_Geometric)
 * End points on impassable ground snap to the nearest passable cell. Parity: web/tests/sim_route.test.mjs.
 * AI-assisted (Claude); reviewed by the author. */
import type { Grid } from './grid.ts';
import { shadowFraction, slopeDeg } from './shadows.ts';

export const MAX_SLOPE = 20;
export const IMPASSABLE = 1e6;
/** Default end points, (row, col) as fractions of the window: SW → NE, as in rover_twin.py. */
export const START: [number, number] = [0.85, 0.12];
export const END: [number, number] = [0.15, 0.88];

export interface CostLayers { slope: Float32Array; shadow: Float32Array; cost: Float64Array; bad: Uint8Array }
export interface Route {
  /** cells along the route, start to end: [row, col] */
  path: [number, number][];
  /** cumulative distance at each cell, metres */
  dist: Float64Array;
  /** total cost (Python's route_through_array cost) */
  cost: number;
  /** the route had to cross ground steeper than MAX_SLOPE */
  blocked: boolean;
}

/** Slope, shadow fraction and cost of every cell. Pass `shadow` to reuse a shadow-fraction map you already have. */
export function costLayers(g: Grid, shadow?: Float32Array, maxSlope = MAX_SLOPE): CostLayers {
  const slope = slopeDeg(g), sh = shadow ?? shadowFraction(g, 2), n2 = g.n * g.n;
  const cost = new Float64Array(n2), bad = new Uint8Array(n2);
  for (let k = 0; k < n2; k++) {
    const s = slope[k], z = g.z[k];
    bad[k] = !Number.isFinite(z) || !Number.isFinite(s) || s > maxSlope ? 1 : 0;
    const c = 1 + ((Number.isFinite(s) ? s : 0) / 10) ** 2 + 3 * (Number.isFinite(sh[k]) ? sh[k] : 0);
    cost[k] = bad[k] ? IMPASSABLE : c;
  }
  return { slope, shadow: sh, cost, bad };
}

/** (row, col) of a fractional position, snapped to the nearest passable cell (first in row-major order on ties). */
export function cellAt(L: CostLayers, n: number, frac: [number, number]): [number, number] {
  let r = Math.trunc(frac[0] * (n - 1)), c = Math.trunc(frac[1] * (n - 1));
  if (!L.bad[r * n + c]) return [r, c];
  let best = Infinity, br = r, bc = c;
  for (let k = 0; k < n * n; k++) {
    if (L.bad[k]) continue;
    const rr = (k / n) | 0, cc = k % n, d = (rr - r) ** 2 + (cc - c) ** 2;
    if (d < best) { best = d; br = rr; bc = cc; }
  }
  return [br, bc];
}

/** Binary min-heap of (key, node). */
class Heap {
  k: number[] = []; v: number[] = [];
  push(key: number, node: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(node);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = node;
  }
  pop(): [number, number] {
    const k = this.k, v = this.v, top: [number, number] = [k[0], v[0]], lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  get size() { return this.k.length; }
}

const STEPS: [number, number, number][] = [[-1, -1, Math.SQRT2], [-1, 0, 1], [-1, 1, Math.SQRT2], [0, -1, 1], [0, 1, 1],
  [1, -1, Math.SQRT2], [1, 0, 1], [1, 1, Math.SQRT2]];

/** Least-cost route between two cells (Dijkstra, 8-connected, geometric step cost). */
export function routeBetween(L: CostLayers, n: number, dx: number, a: [number, number], b: [number, number]): Route {
  const N = n * n, cost = L.cost, best = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const s = a[0] * n + a[1], t = b[0] * n + b[1], h = new Heap();
  best[s] = 0; h.push(0, s);
  while (h.size) {
    const [d, u] = h.pop();
    if (d > best[u]) continue;
    if (u === t) break;
    const r = (u / n) | 0, c = u % n;
    for (const [dr, dc, len] of STEPS) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const w = rr * n + cc, nd = d + len * (cost[u] + cost[w]) / 2;
      if (nd < best[w]) { best[w] = nd; from[w] = u; h.push(nd, w); }
    }
  }
  const cells: number[] = [];
  for (let u = t; u !== -1; u = from[u]) cells.push(u);
  cells.reverse();
  const path = cells.map(u => [(u / n) | 0, u % n] as [number, number]);
  const dist = new Float64Array(path.length);
  for (let k = 1; k < path.length; k++) dist[k] = dist[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]) * dx;
  let blocked = false; for (const u of cells) if (cost[u] >= IMPASSABLE) { blocked = true; break; }
  return { path, dist, cost: best[t], blocked };
}

/** Plan a route on a window between two fractional positions (default: SW → NE, as rover_twin.py). */
export function planRoute(g: Grid, opts: { layers?: CostLayers; start?: [number, number]; end?: [number, number] } = {}): Route & { layers: CostLayers } {
  const L = opts.layers ?? costLayers(g);
  const a = cellAt(L, g.n, opts.start ?? START), b = cellAt(L, g.n, opts.end ?? END);
  return { ...routeBetween(L, g.n, g.dx, a, b), layers: L };
}

/** Fractional position of a cell, to replay a route drawn on one window at the same place of another (twin traverse). */
export function fracOf(n: number, cell: [number, number]): [number, number] { return [cell[0] / (n - 1), cell[1] / (n - 1)]; }
