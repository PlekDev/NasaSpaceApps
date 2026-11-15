/** Mission Rehearsal core: the stable API for web/src/views/mission/ (Aaron).
 *
 *   const t = await loadSimTarget('moon_malapert');           // metadata: target grid + its 5 Earth windows
 *   const moon = await loadSimGrid(t.grid), earth = await loadSimGrid(t.windows[0]);
 *   const mask = castShadow(moon, 3, toGridAz(sun.az, t.grid.up_az));   // 1 = shadow, for the texture
 *   const r = planRoute(moon, { start: [0.8, 0.2], end: [0.2, 0.8] });  // fractions of the window, or default SW→NE
 *   const tel = telemetry(moon, r, r.layers, { sunMask: mask, sunElev: 3 });
 *   const sun = sunFromHourAngle(t.grid.lat, 30, 0);                    // target Sun (Moon/Mars)
 *   const plan = rehearse({ target: { grid: moon, route: r, sun, upAz: t.grid.up_az },
 *                           earth: { grid: earth, lat: t.windows[0].lat, lon: t.windows[0].lon, upAz: t.windows[0].up_az } });
 *   const ics = toICS(plan.windows, { title: 'Rehearse Malapert traverse', location: t.windows[0].region, ... });
 *
 * Every function is synchronous and pure except the two loaders. Grids are 200 × 200, row-major, 30 m.
 * Azimuths for castShadow / hillshade are in the window's frame (clockwise from its up edge): toGridAz(geo, up_az).
 * AI-assisted (Claude); reviewed by the author. */
import { BASE } from '../base.ts';
import { decodeGrid, type Grid, type GridMeta, type TargetMeta } from './grid.ts';

export type { Grid, GridMeta, EarthWindowMeta, TargetMeta } from './grid.ts';
export { decodeGrid, exaggerated, minOf, maxOf } from './grid.ts';
export { castShadow, shadowFraction, slopeDeg, hillshade, EIGHT_AZIMUTHS } from './shadows.ts';
export { solarPosition, sunFromHourAngle, sunDay, sunRange, solarElevationSimple, lowSunHoursByMonth, toGridAz, azDiff,
  localSolarHours, MAX_SUBSOLAR_LAT, type SunPos } from './sun.ts';
export { planRoute, routeBetween, costLayers, cellAt, fracOf, MAX_SLOPE, START, END, type Route, type CostLayers } from './route.ts';
export { telemetry, litProfile, type Telemetry } from './telemetry.ts';
export { rehearse, earthLowSunDirections, fidelity, maskFor, toICS, type RehearseInput, type RehearseWindow, type RehearseResult } from './rehearse.ts';

const SIM = `${BASE}data/sim/`;
const metaCache = new Map<string, Promise<TargetMeta>>(), gridCache = new Map<string, Promise<Grid>>();

/** sim/<target>.json: the target window and its 5 Earth windows (one per region, best first). */
export function loadSimTarget(target: string): Promise<TargetMeta> {
  if (!metaCache.has(target)) metaCache.set(target, fetch(`${SIM}${target}.json`).then(r => { if (!r.ok) throw new Error(`sim/${target}.json`); return r.json(); }));
  return metaCache.get(target)!;
}

/** Fetch and decode one 200 × 200 grid (target or Earth window) from its metadata. */
export function loadSimGrid(meta: Pick<GridMeta, 'file' | 'offset' | 'scale'>): Promise<Grid> {
  if (!gridCache.has(meta.file)) gridCache.set(meta.file, fetch(`${SIM}${meta.file}`).then(r => { if (!r.ok) throw new Error(`sim/${meta.file}`); return r.arrayBuffer(); }).then(b => decodeGrid(b, meta)));
  return gridCache.get(meta.file)!;
}
