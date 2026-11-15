// Parity of web/src/sim/route.ts + telemetry.ts with scripts/extras/rover_twin.plan (±2 %). AI-assisted (Claude); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeGrid } from '../src/sim/grid.ts';
import { planRoute } from '../src/sim/route.ts';
import { telemetry, litProfile } from '../src/sim/telemetry.ts';
import { castShadow } from '../src/sim/shadows.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/sim/parity.json', import.meta.url), 'utf8'));
const SIM = new URL('../../data/processed/sim/', import.meta.url);
const gridOf = g => { const b = readFileSync(new URL(g.file, SIM)); return decodeGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), g); };
const within = (a, b, rel, abs, msg) => assert.ok(Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs), `${msg}: ${a} vs ${b}`);

for (const g of fx.grids) test(`route and telemetry match rover_twin.py on ${g.name} (±2 %)`, () => {
  const grid = gridOf(g), r = planRoute(grid), t = telemetry(grid, r, r.layers), py = g.route, s = py.stats;
  assert.deepEqual(r.path[0], py.start); assert.deepEqual(r.path[r.path.length - 1], py.end);
  within(r.dist[r.dist.length - 1], py.length_m, 0.02, 0, 'length');
  within(t.climb_m, s.climb_m, 0.02, 5, 'climb'); within(t.descent_m, s.descent_m, 0.02, 5, 'descent');
  within(t.max_slope_deg, s.max_slope_deg, 0.02, 0.1, 'max slope'); within(t.mean_slope_deg, s.mean_slope_deg, 0.02, 0.1, 'mean slope');
  within(t.share_in_shadow, s.share_in_shadow, 0.02, 0.02, 'share in shadow'); within(t.mean_shadow_fraction, s.mean_shadow_fraction, 0.02, 0.01, 'mean shadow');
  within(t.share_window_impassable, s.share_window_impassable, 0.02, 0.001, 'impassable share');
  assert.equal(t.impassable_cells_crossed, s.impassable_cells_crossed);
  const m = castShadow(grid, 3, 213.7), t2 = telemetry(grid, r, r.layers, { sunMask: m, sunElev: 3 });
  assert.ok(t2.litShareNow >= 0 && t2.litShareNow <= 1 && t2.driveHours > t2.length_km / 0.72 - 1e-9);
  const lp = litProfile(r, grid.n, m); assert.equal(lp.length, 101);
});
