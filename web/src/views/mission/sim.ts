// AI-assisted (Claude Code); reviewed by the author.
/**
 * Mission Rehearsal simulator core (browser + Node test compatible).
 *
 * Implements the exact algorithms and data contracts of P.E.N.'s 30 m grid
 * simulator (cast shadows, least-cost A* rover routing with 20 deg slope wall,
 * traverse telemetry, NOAA solar ephemeris, and 365-day Earth rehearsal
 * window search + RFC 5545 .ics export).
 *
 * Loads binary 200x200 int16 grids from `${BASE}data/sim/<target>.json` when
 * available, and provides a deterministic terrain synthesis fallback from
 * `${BASE}data/<target>.json` so the Mission view works seamlessly even before
 * `data/sim/` is generated.
 */
import { BASE } from '../../base.ts';
import { loadDetail, loadTarget } from '../../data.ts';
import type { Manifest } from '../../types.ts';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const SLOPE_MAX_DEG = 20;

// ---- Grid & Metadata Types ----

export interface GridEncoding {
  file: string;
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

/**
 * Deterministic fallback 200x200 terrain synthesizer used only when
 * `data/sim/<target>.bin` has not yet been exported to `web/public/data/sim/`.
 */
function synthesizeGrid(seedStr: string, body: string, baseElev: number, relief: number, rows = 200, cols = 200, dx = 30): Grid {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };

  const z = new Float32Array(rows * cols);
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;
  const ridgeAngle = (0.35 + rand() * 0.9) * Math.PI;
  const ca = Math.cos(ridgeAngle);
  const sa = Math.sin(ridgeAngle);

  // Generate 5 craters/basins/cones
  const features = Array.from({ length: 5 }, () => ({
    cr: 25 + rand() * (rows - 50),
    cc: 25 + rand() * (cols - 50),
    radius: 14 + rand() * 34,
    depth: (body === 'moon' ? -1 : rand() > 0.35 ? -1 : 0.8) * (0.18 + rand() * 0.28) * relief,
  }));

  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < rows; r++) {
    const ny = r / rows - 0.5;
    for (let c = 0; c < cols; c++) {
      const nx = c / cols - 0.5;
      const rx = nx * ca - ny * sa;
      const ry = nx * sa + ny * ca;

      // Broad massif / ridge + secondary undulations
      let elev =
        baseElev +
        relief * 0.38 * Math.exp(-((ry * 2.6) ** 2)) * Math.cos(rx * 3.2 + p1) +
        relief * 0.16 * Math.sin(nx * 6.5 + p2) * Math.cos(ny * 6.0 + p3) +
        relief * 0.06 * Math.sin((nx + ny) * 14.0 + p1);

      for (const f of features) {
        const d = Math.hypot(r - f.cr, c - f.cc) / f.radius;
        if (d < 1.35) {
          if (d < 0.82) {
            elev += f.depth * (1 - (d / 0.82) ** 2);
          } else {
            const rim = Math.exp(-(((d - 0.95) / 0.18) ** 2));
            elev -= f.depth * 0.28 * rim;
          }
        }
      }

      z[r * cols + c] = elev;
      if (elev < lo) lo = elev;
      if (elev > hi) hi = elev;
    }
  }
  return { z, rows, cols, dx, min: lo, max: hi };
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
    const p = tryRemote
      .catch(async () => {
        // Fallback synthesis from standard target + detail files
        const [td, det] = await Promise.all([
          loadTarget(target),
          loadDetail(target).catch(() => ({ i: [] as number[], j: [] as number[] })),
        ]);
        const tInfo = manifest?.targets.find((t) => t.id === target);
        const body = tInfo?.body ?? (target.startsWith('mars_') ? 'mars' : 'moon');
        const label = tInfo ? `${tInfo.body === 'mars' ? 'Mars' : 'Moon'} · ${tInfo.name}` : target;
        const [lon, lat] = tInfo?.center ?? [0, body === 'moon' ? -84.9 : 39.1];
        const scaleScore = manifest?.scale?.score ?? 10;
        const scaleLonLat = manifest?.scale?.lonlat ?? 100000;

        // Top 5 distinct Earth regions
        const indices = Array.from({ length: td.n }, (_, k) => k).sort(
          (a, b) => (td.combined[b] ?? 0) - (td.combined[a] ?? 0),
        );
        const seenSites = new Set<number>();
        const windows: SimWindow[] = [];
        for (const idx of indices) {
          const sIdx = td.site[idx];
          if (seenSites.has(sIdx)) continue;
          seenSites.add(sIdx);
          const reg = manifest?.regions[sIdx];
          const siteId = reg?.id ?? `earth_site_${sIdx}`;
          const wi = det.i?.[idx] ?? 200 * windows.length;
          const wj = det.j?.[idx] ?? 200 * windows.length;
          const score = (td.combined[idx] ?? 850) / scaleScore;
          const terrain =
            ((td.score_terrain as number[] | undefined)?.[idx] ?? td.combined[idx] ?? 840) / scaleScore;
          const illum =
            ((td.score_illumination as number[] | undefined)?.[idx] ?? td.combined[idx] ?? 860) / scaleScore;
          windows.push({
            rank: windows.length + 1,
            site: siteId,
            region: reg?.name ?? siteId,
            place: reg?.place ?? '',
            i: wi,
            j: wj,
            lat: (td.lat[idx] ?? 0) / scaleLonLat,
            lon: (td.lon[idx] ?? 0) / scaleLonLat,
            score: Math.round(score * 10) / 10,
            terrain: Math.round(terrain * 10) / 10,
            illumination: Math.round(illum * 10) / 10,
            file: `__synth__${target}__${siteId}_${wi}_${wj}`,
            offset: 2100,
            scale: 0.01,
            nodata_filled: 0,
            min: 1920,
            max: 2340,
          });
          if (windows.length >= 5) break;
        }

        return {
          target,
          label,
          body,
          dx: 30,
          n: 200,
          center: { lat, lon, of: 'site' },
          grid: {
            file: `__synth__${target}`,
            offset: body === 'moon' ? 1200 : -2800,
            scale: 0.01,
            i: 400,
            j: 400,
            nodata_filled: 0,
            min: body === 'moon' ? 880 : -3020,
            max: body === 'moon' ? 1560 : -2580,
          },
          windows,
        } satisfies SimTargetMeta;
      });
    targetCache.set(target, p);
  }
  return targetCache.get(target)!;
}

export function loadSimGrid(enc: GridEncoding, n = 200, dx = 30): Promise<Grid> {
  if (!gridCache.has(enc.file)) {
    if (enc.file.startsWith('__synth__')) {
      const isMoon = enc.file.includes('moon_');
      const relief = Math.max(120, (enc.max ?? 2200) - (enc.min ?? 1800));
      const base = 0.5 * ((enc.min ?? 1800) + (enc.max ?? 2200));
      gridCache.set(
        enc.file,
        Promise.resolve(synthesizeGrid(enc.file, isMoon ? 'moon' : 'mars', base, relief, n, n, dx)),
      );
    } else {
      gridCache.set(
        enc.file,
        fetch(`${BASE}data/sim/${enc.file}`)
          .then((r) => {
            if (!r.ok) throw new Error(`sim/${enc.file}: ${r.status}`);
            return r.arrayBuffer();
          })
          .then((buf) => decodeGrid(buf, enc, n, n, dx))
          .catch(() => {
            const isMoon = enc.file.includes('moon_');
            const relief = Math.max(140, (enc.max ?? 2200) - (enc.min ?? 1800));
            const base = 0.5 * ((enc.min ?? 1800) + (enc.max ?? 2200));
            return synthesizeGrid(enc.file, isMoon ? 'moon' : 'mars', base, relief, n, n, dx);
          }),
      );
    }
  }
  return gridCache.get(enc.file)!;
}

// ---- Cast Shadows, Slope & Hillshade (matching pipeline/illumination.py) ----

export function castShadow(grid: Grid, sunElevDeg: number, sunAzDeg: number): Uint8Array {
  const { z, rows: h, cols: w, dx } = grid;
  const out = new Uint8Array(h * w);
  if (sunElevDeg <= 0) {
    out.fill(1);
    return out;
  }

  const az = sunAzDeg * DEG;
  const tanEl = Math.tan(sunElevDeg * DEG);
  const dr = -Math.cos(az);
  const dc = Math.sin(az);

  let primaryRows: boolean;
  let stepP: number;
  let slopeS: number;
  let stepDist: number;
  if (Math.abs(dr) >= Math.abs(dc)) {
    primaryRows = true;
    stepP = dr < 0 ? -1 : 1;
    slopeS = dc / Math.abs(dr);
    stepDist = dx * Math.hypot(1, slopeS);
  } else {
    primaryRows = false;
    stepP = dc < 0 ? -1 : 1;
    slopeS = dr / Math.abs(dc);
    stepDist = dx * Math.hypot(1, slopeS);
  }
  const dhPerStep = stepDist * tanEl;

  const trace = (r0: number, c0: number) => {
    let horizon = -1e30;
    let r = r0;
    let c = c0;
    while (r >= 0 && r < h && c >= 0 && c < w) {
      const ri = Math.trunc(r);
      const ci = Math.trunc(c);
      const idx = ri * w + ci;
      const zv = z[idx];
      if (zv < horizon) {
        out[idx] = 1;
      } else {
        horizon = zv;
      }
      horizon -= dhPerStep;
      if (primaryRows) {
        r += stepP;
        c += slopeS;
      } else {
        c += stepP;
        r += slopeS;
      }
    }
  };

  if (primaryRows) {
    const rStart = stepP > 0 ? 0 : h - 1;
    for (let c = 0; c < w; c++) trace(rStart, c + 0.5);
    if (slopeS > 0) {
      for (let r = 0; r < h; r++) trace(r + 0.5, 0);
    } else if (slopeS < 0) {
      for (let r = 0; r < h; r++) trace(r + 0.5, w - 1e-6);
    }
  } else {
    const cStart = stepP > 0 ? 0 : w - 1;
    for (let r = 0; r < h; r++) trace(r + 0.5, cStart);
    if (slopeS > 0) {
      for (let c = 0; c < w; c++) trace(0, c + 0.5);
    } else if (slopeS < 0) {
      for (let c = 0; c < w; c++) trace(h - 1e-6, c + 0.5);
    }
  }
  return out;
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
  const cost = new Float32Array(n);
  const impassable = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const sl = slope[i];
    if (sl > slopeMaxDeg) {
      cost[i] = Infinity;
      impassable[i] = 1;
    } else {
      const sRatio = sl / slopeMaxDeg;
      cost[i] = 1 + 4 * sRatio * sRatio + 1.5 * sh[i];
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

export function toGridAz(compassAzDeg: number, latDeg: number): number {
  const raw = latDeg < 0 ? 180 - compassAzDeg : compassAzDeg;
  return ((raw % 360) + 360) % 360;
}

export function azDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

export function solarPosition(latDeg: number, lonDeg: number, when: Date | number): SunAngles {
  const ms = typeof when === 'number' ? when : when.getTime();
  const jd = ms / 86_400_000 + 2440587.5;
  const n = jd - 2451545.0;

  const L = (((280.46 + 0.9856474 * n) % 360) + 360) % 360;
  const g = ((((357.528 + 0.9856003 * n) % 360) + 360) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));

  const y = Math.tan(eps / 2) ** 2;
  const Lr = L * DEG;
  const e = 0.016708634;
  const eqTimeMin =
    4 *
    RAD *
    (y * Math.sin(2 * Lr) -
      2 * e * Math.sin(g) +
      4 * e * y * Math.sin(g) * Math.cos(2 * Lr) -
      0.5 * y * y * Math.sin(4 * Lr) -
      1.25 * e * e * Math.sin(2 * g));

  const dayFracMin = ((((ms % 86_400_000) + 86_400_000) % 86_400_000) / 60_000);
  const trueSolarMin = (((dayFracMin + eqTimeMin + 4 * lonDeg) % 1440) + 1440) % 1440;
  const haDeg = trueSolarMin / 4 - 180;
  const ha = haDeg * DEG;

  const phi = latDeg * DEG;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const yAz = -Math.sin(ha) * Math.cos(decl);
  const xAz = Math.sin(decl) - Math.sin(phi) * sinEl;
  const az = (((Math.atan2(yAz, xAz) * RAD) % 360) + 360) % 360;

  return {
    elevDeg: el * RAD,
    azDeg: az,
    gridAzDeg: toGridAz(az, latDeg),
    declDeg: decl * RAD,
    hourAngleDeg: haDeg,
  };
}

export function sunFromHourAngle(
  latDeg: number,
  hourAngleDeg: number,
  declDeg = 0,
  elevOverrideDeg?: number,
): SunAngles {
  const phi = latDeg * DEG;
  const decl = declDeg * DEG;
  const ha = hourAngleDeg * DEG;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const computedEl = Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD;
  const yAz = -Math.sin(ha) * Math.cos(decl);
  const xAz = Math.sin(decl) - Math.sin(phi) * sinEl;
  const az = (((Math.atan2(yAz, xAz) * RAD) % 360) + 360) % 360;
  const elevDeg = elevOverrideDeg !== undefined ? elevOverrideDeg : computedEl;
  return {
    elevDeg,
    azDeg: az,
    gridAzDeg: toGridAz(az, latDeg),
    declDeg,
    hourAngleDeg,
  };
}

export function sunDay(
  body: 'moon' | 'mars' | 'earth' | string,
  latDeg: number,
  steps = 36,
  opts: { elevDeg?: number; declDeg?: number; dateMs?: number; lonDeg?: number } = {},
): SunAngles[] {
  const out: SunAngles[] = [];
  if (body === 'earth' && opts.dateMs !== undefined) {
    const lon = opts.lonDeg ?? 0;
    const startOfDay = Math.floor(opts.dateMs / 86_400_000) * 86_400_000;
    for (let k = 0; k < steps; k++) {
      out.push(solarPosition(latDeg, lon, startOfDay + (k / steps) * 86_400_000));
    }
    return out;
  }
  const decl = opts.declDeg ?? (body === 'moon' ? -1.5 : 0);
  const elevOverride = opts.elevDeg ?? (body === 'moon' ? 2.5 : undefined);
  for (let k = 0; k < steps; k++) {
    const ha = -180 + (k / steps) * 360;
    out.push(sunFromHourAngle(latDeg, ha, decl, elevOverride));
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
    fromDate = Date.UTC(2026, 0, 1),
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
      const sun = solarPosition(earthLat, earthLon, t);
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
  year = 2026,
): number[] {
  const bins = new Uint8Array(72);
  const t0 = Date.UTC(year, 0, 1);
  for (let d = 0; d < 365; d += 3) {
    for (let m = 0; m < 1440; m += 15) {
      const sun = solarPosition(earthLat, earthLon, t0 + (d * 1440 + m) * 60_000);
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
