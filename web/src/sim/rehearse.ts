/** "Rehearse this traverse on Earth, on this date" (U7).
 *
 * Input: a route on the target window (Moon or Mars) and the target's Sun for it, plus one Earth analog window.
 * 1. The same drive on Earth: a least-cost route between the same relative start and end points of the Earth window.
 * 2. Over the next `days` (365), every `stepMin` (10) minutes, the Earth Sun at the window (NOAA) qualifies when its
 *    elevation is within `elev` (0–7°, the lunar south-pole range) and it comes from the same direction of the terrain
 *    as the target Sun, within `azTol` (10°). Directions are compared in each window's own grid frame
 *    (azimuth − up_az), because near the lunar pole grid-up and north differ by several degrees.
 * 3. Consecutive qualifying steps form a window of time. Its best moment is the step closest to the target Sun
 *    (direction first, then elevation). At that moment:
 *      rehearsal fidelity = share of the route, at 101 evenly spaced points of each drive's length, where the light
 *      condition (sunlit or in shadow, from cast shadows of the window) is the same on Earth and on the target.
 *    100 % = every point of the Earth drive is lit or dark exactly where the target drive is.
 * Limits: shadows only from terrain inside each 6 km window; no refraction (~0.5° at the horizon, a few minutes);
 * times are UTC (labels can use localSolarHours). Formula and limits: docs/notes/sim.md.
 * AI-assisted (Claude); reviewed by the author. */
import type { Grid } from './grid.ts';
import type { Route, CostLayers } from './route.ts';
import { costLayers, cellAt, routeBetween, fracOf } from './route.ts';
import { castShadow } from './shadows.ts';
import { solarPosition, toGridAz, azDiff, type SunPos } from './sun.ts';
import { litProfile } from './telemetry.ts';

export interface RehearseInput {
  /** the target window (Moon/Mars), the route drawn on it, its Sun (geographic azimuth) and its up_az */
  target: { grid: Grid; route: Route; sun: SunPos; upAz: number };
  /** the Earth window: grid, centre and up_az from sim/<target>.json; pass layers/route to reuse them */
  earth: { grid: Grid; lat: number; lon: number; upAz: number; layers?: CostLayers; route?: Route };
  from?: Date; days?: number; stepMin?: number; elev?: [number, number]; azTol?: number;
  /** fidelity is computed for at most this many windows (the best-matching ones); default 120 */
  maxWindows?: number;
  samples?: number;
}
export interface RehearseWindow {
  start: Date; end: Date; best: Date; minutes: number;
  /** Earth Sun at the best moment (geographic azimuth) and the same azimuth in the Earth grid's frame */
  sun: SunPos; sunGridAz: number;
  azDiff: number; elevDiff: number;
  /** 0–100 */
  fidelity: number;
}
export interface RehearseResult {
  windows: RehearseWindow[];
  /** at least one qualifying moment in the period */
  reachable: boolean;
  /** when not reachable: the Earth low Sun (within `elev`) closest in direction, to say how far it is */
  nearest?: { at: Date; sun: SunPos; azDiff: number };
  targetSunGridAz: number;
  earthRoute: Route;
  earthLayers: CostLayers;
  /** lit (1) / dark (0) at the samples of the target drive */
  targetProfile: Uint8Array;
}

/** Shadow masks are cached per Sun (0.25° elevation, 0.5° azimuth) and grid. */
const maskCache = new WeakMap<Grid, Map<string, Uint8Array>>();
export function maskFor(g: Grid, elev: number, gridAz: number): Uint8Array {
  let m = maskCache.get(g); if (!m) { m = new Map(); maskCache.set(g, m); }
  const e = Math.round(elev * 4) / 4, a = (Math.round(gridAz * 2) / 2) % 360, key = `${e}|${a}`;
  let v = m.get(key); if (!v) { v = castShadow(g, e, a); m.set(key, v); }
  return v;
}

export function fidelity(a: Uint8Array, b: Uint8Array): number {
  let same = 0; for (let k = 0; k < a.length; k++) same += a[k] === b[k] ? 1 : 0;
  return 100 * same / a.length;
}

export function rehearse(inp: RehearseInput): RehearseResult {
  const { target, earth } = inp, n = target.grid.n;
  const days = inp.days ?? 365, stepMin = inp.stepMin ?? 10, [e0, e1] = inp.elev ?? [0, 7], azTol = inp.azTol ?? 10;
  const samples = inp.samples ?? 101, from = inp.from ?? new Date();
  const tAz = toGridAz(target.sun.az, target.upAz), tEl = target.sun.elev;
  const targetProfile = litProfile(target.route, n, maskFor(target.grid, tEl, tAz), samples);

  const L = earth.layers ?? costLayers(earth.grid);
  const p = target.route.path;
  const earthRoute = earth.route ?? routeBetween(L, earth.grid.n, earth.grid.dx,
    cellAt(L, earth.grid.n, fracOf(n, p[0])), cellAt(L, earth.grid.n, fracOf(n, p[p.length - 1])));

  const elWant = Math.min(Math.max(tEl, e0), e1);
  const score = (dAz: number, dEl: number) => (dAz / azTol) ** 2 + (dEl / 2) ** 2;
  type Run = { start: Date; end: Date; best: Date; sun: SunPos; gaz: number; dAz: number; dEl: number; s: number; steps: number };
  const runs: Run[] = [];
  let cur: Run | null = null, nearest: RehearseResult['nearest'];
  const t0 = Math.floor(from.getTime() / 60000) * 60000, steps = Math.floor(days * 1440 / stepMin);
  for (let k = 0; k <= steps; k++) {
    const t = new Date(t0 + k * stepMin * 60000), sun = solarPosition(earth.lat, earth.lon, t);
    const ok0 = sun.elev >= e0 && sun.elev <= e1;
    let ok = false;
    if (ok0) {
      const gaz = toGridAz(sun.az, earth.upAz), dAz = azDiff(gaz, tAz), dEl = Math.abs(sun.elev - elWant);
      if (!nearest || dAz < nearest.azDiff) nearest = { at: t, sun, azDiff: dAz };
      if (dAz <= azTol) {
        ok = true;
        const s = score(dAz, dEl);
        if (!cur) cur = { start: t, end: t, best: t, sun, gaz, dAz, dEl, s, steps: 0 };
        cur.end = t; cur.steps++;
        if (s < cur.s) Object.assign(cur, { best: t, sun, gaz, dAz, dEl, s });
      }
    }
    if (!ok && cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);

  const keep = [...runs].sort((a, b) => a.s - b.s).slice(0, inp.maxWindows ?? 120);
  const windows = keep.map(r => ({
    start: r.start, end: new Date(r.end.getTime() + stepMin * 60000), best: r.best, minutes: r.steps * stepMin,
    sun: r.sun, sunGridAz: r.gaz, azDiff: r.dAz, elevDiff: r.dEl,
    fidelity: fidelity(targetProfile, litProfile(earthRoute, earth.grid.n, maskFor(earth.grid, r.sun.elev, r.gaz), samples)),
  })).sort((a, b) => a.start.getTime() - b.start.getTime());
  return { windows, reachable: runs.length > 0, nearest: runs.length ? undefined : nearest, targetSunGridAz: tAz,
    earthRoute, earthLayers: L, targetProfile };
}

/** Minutes per year the Earth Sun spends low (within `elev`) coming from each grid-frame direction (360 bins), to shade
 * a direction slider: which target Suns can this Earth window rehearse at all. */
export function earthLowSunDirections(lat: number, lon: number, upAz: number, opts: { from?: Date; days?: number; stepMin?: number; elev?: [number, number] } = {}): Float64Array {
  const out = new Float64Array(360), step = opts.stepMin ?? 10, [e0, e1] = opts.elev ?? [0, 7];
  const t0 = (opts.from ?? new Date()).getTime(), steps = Math.floor((opts.days ?? 365) * 1440 / step);
  for (let k = 0; k < steps; k++) {
    const s = solarPosition(lat, lon, new Date(t0 + k * step * 60000));
    if (s.elev >= e0 && s.elev <= e1) out[Math.floor(toGridAz(s.az, upAz)) % 360] += step;
  }
  return out;
}

const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** An iCalendar file with one event per rehearsal window (UTC times), for "Download .ics". */
export function toICS(windows: RehearseWindow[], info: { title: string; location: string; lat: number; lon: number; description?: string }): string {
  const now = icsTime(new Date()), lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//P.E.N.//Mission Rehearsal//EN', 'CALSCALE:GREGORIAN'];
  windows.forEach((w, k) => {
    lines.push('BEGIN:VEVENT', `UID:pen-${icsTime(w.start)}-${k}@pen`, `DTSTAMP:${now}`, `DTSTART:${icsTime(w.start)}`, `DTEND:${icsTime(w.end)}`,
      `SUMMARY:${icsText(`${info.title} · fidelity ${Math.round(w.fidelity)} %`)}`,
      `LOCATION:${icsText(info.location)}`, `GEO:${info.lat.toFixed(5)};${info.lon.toFixed(5)}`,
      `DESCRIPTION:${icsText(`${info.description ? info.description + '\n' : ''}Best moment ${w.best.toISOString().slice(0, 16)}Z: Sun ${w.sun.elev.toFixed(1)}° high, from ${w.sun.az.toFixed(0)}°.`)}`,
      'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** RFC 5545 line folding at 75 octets. */
function foldLine(l: string): string {
  const enc = new TextEncoder(), parts: string[] = [];
  let cur = '';
  for (const ch of l) { if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ch; } else cur += ch; }
  parts.push(cur);
  return parts.join('\r\n ');
}
