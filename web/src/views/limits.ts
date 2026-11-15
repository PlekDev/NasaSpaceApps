/** "Limits": where the analogy breaks. Temperature on one kelvin scale (Moon measured, Mars modelled, Earth measured),
 *  ice, air, gravity, minerals and a fidelity matrix per pair of sites. Every number comes from web/public/data/limits/
 *  (web/tools/exports/limits.py); nothing is typed here. AI-assisted (Claude, Anthropic); reviewed by the team. */
import './limits.css';
import { esc, pyFixed } from '../format';
import { getJSON } from '../data';
import type { Manifest } from '../types';

type Lvl = 'yes' | 'partial' | 'no' | 'na';
interface Thermal { source: string; measured: boolean; mean_K: number; min_K: number; max_K: number; note: string }
interface ScaleTarget extends Thermal { id: string; body: string; name: string }
interface RegionRow { id: string; name: string; lst: { mean_K: number | null; min_K: number | null; max_K: number | null; n_windows: number };
  power: { mean_K: number; min_K: number; max_K: number }; emit: (Record<string, number | null> & { n_windows: number }) | null }
interface Scale { earth_record_low_K: number; rules: Record<string, string>; targets: ScaleTarget[]; regions: RegionRow[]; sources: Record<string, string> }
interface Cell { level: Lvl; score?: number; gap_K?: number | null; earth_mean_K?: number; earth_source?: string; note?: string; clays?: number | null; carbonates?: number | null }
interface FRow { site: string; name: string; i: number; j: number; lat: number; lon: number; score_combined: number; thermal: Cell; minerals: Cell; gravity: Cell; atmosphere: Cell; [dim: string]: unknown }
interface Limits {
  target: string; body: string; name: string; dims: string[]; fidelity: FRow[];
  thermal: { target: Thermal | null; earth_record_low_K: number; coldest_earth_region: { id: string; name: string; mean_K: number }; gap_to_coldest_earth_K: number | null };
  gravity: { target_m_s2: number; earth_m_s2: number; ratio: number };
  atmosphere: { kind: string; pressure_Pa?: number; pressure_range_Pa?: [number, number]; earth_pressure_Pa: number; water_triple_point_Pa?: number; share_of_earth?: number; share_above_freezing?: number };
  ice?: { share_stable_within_1m: number; share_stable_at_surface: number; median_depth_m: number | null; share_below_110K: number; share_colder_than_earth_record: number; n_facets: number };
}

const K_MIN = 0, K_MAX = 360;
const pos = (k: number) => `${((Math.min(Math.max(k, K_MIN), K_MAX) - K_MIN) / (K_MAX - K_MIN)) * 100}%`;
const k0 = (k: number) => pyFixed(k, 0);
const pct = (x: number, d = 0) => `${pyFixed(x * 100, d)} %`;
const WORD: Record<Lvl, string> = { yes: 'Yes', partial: 'Partly', no: 'No', na: 'No data' };
const MARK: Record<Lvl, string> = { yes: '✓', partial: '~', no: '✕', na: '–' };
const chip = (l: Lvl, text: string) => `<span class="limits-chip limits-${l}"><b aria-hidden="true">${MARK[l]}</b> ${WORD[l]}${text ? `<i>${esc(text)}</i>` : ''}</span>`;

/** One row of the shared kelvin scale: a bar from coldest to hottest and a dot at the mean. */
let REC = 0;   // Earth's record low (K), set from the data before the rows are drawn
function bar(name: string, kind: 'moon' | 'mars' | 'earth', lo: number, mid: number, hi: number, on: boolean, tag: string) {
  return `<div class="limits-row${on ? ' is-on' : ''}" role="listitem" aria-label="${esc(name)}: mean ${k0(mid)} K, from ${k0(lo)} K to ${k0(hi)} K (${esc(tag)})">
    <span class="limits-name">${esc(name)}</span>
    <span class="limits-track"><i class="limits-recline" style="left:${pos(REC)}"></i><i class="limits-bar limits-${kind}" style="left:${pos(lo)};right:calc(100% - ${pos(hi)})"></i><i class="limits-dot limits-${kind}" style="left:${pos(mid)}"></i></span>
    <span class="limits-val tnum">${k0(mid)} K</span></div>`;
}

function thermalHTML(s: Scale, sel: string) {
  REC = s.earth_record_low_K;
  const rows = [
    ...s.targets.filter(t => t.body === 'moon').map(t => bar(t.name, 'moon', t.min_K, t.mean_K, t.max_K, t.id === sel, 'Moon, measured')),
    ...s.targets.filter(t => t.body === 'mars').map(t => bar(t.name, 'mars', t.min_K, t.mean_K, t.max_K, t.id === sel, 'Mars, modelled')),
    ...s.regions.map(r => r.lst.mean_K != null && r.lst.min_K != null && r.lst.max_K != null
      ? bar(r.name, 'earth', r.lst.min_K, r.lst.mean_K, r.lst.max_K, false, 'Earth, MODIS land-surface temperature')
      : bar(r.name, 'earth', r.power.min_K, r.power.mean_K, r.power.max_K, false, 'Earth, NASA POWER')),
  ].join('');
  const ticks = [50, 100, 150, 200, 250, 300, 350].map(k => `<i style="left:${pos(k)}"><b>${k}</b></i>`).join('');
  return `<div class="limits-scale" role="list" aria-label="Temperature of every target and Earth region on one kelvin scale">
      <div class="limits-axis" aria-hidden="true"><span></span><span class="limits-track">${ticks}<em class="limits-rec" style="left:${pos(s.earth_record_low_K)}"></em></span><span></span></div>
      ${rows}
    </div>
    <p class="limits-legend"><span><i class="limits-dot limits-moon"></i>Moon · LRO Diviner (measured)</span><span><i class="limits-dot limits-mars"></i>Mars · Mars Climate Database (model)</span><span><i class="limits-dot limits-earth"></i>Earth · MODIS land-surface temperature</span><span><i class="limits-reckey"></i>Earth's record low, ${k0(s.earth_record_low_K)} K (air)</span><span>dot = mean · bar = coldest to hottest</span></p>`;
}

function factsHTML(d: Limits) {
  const t = d.thermal, cards: string[] = [];
  if (t.target && t.gap_to_coldest_earth_K != null) cards.push(`<div class="limits-card"><span class="label">Cold</span><b class="tnum">${k0(Math.abs(t.gap_to_coldest_earth_K))} K ${t.gap_to_coldest_earth_K >= 0 ? 'colder' : 'warmer'}</b>
    <p>than the coldest Earth region we search, ${esc(t.coldest_earth_region.name)} (${k0(t.coldest_earth_region.mean_K)} K). ${esc(d.name)} averages ${k0(t.target.mean_K)} K${t.target.measured ? '' : ' in the model'}.</p></div>`);
  if (d.ice) cards.push(`<div class="limits-card"><span class="label">Ice</span><b class="tnum">${pct(d.ice.share_stable_within_1m)}</b>
    <p>of the site keeps water ice stable within 1 m of the surface${d.ice.median_depth_m != null ? ` (median depth ${pyFixed(d.ice.median_depth_m * 100, 0)} cm)` : ''}. ${pct(d.ice.share_colder_than_earth_record, 1)} of it averages below Earth's record low. No Earth site has this.</p></div>`);
  const a = d.atmosphere;
  cards.push(a.pressure_Pa != null && a.share_of_earth != null
    ? `<div class="limits-card"><span class="label">Air</span><b class="tnum">${k0(a.pressure_Pa)} Pa</b><p>${pct(a.share_of_earth, 1)} of Earth's sea-level pressure${a.water_triple_point_Pa ? `, close to water's triple point (${k0(a.water_triple_point_Pa)} Pa)` : ''}. The surface is above freezing ${pct(a.share_above_freezing ?? 0)} of the time (model).</p></div>`
    : `<div class="limits-card"><span class="label">Air</span><b>Hard vacuum</b><p>No air, no weather and no scattered light: shadows are black and dust behaves differently. Earth's ${k0(a.earth_pressure_Pa / 1000)} kPa cannot be removed in the field.</p></div>`);
  cards.push(`<div class="limits-card"><span class="label">Gravity</span><b class="tnum">${pyFixed(d.gravity.target_m_s2, 2)} m/s²</b><p>${pct(d.gravity.ratio)} of Earth's ${pyFixed(d.gravity.earth_m_s2, 2)} m/s². Walking, driving and dust all change; an analog site cannot reproduce it.</p></div>`);
  return `<div class="limits-cards">${cards.join('')}</div>`;
}

function matrixHTML(d: Limits, s: Scale) {
  const dimName = (k: string) => k === 'illumination' ? 'Light' : k.charAt(0).toUpperCase() + k.slice(1);
  const head = [...d.dims.map(dimName), 'Temperature', 'Minerals', 'Gravity', 'Air'].map(h => `<th scope="col">${h}</th>`).join('');
  const body = d.fidelity.map(r => {
    const dims = d.dims.map(k => { const c = r[k] as Cell; return `<td>${chip(c.level, c.score != null ? pyFixed(c.score, 0) : '')}</td>`; }).join('');
    const th = r.thermal, mi = r.minerals;
    const miText = mi.level === 'na' ? '' : `clays ${pct(mi.clays ?? 0, 1)}, carbonates ${pct(mi.carbonates ?? 0, 1)}`;
    const dossier = `#/dossier?target=${encodeURIComponent(d.target)}&window=${encodeURIComponent(`${r.site}_${r.i}_${r.j}`)}`;
    return `<tr><th scope="row"><a class="limits-site" href="${dossier}" title="Open the mission dossier for this pair">${esc(r.name)}</a><small class="tnum">score ${pyFixed(r.score_combined, 0)} · <a href="${dossier}">dossier</a></small></th>${dims}
      <td>${chip(th.level, th.gap_K != null ? `${k0(Math.abs(th.gap_K))} K ${th.gap_K >= 0 ? 'warmer' : 'colder'}` : '')}</td>
      <td>${chip(mi.level, miText)}</td><td>${chip(r.gravity.level, '')}</td><td>${chip(r.atmosphere.level, '')}</td></tr>`;
  }).join('');
  const why = [...new Set(d.fidelity.map(r => r.minerals.level === 'na' ? r.minerals.note : undefined).filter((x): x is string => !!x))];
  const rules = Object.entries(s.rules).map(([k, v]) => `<li><b>${esc(k === 'atmosphere' ? 'air' : k === 'thermal' ? 'temperature' : k)}:</b> ${esc(v)}</li>`).join('');
  return `<div class="tbl limits-matrix"><table><caption>Fidelity of the ${d.fidelity.length} best Earth regions for ${esc(d.name)}</caption>
      <thead><tr><th scope="col">Earth region (best window)</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    ${why.length ? `<p class="note">Minerals without a verdict: ${esc(why.join('; '))}.</p>` : ''}
    <details class="limits-more"><summary>How each verdict is decided</summary><ul>${rules}</ul></details>`;
}

function mineralsHTML(s: Scale) {
  const cov = s.regions.filter(r => r.emit), miss = s.regions.filter(r => !r.emit).map(r => r.name);
  const cell = (v: number | null | undefined) => `<td class="tnum">${v == null ? '–' : pct(v, 1)}</td>`;
  const rows = cov.map(r => `<tr><th scope="row">${esc(r.name)}</th>${cell(r.emit!.clays)}${cell(r.emit!.carbonates)}${cell(r.emit!.iron_oxides)}${cell(r.emit!.sulfates)}<td class="tnum">${r.emit!.n_windows}</td></tr>`).join('');
  return `<div class="tbl"><table><caption>Surface minerals seen by NASA EMIT, median share of each 6 km window</caption>
      <thead><tr><th scope="col">Earth region</th><th scope="col">Clays</th><th scope="col">Carbonates</th><th scope="col">Iron oxides (lower bound)</th><th scope="col">Sulfates</th><th scope="col">Windows</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">EMIT observes between 52° N and 52° S, so ${esc(miss.join(', '))} have no data. It sees only the top of the surface and only ten mineral groups: lunar silicates are not among them, so it cannot say how Moon-like a site is. At Yungay in the Atacama it finds mostly clays and hematite, not the sulfates and nitrates reported from field samples, because those lie below the surface or outside EMIT's ten groups.</p>`;
}

export async function render(el: HTMLElement, m: Manifest) {
  const scale = await getJSON<Scale>('limits/scale');
  const ids = scale.targets.map(t => t.id);
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  let sel = ids.includes(q.get('target') ?? '') ? q.get('target')! : ids[0];
  const name = (id: string) => m.targets.find(t => t.id === id)?.name ?? scale.targets.find(t => t.id === id)?.name ?? id;
  const opt = (body: string, label: string) => `<optgroup label="${label}">${scale.targets.filter(t => t.body === body).map(t => `<option value="${t.id}">${esc(name(t.id))}</option>`).join('')}</optgroup>`;
  el.innerHTML = `<div class="page-in limits">
    <h1>Where the analogy breaks</h1>
    <p class="limits-lede">An analog site matches a target in some ways and never in others. P.E.N. scores terrain and low-Sun light. Here is what it does not reproduce, measured wherever a measurement exists.</p>
    <label class="limits-pick"><span class="label">Target</span><select id="limits-target" aria-label="Target site">${opt('moon', 'Moon')}${opt('mars', 'Mars')}</select></label>
    <section aria-labelledby="limits-h-fid"><h2 id="limits-h-fid">What matches and what does not</h2><div id="limits-facts"></div><div id="limits-matrix"></div></section>
    <section aria-labelledby="limits-h-temp"><h2 id="limits-h-temp">Temperature on one scale</h2>
      <p class="prose-p">Earth's coldest analog regions come close to Mars and nowhere near the Moon Base. The Moon numbers are Diviner measurements; the Mars numbers come from a climate model.</p>
      <div id="limits-thermal"></div></section>
    <section aria-labelledby="limits-h-min"><h2 id="limits-h-min">Minerals</h2>${mineralsHTML(scale)}</section>
  </div>`;
  const pick = el.querySelector<HTMLSelectElement>('#limits-target')!;
  const draw = async () => {
    const d = await getJSON<Limits>(`limits/${sel}`);
    el.querySelector('#limits-facts')!.innerHTML = factsHTML(d);
    el.querySelector('#limits-matrix')!.innerHTML = matrixHTML(d, scale);
    el.querySelector('#limits-thermal')!.innerHTML = thermalHTML(scale, sel);
  };
  pick.value = sel;
  pick.addEventListener('change', () => { sel = pick.value; void draw(); });
  await draw();
}
