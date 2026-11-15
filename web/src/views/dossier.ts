/** Mission dossier (#/dossier?target=<target id>&window=<region id>_<i>_<j>&route=<points>): one printable page per pair of sites.
 * "Print / Save as PDF" uses the browser's own print dialog (styles in dossier.css, @media print); no PDF library.
 * Every number is read from the exported data (web/public/data); nothing is typed by hand.
 *   target  defaults to the first lunar target; window defaults to the best window (equal weights) for that target.
 *   route   optional traverse drawn in the Mission view: "lon,lat;lon,lat;…" (see parseRoute). Without it, the precomputed
 *           least-cost twin traverse of the target is shown.
 *   when, fidelity   optional: the rehearsal window chosen in Mission (ISO start time, and 0–100 or 0–1 fidelity).
 * AI-assisted (Claude Code); reviewed by the author. */
import './dossier.css';
import { BASE } from '../base';
import { esc, cap, nf, coord, pyFixed } from '../format';
import { getJSON, loadTarget, loadDetail } from '../data';
import { fieldEvents } from '../eonet';
import type { Manifest } from '../types';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const THR_SIMILAR = 0.5, THR_DIFF = 1.5; // same thresholds as pen.scoring.explain()
const optional = <T>(name: string) => getJSON<T>(name).catch(() => null);
const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const topShare = (rank: number, n: number) => { const p = (rank / n) * 100; return p < 0.05 ? 'top < 0.1 %' : `top ${p.toFixed(1)} %`; };
/** Query of the route: the router passes it as params (lib/routes); read from the hash when called without it. */
const query = (params?: Record<string, string>) => new URLSearchParams(params ?? location.hash.split('?')[1] ?? '');

/** Traverse waypoints from the URL: "lon,lat;lon,lat" (also accepts "|" or spaces between points, and a JSON array of pairs). */
export function parseRoute(raw: string | null): [number, number][] {
  if (!raw) return [];
  let pts: unknown = null;
  try { pts = JSON.parse(raw); } catch { /* not JSON */ }
  const pairs = Array.isArray(pts) ? pts : raw.split(/[;|\s]+/).filter(Boolean).map(p => p.split(',').map(Number));
  return (pairs as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v))).map(p => [p[0], p[1]]);
}

/** Bootstrap interval of the combined score, if the statistics export has one for this window. Expected shape (stats/bootstrap.json):
 * { "<target id>": { "<region id>_<i>_<j>": { "lo": 89.1, "hi": 92.7 } } }, optionally nested under "targets". Anything else is ignored. */
function scoreInterval(boot: Rec | null, target: string, wid: string): [number, number] | null {
  if (!boot || boot._stub) return null;
  const e = (boot.targets ?? boot)?.[target]?.[wid];
  const lo = e?.lo ?? e?.ci_lo ?? e?.[0], hi = e?.hi ?? e?.ci_hi ?? e?.[1];
  return typeof lo === 'number' && typeof hi === 'number' ? [lo, hi] : null;
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
  const rv = rover?.[t.id], rvHere = rv && rv.earth_site === r.id && Math.abs(rv.earth_window[0] - lat) < 1e-3 && Math.abs(rv.earth_window[1] - lon) < 1e-3;
  const known = Object.entries((kr?.[t.id] ?? {}) as Record<string, { rank: number; n: number }>).filter(([, v]) => v.rank === rank);
  const [thermal, lowSun] = await Promise.all([thermalRef(t.id, t.body), brief?.csv ? fetch(`${BASE}extras/briefs/${brief.csv}`).then(x => (x.ok ? x.text() : '')).catch(() => '') : '']);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = lowSun.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(c => c.length >= 6 && c[0].slice(0, 10) >= today).slice(0, 4);

  const img = (src: string, alt: string, capt: string) => `<figure><img src="${src}" alt="${esc(alt)}" loading="eager"><figcaption>${capt}</figcaption></figure>`;
  const temp = temperatureRows(det as unknown as Record<string, (number | null)[]>, k, thermal);
  const minerals = mineralRows(det as unknown as Record<string, (number | null)[]>, k);

  el.innerHTML = `<article class="dossier page-in">
  <div class="dossier-tools"><a class="link" href="#/explore">← Back to the map</a><button class="btn primary" id="dossier-print">Print / Save as PDF</button></div>
  ${missing ? `<p class="dossier-warn" role="status">Window “${esc(want ?? '')}” was not found for ${esc(t.name)}; showing its best window instead.</p>` : ''}
  <header class="dossier-head"><p class="dossier-kicker">P.E.N. mission dossier · ${esc(cap(t.body))} analog field test</p>
    <h1>${esc(t.name)} <span>↔</span> ${esc(r.name)}</h1>
    <p class="dossier-sub tnum">${esc(t.label.split('·').pop()!.trim())} · Earth window ${coord(lat, lon)}${where ? ` · ${esc(where)}` : ''} · ${m.window_km} km × ${m.window_km} km at 30 m</p></header>

  <section class="dossier-sec dossier-top"><div class="dossier-score"><b class="tnum">${pyFixed(score)}</b><span>/ 100 combined${ci ? `<br><i class="tnum">95 % interval ${pyFixed(ci[0])}–${pyFixed(ci[1])}</i>` : ''}</span></div>
    <dl class="dossier-facts"><div><dt>Rank</dt><dd class="tnum">#${nf(rank)} of ${nf(n)}</dd></div><div><dt>Share</dt><dd class="tnum">${topShare(rank, n)}</dd></div>
      ${dims.map(d => `<div><dt>${esc(cap(d))}</dt><dd class="tnum">${pyFixed((core[`score_${d}`] as number[])[k] / sc.score)}</dd></div>`).join('')}</dl></section>

  <section class="dossier-sec"><h2>Why this site</h2>
    <p>Among ${nf(n)} Earth windows of ${m.window_km} km in ${m.regions.length} regions, this one ranks <b>#${nf(rank)}</b> (${topShare(rank, n)}) for ${esc(t.name)} with equal weights for terrain and low-Sun illumination.${known.length ? ` It contains ${esc(known.map(x => x[0]).join(' and '))}, a known analog site that P.E.N. was never told about.` : ''}</p>
    <dl class="dossier-explain"><dt>Similar in</dt><dd>${similar.length ? esc(similar.join(' · ')) : '—'}</dd><dt>Differs in</dt><dd>${differs.length ? esc(differs.join(' · ')) : 'nothing beyond 1.5 IQR'}</dd></dl>
    <div class="dossier-tbl"><table><thead><tr><th>Feature</th><th>Difference (IQR units)</th><th>Reading</th></tr></thead><tbody>
      ${dv.map(x => `<tr><th scope="row">${esc(m.feature_labels[x.f])}</th><td class="tnum">${x.v > 0 ? '+' : x.v < 0 ? '−' : ''}${Math.abs(x.v).toFixed(2)}</td><td>${Math.abs(x.v) <= THR_SIMILAR ? 'similar' : Math.abs(x.v) >= THR_DIFF ? 'different' : 'close'}</td></tr>`).join('')}</tbody></table></div>
    <p class="dossier-note">Difference = (Earth − target) / inter-quartile range over all Earth windows. |d| ≤ 0.5 similar, |d| ≥ 1.5 different. Score S = 100 · exp(−D).</p></section>

  <section class="dossier-sec"><h2>Same low Sun, same scale</h2><div class="dossier-figs">
    ${img(`${BASE}thumbs/ref/${t.id}.jpg`, `${t.name}, reference window under a low Sun`, `${esc(t.name)} · modelled shadows, Sun 3° from SW`)}
    ${has(m.previews.low) ? img(`${BASE}thumbs/win/${wid}.jpg`, `${r.name}, Earth window under a low Sun`, `${esc(r.name)} · same Sun, same scale`) : ''}
    ${img(`${BASE}thumbs/ref_real/${t.id}.jpg`, `${t.name}, real view`, `Real view · ${esc(credits?.[`ref__${t.id}`] ?? 'NASA imagery')}`)}
    ${has(m.previews.real) ? img(`${BASE}thumbs/real/${wid}.jpg`, `${r.name}, real view`, `Real view · ${esc(credits?.[wid] ?? 'NASA imagery')}`) : ''}</div></section>

  <section class="dossier-sec"><h2>When to go</h2>
    ${when ? `<p class="dossier-pick">Rehearsal window chosen in Mission: <b class="tnum">${esc(when.replace('T', ' '))} UTC</b>${Number.isFinite(fid) && fid > 0 ? ` · rehearsal fidelity <b class="tnum">${pyFixed(fid <= 1 ? fid * 100 : fid)} %</b>` : ''}</p>` : ''}
    ${brief?.block ? `<p>Best 14-day campaign block at ${esc(r.name)}: <b>${esc(brief.block)}</b>, with <b>${brief.min_day} min/day</b> of Sun 0–7° above the horizon, the elevation range of the lunar south pole.</p>` : `<p>No campaign calendar was generated for ${esc(r.name)} yet. The When view gives the hours per day of Sun 0–7° for every region and month.</p>`}
    ${upcoming.length ? `<div class="dossier-tbl"><table><caption>Next low-Sun windows (Sun 0–7°), UTC</caption><thead><tr><th>Start</th><th>End</th><th>Minutes</th><th>Sun azimuth</th><th>Kind</th></tr></thead><tbody>
      ${upcoming.map(c => `<tr><th scope="row" class="tnum">${esc(c[0].replace('T', ' '))}</th><td class="tnum">${esc(c[1].slice(11))}</td><td class="tnum">${esc(c[2])}</td><td class="tnum">${esc(c[3])}°–${esc(c[4])}°</td><td>${esc(c[5])}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${brief ? `<p class="dossier-links dossier-noprint">${brief.calendar ? `<a class="link" download href="${BASE}extras/briefs/${brief.calendar}">Calendar .ics</a>` : ''}${brief.csv ? `<a class="link" download href="${BASE}extras/briefs/${brief.csv}">All low-Sun windows (CSV)</a>` : ''}${brief.brief ? `<a class="link" download href="${BASE}extras/briefs/${brief.brief}">Field brief</a>` : ''}</p>` : ''}</section>

  ${route.length || rv ? `<section class="dossier-sec"><h2>Traverse and telemetry</h2>
    ${route.length ? `<p>Traverse drawn in Mission: <b>${route.length} waypoints</b>.</p><ol class="dossier-route tnum">${route.map(p => `<li>${coord(p[1], p[0])}</li>`).join('')}</ol>` : ''}
    ${rv ? `<p>${route.length ? 'For reference, the' : 'The'} precomputed least-cost twin traverse for ${esc(t.name)}${rvHere ? ' and this Earth window' : ` uses the Earth window at ${coord(rv.earth_window[0], rv.earth_window[1])}`}: the same cost function on both bodies, slopes above 20° impassable.</p>
    <div class="dossier-split"><div class="dossier-tbl"><table><thead><tr><th></th><th>${esc(t.name)}</th><th>Earth analog</th></tr></thead><tbody>
      ${([['Length', (o: Rec) => `${o.length_km.toFixed(2)} km`], ['Climb', (o: Rec) => `${nf(o.climb_m)} m`], ['Descent', (o: Rec) => `${nf(o.descent_m)} m`], ['Max slope', (o: Rec) => `${o.max_slope_deg.toFixed(1)}°`], ['Mean slope', (o: Rec) => `${o.mean_slope_deg.toFixed(1)}°`], ['Route in shadow (Sun 2°)', (o: Rec) => `${pyFixed(o.share_in_shadow * 100)} %`], ['Window impassable', (o: Rec) => `${pyFixed(o.share_window_impassable * 100)} %`]] as [string, (o: Rec) => string][])
        .map(([l, f]) => `<tr><th scope="row">${l}</th><td class="tnum">${f(rv.target)}</td><td class="tnum">${f(rv.earth)}</td></tr>`).join('')}</tbody></table></div>
    ${m.extras[t.id]?.rover ? `<div class="dossier-figs one">${img(`${BASE}extras/${m.extras[t.id].rover}`, `Least-cost route on ${t.name} and its Earth analog`, 'Least-cost route on both windows.')}</div>` : ''}</div>` : ''}</section>` : ''}

  <section class="dossier-sec"><h2>Where the analogy breaks</h2>
    <ul class="dossier-list">${(repro[t.id] ?? []).map(s => `<li>${bold(s)}</li>`).join('')}</ul>
    ${temp}${minerals}</section>

  <section class="dossier-sec"><h2>Field safety</h2><div id="dossier-eonet" aria-live="polite"><p class="dossier-note">Checking NASA EONET for open natural events within 150 km…</p></div></section>

  <section class="dossier-sec"><h2>Data and credits</h2>
    <p class="dossier-note">Terrain: ${t.body === 'moon' ? 'NASA LRO LOLA 5 m south-pole DEMs (GSFC PGDA)' : 'NASA MRO CTX stereo DTMs (USGS Astrogeology)'} and ESA Copernicus DEM GLO-30, on a common 30 m grid. Light: exact cast-shadow model, validated against the NASA LOLA average-illumination map. Temperature: ${t.body === 'moon' ? 'NASA LRO Diviner polar resource product' : 'Mars Climate Database v6.2 (model)'} and NASA MODIS MOD11A2. Minerals: NASA EMIT L2B V002. Imagery: NASA Moon/Mars Trek WMTS and GIBS. Field safety: NASA EONET v3. Analogs reproduce terrain and light only; temperature, minerals and field safety are context, not scored. Not endorsed by NASA or ESA. Built with AI assistance (see the repository README).</p>
    <p class="dossier-note tnum">P.E.N. · Planetary Environmental Navigator · data ${esc(m.data_hash)} · generated ${today} · ${esc(location.origin + location.pathname)}#/dossier?target=${esc(t.id)}&amp;window=${esc(wid)}</p></section>
  </article>`;

  el.querySelector('#dossier-print')!.addEventListener('click', () => window.print());
  fieldEvents(r.id, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000).then(({ events, how }) => {
    const box = el.querySelector('#dossier-eonet'); if (!box) return;
    if (events === null) box.innerHTML = `<p>Field-safety data is unavailable right now. Check NASA EONET before travel.</p>`;
    else if (!events.length) box.innerHTML = `<p><b>No open natural events within 150 km</b> <span class="dossier-dim">(NASA EONET, ${esc(how)})</span>. Check again before travel.</p>`;
    else box.innerHTML = `<p><b>${events.length} open natural event${events.length === 1 ? '' : 's'} within 150 km</b> <span class="dossier-dim">(NASA EONET, ${esc(how)})</span>. Check again before travel.</p>
      <ul class="dossier-list">${events.slice(0, 4).map(e => `<li>${esc(e.title)} <span class="dossier-dim tnum">(${esc(e.category)}, ${esc(e.date)}, ~${e.distance_km} km away)</span></li>`).join('')}</ul>`;
  });
}
export { render as renderDossier };

// ---- context, not scored: temperature of this Earth window (MODIS) against the target (Diviner or Mars Climate Database)
type Thermal = { mean: number; lo: number; hi: number; what: string } | null;
async function thermalRef(id: string, body: string): Promise<Thermal> {
  const pick = async (file: string) => (await optional<{ sites: Record<string, Record<string, number>> }>(file))?.sites[id];
  if (body === 'moon') { const v = await pick('diviner'); return v ? { mean: v.temp_avg_mean_K, lo: v.temp_avg_min_K, hi: v.temp_max_max_K, what: 'LRO Diviner, measured: annual mean 2 cm below the surface; coldest mean to hottest surface maximum' } : null; }
  if (body === 'mars') { const v = await pick('mars_context'); return v ? { mean: v.tsurf_mean_K, lo: v.tsurf_min_K, hi: v.tsurf_max_K, what: 'Mars Climate Database v6.2, modelled surface temperature' } : null; }
  return null;
}
function temperatureRows(d: Record<string, (number | null)[]>, k: number, ref: Thermal): string {
  const mean = d.lst_mean?.[k], lo = d.lst_min?.[k], hi = d.lst_max?.[k];
  if (mean == null || lo == null || hi == null) return '';
  const row = (lab: string, a: number, b: number, c: number, src: string) => `<tr><th scope="row">${lab}</th><td class="tnum">${pyFixed(a)} K</td><td class="tnum">${pyFixed(b)}–${pyFixed(c)} K</td><td>${esc(src)}</td></tr>`;
  const gap = ref ? Math.round(mean / 10 - ref.mean) : 0;
  return `<h3>Surface temperature</h3><div class="dossier-tbl"><table><thead><tr><th></th><th>Mean</th><th>Range</th><th>Source</th></tr></thead><tbody>
    ${row('This Earth window', mean / 10, lo / 10, hi / 10, 'NASA MODIS MOD11A2, 2025, clear-sky land-surface temperature')}${ref ? row('Target', ref.mean, ref.lo, ref.hi, ref.what) : ''}</tbody></table></div>
    ${ref ? `<p class="dossier-note">On average this window is <b>${Math.abs(gap)} K ${gap >= 0 ? 'warmer' : 'colder'}</b> than the target. The two quantities are not measured the same way.</p>` : ''}`;
}
function mineralRows(d: Record<string, (number | null)[]>, k: number): string {
  const v = (key: string) => d[key]?.[k], cov = v('emit_cov');
  if (cov == null) return '';
  const pct = (x: number | null | undefined) => `${Math.round((x ?? 0) / 10)} %`;
  return `<h3>Surface minerals</h3><p>NASA EMIT observed ${pct(cov)} of this window: clays ${pct(v('emit_clays'))}, carbonates ${pct(v('emit_carbonates'))}, iron oxides ${pct(v('emit_iron_oxides'))} (lower bound), sulfates ${pct(v('emit_sulfates'))}; no detection ${pct(v('emit_none'))}.</p>
    <p class="dossier-note">EMIT-10 weighted shares, 2023–2025, not abundances. EMIT cannot see basalt minerals (olivine, pyroxene, plagioclase).</p>`;
}
