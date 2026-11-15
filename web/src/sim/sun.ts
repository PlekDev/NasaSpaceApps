/** Where the Sun is, for Mission Rehearsal.
 *
 * - solarPosition: Earth Sun for a place and a UTC time, the NOAA General Solar Position algorithm (~0.01°), a port of
 *   scripts/extras/common.solar_position (no refraction, which shifts the horizon by ~0.5°).
 * - solarElevationSimple / lowSunHoursByMonth: the simpler model of pen/sun.py behind "Analog in time".
 * - sunFromHourAngle: Sun of any body from its subsolar latitude and the local hour angle (same spherical formula).
 *   At a lunar south-pole site (85–89.5°S) the subsolar latitude stays within ±1.54°, so over a lunar day the Sun goes
 *   once around the horizon and its elevation follows the azimuth: about −5° to +6.5° (docs/EXTRAS.md).
 * Azimuths are degrees clockwise from geographic north; toGridAz turns one into the frame of a terrain window.
 * Parity with Python: web/tests/sim_sun.test.mjs. AI-assisted (Claude); reviewed by the author. */

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
export interface SunPos { elev: number; az: number }

/** Maximum subsolar latitude: the tilt of each body's equator to its orbit around the Sun (degrees). */
export const MAX_SUBSOLAR_LAT = { moon: 1.54, mars: 25.19, earth: 23.44 } as const;

/** NOAA terms for a UTC instant at a longitude: solar declination and hour angle (degrees). */
function noaa(t: Date, lon: number): { decl: number; ha: number } {
  const sec = Math.floor(t.getTime() / 1000);         // numpy datetime64[s]
  const jd = sec / 86400 + 2440587.5, jc = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * jc)
    + Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) * DEG;
  const y = Math.tan(eps / 2 * RAD) ** 2, L0r = L0 * RAD;
  const eqt = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const minutes = (((sec % 86400) + 86400) % 86400) / 60;
  const tst = (((minutes + eqt + 4 * lon) % 1440) + 1440) % 1440;
  return { decl, ha: tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180 };
}

/** NOAA solar position (scripts/extras/common.solar_position) for a UTC instant. */
export function solarPosition(lat: number, lon: number, t: Date): SunPos {
  const { decl, ha } = noaa(t, lon);
  return horizontal(lat, decl, ha);
}

/** Elevation and azimuth from latitude, solar declination (= subsolar latitude) and hour angle, all in degrees. */
function horizontal(lat: number, decl: number, ha: number): SunPos {
  const latr = lat * RAD, dr = decl * RAD, har = ha * RAD;
  const cosz = Math.min(1, Math.max(-1, Math.sin(latr) * Math.sin(dr) + Math.cos(latr) * Math.cos(dr) * Math.cos(har)));
  const elev = 90 - Math.acos(cosz) * DEG;
  const az = Math.atan2(Math.sin(har), Math.cos(har) * Math.sin(latr) - Math.tan(dr) * Math.cos(latr)) * DEG + 180;
  return { elev, az: ((az % 360) + 360) % 360 };
}

/** Sun of any body (Moon, Mars) at a site, from the local hour angle (0 = local noon) and the subsolar latitude. */
export function sunFromHourAngle(lat: number, hourAngle: number, subsolarLat = 0): SunPos {
  return horizontal(lat, subsolarLat, hourAngle);
}

/** One full local day of the Sun at a site, every `step` degrees of hour angle (for sliders and "Play"). */
export function sunDay(lat: number, subsolarLat = 0, step = 2): (SunPos & { hourAngle: number })[] {
  const out: (SunPos & { hourAngle: number })[] = [];
  for (let h = -180; h < 180; h += step) out.push({ hourAngle: h, ...sunFromHourAngle(lat, h, subsolarLat) });
  return out;
}

/** Highest and lowest Sun over a whole year at a site (all hour angles and subsolar latitudes up to ±max). */
export function sunRange(lat: number, maxSubsolar: number): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let d = -maxSubsolar; d <= maxSubsolar + 1e-9; d += maxSubsolar / 10 || 1)
    for (let h = -180; h <= 180; h += 1) { const e = sunFromHourAngle(lat, h, d).elev; if (e < min) min = e; if (e > max) max = e; }
  return { min, max };
}

/** pen/sun.solar_elevation: simple declination model, local solar hours. */
export function solarElevationSimple(lat: number, dayOfYear: number, hour: number): number {
  const dec = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
  const latr = lat * RAD, h = (hour - 12) * 15 * RAD;
  return Math.asin(Math.sin(latr) * Math.sin(dec) + Math.cos(latr) * Math.cos(dec) * Math.cos(h)) * DEG;
}

/** pen/sun.low_sun_hours_by_month: mean hours per day with the Sun between emin and emax, by month (12 values). */
export function lowSunHoursByMonth(lat: number, emin = 0, emax = 7, stepH = 0.05): number[] {
  const out: number[] = [], nh = Math.round(24 / stepH);
  for (let m = 0; m < 12; m++) {
    const d0 = Math.trunc(m * 30.4) + 1, d1 = Math.trunc((m + 1) * 30.4) + 1;
    let tot = 0;
    for (let d = d0; d < d1; d++) {
      let k = 0;
      for (let i = 0; i < nh; i++) { const e = solarElevationSimple(lat, d, i * stepH); if (e >= emin && e <= emax) k++; }
      tot += k * stepH;
    }
    out.push(tot / (d1 - d0));
  }
  return out;
}

/** Geographic azimuth -> azimuth in a window's frame (clockwise from the grid's up edge); upAz from sim/<target>.json. */
export function toGridAz(azGeo: number, upAz: number): number { return (((azGeo - upAz) % 360) + 360) % 360; }

/** Smallest difference between two azimuths, 0–180°. */
export function azDiff(a: number, b: number): number { const d = Math.abs((((a - b) % 360) + 540) % 360 - 180); return d; }

/** Local apparent solar time (hours 0–24) at a longitude, for labels ("06:40 local solar time"). */
export function localSolarHours(t: Date, lon: number): number {
  return ((noaa(t, lon).ha / 15 + 12) % 24 + 24) % 24;
}
