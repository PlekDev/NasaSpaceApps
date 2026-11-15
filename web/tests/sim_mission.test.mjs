// The Mission view (web/src/views/mission/sim.ts) uses the validated core for shadows and each window's up_az for
// Sun directions, and only searches future dates. AI-assisted (Claude); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../src/sim/index.ts';
import * as M from '../src/views/mission/sim.ts';

const SIM = new URL('../../data/processed/sim/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('moon_malapert.json', SIM), 'utf8'));
const buf = f => { const b = readFileSync(new URL(f, SIM)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const gc = core.decodeGrid(buf(meta.grid.file), meta.grid), gm = M.decodeGrid(buf(meta.grid.file), meta.grid);

test('shadows fall away from the Sun (pillar test) and match the validated core cell for cell', () => {
  const n = 41, z = new Float32Array(n * n); z[20 * n + 20] = 500;
  const g = { z, rows: n, cols: n, dx: 30, min: 0, max: 500 };
  const centroid = m => { let r = 0, c = 0, k = 0; m.forEach((v, i) => { if (v) { r += (i / n) | 0; c += i % n; k++; } }); return [r / k, c / k]; };
  assert.ok(centroid(M.castShadow(g, 10, 0))[0] > 20, 'Sun from north (grid up): shadow towards the bottom');
  assert.ok(centroid(M.castShadow(g, 10, 90))[1] < 20, 'Sun from east: shadow towards the left');
  for (const [e, a] of [[2, 0], [3, 45], [5, 135], [2.5, 213.7], [6, 301]]) assert.deepEqual(M.castShadow(gm, e, a), core.castShadow(gc, e, a), `elev ${e} az ${a}`);
});

test('Sun azimuths go to the grid frame with up_az, never mirrored by hemisphere', () => {
  assert.equal(M.toGridAz(10, 355), 15); assert.equal(M.toGridAz(0), 0); assert.equal(M.toGridAz(90, 0), 90);
  const s = M.sunFromHourAngle(meta.grid.lat, 90, 0, undefined, meta.grid.up_az), c = core.sunFromHourAngle(meta.grid.lat, 90, 0);
  assert.ok(core.azDiff(s.azDeg, c.az) < 1e-6, 'same geographic azimuth as the core');
  assert.ok(core.azDiff(s.gridAzDeg, core.toGridAz(c.az, meta.grid.up_az)) < 1e-6, 'same grid azimuth as the core');
});

test('rehearsal dates are in the future and their Sun meets the rules in the Earth grid frame', () => {
  const w = meta.windows[0], ge = M.decodeGrid(buf(w.file), w), now = Date.now();
  const tSun = M.sunFromHourAngle(meta.grid.lat, 90, 0, undefined, meta.grid.up_az);
  const route = M.routeBetween(gm, M.castShadow(gm, Math.max(tSun.elevDeg, 0.5), tSun.gridAzDeg), [0.85, 0.12], [0.15, 0.88]).route;
  const plan = M.rehearse({ targetGrid: gm, targetRoute: route, targetSun: { elevDeg: Math.max(tSun.elevDeg, 0.5), gridAzDeg: tSun.gridAzDeg },
    earthGrid: ge, earthLat: w.lat, earthLon: w.lon, earthUpAzDeg: w.up_az, days: 120, stepMin: 20, maxResults: 4 });
  assert.ok(plan.windows.length > 0);
  for (const x of plan.windows) {
    const t = Date.parse(x.peakIso);
    assert.ok(t >= now - 86_400_000, `${x.peakIso} is in the past`);
    if (plan.exactAzimuthMatch) {
      const s = core.solarPosition(w.lat, w.lon, new Date(t));
      assert.ok(core.azDiff(core.toGridAz(s.az, w.up_az), tSun.gridAzDeg) <= 10.5, x.peakIso);
    }
  }
});
