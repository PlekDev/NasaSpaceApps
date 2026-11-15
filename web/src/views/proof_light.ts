/** Proof 2, "is the light model right?": our far-horizon light model against NASA's LOLA average-illumination map.
 *  Exports renderLightProof(el, data) for the Proof view and loadLightProof() to fetch the data.
 *  Data: web/public/data/light/ (web/tools/exports/light.py <- scripts/stats/light_agreement.py). No number is typed here.
 *  Charts are drawn with canvas and SVG from the design tokens, so they follow the dark and light themes.
 *  AI-assisted (Claude, Anthropic); reviewed by the team. */
import './proof_light.css';
import { esc, nf, pyFixed } from '../format';
import { getJSON } from '../data';

interface Row { label: string; n_points: number; rho_local: number; rho_far: number; mae_far: number; bias: number; loa_low: number; loa_high: number; psr_iou: number }
interface Summary { sites: Record<string, Row>; overall: { n_sites: number; rho_far: [number, number]; bias: [number, number]; mae_far: [number, number]; loa_widest: [number, number] }; settings: Record<string, unknown>; model_settings: { spacing_m: number; n_azimuths: number; max_distance_m: number }; source: string }
interface Site {
  target: string; label: string; n_points: number;
  spearman_rho: { local_flat: number; far_curved: number }; mean_abs_error: { local_flat: number; far_curved: number };
  bland_altman: { bias: number; sd: number; loa_low: number; loa_high: number; share_within_loa: number; n: number; points: [number, number][] };
  density: { bins: number; cells: [number, number, number][]; max_count: number };
  residual_map: { ny: number; nx: number; cell_m: number; model_minus_nasa: (number | null)[][]; nasa: (number | null)[][]; model: (number | null)[][]; abs_max: number };
  ray_reach: { share_rays_shorter_than_max: number; median_ray_km: number; outward_ray_km_min: number; outward_ray_km_max: number } | null;
  psr: { nasa_psr_share: number; model_psr_share: number; agreement: number; precision: number; recall: number; iou: number };
}
export interface LightData { summary: Summary; site: (id: string) => Promise<Site> }

export async function loadLightProof(): Promise<LightData> {
  return { summary: await getJSON<Summary>('light/summary'), site: id => getJSON<Site>(`light/${id}`) };
}

const short = (label: string) => (label.includes('·') ? label.split('·')[1] : label).split('(')[0].trim();
const pp = (x: number, d = 1) => pyFixed(x * 100, d);                    // fraction of time lit -> percentage points
const signed = (x: number, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + pyFixed(Math.abs(x) * 100, d);
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = (hex: string): [number, number, number] => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: [number, number, number], b: [number, number, number], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

function canvas(host: HTMLElement, w: number, h: number) {
  const c = host.querySelector('canvas') ?? host.appendChild(document.createElement('canvas'));
  const r = Math.min(devicePixelRatio || 1, 2);
  c.width = w * r; c.height = h * r; c.style.aspectRatio = `${w} / ${h}`;
  const g = c.getContext('2d')!; g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, w, h);
  return g;
}

/** Binned scatter: modelled lit time (x) against NASA's (y). A perfect model sits on the diagonal. */
function drawDensity(host: HTMLElement, s: Site) {
  const W = 320, P = 34, S = W - P - 22, g = canvas(host, W, W), n = s.density.bins, cell = S / n;
  const lo = rgb(css('--panel-solid') || '#0f1520'), hi = rgb(css('--accent') || '#3987e5'), top = Math.log1p(s.density.max_count);
  for (const [i, j, c] of s.density.cells) { g.fillStyle = mix(lo, hi, 0.18 + 0.82 * Math.log1p(c) / top); g.fillRect(P + i * cell, 8 + S - (j + 1) * cell, cell + 0.5, cell + 0.5); }
  g.strokeStyle = css('--text-3'); g.lineWidth = 1; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(P, 8 + S); g.lineTo(P + S, 8); g.stroke(); g.setLineDash([]);
  g.strokeStyle = css('--line-strong'); g.strokeRect(P + 0.5, 8.5, S, S);
  g.fillStyle = css('--text-3'); g.font = '11px Inter, sans-serif'; g.textAlign = 'center';
  for (const v of [0, 0.5, 1]) { g.fillText(`${v * 100}`, P + v * S, W - 14); g.textAlign = 'right'; g.fillText(`${v * 100}`, P - 5, 8 + S - v * S + 4); g.textAlign = 'center'; }
  g.fillText('our model · % of time lit', P + S / 2, W - 1);
  g.save(); g.translate(9, 8 + S / 2); g.rotate(-Math.PI / 2); g.fillText('NASA LOLA · % of time lit', 0, 0); g.restore();
  host.querySelector('canvas')!.setAttribute('aria-label', `Density of modelled against NASA lit time for ${short(s.label)}: Spearman rho ${s.spearman_rho.far_curved.toFixed(2)} over ${nf(s.n_points)} points`);
}

/** Bland-Altman: difference (model - NASA) against the mean of the two, with the bias and the 95 % limits of agreement. */
function blandAltman(s: Site): string {
  const W = 320, H = 320, L = 40, R = 8, T = 10, B = 34, b = s.bland_altman;
  const span = Math.max(0.12, Math.ceil(Math.max(Math.abs(b.loa_low), Math.abs(b.loa_high), ...b.points.map(p => Math.abs(p[1]))) * 20) / 20);
  const x = (v: number) => L + v * (W - L - R), y = (v: number) => T + (1 - (v + span) / (2 * span)) * (H - T - B);
  const pts = b.points.map(p => `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(Math.max(-span, Math.min(span, p[1]))).toFixed(1)}" r="1.6"/>`).join('');
  const line = (v: number, cls: string, label: string) => `<line class="${cls}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="plight-t ${cls}" x="${W - R - 4}" y="${y(v) - 4}" text-anchor="end">${label}</text>`;
  const yt = [-span, 0, span].map(v => `<text class="plight-t" x="${L - 5}" y="${y(v) + 4}" text-anchor="end">${signed(v, 0)}</text>`).join('');
  const xt = [0, 0.5, 1].map(v => `<text class="plight-t" x="${x(v)}" y="${H - 18}" text-anchor="middle">${v * 100}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bland-Altman plot for ${esc(short(s.label))}: bias ${signed(b.bias)} points, 95 % limits of agreement ${signed(b.loa_low)} to ${signed(b.loa_high)} points">
    <rect class="plight-frame" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    <line class="plight-zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/><g class="plight-pts">${pts}</g>
    ${line(b.loa_high, 'plight-loa', `+1.96 sd · ${signed(b.loa_high)}`)}${line(b.bias, 'plight-bias', `bias · ${signed(b.bias)}`)}${line(b.loa_low, 'plight-loa', `−1.96 sd · ${signed(b.loa_low)}`)}
    ${yt}${xt}<text class="plight-t" x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle">mean of model and NASA · % of time lit</text>
    <text class="plight-t" transform="translate(10 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">model − NASA · points</text></svg>`;
}

/** Three small maps on the site grid, north up: NASA, our model, and where they differ. */
function drawMaps(host: HTMLElement, s: Site) {
  const m = s.residual_map, px = Math.max(2, Math.floor(150 / Math.max(m.nx, m.ny))), w = m.nx * px, h = m.ny * px;
  const dark = rgb(css('--space') || '#05070b'), light = rgb('#f2f4f8'), cold = rgb(css('--accent') || '#3987e5'), warm = rgb(css('--warn') || '#d9a548'), mid = rgb(css('--panel-solid') || '#0f1520');
  const paint = (sel: string, a: (number | null)[][], col: (v: number) => string) => {
    const g = canvas(host.querySelector<HTMLElement>(sel)!, w, h);
    a.forEach((row, r) => row.forEach((v, c) => { if (v == null) return; g.fillStyle = col(v); g.fillRect(c * px, r * px, px, px); }));
  };
  paint('.plight-m-nasa', m.nasa, v => mix(dark, light, v));
  paint('.plight-m-model', m.model, v => mix(dark, light, v));
  paint('.plight-m-res', m.model_minus_nasa, v => { const t = Math.max(-1, Math.min(1, v / (m.abs_max || 1))); return t < 0 ? mix(mid, cold, -t) : mix(mid, warm, t); });
}

function barsHTML(d: Summary, on: string) {
  return Object.entries(d.sites).map(([id, r]) => `<button class="plight-site${id === on ? ' is-on' : ''}" data-site="${id}" aria-pressed="${id === on}">
      <span class="plight-sname">${esc(short(r.label))}</span>
      <span class="plight-bars" aria-hidden="true"><i class="plight-b-local" style="width:${r.rho_local * 100}%"></i><i class="plight-b-far" style="width:${r.rho_far * 100}%"></i></span>
      <span class="plight-rho tnum"><b>${r.rho_far.toFixed(2)}</b><small>local ${r.rho_local.toFixed(2)}</small></span></button>`).join('');
}

export function renderLightProof(el: HTMLElement, data: LightData) {
  const d = data.summary, o = d.overall, ids = Object.keys(d.sites), ms = d.model_settings, far = `${pyFixed(ms.max_distance_m / 1000, 0)} km`;
  let on = ids[0], cur: Site | null = null;
  el.innerHTML = `<div class="plight">
    <p class="plight-claim">Our light model reproduces NASA's own illumination map at all ${o.n_sites} Moon Base sites: Spearman ρ ${o.rho_far[0].toFixed(2)}–${o.rho_far[1].toFixed(2)}, with a mean error of ${pp(o.mae_far[0])}–${pp(o.mae_far[1])} points of lit time.</p>
    <div class="plight-grid">
      <div class="plight-sites" role="group" aria-label="Moon Base site">
        <p class="label">ρ against NASA · <span class="plight-key"><i class="plight-b-far"></i>terrain up to ${far}</span> <span class="plight-key"><i class="plight-b-local"></i>local terrain only</span></p>
        <div id="plight-bars">${barsHTML(d, on)}</div>
      </div>
      <figure class="plight-fig"><div class="plight-density"></div><figcaption>Each cell counts points with that modelled and NASA lit time. On the dashed diagonal the two agree.</figcaption></figure>
      <figure class="plight-fig"><div class="plight-ba"></div><figcaption id="plight-ba-cap"></figcaption></figure>
    </div>
    <div class="plight-maps" aria-label="Maps of the site, north up">
      <figure><div class="plight-m-nasa"></div><figcaption>NASA LOLA, share of time lit</figcaption></figure>
      <figure><div class="plight-m-model"></div><figcaption>Our model</figcaption></figure>
      <figure><div class="plight-m-res"></div><figcaption id="plight-res-cap"></figcaption></figure>
    </div>
    <div id="plight-facts" class="plight-facts"></div>
    <details class="plight-more"><summary>Read more: how this is measured</summary>
      <p>For target points every ${pyFixed(ms.spacing_m, 0)} m we trace ${ms.n_azimuths} horizon directions over NASA's polar elevation model, up to ${far} away on the curved Moon, and average the visible share of the Sun's disk over the Sun's positions through the lunar year. NASA's map (Mazarico et al.) averages a full precession cycle of the Moon. Spearman ρ compares the ranking of the points; the Bland-Altman plot shows the size and the sign of the difference, which a correlation hides.</p>
      <p>The limits of agreement are the bias ± 1.96 standard deviations of the differences: about 95 % of the points fall inside them. A negative bias means our model is slightly darker than NASA's.</p>
      <p class="note">${esc(d.source)}</p></details>
  </div>`;
  const draw = () => {
    if (!cur) return;
    const s = cur, b = s.bland_altman;
    drawDensity(el.querySelector<HTMLElement>('.plight-density')!, s);
    el.querySelector('.plight-ba')!.innerHTML = blandAltman(s);
    el.querySelector('#plight-ba-cap')!.textContent = `Difference against mean. Bias ${signed(b.bias)} points; ${pyFixed(b.share_within_loa * 100, 0)} % of ${nf(b.n)} points lie between ${signed(b.loa_low)} and ${signed(b.loa_high)} (${nf(b.points.length)} shown).`;
    drawMaps(el, s);
    el.querySelector('#plight-res-cap')!.textContent = `Model − NASA: blue darker, amber brighter (up to ±${pp(s.residual_map.abs_max, 0)} points)`;
    const rr = s.ray_reach, p = s.psr;
    el.querySelector('#plight-facts')!.innerHTML = `
      <div><span class="label">Points compared</span><b class="tnum">${nf(s.n_points)}</b></div>
      <div><span class="label">Mean error</span><b class="tnum">${pp(s.mean_abs_error.far_curved)} points</b><small>local terrain only: ${pp(s.mean_abs_error.local_flat)}</small></div>
      ${rr ? `<div><span class="label">Reach of the horizon rays</span><b class="tnum">${pyFixed(rr.median_ray_km, 0)} km median</b><small>${pyFixed(rr.share_rays_shorter_than_max * 100, 0)} % end at the edge of NASA's elevation model before ${far}</small></div>` : ''}
      <div><span class="label">Permanent shadow vs NASA</span><b class="tnum">overlap ${p.iou.toFixed(2)}</b><small>${pyFixed(p.agreement * 100, 1)} % of points agree; shadow covers ${pyFixed(p.nasa_psr_share * 100, 1)} % of the site</small></div>`;
  };
  const pick = async (id: string) => {
    on = id;
    el.querySelectorAll<HTMLElement>('.plight-site').forEach(b => { const a = b.dataset.site === id; b.classList.toggle('is-on', a); b.setAttribute('aria-pressed', String(a)); });
    cur = await data.site(id); draw();
  };
  el.querySelector('#plight-bars')!.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.plight-site'); if (b?.dataset.site) void pick(b.dataset.site); });
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });   // canvases repaint in the new theme
  void pick(on);
}
