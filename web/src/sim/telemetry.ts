/** Telemetry of a rover route: the same numbers scripts/extras/rover_twin.py reports, plus Sun-specific ones.
 *
 * Python-equivalent: length, climb, descent, max/mean slope, share of the way in shadow (shadow fraction > 0.5 at 2°,
 * 8 directions), mean shadow fraction, whether impassable ground is crossed, share of the window that is impassable.
 * With a Sun (a cast-shadow mask for one elevation/azimuth) it adds:
 *   litShareNow   share of the route length that is in sunlight for that Sun
 *   solarEnergyRel relative solar energy = litShareNow × (Sun above 0°): for the vertical, Sun-tracking panels polar
 *                 rovers use, incidence barely changes with a low Sun, so energy is ~ proportional to time in light
 *   driveHours    time at `speed` (default 0.2 m/s, a VIPER-class rover), slowed linearly to half speed at MAX_SLOPE
 * These are planning numbers for comparing two drives, not a rover's power model. AI-assisted (Claude); reviewed by the author. */
import type { Grid } from './grid.ts';
import type { Route, CostLayers } from './route.ts';
import { MAX_SLOPE } from './route.ts';

export interface Telemetry {
  length_km: number; climb_m: number; descent_m: number; max_slope_deg: number; mean_slope_deg: number;
  share_in_shadow: number; mean_shadow_fraction: number; impassable_cells_crossed: boolean; share_window_impassable: number;
  litShareNow?: number; solarEnergyRel?: number; driveHours: number;
}

export function telemetry(g: Grid, route: Route, L: CostLayers, opts: { sunMask?: Uint8Array; sunElev?: number; speed?: number } = {}): Telemetry {
  const n = g.n, p = route.path, idx = p.map(([r, c]) => r * n + c);
  let climb = 0, descent = 0, maxS = -Infinity, sumS = 0, cntS = 0, inSh = 0, sumSh = 0;
  idx.forEach((k, i) => {
    if (i) { const dz = g.z[k] - g.z[idx[i - 1]]; if (dz > 0) climb += dz; else descent -= dz; }
    const s = L.slope[k]; if (Number.isFinite(s)) { maxS = Math.max(maxS, s); sumS += s; cntS++; }
    const sh = L.shadow[k]; if (sh > 0.5) inSh++; sumSh += sh;
  });
  let bad = 0; for (let k = 0; k < L.bad.length; k++) bad += L.bad[k];
  const speed = opts.speed ?? 0.2;
  let hours = 0, lit = 0, len = route.dist[route.dist.length - 1] || 0;
  for (let i = 1; i < idx.length; i++) {
    const step = route.dist[i] - route.dist[i - 1];
    const s = Math.min(L.slope[idx[i]] || 0, MAX_SLOPE);
    hours += step / (speed * (1 - 0.5 * s / MAX_SLOPE)) / 3600;
    if (opts.sunMask && !opts.sunMask[idx[i]] && !opts.sunMask[idx[i - 1]]) lit += step;
  }
  const t: Telemetry = {
    length_km: len / 1000, climb_m: climb, descent_m: descent, max_slope_deg: maxS, mean_slope_deg: sumS / Math.max(cntS, 1),
    share_in_shadow: inSh / idx.length, mean_shadow_fraction: sumSh / idx.length,
    impassable_cells_crossed: route.blocked, share_window_impassable: bad / L.bad.length, driveHours: hours,
  };
  if (opts.sunMask) {
    t.litShareNow = len ? lit / len : 0;
    t.solarEnergyRel = (opts.sunElev ?? 1) > 0 ? t.litShareNow : 0;
  }
  return t;
}

/** Lit (1) or dark (0) along a route at `samples` evenly spaced fractions of its length (used by rehearsal fidelity). */
export function litProfile(route: Route, n: number, sunMask: Uint8Array, samples = 101): Uint8Array {
  const out = new Uint8Array(samples), d = route.dist, L = d[d.length - 1] || 0;
  let j = 0;
  for (let s = 0; s < samples; s++) {
    const want = samples === 1 ? 0 : L * s / (samples - 1);
    while (j < d.length - 1 && d[j + 1] <= want) j++;
    const k = j < d.length - 1 && want - d[j] > d[j + 1] - want ? j + 1 : j;
    const [r, c] = route.path[k];
    out[s] = sunMask[r * n + c] ? 0 : 1;
  }
  return out;
}
