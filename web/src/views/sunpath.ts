// AI-assisted (Claude); reviewed by the author.
/** When, hands-on: the height of the Sun through one local day, month by month, for the Moon Base site, the best low-latitude Earth
 *  region and the best polar one. The band 0–7° is the lunar-pole light P.E.N. looks for; the play button runs the year.
 *  Same formula as the seasonal table (standard declination and hour angle, no refraction, no terrain). Pure functions are importable
 *  in node; mountSunPath needs a DOM. Latitudes come from the manifest; nothing is typed. */
const RAD = Math.PI / 180;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Earth's solar declination (deg) on the 15th of month m (0–11), Cooper's formula. */
export function earthDecl(m: number): number { const N = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][m]; return 23.44 * Math.sin((2 * Math.PI * (284 + N)) / 365); }
/** Sub-solar latitude on the Moon (deg): the lunar equator is tilted 1.54° to the ecliptic, so it swings ±1.54° over the year. */
export function moonDecl(m: number): number { return 1.54 * Math.sin((2 * Math.PI * (m - 2)) / 12); }
/** Sun elevation (deg) at hour angle H (deg, 0 = local noon). */
export function elevation(latDeg: number, declDeg: number, hDeg: number): number {
  const s = Math.sin(latDeg * RAD) * Math.sin(declDeg * RAD) + Math.cos(latDeg * RAD) * Math.cos(declDeg * RAD) * Math.cos(hDeg * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}
/** Hours of the local day (24 parts) with the Sun between lo and hi degrees. */
export function hoursInBand(latDeg: number, declDeg: number, lo = 0, hi = 7): number {
  let k = 0; const steps = 24 * 12;
  for (let i = 0; i < steps; i++) { const e = elevation(latDeg, declDeg, -180 + (360 * (i + .5)) / steps); if (e >= lo && e <= hi) k++; }
  return (24 * k) / steps;
}

export interface SunLine { name: string; lat: number; body: 'moon' | 'earth'; color: string }

export function mountSunPath(host: HTMLElement, lines: SunLine[], startMonth = 2) {
  const W = 780, H = 300, ml = 46, mr = 16, mt = 16, mb = 34, yMin = -12, yMax = 50;
  const x = (h: number) => ml + (h / 24) * (W - ml - mr), y = (e: number) => mt + (1 - (e - yMin) / (yMax - yMin)) * (H - mt - mb);
  const grid = [0, 10, 20, 30, 40, 50].map(e => `<line x1="${ml}" x2="${W - mr}" y1="${y(e)}" y2="${y(e)}" class="sp-g"/><text x="${ml - 8}" y="${y(e) + 4}" class="sp-t" text-anchor="end">${e}°</text>`).join('')
    + [0, 6, 12, 18, 24].map(h => `<text x="${x(h)}" y="${H - 12}" class="sp-t" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`).join('');
  host.innerHTML = `<div class="sp">
    <svg viewBox="0 0 ${W} ${H}" class="sp-svg" role="img" aria-label="Sun height through one local day for the Moon Base site and two Earth regions">
      <rect x="${ml}" y="${y(7)}" width="${W - ml - mr}" height="${y(0) - y(7)}" class="sp-band"/>
      <text x="${W - mr - 6}" y="${y(7) - 6}" class="sp-bl" text-anchor="end">0–7°: lunar-pole light</text>
      ${grid}<line x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}" class="sp-h"/>
      <clipPath id="sp-clip"><rect x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}"/></clipPath>
      <g clip-path="url(#sp-clip)">${lines.map((l, i) => `<path class="sp-l" data-i="${i}" style="stroke:${l.color}"/><path class="sp-on" data-i="${i}" style="stroke:${l.color}"/>`).join('')}</g>
    </svg>
    <div class="sp-side">
      <div class="sp-month"><span class="ex-cap">Month</span><b id="sp-m">–</b></div>
      ${lines.map((l, i) => `<div class="sp-row"><i style="background:${l.color}"></i><span>${l.name}<small>${Math.abs(l.lat).toFixed(1)}° ${l.lat >= 0 ? 'N' : 'S'}${l.body === 'moon' ? ' · Moon' : ''}</small></span><b data-h="${i}">–</b></div>`).join('')}
      <p class="sp-cap">hours a day with the Sun 0–7°${lines.some(l => l.body === 'moon') ? '; a lunar day lasts about a month, so its hours are lunar hours' : ''}.</p>
      <div class="sp-ctl"><input id="sp-r" type="range" min="0" max="11" step="1" value="${startMonth}" aria-label="Month"><button type="button" class="btn small" id="sp-play" aria-pressed="false">Play the year</button></div>
    </div></div>`;
  const r = host.querySelector<HTMLInputElement>('#sp-r')!, play = host.querySelector<HTMLButtonElement>('#sp-play')!;
  const draw = () => {
    const m = Number(r.value);
    host.querySelector('#sp-m')!.textContent = MONTHS[m];
    lines.forEach((l, i) => {
      const d = l.body === 'moon' ? moonDecl(m) : earthDecl(m);
      let full = '', band = '';
      for (let k = 0; k <= 96; k++) {
        const h = (24 * k) / 96, e = elevation(l.lat, d, (h - 12) * 15), X = x(h).toFixed(1), Y = y(e).toFixed(1);
        full += `${k ? 'L' : 'M'}${X} ${Y}`;
        band += e >= 0 && e <= 7 ? `${band.endsWith('|') || !band ? 'M' : 'L'}${X} ${Y}` : '|';
      }
      host.querySelector(`.sp-l[data-i="${i}"]`)!.setAttribute('d', full);
      host.querySelector(`.sp-on[data-i="${i}"]`)!.setAttribute('d', band.replace(/\|/g, ''));
      host.querySelector(`[data-h="${i}"]`)!.textContent = `${hoursInBand(l.lat, d).toFixed(1)} h`;
    });
  };
  draw();
  let timer = 0;
  const stop = () => { clearInterval(timer); timer = 0; play.setAttribute('aria-pressed', 'false'); play.textContent = 'Play the year'; };
  const start = () => { play.setAttribute('aria-pressed', 'true'); play.textContent = 'Pause'; timer = window.setInterval(() => { if (!host.isConnected) return stop(); r.value = String((Number(r.value) + 1) % 12); draw(); }, 800); };
  play.addEventListener('click', () => (timer ? stop() : start()));
  r.addEventListener('input', () => { stop(); draw(); });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) start();
}
