/** Mission dossier (#/dossier?target=<target id>&window=<region id>_<i>_<j>&route=<points>): one printable page per pair of sites.
 * "Print / Save as PDF" uses the browser's own print dialog (styles in dossier.css, @media print); no PDF library.
 * Every number is read from the exported data (web/public/data); nothing is typed by hand.
 *   target  defaults to the first lunar target; window defaults to the best window (equal weights) for that target.
 *   route   optional traverse drawn in the Mission view: "lon,lat;lon,lat;…", longitude first (see parseRoute). Without it, the precomputed
 *           least-cost twin traverse of the target is shown.
 *   when, fidelity   optional: the rehearsal window chosen in Mission (ISO start time, and 0–100 or 0–1 fidelity).
 * Layout: a report. Numbered sections, tables and figures; equations and quantities typeset with KaTeX (lib/katex), with a plain-text
 * fallback already in the page. Motion: sections reveal on scroll, readouts count up, bars and the route draw in. All of it is off under
 * prefers-reduced-motion and in print, where every element is in its final state.
 * AI-assisted (Claude Code); reviewed by the author. */
import './dossier.css';
import { BASE } from '../base';
import { esc, cap, nf, coord, pyFixed } from '../format';
import { getJSON, loadTarget, loadDetail } from '../data';
import { fieldEvents } from '../eonet';
import { renderMath } from '../lib/katex';
import type { Manifest } from '../types';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const THR_SIMILAR = 0.5, THR_DIFF = 1.5; // same thresholds as pen.scoring.explain()
const D_AXIS = 3;                        // the difference bars span ±3 IQR; larger values are clipped at the edge
const optional = <T>(name: string) => getJSON<T>(name).catch(() => null);
const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const topShare = (rank: number, n: number) => { const p = (rank / n) * 100; return p < 0.05 ? 'top < 0.1 %' : `top ${p.toFixed(1)} %`; };
/** Query of the route: the router passes it as params (lib/routes); read from the hash when called without it. */
const query = (params?: Record<string, string>) => new URLSearchParams(params ?? location.hash.split('?')[1] ?? '');
/** A quantity or equation in TeX. The plain text stays in the page until KaTeX has typeset it, and for good if KaTeX fails to load. */
const tex = (src: string, plain: string, display = false) => `<span class="dossier-tex" data-tex="${esc(src)}"${display ? ' data-display' : ''}>${esc(plain)}</span>`;
/** A readout that counts up to its value when its section scrolls into view. The final text is exactly `text`. */
const count = (text: string) => `<b class="tnum" data-count="${esc(text)}">${esc(text)}</b>`;

/** Traverse waypoints from the URL: "lon,lat;lon,lat" (also accepts "|" or spaces between points, and a JSON array of pairs). */
export function parseRoute(raw: string | null): [number, number][] {
  if (!raw) return [];
  let pts: unknown = null;
  try { pts = JSON.parse(raw); } catch { /* not JSON */ }
  const pairs = Array.isArray(pts) ? pts : raw.split(/[;|\s]+/).filter(Boolean).map(p => p.split(',').map(Number));
  return (pairs as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v))).map(p => [p[0], p[1]]);
}

/** 95 % bootstrap interval of the combined score, if the statistics export (stats/bootstrap.json, web/tools/exports/stats.py) lists this window:
 * { "<target id>": [{ "window_id": "<region id>_<i>_<j>", "score": 90.9, "ci95": [76.2, 91.5], … }], "_stub": false }. Stub files are ignored. */
function scoreInterval(boot: Rec | null, target: string, wid: string): [number, number] | null {
  if (!boot || boot._stub || !Array.isArray(boot[target])) return null;
  const ci = (boot[target] as Rec[]).find(w => w.window_id === wid)?.ci95;
  return Array.isArray(ci) && typeof ci[0] === 'number' && typeof ci[1] === 'number' ? [ci[0], ci[1]] : null;
}

/** Plan view of the Earth traverse: waypoints in a local equirectangular projection (longitude scaled by cos latitude), north up,
 *  with a scale bar. The line draws in when the section is revealed. */
function routePlot(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  const W = 340, H = 210, pad = 26, KM_PER_DEG = 111.32;
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length, kx = Math.cos(lat0 * Math.PI / 180);
  const xs = pts.map(p => p[0] * kx), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = Math.max(...xs) - x0 || 1e-6, dy = Math.max(...ys) - y0 || 1e-6;
  const s = Math.min((W - 2 * pad) / dx, (H - 2 * pad - 14) / dy), ox = (W - dx * s) / 2, oy = (H - 14 - dy * s) / 2;
  const P = pts.map((_, i) => [ox + (xs[i] - x0) * s, H - 14 - oy - (ys[i] - y0) * s] as [number, number]);
  const pxPerKm = s / KM_PER_DEG, barKm = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05].find(k => k * pxPerKm <= 90) ?? 0.05, barPx = barKm * pxPerKm;
  const f = (v: number) => v.toFixed(1), a = P[0], b = P[P.length - 1];
  const grid = [1, 2, 3].map(i => `<line x1="${f(W * i / 4)}" y1="0" x2="${f(W * i / 4)}" y2="${H}"/><line x1="0" y1="${f(H * i / 4)}" x2="${W}" y2="${f(H * i / 4)}"/>`).join('');
  return `<svg class="dossier-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plan view of the planned Earth traverse, ${pts.length} waypoints, north up">
    <g class="dossier-plot-grid">${grid}</g>
    <polyline class="dossier-plot-line" pathLength="1" points="${P.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}"/>
    <g class="dossier-plot-pts">${P.map(p => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.2"/>`).join('')}</g>
    <g class="dossier-plot-ends"><circle cx="${f(a[0])}" cy="${f(a[1])}" r="5"/><text x="${f(a[0] - 4)}" y="${f(a[1] + 20)}">A</text><rect x="${f(b[0] - 4.5)}" y="${f(b[1] - 4.5)}" width="9" height="9"/><text x="${f(b[0] - 4)}" y="${f(b[1] + 21)}">B</text></g>
    <g class="dossier-plot-scale"><path d="M${pad} ${H - 8}v-5m0 5h${f(barPx)}m0 0v-5"/><text x="${f(pad + barPx + 6)}" y="${H - 6}">${barKm} km</text></g>
    <g class="dossier-plot-north"><path d="M16 30V12m-4 6l4-6l4 6"/><text x="16" y="42" text-anchor="middle">N</text></g></svg>`;
}

export async function render(el: HTMLElement, m: Manifest, params?: Record<string, string>) {
  const q = query(params);
  const t = m.targets.find(x => x.id === q.get('target')) ?? m.targets.find(x => x.body === 'moon') ?? m.targets[0];
  const [core, det, repro, credits, rover, kr, boot] = await Promise.all([loadTarget(t.id), loadDetail(t.id), getJSON<Record<string, string[]>>('reproduce'),
    optional<Record<string, string>>('credits'), optional<Rec>('rover_twin'), optional<Rec>('known_ranks'), optional<Rec>('stats/bootstrap')]);
  const sc = m.scale, n = core.n, ii = det.i as number[], jj = det.j as number[];
  const widOf = (k: number) => `${m.regions[core.site[k]].id}_${ii[k]}_${jj[k]}`;

  // ranking with equal weights: descending combined score, ties keep file order (as in the README and known_ranks)
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => core.combined[b] - core.combined[a] || a - b);
  const want = q.get('window');
  let k = want ? order.find(x => widOf(x) === want) ?? -1 : order[0];
  const missing = k < 0; if (missing) k = order[0];
  const rank = order.indexOf(k) + 1, wid = widOf(k), r = m.regions[core.site[k]];
  const lon = core.lon[k] / sc.lonlat, lat = core.lat[k] / sc.lonlat, score = core.combined[k] / sc.score;
  const dims = Object.keys(m.dims), feats = dims.flatMap(d => m.dims[d]);
  const dv = feats.map(f => ({ f, v: (det[`d_${f}`] as number[])[k] / sc.d }));
  const similar = dv.filter(x => Math.abs(x.v) <= THR_SIMILAR).map(x => m.feature_labels[x.f]);
  const differs = dv.filter(x => Math.abs(x.v) >= THR_DIFF).map(x => `${m.feature_labels[x.f]} (${x.v > 0 ? 'higher' : 'lower'} on Earth)`);
  const ci = scoreInterval(boot, t.id, wid);
  const brief = m.briefs[r.id], where = [r.place, r.cc].filter(Boolean).join(', ');
  const has = (set: string[]) => set.includes(wid);
  const route = parseRoute(q.get('route')), when = q.get('when'), fid = Number(q.get('fidelity'));
  const whenDate = when ? new Date(when) : null, whenOk = !!whenDate && !Number.isNaN(whenDate.getTime());
  const whenText = whenOk ? `${whenDate!.toISOString().slice(0, 10)} ${whenDate!.toISOString().slice(11, 16)} UTC` : when ?? '';
  const whenPast = whenOk && whenDate!.getTime() < Date.now();
  const rv = rover?.[t.id], rvHere = rv && rv.earth_site === r.id && Math.abs(rv.earth_window[0] - lat) < 1e-3 && Math.abs(rv.earth_window[1] - lon) < 1e-3;
  const known = Object.entries((kr?.[t.id] ?? {}) as Record<string, { rank: number; n: number }>).filter(([, v]) => v.rank === rank);
  const [thermal, lowSun] = await Promise.all([thermalRef(t.id, t.body), brief?.csv ? fetch(`${BASE}extras/briefs/${brief.csv}`).then(x => (x.ok ? x.text() : '')).catch(() => '') : '']);
  const today = new Date().toISOString().slice(0, 10);
  const future = lowSun.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(c => c.length >= 6 && c[0].slice(0, 10) >= today);
  const upcoming = future.slice(0, 8);   // the print layout keeps the first four (dossier.css)
  const futureMin = future.reduce((a, c) => a + (Number(c[2]) || 0), 0), futureKinds = [...new Set(future.map(c => c[5]))].map(kd => `${future.filter(c => c[5] === kd).length} ${kd}`);
  const widest = dv.reduce((a, x) => (Math.abs(x.v) > Math.abs(a.v) ? x : a), dv[0]);

  // running numbers of sections, tables and figures, in reading order (some blocks are optional)
  let nS = 0, nT = 0, nF = 0;
  const h2 = (title: string) => `<h2><span class="dossier-n tnum" aria-hidden="true">${String(++nS).padStart(2, '0')}</span>${title}</h2>`;
  const tcap = (text: string) => `<caption><b>Table ${++nT}.</b> ${text}</caption>`;
  const fcap = (text: string) => `<figcaption><b>Fig. ${++nF}.</b> ${text}</figcaption>`;
  const img = (src: string, alt: string, capt: string) => `<figure><div class="dossier-frame"><img src="${src}" alt="${esc(alt)}" loading="eager"></div>${fcap(capt)}</figure>`;
  const pct = (v: number) => Math.max(0, Math.min(100, v)).toFixed(1);
  const dimScore = (d: string) => (core[`score_${d}`] as number[])[k] / sc.score;
  const dist = score > 0 ? -Math.log(score / 100) : null;   // S = 100·exp(−D), so D = −ln(S / 100)
  /** Nomenclature under a block of equations: every symbol with its meaning and its type, unit and range. Screen only; print keeps the short caption. */
  const symbols = (rows: [string, string, string, string][]) => `<div class="dossier-tbl dossier-sym dossier-guide"><table><thead><tr><th scope="col">Symbol</th><th scope="col">Meaning</th><th scope="col">Type, unit and range</th></tr></thead><tbody>
    ${rows.map(([src, plain, meaning, type]) => `<tr><th scope="row">${tex(src, plain)}</th><td>${meaning}</td><td>${type}</td></tr>`).join('')}</tbody></table></div>`;
  const kind = (v: number) => Math.abs(v) <= THR_SIMILAR ? 'similar' : Math.abs(v) >= THR_DIFF ? 'different' : 'close';
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

  el.innerHTML = `<article class="dossier page-in">
  <div class="dossier-tools"><a class="link" href="#/explore">← Back to the map</a><button class="btn primary" id="dossier-print">Print / Save as PDF</button></div>
  ${missing ? `<p class="dossier-warn" role="status">Window “${esc(want ?? '')}” was not found for ${esc(t.name)}; showing its best window instead.</p>` : ''}
  <header class="dossier-head" data-rv>
    <dl class="dossier-doc tnum"><div><dt>Document</dt><dd>Mission dossier</dd></div><div><dt>Target</dt><dd>${esc(t.id)}</dd></div><div><dt>Earth window</dt><dd>${esc(wid)}</dd></div><div><dt>Data</dt><dd>${esc(m.data_hash)}</dd></div><div><dt>Issued</dt><dd>${today}</dd></div></dl>
    <p class="dossier-kicker">P.E.N. mission dossier · ${esc(cap(t.body))} analog field test</p>
    <h1>${esc(t.name)} <span>↔</span> ${esc(r.name)}</h1>
    <p class="dossier-sub tnum">${esc(t.label.split('·').pop()!.trim())} · Earth window ${coord(lat, lon)}${where ? ` · ${esc(where)}` : ''} · ${m.window_km} km × ${m.window_km} km at 30 m</p>
    <p class="dossier-abstract dossier-guide">This dossier is the field sheet for one pair of sites: ${esc(t.name)} on ${t.body === 'moon' ? 'the Moon' : esc(cap(t.body))} and the ${m.window_km} km window of Earth that P.E.N. ranks for it. It says why the window matches, what both sites look like under the same low Sun, when the light is right on Earth, which traverse a rover would take, what Earth cannot reproduce, and whether natural hazards are open near the site today. Every number is read from the published data set (version ${esc(m.data_hash)}); none is typed by hand.</p></header>

  <section class="dossier-sec dossier-top" data-rv aria-label="Summary">
    <div class="dossier-readout"><p class="dossier-cap">Combined similarity score ${tex('S', 'S')}</p>
      <div class="dossier-score">${count(pyFixed(score))}<span>/ 100</span></div>
      <div class="dossier-scale" role="img" aria-label="Score ${pyFixed(score)} of 100${ci ? `, 95 % bootstrap interval ${pyFixed(ci[0])} to ${pyFixed(ci[1])}` : ''}">
        <div class="dossier-scale-track">${ci ? `<i class="dossier-scale-ci" style="--a:${pct(ci[0])};--b:${pct(ci[1])}"></i>` : ''}<i class="dossier-scale-fill" style="--v:${pct(score)}"></i><i class="dossier-scale-mark" style="--v:${pct(score)}"></i></div>
        <div class="dossier-scale-ticks tnum" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div></div>
      ${ci ? `<p class="dossier-ci tnum">95 % bootstrap interval ${pyFixed(ci[0])}–${pyFixed(ci[1])} ${tex(String.raw`\;\bigl(S \in [${pyFixed(ci[0])},\,${pyFixed(ci[1])}]\bigr)`, '')}</p>` : ''}</div>
    <dl class="dossier-facts"><div><dt>Rank</dt><dd class="tnum">#${count(nf(rank))} <small>of ${nf(n)}</small></dd></div><div><dt>Share</dt><dd class="tnum">${topShare(rank, n)}</dd></div>
      ${dims.map(d => `<div><dt>${esc(cap(d))}</dt><dd class="tnum">${count(pyFixed(dimScore(d)))}<span class="dossier-mini" aria-hidden="true"><i style="--v:${pct(dimScore(d))}"></i></span></dd></div>`).join('')}</dl></section>

  <section class="dossier-sec" data-rv>${h2('Why this site')}
    <p>Among ${nf(n)} Earth windows of ${m.window_km} km in ${m.regions.length} regions, this one ranks <b>#${nf(rank)}</b> (${topShare(rank, n)}) for ${esc(t.name)} with equal weights for terrain and low-Sun illumination.${known.length ? ` It contains ${esc(known.map(x => x[0]).join(' and '))}, a known analog site that P.E.N. was never told about.` : ''}</p>
    <dl class="dossier-explain"><dt>Similar in</dt><dd>${similar.length ? esc(similar.join(' · ')) : '—'}</dd><dt>Differs in</dt><dd>${differs.length ? esc(differs.join(' · ')) : 'nothing beyond 1.5 IQR'}</dd></dl>
    <p class="dossier-guide">The score compares <b>${feats.length} features</b> of the two windows (${dims.map(d => `${m.dims[d].length} of ${esc(d)}`).join(', ')}), each measured on the same 30 m grid. A difference is expressed in units of the spread of that feature over all Earth windows (Eq. 1), so that metres, degrees and fractions can be combined into one distance (Eq. 2) and mapped to a score from 0 to 100 (Eq. 3). Here <b>${similar.length} of ${feats.length}</b> features fall within ${THR_SIMILAR} IQR of the target; the widest gap is in ${esc(m.feature_labels[widest.f])} (${signed(widest.v)} IQR).${ci ? ` Resampling the reference windows of the target moves the score between ${pyFixed(ci[0])} and ${pyFixed(ci[1])} (95 % interval), which is why the rank is reported with its interval and not as a single best place.` : ''}</p>
    <figure class="dossier-eq" aria-label="How the score is computed">
      <div>${tex(String.raw`d_k = \frac{x_k - r_k}{\mathrm{IQR}_k} \tag{1}`, 'd_k = (x_k − r_k) / IQR_k   (1)', true)}</div>
      <div>${tex(String.raw`D = \sqrt{\frac{\sum_k w_k\, d_k^{2}}{\sum_k w_k}} \tag{2}`, 'D = √( Σ w_k d_k² / Σ w_k )   (2)', true)}</div>
      <div>${dist === null ? tex(String.raw`S = 100\, e^{-D} \tag{3}`, 'S = 100 · exp(−D)   (3)', true)
        : tex(String.raw`S = 100\, e^{-D} = 100\, e^{-${dist.toFixed(3)}} = ${score.toFixed(1)} \tag{3}`, `S = 100 · exp(−D) = 100 · exp(−${dist.toFixed(3)}) = ${score.toFixed(1)}   (3)`, true)}</div>
      ${symbols([
        ['k', 'k', `Index of a feature (${dims.map(d => `${m.dims[d].length} of ${esc(d)}`).join(', ')})`, `Integer, ${tex(String.raw`k = 1,\dots,${feats.length}`, `k = 1…${feats.length}`)}`],
        ['x_k', 'x_k', `Value of feature ${tex('k', 'k')} in this Earth window (${m.window_km} km, 30 m grid)`, `Real number, in the unit of the feature: log₁₀ of metres for relief and roughness, degrees for the slopes, a fraction from 0 to 1 for hypsometry and shadow`],
        ['r_k', 'r_k', `Reference value of feature ${tex('k', 'k')} for ${esc(t.name)}: the median over its reference windows`, `Real number, same unit as ${tex('x_k', 'x_k')}`],
        [String.raw`\mathrm{IQR}_k`, 'IQR_k', `Inter-quartile range of feature ${tex('k', 'k')} over all ${nf(n)} Earth windows; the yardstick that makes features comparable`, `Real number greater than 0, same unit as ${tex('x_k', 'x_k')}`],
        ['d_k', 'd_k', `Standardised difference of feature ${tex('k', 'k')} between Earth and target (Table 1)`, `Real number, dimensionless (IQR units); positive when Earth is higher`],
        ['w_k', 'w_k', `Weight of feature ${tex('k', 'k')}; terrain and illumination weigh the same here, and no weight was fitted`, `Real number, dimensionless, ${tex(String.raw`w_k \ge 0`, 'w_k ≥ 0')}`],
        ['D', 'D', 'Distance between the Earth window and the target: the weighted root mean square of the differences', `Real number, dimensionless, ${tex(String.raw`D \ge 0`, 'D ≥ 0')}${dist === null ? '' : `; here ${dist.toFixed(3)}`}`],
        ['S', 'S', 'Similarity score of the window', `Real number, dimensionless, ${tex(String.raw`0 < S \le 100`, '0 < S ≤ 100')}; 100 means identical${dist === null ? '' : `; here ${score.toFixed(1)}`}`],
      ])}
            <figcaption class="dossier-printonly">${tex('x_k', 'x_k')}: feature ${tex('k', 'k')} of this Earth window; ${tex('r_k', 'r_k')}: median of the target; ${tex(String.raw`\mathrm{IQR}_k`, 'IQR_k')}: inter-quartile range over all ${nf(n)} Earth windows; ${tex('w_k', 'w_k')}: weights, equal here and never fitted. ${tex('S = 100', 'S = 100')} means identical.</figcaption></figure>
    <div class="dossier-tbl"><table>${tcap(`Feature differences ${tex('d_k', 'd_k')} between this window and ${esc(t.name)}, in IQR units (Eq. 1). Bars span ${tex(String.raw`\pm ${D_AXIS}`, `±${D_AXIS}`)}; the inner band is ${tex(String.raw`\lvert d_k\rvert \le ${THR_SIMILAR}`, `|d_k| ≤ ${THR_SIMILAR}`)}.`)}
      <thead><tr><th scope="col">Feature</th><th scope="col" class="r">${tex('d_k', 'Difference')}</th><th scope="col" class="dossier-dvh"><span>lower on Earth</span><span>higher</span></th><th scope="col">Reading</th></tr></thead><tbody>
      ${dv.map((x, i) => `<tr><th scope="row">${esc(m.feature_labels[x.f])}</th><td class="tnum">${signed(x.v)}</td><td class="dossier-dvc"><span class="dossier-dv is-${kind(x.v)}${x.v < 0 ? ' is-neg' : ''}" style="--w:${(Math.min(Math.abs(x.v), D_AXIS) / D_AXIS * 50).toFixed(2)};--i:${i}" aria-hidden="true"><i></i></span></td><td><span class="dossier-tag is-${kind(x.v)}">${kind(x.v)}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="dossier-note">${tex(String.raw`\lvert d_k\rvert \le ${THR_SIMILAR}`, `|d_k| ≤ ${THR_SIMILAR}`)}: similar. ${tex(String.raw`\lvert d_k\rvert \ge ${THR_DIFF}`, `|d_k| ≥ ${THR_DIFF}`)}: different. Positive values are higher on Earth than on the target.</p></section>

  <section class="dossier-sec" data-rv>${h2('Same low Sun, same scale')}
    <p class="dossier-guide">Both windows cover ${m.window_km} km × ${m.window_km} km and are drawn at the same scale. The modelled views light the two terrains with the same Sun, 3° above the horizon from the south-west, using the cast-shadow model that P.E.N. validates against the NASA LOLA illumination map; the model is geometric, so compare the length and direction of the shadows, not the brightness of the ground. The real views show the same footprints as the spacecraft and satellites see them.</p>
    <div class="dossier-figs">
    ${img(`${BASE}thumbs/ref/${t.id}.jpg`, `${t.name}, reference window under a low Sun`, `${esc(t.name)} · modelled shadows, Sun 3° from SW`)}
    ${has(m.previews.low) ? img(`${BASE}thumbs/win/${wid}.jpg`, `${r.name}, Earth window under a low Sun`, `${esc(r.name)} · same Sun, same scale`) : ''}
    ${img(`${BASE}thumbs/ref_real/${t.id}.jpg`, `${t.name}, real view`, `Real view · ${esc(credits?.[`ref__${t.id}`] ?? 'NASA imagery')}`)}
    ${has(m.previews.real) ? img(`${BASE}thumbs/real/${wid}.jpg`, `${r.name}, real view`, `Real view · ${esc(credits?.[wid] ?? 'NASA imagery')}`) : ''}</div></section>

  <section class="dossier-sec" data-rv>${h2('When to go')}
    ${when ? `<p class="dossier-pick">Rehearsal window chosen in Mission: <b class="tnum">${esc(whenText)}</b>${Number.isFinite(fid) && fid > 0 ? ` · rehearsal fidelity <b class="tnum">${pyFixed(fid <= 1 ? fid * 100 : fid)} %</b>` : ''}${whenPast ? ` · <span class="dossier-dim">this date has passed; the same Sun returns about a year later</span>` : ''}</p>` : ''}
    ${brief?.block ? `<p>Best 14-day campaign block at ${esc(r.name)}: <b>${esc(brief.block)}</b>, with <b>${brief.min_day} min/day</b> of Sun 0–7° above the horizon, the elevation range of the lunar south pole.</p>
    <p class="dossier-guide">A low-Sun window is one unbroken interval in which the Sun stands between 0° and 7° above the horizon at this site. Morning windows follow sunrise and evening windows precede sunset; the azimuth, measured clockwise from north, tells where the Sun is and so which way the shadows fall.${future.length ? ` From ${today} the calendar holds <b>${nf(future.length)} windows</b> (${esc(futureKinds.join(', '))}), <b>${pyFixed(futureMin / 60)} h</b> of low Sun in total, the last one on ${esc(future[future.length - 1][0].slice(0, 10))}.` : ''}</p>` : `<p>No campaign calendar was generated for ${esc(r.name)} yet. The When view gives the hours per day of Sun 0–7° for every region and month.</p>`}
    ${upcoming.length ? `<div class="dossier-tbl dossier-when"><table>${tcap(`Next low-Sun windows at ${esc(r.name)}: Sun elevation ${tex(String.raw`0^\circ \le h \le 7^\circ`, '0° ≤ h ≤ 7°')}, times in UTC.`)}<thead><tr><th scope="col">Start</th><th scope="col" class="r">End</th><th scope="col" class="r">Duration (min)</th><th scope="col" class="r">Sun azimuth</th><th scope="col">Kind</th></tr></thead><tbody>
      ${upcoming.map(c => `<tr><th scope="row" class="tnum">${esc(c[0].replace('T', ' '))}</th><td class="tnum">${esc(c[1].slice(11))}</td><td class="tnum">${esc(c[2])}</td><td class="tnum">${esc(c[3])}°–${esc(c[4])}°</td><td>${esc(c[5])}</td></tr>`).join('')}</tbody></table></div>` : brief?.csv ? `<p class="dossier-note">The campaign calendar for ${esc(r.name)} has no low-Sun window after ${today}. Regenerate it (scripts/extras/campaign_calendar.py) for later dates.</p>` : ''}
    ${brief ? `<p class="dossier-links dossier-noprint">${brief.calendar ? `<a class="link" download href="${BASE}extras/briefs/${brief.calendar}">Calendar .ics</a>` : ''}${brief.csv ? `<a class="link" download href="${BASE}extras/briefs/${brief.csv}">All low-Sun windows (CSV)</a>` : ''}${brief.brief ? `<a class="link" download href="${BASE}extras/briefs/${brief.brief}">Field brief</a>` : ''}</p>` : ''}</section>

  ${route.length || rv ? `<section class="dossier-sec" data-rv>${h2('Traverse and telemetry')}
    ${route.length ? `<p>Earth traverse planned in Mission, on ${esc(r.name)}: <b>${route.length} waypoints</b>.</p>
      <div class="dossier-trav">${route.length > 1 ? `<figure class="dossier-plotfig">${routePlot(route)}${fcap('Plan view of the planned Earth traverse, from A to B. North is up.')}</figure>` : ''}<ol class="dossier-route tnum">${route.map(p => `<li>${coord(p[1], p[0])}</li>`).join('')}</ol></div>` : ''}
    ${rv ? `<p>${route.length ? 'For reference, the' : 'The'} precomputed least-cost twin traverse for ${esc(t.name)}${rvHere ? ' and this Earth window' : ` uses the Earth window at ${coord(rv.earth_window[0], rv.earth_window[1])}`}: the same cost function on both bodies, slopes above 20° impassable.</p>
    <p class="dossier-guide">On each ${m.window_km} km window a least-cost route links the same two relative positions, from the south-west to the north-east corner area. Every 30 m cell has a cost that grows with its slope ${tex('s', 's')} and with its shadow fraction ${tex(String.raw`f_{\mathrm{sh}}`, 'f_sh')} under a 2° Sun (Eq. 4), so the route avoids ground that is steep or dark. The Earth route is <b>${pyFixed(rv.earth.length_km / rv.target.length_km * 100)} %</b> as long as the one on ${esc(t.name)}; the table compares what a rover would meet along each.</p>
    <figure class="dossier-eq dossier-guide" aria-label="Cost of one cell of the route"><div>${tex(String.raw`c = 1 + \left(\frac{s}{10^\circ}\right)^{2} + 3\, f_{\mathrm{sh}}, \qquad s > 20^\circ \;\Rightarrow\; \text{impassable} \tag{4}`, 'c = 1 + (s / 10°)² + 3 · f_sh;  s > 20°: impassable   (4)', true)}</div>
      ${symbols([
        ['c', 'c', 'Cost of crossing one 30 m cell; the route minimises the sum of the costs along the way', `Real number, dimensionless, ${tex(String.raw`c \ge 1`, 'c ≥ 1')}`],
        ['s', 's', 'Terrain slope of the cell', `Real number, degrees, ${tex(String.raw`0^\circ \le s < 90^\circ`, '0° ≤ s < 90°')}; cells with ${tex(String.raw`s > 20^\circ`, 's > 20°')} cannot be crossed`],
        [String.raw`f_{\mathrm{sh}}`, 'f_sh', 'Shadow fraction of the cell: the share of the 8 Sun directions from which it is in shadow with the Sun 2° above the horizon', `Real number, dimensionless, ${tex(String.raw`0 \le f_{\mathrm{sh}} \le 1`, '0 ≤ f_sh ≤ 1')}`],
      ])}</figure>
    <div class="dossier-split"><div class="dossier-tbl"><table>${tcap('Least-cost twin traverse, the same cost function on both bodies. The last column is Earth minus target (pp: percentage points).')}<thead><tr><th scope="col">Quantity</th><th scope="col" class="r">${esc(t.name)}</th><th scope="col" class="r">Earth analog</th><th scope="col" class="r">Difference</th></tr></thead><tbody>
      ${([['Length', (o: Rec) => o.length_km, (v: number) => `${v.toFixed(2)} km`], ['Climb', (o: Rec) => o.climb_m, (v: number) => `${nf(Math.round(v))} m`], ['Descent', (o: Rec) => o.descent_m, (v: number) => `${nf(Math.round(v))} m`], ['Max slope', (o: Rec) => o.max_slope_deg, (v: number) => `${v.toFixed(1)}°`], ['Mean slope', (o: Rec) => o.mean_slope_deg, (v: number) => `${v.toFixed(1)}°`], ['Route in shadow (Sun 2°)', (o: Rec) => o.share_in_shadow * 100, (v: number) => `${pyFixed(v)} %`], ['Window impassable', (o: Rec) => o.share_window_impassable * 100, (v: number) => `${pyFixed(v)} %`]] as [string, (o: Rec) => number, (v: number) => string][])
        .map(([l, g, f]) => { const d = g(rv.earth) - g(rv.target); return `<tr><th scope="row">${l}</th><td class="tnum">${f(g(rv.target))}</td><td class="tnum">${f(g(rv.earth))}</td><td class="tnum">${d > 0 ? '+' : d < 0 ? '−' : ''}${f(Math.abs(d)).replace(' %', ' pp')}</td></tr>`; }).join('')}</tbody></table></div>
    ${m.extras[t.id]?.rover ? `<div class="dossier-figs one"><figure><div class="dossier-frame"><img src="${BASE}extras/${m.extras[t.id].rover}" alt="${esc(`Least-cost route on ${t.name} and its Earth analog`)}" loading="eager"></div>${fcap('Least-cost route on both windows.')}</figure></div>` : ''}</div>` : ''}</section>` : ''}

  <section class="dossier-sec" data-rv>${h2('Where the analogy breaks')}
    <p class="dossier-guide">The score compares terrain and low-Sun light, nothing else. The points below are what this Earth window does not reproduce of ${esc(t.name)}; a field team plans around them, and none of them enters the score.</p>
    <ul class="dossier-list">${(repro[t.id] ?? []).map(s => `<li>${bold(s)}</li>`).join('')}</ul>
    ${temperatureRows(det as unknown as Record<string, (number | null)[]>, k, thermal, tcap)}${mineralRows(det as unknown as Record<string, (number | null)[]>, k)}</section>

  <section class="dossier-sec" data-rv>${h2('Field safety')}
    <p class="dossier-guide">NASA EONET tracks natural events that are still open, such as wildfires, volcanic activity and severe storms. The check runs when this page opens, for a radius of 150 km around the centre of the Earth window, and falls back to the snapshot stored with the data when the live service cannot be reached.</p>
    <div id="dossier-eonet" aria-live="polite"><p class="dossier-note"><span class="dossier-pulse" aria-hidden="true"></span>Checking NASA EONET for open natural events within 150 km…</p></div></section>

  <section class="dossier-sec" data-rv>${h2('Data and credits')}
    <p class="dossier-note">Terrain: ${t.body === 'moon' ? 'NASA LRO LOLA 5 m south-pole DEMs (GSFC PGDA)' : 'NASA MRO CTX stereo DTMs (USGS Astrogeology)'} and ESA Copernicus DEM GLO-30, on a common 30 m grid. Light: exact cast-shadow model, validated against the NASA LOLA average-illumination map. Temperature: ${t.body === 'moon' ? 'NASA LRO Diviner polar resource product' : 'Mars Climate Database v6.2 (model)'} and NASA MODIS MOD11A2. Minerals: NASA EMIT L2B V002. Imagery: NASA Moon/Mars Trek WMTS and GIBS. Field safety: NASA EONET v3. Analogs reproduce terrain and light only; temperature, minerals and field safety are context, not scored. Not endorsed by NASA or ESA. Built with AI assistance (see the repository README).</p>
    <p class="dossier-note tnum">P.E.N. · Planetary Environmental Navigator · data ${esc(m.data_hash)} · generated ${today} · ${esc(location.origin + location.pathname)}#/dossier?target=${esc(t.id)}&amp;window=${esc(wid)}</p></section>
  </article>`;

  const root = el.querySelector<HTMLElement>('.dossier')!;
  root.querySelector('#dossier-print')!.addEventListener('click', () => window.print());
  typeset(root);
  const stopMotion = motion(root);
  fieldEvents(r.id, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000).then(({ events, how }) => {
    const box = el.querySelector('#dossier-eonet'); if (!box) return;
    if (events === null) box.innerHTML = `<p><span class="dossier-led is-off" aria-hidden="true"></span>Field-safety data is unavailable right now. Check NASA EONET before travel.</p>`;
    else if (!events.length) box.innerHTML = `<p><span class="dossier-led is-ok" aria-hidden="true"></span><b>No open natural events within 150 km</b> <span class="dossier-dim">(NASA EONET, ${esc(how)})</span>. Check again before travel.</p>`;
    else box.innerHTML = `<p><span class="dossier-led is-warn" aria-hidden="true"></span><b>${events.length} open natural event${events.length === 1 ? '' : 's'} within 150 km</b> <span class="dossier-dim">(NASA EONET, ${esc(how)})</span>. Check again before travel.</p>
      <ul class="dossier-list">${events.slice(0, 4).map(e => `<li>${esc(e.title)} <span class="dossier-dim tnum">(${esc(e.category)}, ${esc(e.date)}, ~${e.distance_km} km away)</span></li>`).join('')}</ul>`;
  });
  return stopMotion;
}
export { render as renderDossier };

/** Typeset every [data-tex] with KaTeX. The plain text already in the element stays if KaTeX cannot be loaded. */
function typeset(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-tex]').forEach(box => {
    const out = document.createElement('span');
    renderMath(out, box.dataset.tex!, { display: box.hasAttribute('data-display') }).then(() => { box.replaceChildren(out); box.classList.add('is-katex'); }).catch(() => { /* keep the plain text */ });
  });
}

/** Scroll reveal and count-up. Blocks marked [data-rv] get .is-in when they enter the viewport; CSS does the rest (dossier.css).
 *  Without IntersectionObserver, under prefers-reduced-motion, and before printing, everything is put in its final state at once.
 *  Returns the cleanup for the router. */
function motion(root: HTMLElement): () => void {
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-rv]')];
  const settle = (b: HTMLElement) => b.querySelectorAll<HTMLElement>('[data-count]').forEach(c => { c.textContent = c.dataset.count!; });
  const showAll = () => blocks.forEach(b => { b.classList.add('is-in'); settle(b); });
  let raf = 0;
  const countUp = (b: HTMLElement) => b.querySelectorAll<HTMLElement>('[data-count]').forEach(c => {
    const final = c.dataset.count!, to = Number(final.replace(/,/g, ''));
    if (!Number.isFinite(to) || to === 0) return;
    const t0 = performance.now(), dur = 900;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      c.textContent = p < 1 ? nf(Math.round(to * e)) : final;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { showAll(); return () => {}; }
  root.classList.add('dossier-anim');
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const b = e.target as HTMLElement; io.unobserve(b); b.classList.add('is-in'); countUp(b);
  }), { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  blocks.forEach(b => io.observe(b));
  const onPrint = () => { cancelAnimationFrame(raf); io.disconnect(); showAll(); };
  addEventListener('beforeprint', onPrint);
  return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('beforeprint', onPrint); };
}

// ---- context, not scored: temperature of this Earth window (MODIS) against the target (Diviner or Mars Climate Database)
type Thermal = { mean: number; lo: number; hi: number; what: string } | null;
async function thermalRef(id: string, body: string): Promise<Thermal> {
  const pick = async (file: string) => (await optional<{ sites: Record<string, Record<string, number>> }>(file))?.sites[id];
  if (body === 'moon') { const v = await pick('diviner'); return v ? { mean: v.temp_avg_mean_K, lo: v.temp_avg_min_K, hi: v.temp_max_max_K, what: 'LRO Diviner, measured: annual mean 2 cm below the surface; coldest mean to hottest surface maximum' } : null; }
  if (body === 'mars') { const v = await pick('mars_context'); return v ? { mean: v.tsurf_mean_K, lo: v.tsurf_min_K, hi: v.tsurf_max_K, what: 'Mars Climate Database v6.2, modelled surface temperature' } : null; }
  return null;
}
function temperatureRows(d: Record<string, (number | null)[]>, k: number, ref: Thermal, tcap: (text: string) => string): string {
  const mean = d.lst_mean?.[k], lo = d.lst_min?.[k], hi = d.lst_max?.[k];
  if (mean == null || lo == null || hi == null) return '';
  const row = (lab: string, a: number, b: number, c: number, src: string) => `<tr><th scope="row">${lab}</th><td class="tnum">${pyFixed(a)}</td><td class="tnum">${pyFixed(b)}–${pyFixed(c)}</td><td>${esc(src)}</td></tr>`;
  const gap = ref ? Math.round(mean / 10 - ref.mean) : 0;
  // one kelvin axis for both ranges, rounded outward to 50 K
  const rows = [{ lab: 'Earth window', lo: lo / 10, hi: hi / 10, mean: mean / 10, cls: 'is-earth' }, ...(ref ? [{ lab: 'Target', lo: ref.lo, hi: ref.hi, mean: ref.mean, cls: 'is-target' }] : [])];
  const a0 = Math.floor(Math.min(...rows.map(x => x.lo)) / 50) * 50, a1 = Math.ceil(Math.max(...rows.map(x => x.hi)) / 50) * 50, span = a1 - a0 || 1;
  const pos = (v: number) => ((v - a0) / span * 100).toFixed(2);
  const strip = `<div class="dossier-therm" role="img" aria-label="${esc(rows.map(x => `${x.lab}: ${pyFixed(x.lo)} to ${pyFixed(x.hi)} K, mean ${pyFixed(x.mean)} K`).join('. '))}">
    ${rows.map(x => `<div class="dossier-therm-row ${x.cls}"><span>${x.lab}</span><div class="dossier-therm-track"><i class="dossier-therm-bar" style="--a:${pos(x.lo)};--b:${pos(x.hi)}"></i><i class="dossier-therm-mean" style="--v:${pos(x.mean)}"></i></div></div>`).join('')}
    <div class="dossier-therm-row is-axis tnum" aria-hidden="true"><span></span><div class="dossier-therm-axis"><span>${a0} K</span><span>${Math.round((a0 + a1) / 2)} K</span><span>${a1} K</span></div></div></div>`;
  return `<h3>Surface temperature</h3><div class="dossier-tbl"><table>${tcap(`Surface temperature ${tex('T', 'T')} of this Earth window and of the target. Bars show the range, the tick the mean.`)}<thead><tr><th scope="col">Surface</th><th scope="col" class="r">Mean (K)</th><th scope="col" class="r">Range (K)</th><th scope="col">Source</th></tr></thead><tbody>
    ${row('This Earth window', mean / 10, lo / 10, hi / 10, 'NASA MODIS MOD11A2, 2025, clear-sky land-surface temperature')}${ref ? row('Target', ref.mean, ref.lo, ref.hi, ref.what) : ''}</tbody></table></div>
    ${strip}
    ${ref ? `<p class="dossier-note">On average this window is <b>${Math.abs(gap)} K ${gap >= 0 ? 'warmer' : 'colder'}</b> than the target ${tex(String.raw`(\Delta \bar{T} = ${gap >= 0 ? '+' : '-'}${Math.abs(gap)}\,\mathrm{K})`, '')}. The two quantities are not measured the same way.</p>` : ''}`;
}
function mineralRows(d: Record<string, (number | null)[]>, k: number): string {
  const v = (key: string) => d[key]?.[k], cov = v('emit_cov');
  if (cov == null) return '';
  const pct = (x: number | null | undefined) => `${Math.round((x ?? 0) / 10)} %`;
  return `<h3>Surface minerals</h3><p>NASA EMIT observed ${pct(cov)} of this window: clays ${pct(v('emit_clays'))}, carbonates ${pct(v('emit_carbonates'))}, iron oxides ${pct(v('emit_iron_oxides'))} (lower bound), sulfates ${pct(v('emit_sulfates'))}; no detection ${pct(v('emit_none'))}.</p>
    <p class="dossier-note">EMIT-10 weighted shares, 2023–2025, not abundances. EMIT cannot see basalt minerals (olivine, pyroxene, plagioclase).</p>`;
}
