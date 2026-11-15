// Parity of web/src/sim/sun.ts with the Python solar models (±0.1°). AI-assisted (Claude); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solarPosition, solarElevationSimple, lowSunHoursByMonth, sunFromHourAngle, sunRange, toGridAz, azDiff, localSolarHours } from '../src/sim/sun.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/sim/parity.json', import.meta.url), 'utf8')).sun;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('solarPosition = NOAA in scripts/extras/common.py (±0.1°)', () => {
  for (const p of fx.noaa) fx.times.forEach((t, k) => {
    const s = solarPosition(p.lat, p.lon, new Date(t));
    close(s.elev, p.elev[k], 0.1, `elev ${p.lat},${p.lon} ${t}`);
    if (p.elev[k] > -89) assert.ok(azDiff(s.az, p.az[k]) <= 0.1, `az ${p.lat},${p.lon} ${t}: ${s.az} vs ${p.az[k]}`);
  });
});
test('solarElevationSimple and lowSunHoursByMonth = pen/sun.py', () => {
  for (const c of fx.simple) c.hours.forEach((h, k) => close(solarElevationSimple(c.lat, c.doy, h), c.elev[k], 0.1, `${c.lat} d${c.doy} h${h}`));
  lowSunHoursByMonth(fx.low_sun_hours.lat).forEach((v, m) => close(v, fx.low_sun_hours.hours[m], 0.01, `month ${m + 1}`));
});
test('lunar polar Sun: about −5° to +6.5° at 85–89.5°S, noon Sun due north', () => {
  const r85 = sunRange(-85, 1.54), r895 = sunRange(-89.5, 1.54);
  close(r85.max, 6.54, 0.05, '85°S max'); close(r85.min, -6.54, 0.05, '85°S min');
  close(r895.max, 2.04, 0.05, '89.5°S max');
  const noon = sunFromHourAngle(-86, 0, 0);
  assert.ok(azDiff(noon.az, 0) < 1e-6);
  close(noon.elev, 4, 1e-6, 'elevation at noon = colatitude');
});
test('grid-frame azimuths and local solar time', () => {
  assert.equal(toGridAz(10, 355), 15); assert.equal(azDiff(350, 10), 20); assert.equal(azDiff(90, 270), 180);
  close(localSolarHours(new Date('2026-03-20T12:00:00Z'), 0), 12, 0.15, 'Greenwich at 12 UTC');
});
