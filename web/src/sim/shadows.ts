/** Exact cast shadows for a low Sun: a TypeScript port of pen/shadows.py (and pen/features.slope_deg).
 *
 * With the Sun coming from the left of a row, pixel i is in shadow iff some j < i has z_j - (i - j)·dx·tan(e) > z_i.
 * With g_i = z_i + i·dx·tan(e) that is max_{j<i} g_j > g_i: a running maximum, O(N) per row, no maximum distance.
 * Other azimuths rotate the grid so the Sun comes from the left (scipy.ndimage.rotate, ported below with the same
 * output shape, offsets, bilinear weights and boundary rules), then rotate the mask back with nearest neighbour.
 * Parity with Python on the committed grids: web/tests/sim_shadows.test.mjs.
 * Same simplifications as Python: no curvature, no horizons outside the grid, point-source Sun.
 * AI-assisted (Claude); reviewed by the author. */
import type { Grid } from './grid.ts';

const RAD = Math.PI / 180;

/** scipy.special.cosdg / sindg: exact at multiples of 90°. */
function cosdg(a: number): number {
  const r = ((a % 360) + 360) % 360;
  return r === 0 ? 1 : r === 90 ? 0 : r === 180 ? -1 : r === 270 ? 0 : Math.cos(a * RAD);
}
function sindg(a: number): number {
  const r = ((a % 360) + 360) % 360;
  return r === 0 ? 0 : r === 90 ? 1 : r === 180 ? 0 : r === 270 ? -1 : Math.sin(a * RAD);
}

interface Plane { h: number; w: number; a: Float32Array }

/** Mirror an out-of-range footprint index the way scipy's spline code does (only hit with zero weight here). */
function mirror(idx: number, len: number): number {
  if (len <= 1) return 0;
  const s2 = 2 * len - 2;
  if (idx < 0) { idx = s2 * Math.trunc(-idx / s2) + idx; idx = idx <= 1 - len ? idx + s2 : -idx; }
  else if (idx >= len) { idx -= s2 * Math.trunc(idx / s2); if (idx >= len) idx = s2 - idx; }
  return idx;
}

/** scipy.ndimage.rotate(a, angle, reshape=True, order, mode, cval) for a 2-D float32 plane (output float32). */
export function rotate(src: Plane, angle: number, order: 0 | 1, mode: 'nearest' | 'constant', cval = 0): Plane {
  const c = cosdg(angle), s = sindg(angle), { h, w, a } = src;
  // out_bounds = R @ [[0, 0, iy, iy], [0, ix, 0, ix]], out shape = (ptp + 0.5).astype(int)
  const ys = [0, s * w, c * h, c * h + s * w], xs = [0, c * w, -s * h, -s * h + c * w];
  const oh = Math.trunc(Math.max(...ys) - Math.min(...ys) + 0.5), ow = Math.trunc(Math.max(...xs) - Math.min(...xs) + 0.5);
  const ocy = (oh - 1) / 2, ocx = (ow - 1) / 2;
  const offY = (h - 1) / 2 - (c * ocy + s * ocx), offX = (w - 1) / 2 - (-s * ocy + c * ocx);
  const out = new Float32Array(oh * ow);
  for (let r = 0; r < oh; r++) {
    for (let q = 0; q < ow; q++) {
      let yi = offY; yi += r * c; yi += q * s;
      let xi = offX; xi += r * -s; xi += q * c;
      if (mode === 'nearest') {
        yi = yi < 0 ? 0 : yi > h - 1 ? h - 1 : yi;
        xi = xi < 0 ? 0 : xi > w - 1 ? w - 1 : xi;
      } else if (yi < 0 || yi > h - 1 || xi < 0 || xi > w - 1) { out[r * ow + q] = cval; continue; }
      if (order === 0) {
        const y0 = mirror(Math.floor(yi + 0.5), h), x0 = mirror(Math.floor(xi + 0.5), w);
        out[r * ow + q] = a[y0 * w + x0];
      } else {
        const fy = Math.floor(yi), fx = Math.floor(xi), ty = yi - fy, tx = xi - fx;
        const y0 = mirror(fy, h), y1 = mirror(fy + 1, h), x0 = mirror(fx, w), x1 = mirror(fx + 1, w);
        const wy0 = 1 - ty, wx0 = 1 - tx;
        let t = 0;
        t += a[y0 * w + x0] * wy0 * wx0;
        t += a[y0 * w + x1] * wy0 * tx;
        t += a[y1 * w + x0] * ty * wx0;
        t += a[y1 * w + x1] * ty * tx;
        out[r * ow + q] = t;
      }
    }
  }
  return { h: oh, w: ow, a: out };
}

/** Running-maximum shadow test per row, Sun from the left (pen.shadows._shadow_rows). NaN cells never cast or receive. */
function shadowRows(p: Plane, tanE: number, dx: number): Float32Array {
  const { h, w, a } = p, out = new Float32Array(h * w);
  for (let r = 0; r < h; r++) {
    let prev = -Infinity;
    for (let i = 0; i < w; i++) {
      const zi = a[r * w + i];
      const g = Number.isNaN(zi) ? -Infinity : zi + i * dx * tanE;
      if (prev > g && Number.isFinite(g)) out[r * w + i] = 1;
      if (g > prev) prev = g;
    }
  }
  return out;
}

/** Fill NaN holes with a nearby valid height so they do not act as pits (Python uses the exact nearest; the committed
 * grids have no holes, so this only matters for other inputs). */
function fillHoles(z: Float32Array, n: number): { zf: Float32Array; holes: Uint8Array | null } {
  let any = false; for (let k = 0; k < z.length; k++) if (Number.isNaN(z[k])) { any = true; break; }
  if (!any) return { zf: z, holes: null };
  const zf = Float32Array.from(z), holes = new Uint8Array(z.length), queue: number[] = [];
  for (let k = 0; k < z.length; k++) { if (Number.isNaN(z[k])) holes[k] = 1; else queue.push(k); }
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h], r = (k / n) | 0, c = k % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, kk = rr * n + cc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n || !Number.isNaN(zf[kk])) continue;
      zf[kk] = zf[k]; queue.push(kk);
    }
  }
  return { zf, holes };
}

/** Shadow mask (1 = in shadow). az: direction the Sun comes FROM, degrees clockwise from the grid's up edge. */
export function castShadow(g: Grid, elevDeg: number, azDeg: number): Uint8Array {
  const n = g.n, tanE = Math.tan(elevDeg * RAD), { zf, holes } = fillHoles(g.z, n);
  const ang = azDeg - 270;          // az = 270 (west) already comes from the left
  const out = new Uint8Array(n * n);
  if (ang % 360 === 0) {
    const sh = shadowRows({ h: n, w: n, a: zf }, tanE, g.dx);
    for (let k = 0; k < out.length; k++) out[k] = sh[k];
  } else {
    const zr = rotate({ h: n, w: n, a: zf }, ang, 1, 'nearest');
    const nm = new Float32Array(n * n); if (holes) for (let k = 0; k < nm.length; k++) nm[k] = holes[k];
    const mr = rotate({ h: n, w: n, a: nm }, ang, 1, 'constant', 1);
    for (let k = 0; k < zr.a.length; k++) if (mr.a[k] > 1e-3) zr.a[k] = NaN;
    const back = rotate({ h: zr.h, w: zr.w, a: shadowRows(zr, tanE, g.dx) }, -ang, 0, 'constant', 0);
    const oy = Math.floor((back.h - n) / 2), ox = Math.floor((back.w - n) / 2);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[r * n + c] = back.a[(r + oy) * back.w + c + ox] ? 1 : 0;
  }
  if (holes) for (let k = 0; k < out.length; k++) if (holes[k]) out[k] = 0;
  return out;
}

export const EIGHT_AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];

/** Per cell: share of the azimuths for which the cell is in shadow (pen.shadows.shadow_fraction_maps, one elevation). */
export function shadowFraction(g: Grid, elevDeg = 2, azs: number[] = EIGHT_AZIMUTHS): Float32Array {
  const out = new Float32Array(g.n * g.n);
  for (const a of azs) { const m = castShadow(g, elevDeg, a); for (let k = 0; k < out.length; k++) out[k] += m[k]; }
  for (let k = 0; k < out.length; k++) out[k] /= azs.length;
  return out;
}

/** Slope in degrees from a Sobel gradient with reflected edges (pen.features.slope_deg, float32 like numpy). */
export function slopeDeg(g: Grid): Float32Array {
  const n = g.n, z = g.z, f = Math.fround;
  let sum = 0, cnt = 0; for (let k = 0; k < z.length; k++) if (!Number.isNaN(z[k])) { sum += z[k]; cnt++; }
  const mean = f(sum / Math.max(cnt, 1));
  const zf = new Float32Array(z.length); for (let k = 0; k < z.length; k++) zf[k] = Number.isNaN(z[k]) ? mean : z[k];
  const ix = (i: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);      // 'reflect': d c b a | a b c d
  const sob = (axis: 0 | 1): Float32Array => {
    const d = new Float32Array(n * n), o = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)       // derivative [-1, 0, 1] along axis
      d[r * n + c] = axis === 1 ? -zf[r * n + ix(c - 1)] + 0 * zf[r * n + c] + zf[r * n + ix(c + 1)]
        : -zf[ix(r - 1) * n + c] + 0 * zf[r * n + c] + zf[ix(r + 1) * n + c];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)       // smoothing [1, 2, 1] along the other axis
      o[r * n + c] = axis === 1 ? d[ix(r - 1) * n + c] + 2 * d[r * n + c] + d[ix(r + 1) * n + c]
        : d[r * n + ix(c - 1)] + 2 * d[r * n + c] + d[r * n + ix(c + 1)];
    return o;
  };
  const gx = sob(1), gy = sob(0), k8 = 8 * g.dx, out = new Float32Array(n * n);
  for (let k = 0; k < out.length; k++) {
    const a = f(gx[k] / k8), b = f(gy[k] / k8);
    out[k] = Number.isNaN(z[k]) ? NaN : f(f(Math.atan(f(Math.hypot(a, b)))) * (180 / Math.PI));
  }
  return out;
}

/** Low-Sun hillshade with cast shadows in black, 0–1 (pen.shadows.lowsun_hillshade), for textures. */
export function hillshade(g: Grid, elevDeg = 3, azDeg = 225, shadow?: Uint8Array): Float32Array {
  const n = g.n, z = g.z, dx = g.dx, out = new Float32Array(n * n);
  const zen = (90 - elevDeg) * RAD, azr = azDeg * RAD, sh = shadow ?? castShadow(g, elevDeg, azDeg);
  const at = (r: number, c: number) => z[r * n + c];
  const lit: number[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {      // np.gradient: central inside, one-sided at the edges
    const gy = r === 0 ? (at(1, c) - at(0, c)) / dx : r === n - 1 ? (at(n - 1, c) - at(n - 2, c)) / dx : (at(r + 1, c) - at(r - 1, c)) / (2 * dx);
    const gx = c === 0 ? (at(r, 1) - at(r, 0)) / dx : c === n - 1 ? (at(r, n - 1) - at(r, n - 2)) / dx : (at(r, c + 1) - at(r, c - 1)) / (2 * dx);
    const slope = Math.atan(Math.hypot(gx, gy)), aspect = Math.atan2(-gx, gy);
    const hs = Math.min(1, Math.max(0, Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(azr - aspect)));
    out[r * n + c] = hs;
    if (!sh[r * n + c]) lit.push(hs);
  }
  lit.sort((a, b) => a - b);
  const top = lit.length ? lit[Math.min(lit.length - 1, Math.floor(0.99 * (lit.length - 1)))] : 1;
  for (let k = 0; k < out.length; k++) out[k] = Math.min(1, Math.max(0, out[k] / Math.max(top, 1e-6))) * 0.92 * (sh[k] ? 0 : 1) + 0.03;
  return out;
}
