// AI-assisted (Claude Code); reviewed by the author.
/**
 * Mission Rehearsal simulator core (browser + Node test compatible).
 *
 * Implements the exact algorithms and data contracts of P.E.N.'s 30 m grid
 * simulator (cast shadows, least-cost A* rover routing with 20 deg slope wall,
 * traverse telemetry, NOAA solar ephemeris, and 365-day Earth rehearsal
 * window search + RFC 5545 .ics export).
 *
 * Loads the real 200x200 int16 grids from `${BASE}data/sim/` (web/tools/exports/sim.py). If they are
 * missing the view says so: it never shows made-up terrain. Cast shadows come from the validated core
 * (web/src/sim/shadows.ts, bit-identical to pen/shadows.py); Sun azimuths are turned into each window's
 * grid frame with its `up_az` (web/tools/exports/README.md).
 */
import { BASE } from '../../base.ts';
import { castShadow as coreCastShadow, shadowFraction as coreShadowFraction } from '../../sim/shadows.ts';
import { solarPosition as coreSolarPosition, sunFromHourAngle as coreSunFromHourAngle, localSolarHours as coreLocalSolarHours } from '../../sim/sun.ts';
import type { Manifest } from '../../types.ts';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const SLOPE_MAX_DEG = 20;

// ---- Grid & Metadata Types ----

export interface GridEncoding {
  file: string;
  /** geographic azimuth of the grid's up edge at the window centre (web/tools/exports/sim.py) */
  up_az?: number;
  lat?: number;
  lon?: number;
  offset: number;
  scale: number;
  min: number;
  max: number;
  nodata_filled: number;
}

export interface SimWindow extends GridEncoding {
  rank: number;
  site: string;
  region: string;
  place: string;
  i: number;
  j: number;
  lat: number;
  lon: number;
  score: number;
  terrain: number;
  illumination: number;
}

export interface SimTargetMeta {
  target: string;
  label: string;
  body: 'moon' | 'mars' | string;
  dx: number;
  n: number;
  center: { lat: number; lon: number; of: string };
  grid: GridEncoding & { i: number; j: number };
  windows: SimWindow[];
}

export interface Grid {
  z: Float32Array;
  rows: number;
  cols: number;
  dx: number;
  min: number;
  max: number;
}

export function decodeGrid(
  buf: ArrayBuffer | ArrayBufferView,
  enc: Pick<GridEncoding, 'offset' | 'scale'>,
  rows = 200,
  cols = 200,
  dx = 30,
): Grid {
  const i16 =
    buf instanceof ArrayBuffer
      ? new Int16Array(buf)
      : new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  if (i16.length !== rows * cols) {
    throw new Error(`sim grid length ${i16.length} != ${rows}x${cols}`);
  }
  const z = new Float32Array(i16.length);
  const { offset, scale } = enc;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < i16.length; k++) {
    const v = offset + scale * i16[k];
    z[k] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { z, rows, cols, dx, min: lo, max: hi };
}

export function exaggerated(grid: Grid, k = 1): Float32Array {
  const out = new Float32Array(grid.z.length);
  const mid = 0.5 * (grid.min + grid.max);
  for (let i = 0; i < grid.z.length; i++) {
    out[i] = (grid.z[i] - mid) * k;
  }
  return out;
}


const targetCache = new Map<string, Promise<SimTargetMeta>>();
const gridCache = new Map<string, Promise<Grid>>();

export function loadSimTarget(target: string, manifest?: Manifest): Promise<SimTargetMeta> {
  if (!targetCache.has(target)) {
    const hasSimExport =
      !manifest || Boolean((manifest as unknown as { exports?: { sim?: unknown } }).exports?.sim);
    const tryRemote = hasSimExport
      ? fetch(`${BASE}data/sim/${target}.json`).then(async (r) => {
          if (!r.ok) throw new Error(`sim/${target}.json: ${r.status}`);
          return (await r.json()) as SimTargetMeta;
        })
      : Promise.reject(new Error('sim export not in manifest'));
    const p = tryRemote.catch((e: unknown) => {
      // no made-up terrain: without the exported grids the view shows an error instead
      throw new Error(`Terrain grids for ${target} are not available (${e instanceof Error ? e.message : String(e)}); run make web-data`);
    });
    targetCache.set(target, p);
  }
  return targetCache.get(target)!;
}

export function loadSimGrid(enc: GridEncoding, n = 200, dx = 30): Promise<Grid> {
  if (!gridCache.has(enc.file)) {
    gridCache.set(
      enc.file,
      fetch(`${BASE}data/sim/${enc.file}`)
        .then((r) => {
          if (!r.ok) throw new Error(`sim/${enc.file}: ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => decodeGrid(buf, enc, n, n, dx)),
    );
  }
  return gridCache.get(enc.file)!;
}

// ---- Cast Shadows, Slope & Hillshade ----

/** Cast shadows (1 = shadow) from the validated core: the same cells as pen/shadows.py.
 *  sunAzDeg: direction the Sun comes FROM, degrees clockwise from the grid's up edge (see toGridAz). */
export function castShadow(grid: Grid, sunElevDeg: number, sunAzDeg: number): Uint8Array {
  if (sunElevDeg <= 0) return new Uint8Array(grid.rows * grid.cols).fill(1);   // Sun below the horizon: all dark
  if (grid.rows !== grid.cols) throw new Error('castShadow: square grids only');
  return coreCastShadow({ n: grid.rows, dx: grid.dx, z: grid.z }, sunElevDeg, sunAzDeg);
}

export function shadowFraction(shadow: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < shadow.length; i++) s += shadow[i];
  return shadow.length ? s / shadow.length : 0;
}

export function hillshade(
  grid: Grid,
  sunElevDeg: number,
  sunAzDeg: number,
  shadow?: Uint8Array,
  ambient = 0.22,
): Float32Array {
  const { z, rows, cols, dx } = grid;
  const out = new Float32Array(rows * cols);
  const el = Math.max(0, sunElevDeg) * DEG;
  const az = sunAzDeg * DEG;
  const sx = Math.cos(el) * Math.sin(az);
  const sy = Math.cos(el) * Math.cos(az);
  const sz = Math.sin(el);
  const inv2dx = 1 / (2 * dx);

  for (let r = 0; r < rows; r++) {
    const r0 = r > 0 ? r - 1 : 0;
    const r1 = r < rows - 1 ? r + 1 : rows - 1;
    const drScale = r1 > r0 ? 2 / (r1 - r0) : 1;
    for (let c = 0; c < cols; c++) {
      const c0 = c > 0 ? c - 1 : 0;
      const c1 = c < cols - 1 ? c + 1 : cols - 1;
      const dcScale = c1 > c0 ? 2 / (c1 - c0) : 1;
      const dzdx = (z[r * cols + c1] - z[r * cols + c0]) * inv2dx * dcScale;
      const dzdy = (z[r0 * cols + c] - z[r1 * cols + c]) * inv2dx * drScale;
      const nx = -dzdx;
      const ny = -dzdy;
      const nz = 1;
      const norm = Math.hypot(nx, ny, nz);
      const cosI = Math.max(0, (nx * sx + ny * sy + nz * sz) / norm);
      const inShadow = shadow ? shadow[r * cols + c] : 0;
      out[r * cols + c] = inShadow ? ambient * (0.65 + 0.35 * (nz / norm)) : ambient + (1 - ambient) * cosI;
    }
  }
  return out;
}

export function slopeDeg(grid: Grid): Float32Array {
  const { z, rows, cols, dx } = grid;
  const out = new Float32Array(rows * cols);
  const inv2dx = 1 / (2 * dx);
  for (let r = 0; r < rows; r++) {
    const r0 = r > 0 ? r - 1 : 0;
    const r1 = r < rows - 1 ? r + 1 : rows - 1;
    const drScale = r1 > r0 ? 2 / (r1 - r0) : 1;
    for (let c = 0; c < cols; c++) {
      const c0 = c > 0 ? c - 1 : 0;
      const c1 = c < cols - 1 ? c + 1 : cols - 1;
      const dcScale = c1 > c0 ? 2 / (c1 - c0) : 1;
      const gx = (z[r * cols + c1] - z[r * cols + c0]) * inv2dx * dcScale;
      const gy = (z[r1 * cols + c] - z[r0 * cols + c]) * inv2dx * drScale;
      out[r * cols + c] = Math.atan(Math.hypot(gx, gy)) * RAD;
    }
  }
  return out;
}

// ---- Least-Cost Rover Traverse Planner (8-connected A*) ----

export interface CostLayers {
  cost: Float32Array;
  slope: Float32Array;
  shadow: Uint8Array;
  impassable: Uint8Array;
  rows: number;
  cols: number;
}

/** Shadow fraction with the Sun at 2 deg over 8 azimuths (core), cached per grid: the shadow term of the route cost. */
const fracCache = new WeakMap<Grid, Float32Array>();
function shadowFraction2(grid: Grid): Float32Array {
  let f = fracCache.get(grid);
  if (!f) { f = coreShadowFraction({ n: grid.rows, dx: grid.dx, z: grid.z }, 2); fracCache.set(grid, f); }
  return f;
}

/** Route cost as documented (scripts/extras/rover_twin.py, docs/notes/sim.md, the technical note):
 *  1 + (slope / 10 deg)^2 + 3 x shadow fraction (Sun at 2 deg, 8 directions); slope > 20 deg costs 1e6 (crossed only
 *  when no route avoids it, as in Python).
 *  `shadow` (the cast shadow at the current Sun) is kept in the layers for telemetry, not used in the cost, so the
 *  route does not change with the Sun and rehearsal fidelity compares the same drive at different Suns. */
export function costLayers(
  grid: Grid,
  shadow?: Uint8Array,
  slopeOut?: Float32Array,
  slopeMaxDeg = SLOPE_MAX_DEG,
): CostLayers {
  const { rows, cols } = grid;
  const n = rows * cols;
  const slope = slopeOut ?? slopeDeg(grid);
  const sh = shadow ?? new Uint8Array(n);
  const frac = grid.rows === grid.cols ? shadowFraction2(grid) : new Float32Array(n);
  const cost = new Float32Array(n);
  const impassable = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const sl = slope[i];
    if (sl > slopeMaxDeg) {
      // as rover_twin.py: very costly but finite, so when no route avoids steep ground (Malapert, Nobile Rim 1) the
      // planner crosses as little of it as possible and the max slope shows it, instead of stopping after a few cells
      cost[i] = 1e6;
      impassable[i] = 1;
    } else {
      cost[i] = 1 + (sl / 10) ** 2 + 3 * frac[i];
    }
  }
  return { cost, slope, shadow: sh, impassable, rows, cols };
}

function nearestPassable(impassable: Uint8Array, rows: number, cols: number, r0: number, c0: number): [number, number] {
  const clampR = Math.max(0, Math.min(rows - 1, Math.round(r0)));
  const clampC = Math.max(0, Math.min(cols - 1, Math.round(c0)));
  if (!impassable[clampR * cols + clampC]) return [clampR, clampC];
  let bestR = clampR;
  let bestC = clampC;
  let bestD = Infinity;
  const maxRad = Math.max(rows, cols);
  for (let rad = 1; rad < maxRad; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      const r = clampR + dr;
      if (r < 0 || r >= rows) continue;
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const c = clampC + dc;
        if (c < 0 || c >= cols) continue;
        if (!impassable[r * cols + c]) {
          const d = dr * dr + dc * dc;
          if (d < bestD) {
            bestD = d;
            bestR = r;
            bestC = c;
          }
        }
      }
    }
    if (bestD < Infinity) break;
  }
  return [bestR, bestC];
}

const DR = [-1, -1, -1, 0, 0, 1, 1, 1];
const DC = [-1, 0, 1, -1, 1, -1, 0, 1];
const STEP = [Math.SQRT2, 1, Math.SQRT2, 1, 1, Math.SQRT2, 1, Math.SQRT2];

export function planRoute(
  layers: CostLayers,
  start: [number, number],
  end: [number, number],
): Array<[number, number]> {
  const { cost, impassable, rows, cols } = layers;
  const n = rows * cols;
  const [sr, sc] = nearestPassable(impassable, rows, cols, start[0], start[1]);
  const [er, ec] = nearestPassable(impassable, rows, cols, end[0], end[1]);
  const sIdx = sr * cols + sc;
  const eIdx = er * cols + ec;
  if (sIdx === eIdx) return [[sr, sc]];

  const dist = new Float64Array(n);
  dist.fill(Infinity);
  const prev = new Int32Array(n);
  prev.fill(-1);
  const closed = new Uint8Array(n);

  const heapNode = new Int32Array(n + 4);
  const heapF = new Float64Array(n + 4);
  let heapLen = 0;
  const push = (node: number, f: number) => {
    let i = ++heapLen;
    while (i > 1) {
      const p = i >> 1;
      if (heapF[p] <= f) break;
      heapNode[i] = heapNode[p];
      heapF[i] = heapF[p];
      i = p;
    }
    heapNode[i] = node;
    heapF[i] = f;
  };
  const pop = (): number => {
    const top = heapNode[1];
    const lastN = heapNode[heapLen];
    const lastF = heapF[heapLen--];
    let i = 1;
    while (i << 1 <= heapLen) {
      let child = i << 1;
      if (child < heapLen && heapF[child + 1] < heapF[child]) child++;
      if (lastF <= heapF[child]) break;
      heapNode[i] = heapNode[child];
      heapF[i] = heapF[child];
      i = child;
    }
    if (heapLen >= 1) {
      heapNode[i] = lastN;
      heapF[i] = lastF;
    }
    return top;
  };

  dist[sIdx] = 0;
  push(sIdx, Math.hypot(er - sr, ec - sc));

  while (heapLen > 0) {
    const u = pop();
    if (closed[u]) continue;
    if (u === eIdx) break;
    closed[u] = 1;
    const ur = Math.trunc(u / cols);
    const uc = u - ur * cols;
    const du = dist[u];
    const cu = cost[u];

    for (let k = 0; k < 8; k++) {
      const vr = ur + DR[k];
      const vc = uc + DC[k];
      if (vr < 0 || vr >= rows || vc < 0 || vc >= cols) continue;
      const v = vr * cols + vc;
      if (closed[v]) continue;
      const cv = cost[v];
      if (!Number.isFinite(cv)) continue;
      const nd = du + 0.5 * (cu + cv) * STEP[k];
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        const h = Math.hypot(er - vr, ec - vc);
        push(v, nd + h);
      }
    }
  }

  let goal = eIdx;
  if (!Number.isFinite(dist[goal])) {
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(dist[i])) continue;
      const r = Math.trunc(i / cols);
      const c = i - r * cols;
      const d = (r - er) * (r - er) + (c - ec) * (c - ec);
      if (d < bestD) {
        bestD = d;
        goal = i;
      }
    }
    if (!Number.isFinite(dist[goal])) return [[sr, sc]];
  }

  const out: Array<[number, number]> = [];
  for (let cur = goal; cur !== -1; cur = prev[cur]) {
    const r = Math.trunc(cur / cols);
    out.push([r, cur - r * cols]);
  }
  out.reverse();
  return out;
}

export function cellAt(grid: Grid, frac: [number, number]): [number, number] {
  return [
    Math.max(0, Math.min(grid.rows - 1, Math.round(frac[0] * (grid.rows - 1)))),
    Math.max(0, Math.min(grid.cols - 1, Math.round(frac[1] * (grid.cols - 1)))),
  ];
}

export function fracOf(grid: Grid, cell: [number, number]): [number, number] {
  return [cell[0] / Math.max(1, grid.rows - 1), cell[1] / Math.max(1, grid.cols - 1)];
}

export function routeBetween(
  grid: Grid,
  shadow: Uint8Array,
  startFrac: [number, number] = [0.15, 0.15],
  endFrac: [number, number] = [0.85, 0.85],
): { route: Array<[number, number]>; layers: CostLayers } {
  const layers = costLayers(grid, shadow);
  const route = planRoute(layers, cellAt(grid, startFrac), cellAt(grid, endFrac));
  return { route, layers };
}

/**
 * Convert a route of `[row, col]` grid indices on a window centered at `(win.lat, win.lon)`
 * into a compact `"lon,lat;lon,lat;..."` string (up to `maxWaypoints` points) for `#/dossier`.
 */
export function routeToLonLat(
  route: ReadonlyArray< readonly [number, number]>,
  win: { lat: number; lon: number },
  n = 200,
  dx = 30,
  maxWaypoints = 12,
): string {
  if (!route.length) return '';
  const mPerDegLat = 111_132;
  const mPerDegLon = Math.max(10_000, 111_320 * Math.cos(win.lat * DEG));
  const half = (n - 1) * 0.5;

  const picked: Array<readonly [number, number]> = [];
  if (route.length <= maxWaypoints) {
    picked.push(...route);
  } else {
    for (let k = 0; k < maxWaypoints; k++) {
      const idx = Math.round((k / (maxWaypoints - 1)) * (route.length - 1));
      picked.push(route[idx]);
    }
  }

  return picked
    .map(([r, c]) => {
      const dNorthM = (half - r) * dx;
      const dEastM = (c - half) * dx;
      const lat = win.lat + dNorthM / mPerDegLat;
      const lon = win.lon + dEastM / mPerDegLon;
      return `${lon.toFixed(4)},${lat.toFixed(4)}`;
    })
    .join(';');
}

// ---- Route Telemetry ----

export interface RouteTelemetry {
  waypoints: number;
  length_m: number;
  length_km: number;
  climb_m: number;
  descent_m: number;
  max_slope_deg: number;
  mean_slope_deg: number;
  share_in_shadow: number;
  share_window_impassable: number;
  litShareNow: number;
  solarEnergyRel: number;
  driveHours: number;
}

export function telemetry(
  grid: Grid,
  layers: CostLayers,
  route: ReadonlyArray<readonly [number, number]>,
  sunElevDeg = 3,
): RouteTelemetry {
  const { z, cols, dx } = grid;
  const { slope, shadow, impassable } = layers;
  let imp = 0;
  for (let i = 0; i < impassable.length; i++) imp += impassable[i];
  const impShare = impassable.length ? imp / impassable.length : 0;

  if (route.length < 2) {
    const idx = route.length ? route[0][0] * cols + route[0][1] : 0;
    const sh = shadow[idx] ?? 0;
    const sl = slope[idx] ?? 0;
    return {
      waypoints: route.length,
      length_m: 0,
      length_km: 0,
      climb_m: 0,
      descent_m: 0,
      max_slope_deg: sl,
      mean_slope_deg: sl,
      share_in_shadow: sh,
      share_window_impassable: impShare,
      litShareNow: 1 - sh,
      solarEnergyRel: 1 - sh,
      driveHours: 0,
    };
  }

  let length = 0;
  let climb = 0;
  let descent = 0;
  let maxSl = 0;
  let sumSl = 0;
  let shadowLen = 0;
  let energySum = 0;
  let driveSec = 0;
  const elRad = Math.max(0.5, sunElevDeg) * DEG;
  const sinEl = Math.sin(elRad);

  const r0 = route[0][0];
  const c0 = route[0][1];
  maxSl = slope[r0 * cols + c0];
  sumSl = maxSl;

  for (let k = 1; k < route.length; k++) {
    const [ra, ca] = route[k - 1];
    const [rb, cb] = route[k];
    const ia = ra * cols + ca;
    const ib = rb * cols + cb;
    const ds = Math.hypot(rb - ra, cb - ca) * dx;
    const dz = z[ib] - z[ia];
    length += ds;
    if (dz > 0) climb += dz;
    else descent -= dz;

    const sl = slope[ib];
    if (sl > maxSl) maxSl = sl;
    sumSl += sl;

    const sh = 0.5 * (shadow[ia] + shadow[ib]);
    shadowLen += ds * sh;

    const lit = 1 - sh;
    const slRad = sl * DEG;
    const collect = Math.min(2, (Math.cos(slRad) * sinEl + 0.5 * Math.sin(slRad) * Math.cos(elRad)) / sinEl);
    energySum += ds * lit * Math.max(0, collect);

    const speed = 0.5 * Math.max(0.25, 1 - 0.6 * (sl / SLOPE_MAX_DEG));
    driveSec += ds / speed;
  }

  const shShare = length > 0 ? shadowLen / length : 0;
  const litShare = 1 - shShare;
  return {
    waypoints: route.length,
    length_m: Math.round(length * 10) / 10,
    length_km: Math.round((length / 1000) * 1000) / 1000,
    climb_m: Math.round(climb * 10) / 10,
    descent_m: Math.round(descent * 10) / 10,
    max_slope_deg: Math.round(maxSl * 100) / 100,
    mean_slope_deg: Math.round((sumSl / route.length) * 100) / 100,
    share_in_shadow: Math.round(shShare * 10000) / 10000,
    share_window_impassable: Math.round(impShare * 10000) / 10000,
    litShareNow: Math.round(litShare * 10000) / 10000,
    solarEnergyRel: length > 0 ? Math.round((energySum / length) * 1000) / 1000 : 0,
    driveHours: Math.round((driveSec / 3600) * 100) / 100,
  };
}

export function litProfile(
  shadow: Uint8Array,
  cols: number,
  route: ReadonlyArray<readonly [number, number]>,
  samples = 101,
): Uint8Array {
  const out = new Uint8Array(samples);
  if (route.length === 0) return out;
  if (route.length === 1) {
    const [r, c] = route[0];
    out.fill(shadow[r * cols + c] ? 0 : 1);
    return out;
  }
  const cum = new Float64Array(route.length);
  for (let k = 1; k < route.length; k++) {
    cum[k] = cum[k - 1] + Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]);
  }
  const total = cum[route.length - 1] || 1;
  let seg = 0;
  for (let i = 0; i < samples; i++) {
    const target = (i / Math.max(1, samples - 1)) * total;
    while (seg < route.length - 2 && cum[seg + 1] < target) seg++;
    const pick = target - cum[seg] <= cum[seg + 1] - target ? seg : seg + 1;
    const [r, c] = route[pick];
    out[i] = shadow[r * cols + c] ? 0 : 1;
  }
  return out;
}

export function routeElevationProfile(
  grid: Grid,
  route: ReadonlyArray<readonly [number, number]>,
  samples = 101,
): Float32Array {
  const out = new Float32Array(samples);
  if (route.length === 0) return out;
  if (route.length === 1) {
    const [r, c] = route[0];
    out.fill(grid.z[r * grid.cols + c]);
    return out;
  }
  const cum = new Float64Array(route.length);
  for (let k = 1; k < route.length; k++) {
    cum[k] = cum[k - 1] + Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]);
  }
  const total = cum[route.length - 1] || 1;
  let seg = 0;
  for (let i = 0; i < samples; i++) {
    const target = (i / Math.max(1, samples - 1)) * total;
    while (seg < route.length - 2 && cum[seg + 1] < target) seg++;
    const span = Math.max(1e-9, cum[seg + 1] - cum[seg]);
    const t = Math.max(0, Math.min(1, (target - cum[seg]) / span));
    const [ra, ca] = route[seg];
    const [rb, cb] = route[seg + 1];
    const za = grid.z[ra * grid.cols + ca];
    const zb = grid.z[rb * grid.cols + cb];
    out[i] = za + t * (zb - za);
  }
  return out;
}

// ---- Solar Geometry & Ephemeris ----

export interface SunAngles {
  elevDeg: number;
  azDeg: number;
  gridAzDeg: number;
  declDeg?: number;
  hourAngleDeg?: number;
}

/** Geographic azimuth -> azimuth in a window's grid frame. upAzDeg = the window's `up_az` from sim/<target>.json
 *  (geographic azimuth of the grid's up edge; up to ~6 deg off north near the lunar pole). The grids are north-up
 *  azimuthal equidistant projections in both hemispheres, so nothing is mirrored. */
export function toGridAz(compassAzDeg: number, upAzDeg = 0): number {
  return (((compassAzDeg - upAzDeg) % 360) + 360) % 360;
}

export function azDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

/** Earth Sun from the validated core (NOAA, within 0.1 deg of scripts/extras/common.py; web/tests/sim_sun.test.mjs).
 *  upAzDeg: the window's `up_az`, so gridAzDeg is in that window's frame (0 = geographic north). */
export function solarPosition(latDeg: number, lonDeg: number, when: Date | number, upAzDeg = 0): SunAngles {
  const t = new Date(typeof when === 'number' ? when : when.getTime());
  const s = coreSolarPosition(latDeg, lonDeg, t);
  const haDeg = (coreLocalSolarHours(t, lonDeg) - 12) * 15;
  return { elevDeg: s.elev, azDeg: s.az, gridAzDeg: toGridAz(s.az, upAzDeg), hourAngleDeg: haDeg };
}

/** Sun of the Moon or Mars from the local hour angle and the subsolar latitude (core formula; the azimuth needs the
 *  1/cos(latitude) factor, which matters most near the lunar pole). elevOverrideDeg only replaces the elevation. */
export function sunFromHourAngle(
  latDeg: number,
  hourAngleDeg: number,
  declDeg = 0,
  elevOverrideDeg?: number,
  upAzDeg = 0,
): SunAngles {
  const s = coreSunFromHourAngle(latDeg, hourAngleDeg, declDeg);
  return {
    elevDeg: elevOverrideDeg !== undefined ? elevOverrideDeg : s.elev,
    azDeg: s.az,
    gridAzDeg: toGridAz(s.az, upAzDeg),
    declDeg,
    hourAngleDeg,
  };
}

export function sunDay(
  body: 'moon' | 'mars' | 'earth' | string,
  latDeg: number,
  steps = 36,
  opts: { elevDeg?: number; declDeg?: number; dateMs?: number; lonDeg?: number; upAzDeg?: number } = {},
): SunAngles[] {
  const out: SunAngles[] = [];
  if (body === 'earth' && opts.dateMs !== undefined) {
    const lon = opts.lonDeg ?? 0;
    const startOfDay = Math.floor(opts.dateMs / 86_400_000) * 86_400_000;
    for (let k = 0; k < steps; k++) {
      out.push(solarPosition(latDeg, lon, startOfDay + (k / steps) * 86_400_000, opts.upAzDeg ?? 0));
    }
    return out;
  }
  const decl = opts.declDeg ?? (body === 'moon' ? -1.5 : 0);
  const elevOverride = opts.elevDeg ?? (body === 'moon' ? 2.5 : undefined);
  for (let k = 0; k < steps; k++) {
    const ha = -180 + (k / steps) * 360;
    out.push(sunFromHourAngle(latDeg, ha, decl, elevOverride, opts.upAzDeg ?? 0));
  }
  return out;
}

export function localSolarHours(utcMs: number, lonDeg: number): number {
  const utcH = ((((utcMs % 86_400_000) + 86_400_000) % 86_400_000) / 3_600_000);
  return (((utcH + lonDeg / 15) % 24) + 24) % 24;
}

// ---- Rehearse This Traverse on Earth (A2 / U7) ----

export interface RehearsalWindow {
  date: string;
  startIso: string;
  endIso: string;
  peakIso: string;
  durationMin: number;
  localStart: string;
  localEnd: string;
  earthElevDeg: number;
  earthAzDeg: number;
  earthGridAzDeg: number;
  azErrorDeg: number;
  fidelity: number;
  targetLitShare: number;
  earthLitShare: number;
  exactAzimuthMatch: boolean;
  earthLitProfile: Uint8Array;
}

export interface RehearsalPlan {
  targetLitProfile: Uint8Array;
  targetLitShare: number;
  targetGridAzDeg: number;
  targetElevDeg: number;
  exactAzimuthMatch: boolean;
  azToleranceDeg: number;
  elevBandDeg: [number, number];
  best: RehearsalWindow | null;
  windows: RehearsalWindow[];
}

export interface RehearseOptions {
  targetGrid: Grid;
  targetRoute: ReadonlyArray<readonly [number, number]>;
  targetSun: { elevDeg: number; gridAzDeg: number };
  earthGrid: Grid;
  earthRoute?: ReadonlyArray<readonly [number, number]>;
  earthLat: number;
  earthLon: number;
  /** the Earth window's `up_az` (grid frame of earthGrid) */
  earthUpAzDeg?: number;
  /** start of the search; default now (a rehearsal date must be in the future) */
  fromDate?: Date | number;
  days?: number;
  stepMin?: number;
  elevMinDeg?: number;
  elevMaxDeg?: number;
  azTolDeg?: number;
  maxResults?: number;
}

function fmtHM(hours: number): string {
  const totalMin = Math.round((((hours % 24) + 24) % 24) * 60) % 1440;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rehearse(opts: RehearseOptions): RehearsalPlan {
  const {
    targetGrid,
    targetRoute,
    targetSun,
    earthGrid,
    earthLat,
    earthLon,
    earthUpAzDeg = 0,
    fromDate = Date.now(),
    days = 365,
    stepMin = 10,
    elevMinDeg = 0,
    elevMaxDeg = 7,
    azTolDeg = 10,
    maxResults = 10,
  } = opts;

  const targetShadow = castShadow(targetGrid, targetSun.elevDeg, targetSun.gridAzDeg);
  const targetProf = litProfile(targetShadow, targetGrid.cols, targetRoute);
  let tLit = 0;
  for (let i = 0; i < targetProf.length; i++) tLit += targetProf[i];
  const targetLitShare = targetProf.length ? tLit / targetProf.length : 0;

  let earthRoute = opts.earthRoute;
  if (!earthRoute || earthRoute.length === 0) {
    const s = targetRoute.length ? fracOf(targetGrid, [targetRoute[0][0], targetRoute[0][1]]) : ([0.15, 0.15] as [number, number]);
    const e = targetRoute.length
      ? fracOf(targetGrid, [targetRoute[targetRoute.length - 1][0], targetRoute[targetRoute.length - 1][1]])
      : ([0.85, 0.85] as [number, number]);
    const nominalShadow = castShadow(earthGrid, 0.5 * (elevMinDeg + elevMaxDeg), targetSun.gridAzDeg);
    earthRoute = routeBetween(earthGrid, nominalShadow, s, e).route;
  }

  const startMs = typeof fromDate === 'number' ? fromDate : fromDate.getTime();
  const startDayMs = Math.floor(startMs / 86_400_000) * 86_400_000;
  const stepMs = stepMin * 60_000;
  const totalSteps = Math.floor((days * 1440) / stepMin);

  interface RawRun {
    startMs: number;
    endMs: number;
    bestMs: number;
    bestScore: number;
    bestSun: SunAngles;
    bestAzErr: number;
  }

  const scan = (tolDeg: number): RawRun[] => {
    const runs: RawRun[] = [];
    let cur: RawRun | null = null;
    for (let s = 0; s <= totalSteps; s++) {
      const t = startDayMs + s * stepMs;
      const sun = solarPosition(earthLat, earthLon, t, earthUpAzDeg);
      const inElev = sun.elevDeg >= elevMinDeg && sun.elevDeg <= elevMaxDeg;
      const aErr = azDiff(sun.gridAzDeg, targetSun.gridAzDeg);
      const inAz = aErr <= tolDeg;
      if (inElev && inAz) {
        const score = aErr + 0.5 * Math.abs(sun.elevDeg - targetSun.elevDeg);
        if (cur && t - cur.endMs <= stepMs * 1.5) {
          cur.endMs = t;
          if (score < cur.bestScore) {
            cur.bestScore = score;
            cur.bestMs = t;
            cur.bestSun = sun;
            cur.bestAzErr = aErr;
          }
        } else {
          if (cur) runs.push(cur);
          cur = { startMs: t, endMs: t, bestMs: t, bestScore: score, bestSun: sun, bestAzErr: aErr };
        }
      } else if (cur) {
        runs.push(cur);
        cur = null;
      }
    }
    if (cur) runs.push(cur);
    return runs;
  };

  let runs = scan(azTolDeg);
  let exactAz = true;
  if (runs.length === 0) {
    exactAz = false;
    runs = scan(180);
  }

  runs.sort((a, b) => a.bestScore - b.bestScore || b.endMs - b.startMs - (a.endMs - a.startMs));
  const candidates = runs.slice(0, Math.max(maxResults * 3, 24));

  const profByAzBin = new Map<number, { prof: Uint8Array; litShare: number }>();
  const getEarthProf = (sun: SunAngles) => {
    const key = Math.round(sun.gridAzDeg / 2) * 100 + Math.round(sun.elevDeg * 2);
    let hit = profByAzBin.get(key);
    if (!hit) {
      const sh = castShadow(earthGrid, sun.elevDeg, sun.gridAzDeg);
      const prof = litProfile(sh, earthGrid.cols, earthRoute!);
      let lit = 0;
      for (let i = 0; i < prof.length; i++) lit += prof[i];
      hit = { prof, litShare: prof.length ? lit / prof.length : 0 };
      profByAzBin.set(key, hit);
    }
    return hit;
  };

  const windows: RehearsalWindow[] = candidates.map((r) => {
    const { prof, litShare } = getEarthProf(r.bestSun);
    let agree = 0;
    for (let i = 0; i < prof.length; i++) {
      if (prof[i] === targetProf[i]) agree++;
    }
    const fidelity = prof.length ? Math.round((agree / prof.length) * 1000) / 10 : 0;
    const durMin = Math.max(stepMin, Math.round((r.endMs - r.startMs) / 60_000) + stepMin);
    const endWithStep = r.endMs + stepMs;
    return {
      date: new Date(r.bestMs).toISOString().slice(0, 10),
      startIso: new Date(r.startMs).toISOString(),
      endIso: new Date(endWithStep).toISOString(),
      peakIso: new Date(r.bestMs).toISOString(),
      durationMin: durMin,
      localStart: fmtHM(localSolarHours(r.startMs, earthLon)),
      localEnd: fmtHM(localSolarHours(endWithStep, earthLon)),
      earthElevDeg: Math.round(r.bestSun.elevDeg * 100) / 100,
      earthAzDeg: Math.round(r.bestSun.azDeg * 10) / 10,
      earthGridAzDeg: Math.round(r.bestSun.gridAzDeg * 10) / 10,
      azErrorDeg: Math.round(r.bestAzErr * 10) / 10,
      fidelity,
      targetLitShare: Math.round(targetLitShare * 1000) / 1000,
      earthLitShare: Math.round(litShare * 1000) / 1000,
      exactAzimuthMatch: exactAz,
      earthLitProfile: prof,
    };
  });

  windows.sort((a, b) => b.fidelity - a.fidelity || a.azErrorDeg - b.azErrorDeg || b.durationMin - a.durationMin);
  const top = windows.slice(0, maxResults);

  return {
    targetLitProfile: targetProf,
    targetLitShare: Math.round(targetLitShare * 1000) / 1000,
    targetGridAzDeg: Math.round(targetSun.gridAzDeg * 10) / 10,
    targetElevDeg: Math.round(targetSun.elevDeg * 100) / 100,
    exactAzimuthMatch: exactAz,
    azToleranceDeg: azTolDeg,
    elevBandDeg: [elevMinDeg, elevMaxDeg],
    best: top[0] ?? null,
    windows: top,
  };
}

export function earthLowSunDirections(
  earthLat: number,
  earthLon = 0,
  elevMinDeg = 0,
  elevMaxDeg = 7,
  upAzDeg = 0,
  fromMs = Date.now(),
): number[] {
  const bins = new Uint8Array(72);
  const t0 = fromMs;                                          // the next 365 days
  for (let d = 0; d < 365; d += 3) {
    for (let m = 0; m < 1440; m += 15) {
      const sun = solarPosition(earthLat, earthLon, t0 + (d * 1440 + m) * 60_000, upAzDeg);
      if (sun.elevDeg >= elevMinDeg && sun.elevDeg <= elevMaxDeg) {
        bins[Math.floor(sun.gridAzDeg / 5) % 72] = 1;
      }
    }
  }
  const out: number[] = [];
  for (let b = 0; b < 72; b++) if (bins[b]) out.push(b * 5 + 2.5);
  return out;
}

export interface ICSDetails {
  targetLabel: string;
  earthRegion: string;
  earthPlace?: string;
  lat: number;
  lon: number;
  window: RehearsalWindow;
  routeKm?: number;
}

function icsStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function toICS(d: ICSDetails): string {
  const w = d.window;
  const uid = `pen-rehearsal-${d.earthRegion.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${icsStamp(w.startIso)}@pen.analog`;
  const loc = d.earthPlace
    ? `${d.earthRegion}, ${d.earthPlace} (${d.lat.toFixed(4)}, ${d.lon.toFixed(4)})`
    : `${d.earthRegion} (${d.lat.toFixed(4)}, ${d.lon.toFixed(4)})`;
  const summary = `P.E.N. Rehearsal: ${d.targetLabel} on ${d.earthRegion} (${w.fidelity.toFixed(0)}% fidelity)`;
  const desc = [
    `Rehearse ${d.targetLabel} traverse on ${d.earthRegion}.`,
    `Rehearsal fidelity: ${w.fidelity.toFixed(1)}% (target lit ${(w.targetLitShare * 100).toFixed(0)}%, Earth lit ${(w.earthLitShare * 100).toFixed(0)}%).`,
    `Earth Sun: elevation ${w.earthElevDeg.toFixed(1)} deg, azimuth ${w.earthAzDeg.toFixed(0)} deg (grid Δaz ${w.azErrorDeg.toFixed(1)} deg).`,
    `Local solar window: ${w.localStart}-${w.localEnd} (${w.durationMin} min).`,
    d.routeKm !== undefined ? `Planned traverse length: ${d.routeKm.toFixed(2)} km.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//P.E.N.//Planetary Exploration Navigation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(w.startIso)}`,
    `DTSTART:${icsStamp(w.startIso)}`,
    `DTEND:${icsStamp(w.endIso)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `LOCATION:${icsEscape(loc)}`,
    `GEO:${d.lat.toFixed(5)};${d.lon.toFixed(5)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
