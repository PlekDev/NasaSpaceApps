import { BASE } from '../base.ts';
import { esc, nf, coord } from '../format.ts';
import { getJSON } from '../data.ts';
import { ramp } from '../score.ts';
import type { Manifest, Region } from '../types.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEASON_NOTE: Record<number, string> = {
  2: 'Vernal equinox · polar grazing light peaks',
  5: 'June solstice · sub-Arctic grazing light peaks',
  8: 'Autumnal equinox · polar grazing light peaks',
  11: 'December solstice · subtropical winter window',
};
// Okabe–Ito-derived categorical colours: distinguishable under common colour-vision deficiencies
const PALETTE = ['#3987e5', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442'];

interface Series {
  id: string;
  v: number[];
  r: Region;
  mean: number;
  peak: number;
  peakMonth: number;
  annualHours: number;
  lat: number;
  absLat: number;
}

const where = (r: Region) => [r.place, r.cc].filter(Boolean).join(', ');
const latFmt = (lat: number) => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;

/** Fritsch–Carlson monotone cubic Hermite spline so curves pass smoothly through every month without overshooting 0. */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    dy.push(pts[i + 1][1] - pts[i][1]);
    m.push(dy[i] / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  }
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-6) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i], b = t[i + 1] / m[i], h = Math.hypot(a, b);
      if (h > 3) {
        const s = 3 / h;
        t[i] = s * a * m[i];
        t[i + 1] = s * b * m[i];
      }
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c1x = pts[i][0] + h, c1y = pts[i][1] + t[i] * h;
    const c2x = pts[i + 1][0] - h, c2y = pts[i + 1][1] - t[i + 1] * h;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

export async function renderTime(el: HTMLElement, m: Manifest) {
  const res = await getJSON<{ low_sun_hours_by_month: Record<string, number[]> }>('results');
  const series: Series[] = Object.entries(res.low_sun_hours_by_month)
    .map(([id, v]) => {
      const r = m.regions.find(x => x.id === id);
      if (!r) return null;
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      let peak = -1, peakMonth = 0;
      v.forEach((val, idx) => { if (val > peak) { peak = val; peakMonth = idx; } });
      const lat = r.center[1];
      return { id, v, r, mean, peak, peakMonth, annualHours: Math.round(mean * 365), lat, absLat: Math.abs(lat) };
    })
    .filter((s): s is Series => s !== null)
    .sort((a, b) => b.mean - a.mean);

  const pinned = new Set(series.slice(0, 4).map(s => s.id));
  let hover: string | null = null;
  let focusId: string = series[0]?.id ?? '';
  let viewMode: 'curve' | 'heatmap' = 'curve';
  let hmSort: 'mean' | 'peak' | 'lat' = 'mean';

  const max = Math.max(...series.flatMap(s => s.v), 1);
  const narrow = el.clientWidth < 700;
  const W = narrow ? 440 : 780, H = narrow ? 340 : 400;
  const ml = narrow ? 36 : 48, mr = narrow ? 68 : 128, mt = 28, mb = 36;
  const yMax = Math.ceil(max / 2) * 2 || 2;
  const x = (i: number) => ml + (i / 11) * (W - ml - mr);
  const y = (v: number) => mt + (1 - v / yMax) * (H - mt - mb);
  const colorOf = (id: string) => {
    const k = [...pinned].indexOf(id);
    return k >= 0 ? PALETTE[k % PALETTE.length] : null;
  };
  const rampForVal = (v: number) => ramp(20 + (v / max) * 80, 20);
  const textForVal = (v: number) => (v / max > 0.525 ? '#0b0f17' : '#fff');

  const briefEntries = series.filter(s => m.briefs[s.id] && (m.briefs[s.id].brief || m.briefs[s.id].calendar || m.briefs[s.id].csv));

  el.innerHTML = `<div class="page-in wide">
    <h1>Analog in time</h1>
    <p class="lead">At the lunar south pole the Sun never climbs above ~7°. On Earth that grazing light only lasts minutes at sunrise and sunset — except at high latitudes, where it lasts for hours around the equinoxes. P.E.N. tells field teams <b>when</b> to test rover vision and EVA lighting, not just <b>where</b>.</p>

    <div class="time-grid">
      <div class="time-main">
        <section class="panel time-panel" aria-label="Seasonal low-Sun illumination">
          <header class="time-head">
            <div>
              <h2>Hours per day with the Sun 0–7° above the horizon</h2>
              <p class="tnum muted" id="time-sub">${series.length} Earth candidate regions · monthly daily average · solar elevation 0–7°</p>
            </div>
            <div class="seg" role="group" aria-label="Visualization mode">
              <button type="button" data-mode="curve" aria-pressed="true">Seasonal curves</button>
              <button type="button" data-mode="heatmap" aria-pressed="false">12-month heatmap</button>
            </div>
          </header>

          <div class="time-bar" id="time-presets">
            <div class="bulk">
              <span class="label">Presets</span>
              <button type="button" class="link" data-preset="top4">Top 4 polar</button>
              ${briefEntries.length ? `<button type="button" class="link" data-preset="briefs">Field-brief sites (${briefEntries.length})</button>` : ''}
              <button type="button" class="link" data-preset="equatorial">Low latitude</button>
              <button type="button" class="link" data-preset="all">All ${series.length}</button>
              <button type="button" class="link" data-preset="none">Clear</button>
            </div>
            <span class="muted tnum" id="pin-count"></span>
          </div>

          <figure class="chart" id="time-chart-fig">
            <figcaption class="sr-only">Monthly low-Sun hours per day (0–7° solar elevation) across the year for each Earth candidate region.</figcaption>
            <div class="chart-box">
              <svg id="tc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of monthly low-Sun hours per day for each Earth region"></svg>
              <div class="tip" id="tt" hidden></div>
            </div>
          </figure>

          <div id="time-hm-wrap" class="time-hm-wrap" hidden>
            <div class="hm-bar">
              <div class="seg" role="group" aria-label="Sort regions by">
                <button type="button" data-hmsort="mean" aria-pressed="true">Annual mean</button>
                <button type="button" data-hmsort="peak" aria-pressed="false">Peak month</button>
                <button type="button" data-hmsort="lat" aria-pressed="false">Latitude</button>
              </div>
              <span class="muted tiny">Click any region row to pin on the curve chart and inspect its profile.</span>
            </div>
            <div class="hm-scroll">
              <table class="hm time-hm" id="time-hm-tbl"></table>
            </div>
          </div>

          <footer class="time-foot">
            <p class="d-note">Standard solar declination and hour-angle formula, no refraction, by the latitude of each Earth region.</p>
            <div class="legend" aria-hidden="true">
              <span class="tnum">0.0 h</span>
              <span class="ramp"></span>
              <span class="tnum">${max.toFixed(1)} h/d</span>
            </div>
          </footer>
        </section>
      </div>

      <aside class="time-side" aria-label="Region inspector and selector">
        <section class="panel time-focus" id="time-focus" aria-label="Focused region profile"></section>
        <section class="panel time-regs" aria-label="Earth regions list">
          <header class="time-regs-h">
            <h2>Earth regions</h2>
            <p class="tnum muted">Click to pin on chart · hover to inspect</p>
          </header>
          <div class="regs" role="group" aria-label="Earth regions in the chart">
            ${series.map((s, idx) => `<button type="button" class="reg" data-id="${s.id}" aria-pressed="${pinned.has(s.id)}">
              <span class="rk tnum">${idx + 1}</span>
              <i></i>
              <span class="reg-body">
                <span class="n">${esc(s.r.name)}</span>
                <span class="dm tnum">${esc(where(s.r))}${where(s.r) ? ' · ' : ''}${latFmt(s.lat)} · Peak ${MONTHS[s.peakMonth]} (${s.peak.toFixed(1)} h)</span>
              </span>
              <span class="sc tnum">
                <span class="v">${s.mean.toFixed(1)} h</span>
                <span class="n-sub">mean/d</span>
              </span>
            </button>`).join('')}
          </div>
        </section>
      </aside>
    </div>

    ${briefEntries.length ? `<section class="vsec time-campaigns" aria-label="Field campaign windows">
      <div class="time-camp-head">
        <div>
          <h2>Field campaign windows · 2026–2027</h2>
          <p class="prose-p">For every Earth region that ranks in the top 3 analogs of a lunar polar target, P.E.N. computes the optimal 14-day low-Sun test block (01 Dec 2026 – 30 Nov 2027, NOAA solar algorithm, Sun 0–7° above the horizon) along with ready-to-import calendar files (<code>.ics</code>) and full-year window logs (<code>.csv</code>).</p>
        </div>
      </div>
      <div class="camp-grid">
        ${briefEntries.map(s => {
          const b = m.briefs[s.id];
          const minDay = b.min_day ?? Math.round(s.peak * 60);
          const block = b.block ?? `Peak month: ${MONTH_FULL[s.peakMonth]}`;
          const serves = b.serves ?? [];
          return `<article class="panel camp-card" data-camp-id="${s.id}">
            <div class="camp-top">
              <div>
                <div class="label tnum">${esc(where(s.r))} · ${latFmt(s.lat)}</div>
                <h3>${esc(s.r.name)}</h3>
              </div>
              <button type="button" class="btn small camp-pin" data-pin-id="${s.id}">Show on chart</button>
            </div>
            <div class="camp-metrics">
              <div class="camp-block">
                <span class="label">Best 14-day campaign block</span>
                <b class="tnum">${esc(block)}</b>
              </div>
              <div class="camp-dur">
                <span class="label">Sun 0–7° in block</span>
                <b class="tnum">${nf(minDay)} min/day</b>
                <span class="muted tiny tnum">(${(minDay / 60).toFixed(1)} h/day · annual mean ${s.mean.toFixed(1)} h/day)</span>
              </div>
            </div>
            <div class="mstrip camp-strip" role="img" aria-label="Monthly low-Sun profile for ${esc(s.r.name)}">
              ${s.v.map((val, mi) => `<span class="mbar-col" title="${MONTHS[mi]}: ${val.toFixed(1)} h/day"><span class="mbar-track"><i style="height:${Math.max(6, Math.round((val / max) * 100))}%;background:${val > 0 ? rampForVal(val) : 'var(--raise-2)'}"></i></span><small>${MONTHS[mi][0]}</small></span>`).join('')}
            </div>
            ${serves.length ? `<div class="camp-serves"><span class="label">Top Moon Base matches</span><div class="camp-tags">${serves.map(tag => `<span class="tag tnum">${esc(tag)}</span>`).join('')}</div></div>` : ''}
            <div class="dl-row">
              <span class="muted tiny">Field kit downloads</span>
              <span class="camp-links">
                ${b.calendar ? `<a class="link" download href="${BASE}extras/briefs/${b.calendar}">Calendar .ics</a>` : ''}
                ${b.csv ? `<a class="link" download href="${BASE}extras/briefs/${b.csv}">Low-Sun CSV</a>` : ''}
                ${b.brief ? `<a class="link" download href="${BASE}extras/briefs/${b.brief}">Field brief</a>` : ''}
              </span>
            </div>
          </article>`;
        }).join('')}
      </div>
    </section>` : ''}
  </div>`;

  const svg = el.querySelector<SVGSVGElement>('#tc')!;
  const tt = el.querySelector<HTMLElement>('#tt')!;
  const focusEl = el.querySelector<HTMLElement>('#time-focus')!;
  const pinCountEl = el.querySelector<HTMLElement>('#pin-count')!;
  const hmWrap = el.querySelector<HTMLElement>('#time-hm-wrap')!;
  const hmTbl = el.querySelector<HTMLElement>('#time-hm-tbl')!;
  const chartFig = el.querySelector<HTMLElement>('#time-chart-fig')!;

  function renderFocus() {
    const targetId = hover ?? focusId ?? [...pinned][0] ?? series[0]?.id;
    const s = series.find(x => x.id === targetId) ?? series[0];
    if (!s) return;
    const c = colorOf(s.id);
    const b = m.briefs[s.id];
    const peakMin = Math.round(s.peak * 60);
    const meanMin = Math.round(s.mean * 60);
    focusEl.innerHTML = `
      <div class="focus-head">
        <span class="label">Focused region · Seasonal profile</span>
        <span class="focus-badge tnum"><i style="background:${c ?? 'var(--accent)'}"></i>${pinned.has(s.id) ? 'Pinned' : 'Preview'}</span>
      </div>
      <div class="score">
        <b class="tnum">${s.peak.toFixed(1)}</b>
        <span>h / day peak in ${MONTHS[s.peakMonth]} (${nf(peakMin)} min)</span>
      </div>
      <div class="where">${esc(s.r.name)}</div>
      <div class="coords tnum">${esc(where(s.r))}${where(s.r) ? ' · ' : ''}${coord(s.r.center[1], s.r.center[0])}</div>
      <div class="dimrow tnum">
        <span>Mean<b>${s.mean.toFixed(1)} h/d</b> (${meanMin}m)</span>
        <span>Annual<b>${nf(s.annualHours)} h/yr</b></span>
        <span>Lat<b>${latFmt(s.lat)}</b></span>
      </div>
      <div class="mstrip" role="img" aria-label="Monthly low-Sun hours from January to December for ${esc(s.r.name)}">
        ${s.v.map((val, mi) => `<span class="mbar-col${mi === s.peakMonth ? ' is-peak' : ''}" title="${MONTHS[mi]}: ${val.toFixed(2)} h/day (${Math.round(val * 60)} min)"><span class="mbar-val tnum">${val >= 0.1 ? val.toFixed(1) : '0'}</span><span class="mbar-track"><i style="height:${Math.max(6, Math.round((val / max) * 100))}%;background:${val > 0 ? rampForVal(val) : 'var(--raise-2)'}"></i></span><small>${MONTHS[mi]}</small></span>`).join('')}
      </div>
      ${b && (b.brief || b.calendar || b.csv) ? `<div class="focus-brief">
        ${b.block ? `<div class="focus-block"><span class="label">Optimal 14-day window</span><b class="tnum">${esc(b.block)}${b.min_day ? ` · ${b.min_day} min/d` : ''}</b></div>` : ''}
        <div class="dl-row">
          <span class="muted tiny">Campaign files</span>
          <span>
            ${b.calendar ? `<a class="link" download href="${BASE}extras/briefs/${b.calendar}">Calendar .ics</a>` : ''}
            ${b.csv ? `<a class="link" download href="${BASE}extras/briefs/${b.csv}">CSV</a>` : ''}
            ${b.brief ? `<a class="link" download href="${BASE}extras/briefs/${b.brief}">Brief</a>` : ''}
          </span>
        </div>
      </div>` : ''}`;
  }

  function renderHeatmap() {
    const sorted = series.slice().sort((a, b) => {
      if (hmSort === 'peak') return b.peak - a.peak || b.mean - a.mean;
      if (hmSort === 'lat') return b.lat - a.lat;
      return b.mean - a.mean;
    });
    hmTbl.innerHTML = `<caption class="sr-only">Monthly low-Sun hours per day by Earth region</caption><thead>
      <tr>
        <th class="corner" scope="col">Region</th>
        <th scope="col" class="tnum">Lat</th>
        ${MONTHS.map(mn => `<th scope="col" class="tnum">${mn}</th>`).join('')}
        <th scope="col" class="tnum">Mean</th>
        <th scope="col" class="tnum">Peak</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map(s => {
        const isPin = pinned.has(s.id);
        return `<tr class="hm-row${isPin ? ' is-pinned' : ''}" data-hmid="${s.id}">
          <th scope="row" class="rh"><button type="button" data-hmbtn="${s.id}" title="Pin and inspect ${esc(s.r.name)}"><i class="hm-dot" style="background:${colorOf(s.id) ?? 'transparent'};border-color:${colorOf(s.id) ?? 'var(--text-3)'}"></i><span>${esc(s.r.name)}</span></button></th>
          <td class="tnum na">${latFmt(s.lat)}</td>
          ${s.v.map((val, mi) => {
            if (val < 0.05) return `<td class="tnum na" title="${esc(s.r.name)} · ${MONTHS[mi]}: 0.0 h/day">0.0</td>`;
            return `<td class="tnum" style="background:${rampForVal(val)};color:${textForVal(val)}" title="${esc(s.r.name)} · ${MONTHS[mi]}: ${val.toFixed(2)} h/day (${Math.round(val * 60)} min)">${val.toFixed(1)}</td>`;
          }).join('')}
          <td class="tnum hm-stat"><b>${s.mean.toFixed(1)}</b></td>
          <td class="tnum hm-stat">${MONTHS[s.peakMonth]} (${s.peak.toFixed(1)})</td>
        </tr>`;
      }).join('')}
    </tbody>`;
    hmTbl.querySelectorAll<HTMLButtonElement>('[data-hmbtn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.hmbtn!;
        focusId = id;
        pinned.has(id) ? pinned.delete(id) : pinned.add(id);
        draw();
      });
      btn.addEventListener('pointerenter', () => { hover = btn.dataset.hmbtn!; renderFocus(); });
      btn.addEventListener('pointerleave', () => { hover = null; renderFocus(); });
    });
  }

  function showTooltip(i: number) {
    const cx = svg.querySelector<SVGLineElement>('#cx');
    if (cx) {
      cx.removeAttribute('hidden');
      cx.setAttribute('x1', String(x(i)));
      cx.setAttribute('x2', String(x(i)));
    }
    svg.querySelectorAll<SVGCircleElement>('.pt-active').forEach(elPt => elPt.remove());
    const activeLayer = svg.querySelector<SVGGElement>('#active-pts');
    const rows = series
      .filter(s => pinned.has(s.id) || s.id === hover)
      .sort((a, b) => b.v[i] - a.v[i]);
    if (activeLayer) {
      activeLayer.innerHTML = rows.map(s => {
        const c = colorOf(s.id) ?? 'var(--text-1)';
        return `<circle class="pt-active" cx="${x(i).toFixed(1)}" cy="${y(s.v[i]).toFixed(1)}" r="5" fill="${c}" stroke="var(--panel-solid)" stroke-width="2"/>`;
      }).join('');
    }
    const season = SEASON_NOTE[i] ? `<div class="tt-season">${esc(SEASON_NOTE[i])}</div>` : '';
    tt.hidden = false;
    tt.innerHTML = `<div class="tt-head"><b>${MONTH_FULL[i]}</b><span class="muted tiny">Sun 0–7°</span></div>${season}${
      rows.map(s => `<div><i style="background:${colorOf(s.id) ?? 'var(--text-1)'}"></i><span>${esc(s.r.name)}</span><b class="tnum">${s.v[i].toFixed(1)} h <small class="muted">(${Math.round(s.v[i] * 60)}m)</small></b></div>`).join('') || '<div class="muted">Pin a region to compare</div>'
    }`;
    tt.style.left = `${Math.min((x(i) / W) * 100, narrow ? 48 : 64)}%`;
  }

  const draw = () => {
    pinCountEl.textContent = `${pinned.size} of ${series.length} pinned`;

    // 1. Defs for subtle area gradients under active curves
    const activeSeries = series.filter(s => pinned.has(s.id) || s.id === hover);
    const defs = `<defs>${activeSeries.map((s, idx) => {
      const c = colorOf(s.id) ?? '#3987e5';
      const op = s.id === hover ? 0.24 : 0.11;
      return `<linearGradient id="tg-${idx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c}" stop-opacity="${op}"/><stop offset="100%" stop-color="${c}" stop-opacity="0.0"/></linearGradient>`;
    }).join('')}</defs>`;

    // 2. Equinox & Solstice vertical reference guides
    const refMarks = [
      { i: 2, label: 'Equinox' },
      { i: 5, label: 'Solstice' },
      { i: 8, label: 'Equinox' },
      { i: 11, label: 'Solstice' },
    ].map(mRef => `<g class="ref-g">
      <line x1="${x(mRef.i).toFixed(1)}" x2="${x(mRef.i).toFixed(1)}" y1="${mt}" y2="${H - mb}" class="ref-ln"/>
      <text x="${x(mRef.i).toFixed(1)}" y="${mt - 8}" class="ax ref-tx" text-anchor="middle">${mRef.label}</text>
    </g>`).join('');

    // 3. Horizontal y-gridlines and axis labels
    const grid = Array.from({ length: yMax / 2 + 1 }, (_, i) => i * 2)
      .map(t => `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="gl"/><text x="${ml - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${t} h</text>`)
      .join('');

    // 4. Month x-axis labels
    const xs = MONTHS.map((mn, i) => `<text x="${x(i)}" y="${H - 10}" class="ax" text-anchor="middle">${mn}</text>`).join('');

    // 5. Background unpinned curves
    const rest = series
      .filter(s => !pinned.has(s.id) && s.id !== hover)
      .map(s => {
        const pts: [number, number][] = s.v.map((val, i) => [x(i), y(val)]);
        return `<path d="${monotonePath(pts)}" class="ln dim"/>`;
      })
      .join('');

    // 6. Active pinned + hovered curves with monotone spline, area fill, vertex markers, and right-hand labels
    const y0 = y(0);
    let lastY = -99;
    const sortedActive = activeSeries.slice().sort((a, b) => a.v[11] - b.v[11]);
    const areas = sortedActive.map((s) => {
      const gIdx = activeSeries.indexOf(s);
      const pts: [number, number][] = s.v.map((val, i) => [x(i), y(val)]);
      const curveD = monotonePath(pts);
      return `<path d="${curveD}L${x(11).toFixed(1)},${y0.toFixed(1)}L${x(0).toFixed(1)},${y0.toFixed(1)}Z" fill="url(#tg-${gIdx})" pointer-events="none"/>`;
    }).join('');

    const on = sortedActive.map(s => {
      const c = colorOf(s.id) ?? 'var(--text-1)';
      const last = s.v[11];
      const pts: [number, number][] = s.v.map((val, i) => [x(i), y(val)]);
      const curveD = monotonePath(pts);
      const isHov = s.id === hover;
      const dots = pts.map(([px, py], mi) => {
        const isPeak = mi === s.peakMonth && s.peak > 1.5;
        return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${isPeak ? 4 : 2.5}" fill="${c}"${isPeak ? ' stroke="var(--panel-solid)" stroke-width="1.5"' : ''}/>`;
      }).join('');
      const showLabel = (y(last) - lastY) >= 13 || isHov;
      if (showLabel) lastY = y(last);
      const shortName = s.r.name.split(' ')[0];
      return `<g>
        <path d="${curveD}" class="ln" stroke="${c}"${isHov ? ' stroke-width="3.25"' : ''}/>
        ${dots}
        ${showLabel ? `<text x="${x(11) + 8}" y="${y(last) + 4}" class="ax" fill="${c}">${esc(shortName)}</text>` : ''}
      </g>`;
    }).join('');

    svg.innerHTML = `${defs}${grid}${refMarks}${xs}<text x="${ml}" y="12" class="ax">hours/day</text>${rest}${areas}${on}<line id="cx" class="cx" y1="${mt}" y2="${H - mb}" hidden/><g id="active-pts"></g><rect id="hit" x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>`;

    el.querySelectorAll<HTMLButtonElement>('.reg').forEach(b => {
      const id = b.dataset.id!;
      const c = colorOf(id);
      const dot = b.querySelector('i') as HTMLElement;
      dot.style.background = c ?? 'transparent';
      dot.style.borderColor = c ?? 'var(--text-3)';
      b.setAttribute('aria-pressed', String(pinned.has(id)));
      b.classList.toggle('is-focus', id === (hover ?? focusId));
    });

    const hit = svg.querySelector<SVGRectElement>('#hit')!;
    const cx = svg.querySelector<SVGLineElement>('#cx')!;
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = ((e as PointerEvent).clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(11, Math.round(((px - ml) / (W - ml - mr)) * 11)));
      showTooltip(i);
    });
    hit.addEventListener('pointerleave', () => {
      cx.setAttribute('hidden', '');
      tt.hidden = true;
      const activeLayer = svg.querySelector<SVGGElement>('#active-pts');
      if (activeLayer) activeLayer.innerHTML = '';
    });

    renderFocus();
    renderHeatmap();
  };

  // Wire region list buttons
  el.querySelectorAll<HTMLButtonElement>('.reg').forEach(b => {
    const id = b.dataset.id!;
    b.addEventListener('click', () => {
      focusId = id;
      pinned.has(id) ? pinned.delete(id) : pinned.add(id);
      draw();
    });
    b.addEventListener('pointerenter', () => { hover = id; draw(); });
    b.addEventListener('pointerleave', () => { hover = null; draw(); });
    b.addEventListener('focus', () => { hover = id; draw(); });
    b.addEventListener('blur', () => { hover = null; draw(); });
  });

  // Wire visualization mode switcher (Seasonal curves vs. 12-month heatmap)
  el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.mode as 'curve' | 'heatmap';
      el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      chartFig.hidden = viewMode !== 'curve';
      hmWrap.hidden = viewMode !== 'heatmap';
    });
  });

  // Wire heatmap sort switcher
  el.querySelectorAll<HTMLButtonElement>('[data-hmsort]').forEach(btn => {
    btn.addEventListener('click', () => {
      hmSort = btn.dataset.hmsort as 'mean' | 'peak' | 'lat';
      el.querySelectorAll<HTMLButtonElement>('[data-hmsort]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      renderHeatmap();
    });
  });

  // Wire preset filter buttons
  el.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset!;
      pinned.clear();
      if (p === 'top4') {
        series.slice(0, 4).forEach(s => pinned.add(s.id));
      } else if (p === 'briefs') {
        briefEntries.forEach(s => pinned.add(s.id));
      } else if (p === 'equatorial') {
        series.filter(s => s.absLat < 36).slice(0, 6).forEach(s => pinned.add(s.id));
      } else if (p === 'all') {
        series.forEach(s => pinned.add(s.id));
      }
      if (pinned.size) focusId = [...pinned][0];
      draw();
    });
  });

  // Wire campaign card "Show on chart" buttons
  el.querySelectorAll<HTMLButtonElement>('[data-pin-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pinId!;
      pinned.add(id);
      focusId = id;
      if (viewMode !== 'curve') {
        el.querySelector<HTMLButtonElement>('[data-mode="curve"]')?.click();
      }
      draw();
      chartFig.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });

  draw();
}
