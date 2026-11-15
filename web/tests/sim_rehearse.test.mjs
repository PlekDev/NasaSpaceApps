// "Rehearse this traverse on Earth": windows, fidelity and .ics on the committed Malapert ↔ Mauna Kea grids.
// AI-assisted (Claude); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeGrid } from '../src/sim/grid.ts';
import { planRoute } from '../src/sim/route.ts';
import { sunFromHourAngle, toGridAz, azDiff, solarPosition } from '../src/sim/sun.ts';
import { rehearse, earthLowSunDirections, fidelity, toICS } from '../src/sim/rehearse.ts';

const SIM = new URL('../../data/processed/sim/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('moon_malapert.json', SIM), 'utf8'));
const gridOf = g => { const b = readFileSync(new URL(g.file, SIM)); return decodeGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), g); };
const moon = gridOf(meta.grid), w = meta.windows[0], earth = gridOf(w), route = planRoute(moon);
const from = new Date('2027-01-01T00:00:00Z');

test('fidelity of identical profiles is 100, of opposite ones 0', () => {
  const a = Uint8Array.from([1, 0, 1, 1]), b = Uint8Array.from([0, 1, 0, 0]);
  assert.equal(fidelity(a, a), 100); assert.equal(fidelity(a, b), 0);
});

test('a reachable lunar Sun gives dated windows whose Earth Sun meets the rules', () => {
  // pick the lunar hour angle whose grid-frame direction Mauna Kea sees most often at low Sun
  const dirs = earthLowSunDirections(w.lat, w.lon, w.up_az, { from, days: 365, stepMin: 20 });
  let best = 0; for (let a = 0; a < 360; a++) if (dirs[a] > dirs[best]) best = a;
  let H = 0, dmin = 999;
  for (let h = -180; h < 180; h += 1) { const s = sunFromHourAngle(meta.grid.lat, h, 0), d = azDiff(toGridAz(s.az, meta.grid.up_az), best); if (d < dmin) { dmin = d; H = h; } }
  const sun = sunFromHourAngle(meta.grid.lat, H, 0);
  const r = rehearse({ target: { grid: moon, route, sun, upAz: meta.grid.up_az }, earth: { grid: earth, lat: w.lat, lon: w.lon, upAz: w.up_az }, from, days: 365, maxWindows: 30 });
  assert.ok(r.reachable && r.windows.length > 0 && r.windows.length <= 30);
  for (const x of r.windows) {
    assert.ok(x.start <= x.best && x.best < x.end && x.start >= from);
    const s = solarPosition(w.lat, w.lon, x.best);
    assert.ok(s.elev >= 0 && s.elev <= 7, `elev ${s.elev}`);
    assert.ok(azDiff(toGridAz(s.az, w.up_az), r.targetSunGridAz) <= 10);
    assert.ok(x.fidelity >= 0 && x.fidelity <= 100);
  }
  assert.equal(r.targetProfile.length, 101);
  const ics = toICS(r.windows.slice(0, 3), { title: 'Rehearse the Malapert traverse', location: `${w.region}, ${w.place}`, lat: w.lat, lon: w.lon });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
});

test('a lunar Sun from a direction Mauna Kea never sees low is reported as not reachable, with the nearest', () => {
  const dirs = earthLowSunDirections(w.lat, w.lon, w.up_az, { from, days: 365, stepMin: 20 });
  let worst = -1;
  for (let a = 0; a < 360; a++) { let ok = true; for (let d = -12; d <= 12; d++) if (dirs[(a + d + 360) % 360] > 0) ok = false; if (ok) { worst = a; break; } }
  assert.ok(worst >= 0, 'some direction is never low at 19.8°N');
  const sun = { elev: 3, az: (worst + meta.grid.up_az) % 360 };
  const r = rehearse({ target: { grid: moon, route, sun, upAz: meta.grid.up_az }, earth: { grid: earth, lat: w.lat, lon: w.lon, upAz: w.up_az }, from, days: 365, stepMin: 20 });
  assert.equal(r.reachable, false); assert.equal(r.windows.length, 0); assert.ok(r.nearest && r.nearest.azDiff > 10);
});
