import { BASE } from '../base';
import { esc, nf, pyFixed } from '../format';
import { getJSON } from '../data';
import { ramp } from '../score';
import { figureCard, wireFigures } from './lightbox';
import { mountHeatmap } from './heatmap';
import type { Manifest } from '../types';
import { blindProof, proofLine, type Ranks } from '../proof';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ord = (n: string) => n + (/1[123]$/.test(n) ? 'th' : ({ '1': 'st', '2': 'nd', '3': 'rd' } as Record<string, string>)[n.slice(-1)] ?? 'th');
// rays toward lower latitudes that stop this short of the DEM limit mean the site sits near the edge of NASA's 85°S DEM
const EDGE_KM = 100;

export async function renderValidation(el: HTMLElement, m: Manifest) {
  const [val, far, ka, sens, div, mx, kr] = await Promise.all(['validation', 'far_horizons', 'known_analogs', 'sensitivity', 'diviner', 'matrix', 'known_ranks'].map(n => getJSON<Rec>(n)));
  const rankOf = (ref: string, site: string) => (kr as Rec)[ref]?.[site] as { rank: number; n: number } | undefined;
  const name = (id: string) => m.targets.find(t => t.id === id)?.name ?? id;
  const moonIds = m.targets.filter(t => t.body === 'moon').map(t => t.id);

  // 1 · illumination metric
  const rhoRows = Object.entries(val as Rec).map(([id, v]) => `<tr><th scope="row">${esc(name(id))}</th><td class="tnum">${v.spearman_rho.toFixed(2)}</td><td class="tnum">${nf(v.n_pixels)}</td></tr>`).join('');
  const farSites = Object.entries(far.sites as Rec), maxKm = far.settings.max_distance_m / 1000;
  const edge = farSites.filter(([, v]) => v.ray_reach && v.ray_reach.outward_ray_km_min < EDGE_KM);
  const list = (a: string[]) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const farRows = farSites.map(([id, v]) => `<tr><th scope="row">${esc(name(id))}</th><td class="tnum"><b>${v.V3_far_curved.spearman_rho.toFixed(2)}</b></td>
    <td class="tnum">±${v.V3_far_curved.mean_abs_error.toFixed(3)}</td><td class="tnum">${v.V1_local_flat.spearman_rho.toFixed(2)}</td><td class="tnum">${v.ray_reach ? `${v.ray_reach.outward_ray_km_min.toFixed(0)}–${v.ray_reach.outward_ray_km_max.toFixed(0)} km` : '—'}${edge.some(e => e[0] === id) ? ' <span class="tag">near DEM edge</span>' : ''}</td></tr>`).join('');
  const rays = edge.map(([, v]) => `${v.ray_reach.outward_ray_km_min.toFixed(0)}–${v.ray_reach.outward_ray_km_max.toFixed(0)} km`);

  const farRho = farSites.map(([, v]) => v.V3_far_curved.spearman_rho as number);
  const farRange = `${Math.min(...farRho).toFixed(2)}–${Math.max(...farRho).toFixed(2)}`;
  const proof = blindProof(kr as Ranks, m);
  const psr = farSites.filter(([, x]) => x.psr) as [string, Rec][];
  const rng = (f: (p: Rec) => number, d: number, mul = 1) => { const a = psr.map(([, x]) => f(x.psr) * mul); return `${pyFixed(Math.min(...a), d)}–${pyFixed(Math.max(...a), d)}`; };
  const psrHtml = psr.length ? `<h3>Permanent shadow, a second check against NASA</h3>
    <p class="prose-p">The same far-horizon run also says which points never see any part of the Sun. Compared with NASA's permanently-shadowed-region map (LOLA LPSR), the two agree on ${rng(p => p.agreement, 1, 100)} % of the points at every site. Permanent shadow is rare in these footprints (${rng(p => p.nasa_psr_share, 1, 100)} % of each), so the stricter number is the overlap of the two shadow masks: intersection over union ${rng(p => p.iou, 2)}.</p>
    <div class="tbl"><table><thead><tr><th>Target</th><th>NASA shadow</th><th>Our shadow</th><th>Agreement</th><th>Precision</th><th>Recall</th><th>IoU</th></tr></thead><tbody>${psr.map(([id, x]) => `<tr><th scope="row">${esc(name(id))}</th>${[x.psr.nasa_psr_share, x.psr.model_psr_share].map((q: number) => `<td class="tnum">${pyFixed(q * 100, 1)} %</td>`).join('')}<td class="tnum">${pyFixed(x.psr.agreement * 100, 1)} %</td><td class="tnum">${x.psr.precision.toFixed(2)}</td><td class="tnum">${x.psr.recall.toFixed(2)}</td><td class="tnum"><b>${x.psr.iou.toFixed(2)}</b></td></tr>`).join('')}</tbody></table></div>
    <p class="note">Share of points in permanent shadow, as a share of each footprint. Points are sampled every 240 m against NASA's 60 m map, and we use 1,728 Sun positions where NASA uses hourly steps over 18.6 years, so small or marginal shadows differ.</p>` : '';

  // 2 · known analogs
  const s = ka.summary, rows = ka.rows as Rec[];
  const hiw = rows.filter(r => /hiwahine/i.test(r.site)).sort((a, b) => (rankOf(a.reference, a.site)?.rank ?? 1e9) - (rankOf(b.reference, b.site)?.rank ?? 1e9));
  const top = (p: number) => (100 - p) < 0.05 ? 'top < 0.1 %' : `top ${(100 - p).toFixed(1)} %`;

  // the blind-rediscovery callout is about the lunar targets only: Pu'u Hiwahine is a lunar-polar test site, not a Mars analog
  const hiwMoon = hiw.filter(r => moonIds.includes(r.reference));

  // 3 · sensitivity
  const W = sens.illumination_weight as number[], iLo = W.indexOf(0.5), iHi = W.indexOf(2);
  const ov = sens.top10_overlap_vs_equal as Record<string, number[]>;
  const mins = Object.entries(ov).map(([id, a]) => [id, Math.min(a[iLo], a[iHi])] as [string, number]);
  const lo = Math.min(...mins.map(x => x[1])), hiCount = mins.filter(x => x[1] >= 7).length, lowest = mins.filter(x => x[1] === lo).map(x => name(x[0]));

  // 4 · Diviner
  const shares = Object.values(div.sites as Rec).map((v: Rec) => v.share_colder_than_earth_record * 100);

  el.innerHTML = `<div class="page-in wide"><h1>Validation</h1>
  <p class="lead">What the numbers on the map are worth. In short: P.E.N. finds NASA's own lunar test site on Earth without being told about it, and its light model matches NASA's illumination maps with Spearman ρ = ${farRange} once distant mountains are included.</p>

  <section class="vsec"><h2>1 · Does it find NASA's own test site, blind?</h2>
    ${hiwMoon.length ? `<div class="callout"><h3>Blind rediscovery</h3><p>Pu'u Hiwahine on Mauna Kea is where NASA, CSA and DLR rehearsed a lunar-polar prospecting mission in 2012 (PISCES ISRU field test). P.E.N. was never told about it, yet it comes out ${proof ? proofLine(proof) : 'near the top for every lunar target'}.</p>
      <div class="rank-list">${hiwMoon.map(r => { const k = rankOf(r.reference, r.site); return `<div class="rk-row"><span>${esc(name(r.reference))}</span><span class="rk-bar"><i style="width:${r.score_combined_pct_best}%;background:${ramp(r.score_combined_pct_best, 20)}"></i></span><b class="tnum">${k ? `#${nf(k.rank)} of ${nf(k.n)}` : ''}</b><span class="tnum muted">${top(r.score_combined_pct_best)}</span></div>`; }).join('')}</div></div>` : ''}
    <p class="prose-p">Across all ${s.n_tests} tests of classic NASA analog sites inside our regions against every target, the best window containing the site has a median rank at the <b>${ord(pyFixed(s.median_percentile_illumination_best))} percentile</b> in illumination and the <b>${ord(pyFixed(s.median_percentile_terrain_best))}</b> in terrain (50 = random).</p>
    <p class="note">Sites chosen for other reasons rank lower, as they should: Meteor Crater is an impact-geology analog and University Valley a dry-permafrost (thermal) analog, not terrain-and-light analogs. The table lists every site and target, Mars included.</p>
    <div class="tbl scroll sortable" id="kt"></div></section>

  <section class="vsec"><h2>2 · Is the light model right?</h2>
    <p class="prose-p">We recompute the light at each lunar site with NASA's 40 m polar DEM, tracing horizons up to ${maxKm.toFixed(0)} km away on the curved lunar surface with 1,728 real Sun positions, and compare it with NASA's LOLA 18.6-year average-illumination map:</p>
    <div class="tbl"><table><caption>Light model against NASA LOLA average illumination</caption><thead><tr><th>Target</th><th>Spearman ρ, horizons up to ${maxKm.toFixed(0)} km</th><th>Error, lit fraction</th><th>ρ, local DEM only</th><th>Outward rays</th></tr></thead><tbody>${farRows}</tbody></table></div>
    <p class="note">${edge.length ? `${esc(list(edge.map(e => name(e[0]))))} sit near the edge of NASA's 85°S DEM, so their rays toward lower latitudes stop after ${esc(list(rays))}. ` : ''}Scoring still uses local windows on both bodies, so Moon and Earth are treated the same way; this test shows the light model itself is right once distant terrain is included.</p>
    ${psrHtml}
    ${figureCard('fig7_far_horizons.png', 'Local DEM against horizons up to 150 km', 'Spearman ρ and mean error per lunar site, local DEM against far horizons.', { wide: true })}
    <h3>Why the local model alone agrees less</h3>
    <p class="prose-p">Away from the pole, the Sun is often hidden by mountains tens of kilometres away, outside a local DEM. The scoring pipeline itself only sees the local DEM, and its lit fraction already follows NASA's pattern:</p>
    <div class="cols"><div class="tbl"><table><caption>Scoring pipeline, local DEM only (Sun 0.5–2.5°, 17 azimuths)</caption><thead><tr><th>Target</th><th>Spearman ρ vs NASA LOLA</th><th>Pixels (120 m)</th></tr></thead><tbody>${rhoRows}</tbody></table></div>
    <p class="note">Against the LOLA 18.6-year average-illumination map (Mazarico et al. 2011), sampled every 120 m. The "local DEM only" column of the table above uses the far-horizon run's 1,728 Sun positions and 240 m sampling instead, so the two local values differ slightly.</p></div>
    ${figureCard('fig4_illumination_validation.png', 'Illumination validation against LOLA', 'Lit fraction from the light model against the LOLA 18.6-year average-illumination map, per lunar site.', { wide: true })}</section>

  <section class="vsec"><h2>3 · How robust is the ranking?</h2>
    <p class="prose-p">Re-weighting illumination 0.5–2× keeps ${lo}–10 of the top 10 for ${hiCount} of ${mins.length} targets (down to ${lo} for ${esc(list(lowest))}); the window size (3/6/12 km) changes rankings much more — reported, not hidden.</p>
    <div class="tbl"><table class="heat"><caption>Windows of the top 10 kept when illumination is re-weighted</caption><thead><tr><th>Target</th>${W.map(w => `<th>×${w}</th>`).join('')}</tr></thead>
      <tbody>${Object.entries(ov).map(([id, a]) => `<tr><th scope="row">${esc(name(id))}</th>${a.map((v, i) => `<td class="tnum${W[i] === 1 ? ' base' : ''}" style="background:${ramp(v * 10, 20)};color:${v >= 7 ? '#0b0f17' : '#fff'}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${figureCard('fig5_sensitivity.png', 'Sensitivity of the ranking', 'Top-10 overlap with the equal-weight ranking, and how the best region changes with illumination weight.', { wide: true })}</section>

  <section class="vsec"><h2>4 · Where Earth stops being an analog</h2>
    <p class="prose-p">Analogs reproduce terrain and light, not lunar polar temperature. LRO Diviner measurements show all ${shares.length} lunar sites average below Earth's coldest recorded temperature over ${pyFixed(Math.min(...shares))}–${pyFixed(Math.max(...shares))} % of their area, with water ice stable just under the surface. P.E.N. says so on every analog card instead of overselling the match.</p>
    ${figureCard('fig6_diviner.png', 'Diviner: lunar polar temperature', 'LRO Diviner annual mean temperature 2 cm below the surface, and ice stability, per lunar site.', { wide: true })}
    ${figureCard('fig8_thermal_gap.png', 'Diviner against Earth analog regions', 'Surface temperature of each Earth region (NASA POWER) against the lunar and Martian sites.', { wide: true })}</section>

  <section class="vsec"><h2>Score matrix</h2>
    <p class="prose-p">The best window in every Earth region against every target, from the exported data. <a class="link" href="${BASE}figures/fig2_score_matrix.png" target="_blank" rel="noopener">Figure 2 (static)</a></p>
    <div id="hm"></div>
    ${figureCard('fig1_low_sun_side_by_side.png', 'The same low Sun on a target and its best Earth analog', 'Same low Sun (3° elevation, from SW), same scale: 6 km windows at 30 m.', { wide: true })}</section></div>`;
  wireFigures(el);
  mountHeatmap(el.querySelector('#hm')!, m, mx as never);

  // known-analog table (sortable)
  const cols: [string, string, (r: Rec) => string | number][] = [['Target', 'ref', r => name(r.reference)], ['Known site', 'site', r => r.site], ['Windows', 'n', r => r.n_windows], ['Rank of best', 'rk', r => rankOf(r.reference, r.site)?.rank ?? 0],
    ['Combined pct', 'c', r => r.score_combined_pct_best], ['Terrain pct', 't', r => r.score_terrain_pct_best], ['Illumination pct', 'i', r => r.score_illumination_pct_best], ['Combined, mean', 'cm', r => r.score_combined_pct_mean]];
  let sk = 4, sd = -1;
  const drawKT = () => {
    const sorted = rows.slice().sort((a, b) => { const x = cols[sk][2](a), y = cols[sk][2](b); return sd * (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y))); });
    el.querySelector('#kt')!.innerHTML = `<table><caption>Known analog sites: percentile of the best window among all Earth windows (50 = random)</caption><thead><tr>${cols.map((c, i) => `<th aria-sort="${i === sk ? (sd < 0 ? 'descending' : 'ascending') : 'none'}"><button data-s="${i}">${c[0]}${i === sk ? (sd < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${sorted.map(r => `<tr>${cols.map((c, i) => `<${i < 2 ? 'th scope="row"' : 'td'} class="${i > 1 ? 'tnum' : ''}">${esc(String(i > 3 ? Number(c[2](r)).toFixed(1) : i === 3 ? nf(Number(c[2](r))) : c[2](r)))}</${i < 2 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table>`;
    el.querySelectorAll<HTMLButtonElement>('#kt [data-s]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.s!; sd = sk === i ? -sd : (i < 2 || i === 3 ? 1 : -1); sk = i; drawKT(); }));
  };
  drawKT(); void moonIds;
}
