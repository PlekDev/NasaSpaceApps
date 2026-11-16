// AI-assisted (Claude Code); reviewed by the author.
/** Explore: the globe with an overview (target, six live cards) and a zone view (imagery, the zone's own cards, link to its dossier).
 *  Every number is recomputed in the browser from the exported per-window scores when a weight or the minimum score moves.
 *  Layout and behaviour follow the Mission Stage prototype. */
import { BASE } from './base';
import { esc, nf, coord, pyFixed } from './format';
import { icon } from './icons';
import { score, type Scored } from './model';
import { createDeferredView, type View, type MapMarker } from './view';
import { createStore, type Store } from './store';
import { getJSON, loadTarget, loadDetail } from './data';
import { $, html, isPhone, popover } from './ui';
import { footerHTML, creditsHTML } from './footer';
import { ABOUT, TOPO_SOURCE } from './lib/about';
import { rankScores, zoneStats, siteRank, windowsAt, d2Arrays, combineAll, sweepRank, type Ranks, type ZoneStat } from './lib/live';
import './explore.css';
import type { Manifest, TargetData } from './types';

/** Zoom at which the globe is `px` pixels across (calibrated: 685 px at z 2.35 in MapLibre's globe). */
const zoomForGlobe = (px: number) => 2.35 + Math.log2(px / 685);
const f1 = (v: number) => pyFixed(v, 1);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const where = (r: { place: string; cc: string }) => [r.place, r.cc].filter(Boolean).join(', ');

export interface Explore { store: Store; view: View; ready: Promise<void>; show(on: boolean): void; overview(animate?: boolean): void; focus(p: { target?: string; region?: string }): void }

interface KnownSite { name: string; lat: number; lon: number; analog_for: string[] | string }
interface Known { name: string; lat: number; lon: number; zone: number; w: number[]; now: { rank: number; best: number }; was: { rank: number; best: number }; nasa: boolean }
interface NullStats { _stub?: boolean; pu_uhiwahine?: Record<string, { rank: number; p_value_region_matched: number; p_bonferroni: number }> }
interface Derived {
  sc: Scored; rk: Ranks; Z: ZoneStat[]; Zs: ZoneStat[]; top10: number[]; base10: number[]; kept: number[]; above: number; bins: number[];
  known: Known[]; puu: Known | null; moved: boolean; zero: boolean;
}
interface TargetCache { d2: Float32Array[]; baseS: Float32Array; baseRk: Ranks; sites: Map<string, number[]>; bounds: [number, number, number, number][] }

const CARDS_OVERVIEW = ['best', 'nasa', 'dist', 'regions', 'sens', 'scatter'] as const;
const CARDS_ZONE = ['zwin', 'zknown', 'zpass', 'zrank'] as const;
type CardId = typeof CARDS_OVERVIEW[number] | typeof CARDS_ZONE[number];

export function mountExplore(root: HTMLElement, m: Manifest, theme: () => string, startTarget: string): Explore {
  const dims = Object.keys(m.dims), counts = dims.map(d => m.dims[d].length), NZ = m.regions.length, N = m.windows_per_target;
  const store = createStore({ target: startTarget, weights: Object.fromEntries(dims.map(d => [d, 1])), minScore: 60,
    regions: new Set(m.regions.map(r => r.id)), hover: null, selected: null, expanded: null, zone: null });
  const S = store.state;
  const tgt = () => m.targets.find(t => t.id === S.target)!;
  const dimLabel = (d: string) => (d === 'illumination' ? 'Low-Sun illumination' : d.charAt(0).toUpperCase() + d.slice(1));
  let data: TargetData, X: Derived, tc: TargetCache | null = null, det: { i: number[]; j: number[] } | null = null;
  const cache = new Map<string, TargetCache>();
  let nul: NullStats | null = null, nMoonTests = 0, known0: KnownSite[] = [], far: Record<string, any> | null = null, credits: Record<string, string> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  const bestOf = new Map<string, number>();   // best equal-weights score per target, for the target menu
  const baseBest = (x: TargetData) => { const c = combineAll(d2Arrays(dims.map(k => (x[`score_${k}`] as number[]).map(v => v / m.scale.score))), dims.map(() => 1), counts); return c.reduce((a, v) => Math.max(a, v), 0); };
  let dd: 't' | 'z' | null = null, openCard: CardId | null = null, panelKey = '';

  root.insertAdjacentHTML('beforeend', `
  <div id="map" role="application" aria-label="Globe with every Earth window that scores at or above your minimum"></div>
  <div class="tip" id="tip" hidden></div>
  <main class="explore ex" id="explore">
   <div class="dock" id="dock">
    <button class="grab" id="grab" aria-label="Resize panel" aria-expanded="false"><span></span></button>
    <aside class="ex-left panel" aria-label="Controls">
      <div class="ex-sec"><div class="ex-sec-h"><span class="ex-n" aria-hidden="true">01</span><span class="ex-cap">Target</span></div><div class="ex-dd" id="dd-t"></div></div>
      <div class="ex-sec"><div class="ex-sec-h"><span class="ex-n" aria-hidden="true">02</span><span class="ex-cap">Weights</span></div>
        ${dims.map(d => slider(`w-${d}`, dimLabel(d), 1, 0, 2, .1)).join('')}${slider('min', 'Minimum score', 60, 0, 100, 1)}</div>
      <div class="ex-sec"><div class="ex-sec-h"><span class="ex-n" aria-hidden="true">03</span><span class="ex-cap">Zone</span></div><div class="ex-dd" id="dd-z"></div>
        <div class="ex-row"><button type="button" class="btn" id="ex-reset">Reset weights</button><span class="ex-live" id="ex-live"><i></i><span></span></span></div></div>
    </aside>
    <aside class="ex-right" id="ex-right" aria-live="polite"><div id="ex-panel"></div></aside>
    <div class="ex-legend ex-glass" id="ex-legend"></div>
    ${footerHTML(m)}
   </div>
  </main>
  <div id="ex-focus" hidden><div class="ex-modal panel" id="ex-modal" role="dialog" aria-modal="true" aria-labelledby="ex-m-title"></div></div>
  ${creditsHTML(m)}`);

  function slider(id: string, name: string, val: number, min: number, max: number, step: number) {
    return `<div class="ex-sl"><label for="${id}">${name}</label><output class="tnum" for="${id}" id="${id}-o">${val.toFixed(step < 1 ? 1 : 0)}</output>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="--p:${((val - min) / (max - min)) * 100}%"><span class="ex-ends" aria-hidden="true"><span>${min}</span><span>${max}</span></span></div>`;
  }
  const mapEl = $('#map', root), panelEl = $('#ex-panel', root), focusEl = $('#ex-focus', root), modalEl = $('#ex-modal', root);
  const view = createDeferredView(mapEl, [0, 20], isPhone() ? 1.2 : 2.6, theme);
  const tip = $('#tip', root);
  view.ready.then(() => { if (view.dead) mapEl.innerHTML = '<p class="nogl">The map needs WebGL, which is not available in this browser. Rankings, filters and every card still work.</p>'; });

  // ---------- phone sheet snap points
  const dock = $('#dock', root), grab = $('#grab', root);
  const homeOn = () => document.documentElement.dataset.intro !== undefined;
  const snaps = () => [168, Math.round(innerHeight * .55), innerHeight - 64];
  let snap = 0;
  const cssPx = (v: string, d: number) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)) || d;
  /** Map padding: the globe is centred in the part of the screen the panels leave free. */
  const pad = () => isPhone() ? { top: 52, bottom: Math.round(Math.min(dock.getBoundingClientRect().height, innerHeight * .6)), left: 0, right: 0 }
    : { top: 68, bottom: 96, left: cssPx('--col-l', 300) + 32, right: cssPx('--col-r', 372) + 32 };
  let lastPad = '';
  const applyPad = () => { if (homeOn()) return; const p = pad(), key = JSON.stringify(p); if (key === lastPad) return; lastPad = key; view.setPadding(p); };   // an unchanged padding must not cancel a flight in progress
  const applySnap = (h: number, i = snap) => {
    if (i > 0 && snap === 0) dock.scrollTop = 0;
    snap = i; dock.style.setProperty('--sheet-h', `${h}px`); dock.dataset.snap = ['peek', 'half', 'full'][i]; grab.setAttribute('aria-expanded', String(i > 0)); applyPad();
  };
  const setSnap = (i: number) => applySnap(snaps()[i], i);
  grab.addEventListener('click', () => setSnap((snap + 1) % 3));
  let drag: { y: number; h: number; t: number } | null = null;
  grab.addEventListener('pointerdown', e => { if (!isPhone()) return; drag = { y: e.clientY, h: dock.getBoundingClientRect().height, t: e.timeStamp }; dock.classList.add('dragging'); (e.target as Element).setPointerCapture?.(e.pointerId); });
  grab.addEventListener('pointermove', e => { if (!drag) return; dock.style.setProperty('--sheet-h', `${Math.max(120, Math.min(innerHeight - 64, drag.h + drag.y - e.clientY))}px`); });
  const endDrag = (e: PointerEvent) => {
    if (!drag) return; dock.classList.remove('dragging');
    const h = dock.getBoundingClientRect().height, v = (drag.y - e.clientY) / Math.max(e.timeStamp - drag.t, 1), s = snaps();
    const moved = Math.abs(drag.y - e.clientY) > 6; drag = null; if (!moved) return;
    const proj = h + v * 160; let best = 0; s.forEach((x, i) => { if (Math.abs(x - proj) < Math.abs(s[best] - proj)) best = i; }); setSnap(best);
  };
  grab.addEventListener('pointerup', endDrag); grab.addEventListener('pointercancel', endDrag);
  addEventListener('resize', () => { setSnap(isPhone() ? snap : 0); });

  // ---------- derived numbers (recomputed on every input)
  function targetCache(sc: Scored): TargetCache {
    let c = cache.get(S.target); if (c) return c;
    const d2 = d2Arrays(sc.dim), baseS = combineAll(d2, dims.map(() => 1), counts), sites = new Map<string, number[]>();
    for (const k of known0) sites.set(k.name, windowsAt(sc.lon, sc.lat, k.lon, k.lat, m.window_km));
    const bounds: [number, number, number, number][] = m.regions.map(() => [1e9, 1e9, -1e9, -1e9]);
    for (let i = 0; i < sc.n; i++) { const b = bounds[sc.site[i]]; if (sc.lon[i] < b[0]) b[0] = sc.lon[i]; if (sc.lat[i] < b[1]) b[1] = sc.lat[i]; if (sc.lon[i] > b[2]) b[2] = sc.lon[i]; if (sc.lat[i] > b[3]) b[3] = sc.lat[i]; }
    c = { d2, baseS, baseRk: rankScores(baseS), sites, bounds }; cache.set(S.target, c); return c;
  }
  function compute() {
    const sc = score(m, data, S.weights, S.minScore, S.regions); tc = targetCache(sc);
    const rk = rankScores(sc.s), Z = zoneStats(sc.s, sc.site, NZ, S.minScore), Zs = [...Z].sort((a, b) => a.rank - b.rank);
    const top10 = Array.from(rk.order.slice(0, 10)), base10 = Array.from(tc.baseRk.order.slice(0, 10)), bins = new Array<number>(50).fill(0);
    let above = 0; for (const z of Z) { above += z.above; z.bins.forEach((n, i) => { bins[i] += n; }); }
    const body = tgt().body, kn: Known[] = [];
    for (const k of known0) {
      const w = tc.sites.get(k.name) ?? []; if (!w.length || !(Array.isArray(k.analog_for) ? k.analog_for : k.analog_for.split(',')).includes(body)) continue;
      kn.push({ name: k.name, lat: k.lat, lon: k.lon, zone: sc.site[w[0]], w, now: siteRank(sc.s, w), was: siteRank(tc.baseS, w), nasa: /hiwahine/i.test(k.name) });
    }
    const puuW = known0.filter(k => /hiwahine/i.test(k.name)).map(k => tc!.sites.get(k.name) ?? [])[0] ?? [], pk = known0.find(k => /hiwahine/i.test(k.name));
    const puu: Known | null = pk && puuW.length ? { name: pk.name, lat: pk.lat, lon: pk.lon, zone: sc.site[puuW[0]], w: puuW, now: siteRank(sc.s, puuW), was: siteRank(tc.baseS, puuW), nasa: true } : null;
    bestOf.set(S.target, tc.baseS[tc.baseRk.order[0]]);
    X = { sc, rk, Z, Zs, top10, base10, kept: top10.filter(w => base10.includes(w)), above, bins, known: kn, puu,
      moved: dims.some(d => S.weights[d] !== 1), zero: sc.zeroWeights };
  }
  const curWin = () => (S.zone != null && S.selected != null && X.sc.site[S.selected] === S.zone ? S.selected : X.Z[S.zone ?? 0].bi);
  const wid = (k: number) => (det ? `${m.regions[X.sc.site[k]].id}_${det.i[k]}_${det.j[k]}` : null);
  const dossier = (k: number | null) => { const w = k == null ? null : wid(k); return `#/dossier?target=${encodeURIComponent(S.target)}${w ? `&window=${encodeURIComponent(w)}` : ''}`; };
  const regionOf = (k: number) => m.regions[X.sc.site[k]];

  // ---------- count-up numbers
  const PREV: Record<string, number> = {};
  const fmt = (v: number, f: string) => (f === 'i' ? nf(Math.round(v)) : f === '#' ? `#${nf(Math.round(v))}` : f1(v));
  function tween(rootEl: ParentNode) {
    rootEl.querySelectorAll<HTMLElement>('[data-n]').forEach(el => {
      const k = el.dataset.k!, to = Number(el.dataset.n), f = el.dataset.f!, from = PREV[k] ?? to; PREV[k] = to;
      const node = el.firstChild!; if (reduced() || from === to) { node.nodeValue = fmt(to, f); return; }
      const t0 = performance.now();
      const step = (t: number) => { const p = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - p, 3); node.nodeValue = fmt(from + (to - from) * e, f); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  const num = (k: string, v: number, f: string, unit?: string) => `<span class="ex-num"><span data-k="${k}" data-n="${v}" data-f="${f}">${fmt(v, f)}</span>${unit ? `<small>${unit}</small>` : ''}</span>`;

  // ---------- chart pieces (rank on a log scale, histogram, zone bars)
  const logp = (r: number) => `${((100 * Math.log(r)) / Math.log(N)).toFixed(2)}%`;
  const rankTrack = (now: number, was: number) => `<span class="ex-ml"><s style="left:${logp(was)}"></s><b style="left:${logp(now)}"></b><span>#1</span><span>#100</span><span>#10k</span></span>`;
  const hist = (bins: number[], h?: number) => { const mx = Math.max(...bins) || 1;
    return `<span class="ex-hist"${h ? ` style="--h:${h}px"` : ''}>${bins.map((n, i) => `<i class="${2 * i + 2 > S.minScore ? 'on' : ''}" style="height:${((100 * n) / mx).toFixed(1)}%" title="${2 * i}–${2 * i + 2}: ${nf(n)} windows"></i>`).join('')}<em style="left:${S.minScore}%"></em></span>`; };
  const arrow = (now: number, was: number) => (now === was ? '<small>=</small>' : now < was ? `<span class="up">▲ ${nf(was - now)}</span>` : `<span class="down">▼ ${nf(now - was)}</span>`);

  // ---------- cards: a number, one mini chart, one sentence
  interface Card { cap: string; num: string; chip?: [string, boolean] | null; txt: string; mini: string }
  const bar = (v: number) => `<i style="--w:${v}%"></i>`;
  const CARD: Record<CardId, () => Card | null> = {
    best() { const w = X.top10[0], w0 = X.base10[0]; return { cap: 'Best match on Earth', num: num('best', X.sc.s[w], '1', 'of 100'), chip: X.moved ? [w === w0 ? 'Same window' : 'Changed', w !== w0] : null,
      txt: `<b>${esc(regionOf(w).name)}</b>, ${esc(regionOf(w).place)}.`, mini: `<span class="ex-mb">${X.top10.slice(0, 5).map(i => bar(X.sc.s[i])).join('')}</span>` }; },
    nasa() { const p = X.puu; if (!p) return null; return { cap: "NASA's test site", num: num('nasa', p.now.rank, '#', `of ${nf(N)}`), chip: X.moved ? [p.now.rank === p.was.rank ? `Still #${nf(p.was.rank)}` : `Was #${nf(p.was.rank)}`, p.now.rank !== p.was.rank] : null,
      txt: "Pu'u Hiwahine, where NASA rehearsed a lunar-polar mission in 2012, ranked with your weights.", mini: rankTrack(p.now.rank, p.was.rank) }; },
    dist() { return { cap: 'Windows above your minimum', num: num('dist', X.above, 'i', `${((100 * X.above) / N).toFixed(1)} %`), txt: `Of ${nf(N)} Earth windows, these score <b>${S.minScore} or more</b>.`, mini: hist(X.bins) }; },
    regions() { const ok = X.Z.filter(z => z.above > 0).length; return { cap: 'Zones that qualify', num: num('reg', ok, 'i', `of ${NZ}`), txt: `Zones with at least one window at <b>${S.minScore}+</b>. Open to rank all ${NZ}.`,
      mini: `<span class="ex-ms">${X.Zs.map(z => `<i class="${z.above ? 'on' : ''}" style="height:${Math.max(4, z.best)}%"></i>`).join('')}</span>` }; },
    sens() { const k = X.kept.length; return { cap: 'How much your weights change it', num: num('sens', k, 'i', 'of 10 kept'), chip: X.moved ? [k === 10 ? 'Same top 10' : `${10 - k} replaced`, k !== 10] : null,
      txt: X.moved ? 'Top windows that are the same as with equal weights.' : 'Move a weight to see how many top windows survive.', mini: `<span class="ex-mq">${X.top10.map(w => `<i class="${X.base10.includes(w) ? 'on' : ''}"></i>`).join('')}</span>` }; },
    scatter() { const w = X.top10[0]; return { cap: 'Terrain vs light', num: `<span class="ex-num">${f1(X.sc.dim[0][w])} · ${f1(X.sc.dim[1][w])}</span>`, txt: 'Best window: terrain score · low-Sun light score. Few windows match both.', mini: '<canvas class="ex-mc" data-sc="mini"></canvas>' }; },
    zwin() { const z = S.zone!, w = curWin(), best = w === X.Z[z].bi; return { cap: best ? 'Best window in this zone' : 'Selected window', num: num('zwin', X.sc.s[w], '1', 'of 100'), chip: best ? null : ['Selected', false],
      txt: `<b>#${nf(X.rk.rank[w])}</b> of ${nf(N)} · ${coord(X.sc.lat[w], X.sc.lon[w])}`, mini: `<span class="ex-mb">${bar(X.sc.dim[0][w])}${bar(X.sc.dim[1][w])}</span>` }; },
    zpass() { const z = X.Z[S.zone!]; return { cap: 'Windows here above your minimum', num: num('zpass', z.above, 'i', `of ${nf(z.n)}`), txt: `${((100 * z.above) / z.n).toFixed(1)} % of this zone scores <b>${S.minScore}+</b>. A whole area, or a few lucky windows?`, mini: hist(z.bins) }; },
    zrank() { const z = X.Z[S.zone!]; return { cap: `Rank among the ${NZ} zones`, num: num('zrank', z.rank, '#', `of ${NZ}`),
      txt: z.rank === 1 ? `The closest zone to ${esc(tgt().name)} with your weights.` : `<b>${f1(X.Zs[0].best - z.best)}</b> points below the best zone, ${esc(m.regions[X.Zs[0].zone].name)}.`,
      mini: `<span class="ex-ms">${X.Zs.map(q => `<i class="${q.zone === S.zone ? 'me' : q.above ? 'on' : ''}" style="height:${Math.max(4, q.best)}%"></i>`).join('')}</span>` }; },
    zknown() { const k = X.known.find(s => s.zone === S.zone); if (!k) return null;
      return { cap: k.nasa ? "NASA's test site is here" : 'Known analog site here', num: num('zknown', k.now.rank, '#', `of ${nf(N)}`), chip: X.moved ? [k.now.rank === k.was.rank ? 'Unchanged' : `Was #${nf(k.was.rank)}`, k.now.rank !== k.was.rank] : null,
        txt: `<b>${esc(k.name.split(',')[0])}</b>${k.nasa ? ', never shown to P.E.N.' : ', a site used as an analog before.'}`, mini: rankTrack(k.now.rank, k.was.rank) }; },
  };
  const cardHTML = (id: CardId, i: number) => { const c = CARD[id](); if (!c) return '';
    return `<button type="button" class="ex-card ex-glass" data-card="${id}" style="--i:${i}"><span class="ex-cap">${c.cap}${icon.chevron}</span>${c.num}<span class="ex-txt">${c.txt}${c.chip ? `<span class="ex-chip${c.chip[1] ? ' is-moved' : ''}">${esc(c.chip[0])}</span>` : ''}</span><span class="ex-mini">${c.mini}</span></button>`; };

  // ---------- the details behind each card (opened in focus)
  function winTable(list: number[], vsEqual: boolean) {
    return `<div class="ex-tbl"><table><thead><tr><th>#</th><th>Zone</th><th>Centre</th><th class="n">Score</th><th class="n">${esc(dimLabel(dims[0]))}</th><th class="n">${esc(dimLabel(dims[1]))}</th>${vsEqual ? '<th class="n">vs equal</th>' : ''}<th></th></tr></thead><tbody>`
      + list.map((i, k) => `<tr class="go${k ? '' : ' hi'}" data-gow="${i}"><td>${nf(X.rk.rank[i])}</td><td>${esc(regionOf(i).name)}</td><td>${coord(X.sc.lat[i], X.sc.lon[i])}</td><td class="n">${f1(X.sc.s[i])}</td><td class="n">${f1(X.sc.dim[0][i])}</td><td class="n">${f1(X.sc.dim[1][i])}</td>`
        + `${vsEqual ? `<td class="n">${arrow(X.rk.rank[i], tc!.baseRk.rank[i])}</td>` : ''}<td class="n">${det ? `<a href="${dossier(i)}">Review</a>` : ''}</td></tr>`).join('') + '</tbody></table></div>';
  }
  function zoneTable() {
    return `<div class="ex-tbl"><table><thead><tr><th>#</th><th>Zone</th><th class="n">Best</th><th class="n">Windows ${S.minScore}+</th><th class="n">Share</th></tr></thead><tbody>`
      + X.Zs.map(z => `<tr class="go${z.zone === S.zone ? ' hi' : ''}" data-goz="${z.zone}"><td>${z.rank}</td><td><i class="ex-sw" style="background:${z.above ? rampC(z.best) : 'var(--text-3)'}"></i>${esc(m.regions[z.zone].name)} <small>${esc(where(m.regions[z.zone]))}</small></td><td class="n">${f1(z.best)}</td><td class="n">${nf(z.above)}</td><td class="n">${((100 * z.above) / z.n).toFixed(1)} %</td></tr>`).join('') + '</tbody></table></div>';
  }
  const rampStops = [[28, 61, 110], [42, 120, 214], [109, 167, 236], [255, 209, 102]];
  const rampC = (v: number) => { const t = Math.max(0, Math.min(1, (v - S.minScore) / Math.max(100 - S.minScore, 1))) * 3, k = Math.min(2, Math.floor(t)), f = t - k; return `rgb(${rampStops[k].map((c, j) => Math.round(c + (rampStops[k + 1][j] - c) * f)).join(',')})`; };
  function sweepSvg(w: number[]) {
    const sw = sweepRank(tc!.d2, counts, dims.map(d => S.weights[d]), dims.length - 1, w), W = 560, H = 190, L = 44, B = 26, vary = dims.length - 1;
    const x = (v: number) => L + (W - L - 8) * v / 2, y = (r: number) => 8 + (H - B - 8) * Math.log(r) / Math.log(N), cur = siteRank(X.sc.s, w).rank;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Rank of the site as the ${esc(dimLabel(dims[vary]))} weight changes">`
      + [1, 10, 100, 1000, N].map(r => `<path class="gl" d="M${L} ${y(r)}H${W - 8}"/><text x="${L - 6}" y="${y(r) + 4}" text-anchor="end">#${r === N ? '10k' : nf(r)}</text>`).join('')
      + [0, .5, 1, 1.5, 2].map(v => `<text x="${x(v)}" y="${H - 6}" text-anchor="middle">${v.toFixed(1)}</text>`).join('')
      + `<path class="ln" d="${sw.map((p, k) => `${k ? 'L' : 'M'}${x(p.w).toFixed(1)} ${y(p.rank).toFixed(1)}`).join('')}"/><rect class="pt" width="9" height="9" transform="translate(${x(S.weights[dims[vary]])} ${y(cur) - 6.4}) rotate(45)"/></svg>`;
  }
  function knownBlock(zone: number | null) {
    const rows = X.known.filter(s => zone == null || s.zone === zone).sort((a, b) => a.now.rank - b.now.rank), base = rows.find(r => r.nasa) ?? rows[0];
    const fx = nul && !nul._stub ? nul.pu_uhiwahine?.[S.target] : undefined, vary = dims[dims.length - 1];
    return `<div><h2>Rank as the ${esc(dimLabel(vary))} weight goes from 0 to 2</h2>${base ? sweepSvg(base.w) : '<p>No known site falls in this zone.</p>'}<p>The other weights stay as you set them. The diamond is you. A flat line near the top means the result does not hinge on the exact weights.</p></div>`
      + `<div><h2>Known ${tgt().body === 'moon' ? 'lunar' : 'Mars'} analog sites</h2><div class="ex-tbl"><table><thead><tr><th>Site</th><th class="n">Rank</th><th class="n">Top</th><th class="n">vs equal</th></tr></thead><tbody>`
      + rows.map(s => `<tr class="${s.nasa ? 'hi' : ''}"><td>${esc(s.name)}</td><td class="n">#${nf(s.now.rank)}</td><td class="n">${((100 * s.now.rank) / N).toFixed(s.now.rank < 100 ? 2 : 1)} %</td><td class="n">${arrow(s.now.rank, s.was.rank)}</td></tr>`).join('') + '</tbody></table></div>'
      + `<p class="ex-note">${fx ? `Fixed test with equal weights: only <b>${(100 * fx.p_value_region_matched).toFixed(1)} %</b> of Mauna Kea scores as high as the NASA site (p = ${fx.p_value_region_matched.toFixed(3)}; ${Number(fx.p_bonferroni.toPrecision(2))} corrected for the lunar targets; ${Number(Math.min(1, fx.p_value_region_matched * nMoonTests).toPrecision(2))} for all ${nMoonTests} lunar site–target tests).` : 'The significance test exists for lunar targets only; for Mars the score does not separate the known sites.'} Live ranks use the 6 km square around each window centre, so they can differ from the exported ranks by a few positions.</p></div>`;
  }
  const DETAIL: Record<CardId, () => string> = {
    best: () => `<div class="wide"><h2>Top 10 windows with your weights</h2>${winTable(X.top10, true)}<p>Pick a row to fly there. <b>Review</b> opens the window's mission dossier.</p></div>`,
    nasa: () => knownBlock(null),
    dist: () => `<div><h2>All ${nf(N)} windows by score</h2>${hist(X.bins, 150)}<div class="ex-hax"><span>0</span><span>50</span><span>100</span></div><p>Most of what we scanned does not look like ${esc(tgt().name)}. Your minimum decides how much of the right tail stays on the globe.</p></div><div><h2>Where they are</h2>${zoneTable()}</div>`,
    regions: () => `<div class="wide"><h2>All ${NZ} zones, best first</h2>${zoneTable()}<p>Pick a zone to fly there. A zone qualifies when at least one of its 6 km windows reaches your minimum.</p></div>`,
    sens: () => { const out = X.base10.filter(w => !X.top10.includes(w));
      return `<div><h2>Your top 10</h2>${winTable(X.top10, true)}</div><div><h2>Left the top 10</h2>${out.length ? winTable(out, true) : '<p>None. Same set as with equal weights.</p>'}<p class="ex-note">Claims should be about zones, not single windows: the exact #1 can change with the weights while the zone stays.</p></div>`; },
    scatter: () => `<div class="wide"><h2>${nf(N)} windows · ${esc(dimLabel(dims[0]).toLowerCase())} across, ${esc(dimLabel(dims[1]).toLowerCase())} up</h2><canvas class="ex-sc" data-sc="big"></canvas><p>Bright dots pass your minimum; the ring is the best match. Many windows match the terrain or the light; very few match both, the top-right corner.</p></div>`,
    zwin: () => { const ws = Array.from(X.rk.order).filter(i => X.sc.site[i] === S.zone).slice(0, 10); return `<div class="wide"><h2>Best 10 windows in ${esc(m.regions[S.zone!].name)}</h2>${winTable(ws, true)}<p>Pick a row to select it on the globe.</p></div>`; },
    zpass: () => { const z = X.Z[S.zone!]; return `<div><h2>${nf(z.n)} windows in this zone</h2>${hist(z.bins, 150)}<div class="ex-hax"><span>0</span><span>50</span><span>100</span></div></div><div><p>${nf(z.above)} of ${nf(z.n)} windows pass. ${z.above / z.n > .05 ? 'That is a broad area, so a team has room to pick a site.' : 'Only a small share passes, so the match depends on a few specific places.'}</p></div>`; },
    zrank: () => `<div class="wide"><h2>All ${NZ} zones</h2>${zoneTable()}</div>`,
    zknown: () => knownBlock(S.zone),
  };

  // ---------- imagery for the zone view
  function winImage(w: number): { src: string; credit: string; exact: boolean; at: number } | null {
    const id = wid(w); if (!id) return null; const real = new Set(m.previews.real);
    if (real.has(id)) return { src: `${BASE}thumbs/real/${id}.jpg`, credit: credits[id] ?? 'NASA imagery', exact: true, at: w };
    let best = -1, bd = 1e9;
    for (let i = 0; i < X.sc.n; i++) { if (X.sc.site[i] !== X.sc.site[w]) continue; const o = wid(i); if (!o || !real.has(o)) continue; const d = (X.sc.lon[i] - X.sc.lon[w]) ** 2 + (X.sc.lat[i] - X.sc.lat[w]) ** 2; if (d < bd) { bd = d; best = i; } }
    return best < 0 ? null : { src: `${BASE}thumbs/real/${wid(best)}.jpg`, credit: credits[wid(best)!] ?? 'NASA imagery', exact: false, at: best };
  }

  // ---------- left panel
  const CHEV_DOWN = icon.chevron.replace('class="i"', 'class="i ex-down"');
  const thumb = (t: { thumb: string | null }, c: string) => (t.thumb ? `<img src="${BASE}thumbs/${t.thumb}" alt="" width="44" height="44" class="${c}">` : '<span class="ex-thumb"></span>');
  function renderLeft() {
    const t = tgt(), z = S.zone == null ? null : X.Z[S.zone];
    $('#dd-t', root).innerHTML = `<button type="button" class="ex-dd-btn" data-dd="t" aria-haspopup="listbox" aria-expanded="${dd === 't'}">${thumb(t, '')}<span><b>${esc(t.name)}</b><small>${t.body === 'moon' ? 'Moon' : 'Mars'} · ${esc(t.detail)}</small></span>${CHEV_DOWN}</button>`
      + (dd === 't' ? `<div class="ex-dd-pop" role="listbox" aria-label="Target">${(['moon', 'mars'] as const).map(b => `<span class="ex-cap">${b === 'moon' ? 'Moon' : 'Mars'}</span>${m.targets.filter(x => x.body === b).map(x => {
        const bv = bestOf.get(x.id); return `<button type="button" class="ex-dd-opt" role="option" data-t="${x.id}" aria-selected="${x.id === S.target}">${thumb(x, '')}<span><b>${esc(x.name)}</b><small>${esc(x.detail)}</small></span>${bv != null ? `<em>${f1(bv)}</em>` : ''}</button>`; }).join('')}`).join('')}</div>` : '');
    $('#dd-z', root).innerHTML = `<button type="button" class="ex-dd-btn is-zone" data-dd="z" aria-haspopup="listbox" aria-expanded="${dd === 'z'}">${z ? `<i class="ex-sw" style="background:${z.above ? rampC(z.best) : 'var(--text-3)'}"></i>` : ''}<span><b>${z ? esc(m.regions[z.zone].name) : `All ${NZ} zones`}</b><small>${z ? `Zone ${z.rank} of ${NZ} · best ${f1(z.best)}` : 'Overview of the globe'}</small></span>${CHEV_DOWN}</button>`
      + (dd === 'z' ? `<div class="ex-dd-pop" role="listbox" aria-label="Zone"><button type="button" class="ex-dd-opt" role="option" data-z="-1" aria-selected="${S.zone == null}"><span><b>All ${NZ} zones</b><small>Overview</small></span></button><span class="ex-cap">Best first, with your weights</span>`
        + X.Zs.map(q => `<button type="button" class="ex-dd-opt" role="option" data-z="${q.zone}" aria-selected="${q.zone === S.zone}"><i class="ex-sw" style="background:${q.above ? rampC(q.best) : 'var(--text-3)'}"></i><span><b>${esc(m.regions[q.zone].name)}</b><small>${esc(where(m.regions[q.zone]))}</small></span><em>${f1(q.best)}</em></button>`).join('') + '</div>' : '');
    for (const d of dims) syncSlider(`w-${d}`, S.weights[d], v => v.toFixed(1)); syncSlider('min', S.minScore, v => String(v));
    const lv = $('#ex-live', root); lv.className = `ex-live${X.moved ? ' is-moved' : ''}`; lv.lastElementChild!.textContent = X.moved ? 'Custom weights · rescored live' : 'Equal weights';
    $('#ex-legend', root).innerHTML = `<p><b>Score</b>: how close a window is to ${esc(t.name)}. Only windows at your minimum or above are shown.</p><div class="ex-bar"></div><div class="ex-ends"><span>${S.minScore} · your minimum</span><span>100 · identical</span></div>`;
    const cr = document.getElementById('crumbs');
    if (cr) cr.innerHTML = `<span>Explore</span><i>/</i><b>${esc(t.name)}</b>${z ? `<i>/</i><b>${esc(m.regions[z.zone].name)}</b>` : ''}`;
  }
  function syncSlider(id: string, v: number, f: (v: number) => string) {
    const el = $<HTMLInputElement>(`#${id}`, root); el.value = String(v); el.style.setProperty('--p', `${((v - +el.min) / (+el.max - +el.min)) * 100}%`); $(`#${id}-o`, root).textContent = f(v);
  }

  // ---------- right panel
  const kicker = () => { const t = tgt(); return `Explore · ${t.body === 'moon' ? 'Moon' : 'Mars'} · ${[t.detail, ...t.tags].map(esc).join(' · ')}`; };
  function panelHTML(): string {
    const t = tgt(), far0 = far?.sites?.[t.id]?.V3_far_curved?.spearman_rho as number | undefined;
    if (X.zero) return `<section class="ex-ph panel"><span class="ex-cap">${kicker()}</span><h1>${esc(t.name)}</h1><p>All weights are 0, so there is no score to compute. Raise a weight to rank the windows.</p></section>`;
    if (S.zone == null) {
      return `<section class="ex-ph panel"><span class="ex-cap">${kicker()}</span><h1>${esc(t.name)}</h1><p>${esc(ABOUT[t.id] ?? t.label)}</p><p class="ex-facts">${esc(TOPO_SOURCE[t.body] ?? '')}${far0 != null ? ` · Light model vs NASA LOLA ρ ${pyFixed(far0, 3)}` : ''}</p></section>`
        + CARDS_OVERVIEW.map((c, i) => cardHTML(c, i + 1)).join('');
    }
    const z = X.Z[S.zone], r = m.regions[z.zone], w = curWin(), im = winImage(w), ref = `${BASE}thumbs/ref_real/${t.id}.jpg`, refOk = true;
    return `<section class="ex-ph panel ex-zone"><div class="ex-zn"><button type="button" class="ex-back" data-act="overview">${icon.chevron.replace('class="i"', 'class="i ex-flip"')}Overview</button><span class="ex-sp"></span>`
      + `<button type="button" class="ex-ib" data-act="prev" aria-label="Previous zone">${icon.chevron.replace('class="i"', 'class="i ex-flip"')}</button><span class="ex-cap">Zone ${z.rank} of ${NZ}</span><button type="button" class="ex-ib" data-act="next" aria-label="Next zone">${icon.chevron}</button></div>`
      + `<h1>${esc(r.name)}</h1><p>${esc(where(r))} · ${nf(z.n)} windows of ${m.window_km} km scanned. Each square on the globe is one window, coloured by its score. Pick a square to inspect it.</p>`
      + `<div class="ex-pair"><figure>${refOk ? `<img src="${ref}" alt="${esc(t.name)}, NASA imagery">` : ''}<figcaption><b>${esc(t.name)}</b>${esc(credits[`ref__${t.id}`] ?? 'NASA imagery')}</figcaption></figure>`
      + `<figure>${im ? `<img src="${im.src}" alt="Earth window, real view">` : '<span class="ex-nopic">Loading imagery…</span>'}<figcaption><b>${im ? (im.exact ? (w === z.bi ? 'Best window here' : 'Selected window') : 'Nearest window with a real view') : 'Earth window'}</b>${im ? esc(im.credit) + (im.exact ? '' : ` · ${coord(X.sc.lat[im.at], X.sc.lon[im.at])}`) : ''}</figcaption></figure></div>`
      + `<div class="ex-cta"><a class="btn primary" href="${dossier(w)}">Open zone review${icon.external}</a><p>Mission dossier for this window and ${esc(t.name)}.</p></div></section>`
      + CARDS_ZONE.map((c, i) => cardHTML(c, i + 1)).join('');
  }
  function renderPanel(animate: boolean) {
    const key = `${S.target}|${S.zone}`, html0 = panelHTML();
    const put = () => { panelEl.innerHTML = html0; panelEl.className = animate && !reduced() ? 'anim-in' : ''; [...panelEl.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i))); tween(panelEl); drawSc(panelEl); };
    if (animate && key !== panelKey && panelEl.children.length && !reduced()) { panelEl.className = 'out'; setTimeout(put, 170); } else put();
    panelKey = key;
  }
  function drawSc(rootEl: ParentNode) {
    const cs = getComputedStyle(document.documentElement), col = (v: string) => cs.getPropertyValue(v).trim();
    rootEl.querySelectorAll<HTMLCanvasElement>('canvas[data-sc]').forEach(cv => {
      const big = cv.dataset.sc === 'big', dpr = devicePixelRatio || 1, w = cv.clientWidth || 118, h = big ? 360 : 56; cv.width = w * dpr; cv.height = h * dpr; cv.style.height = `${h}px`;
      const g = cv.getContext('2d'); if (!g) return; g.scale(dpr, dpr);
      const p = big ? 28 : 3, x = (v: number) => p + (w - p - 4) * v / 100, y = (v: number) => h - p - (h - p - 4) * v / 100, r = big ? 1.6 : .9, a = X.sc.dim[0], b = X.sc.dim[1], s = X.sc.s;
      if (big) { g.strokeStyle = col('--line-strong'); g.strokeRect(p + .5, 4.5, w - p - 4, h - p - 4); g.fillStyle = col('--text-3'); g.font = `11px ${col('--font-ui')}`; g.textAlign = 'center'; [0, 50, 100].forEach(v => g.fillText(String(v), x(v), h - 8)); g.textAlign = 'right'; [0, 50, 100].forEach(v => g.fillText(String(v), p - 6, y(v) + 4)); }
      g.globalAlpha = .4; g.fillStyle = col('--text-3'); for (let i = 0; i < X.sc.n; i++) if (s[i] < S.minScore) g.fillRect(x(a[i]) - r / 2, y(b[i]) - r / 2, r, r);
      g.globalAlpha = 1; g.fillStyle = col('--accent'); for (let i = 0; i < X.sc.n; i++) if (s[i] >= S.minScore) g.fillRect(x(a[i]) - r, y(b[i]) - r, 2 * r, 2 * r);
      const t = X.top10[0]; g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.arc(x(a[t]), y(b[t]), big ? 8 : 5, 0, 7); g.stroke();
    });
  }

  // ---------- map: pin, selection, known-site labels, camera
  const pinEl = html(`<div class="pin" aria-hidden="true">${icon.crosshair}<span class="tnum"></span></div>`);
  function syncMap() {
    view.setScored(X.sc, S.minScore, m.window_km);
    const b = X.top10[0];
    if (S.zone == null && !X.zero) { $('span', pinEl).textContent = f1(X.sc.s[b]); view.setPin(pinEl, X.sc.lon[b], X.sc.lat[b]); } else view.setPin(null);
    view.mark('sel', S.zone == null || X.zero ? null : curWin());
    const marks: MapMarker[] = S.zone == null ? [] : X.known.filter(k => k.zone === S.zone).map(k => ({
      el: html(`<div class="ex-site"><i></i><span>${esc(k.name.split(',')[0])}<small>${k.nasa ? "NASA's 2012 lunar-pole test site · " : 'Known analog · '}#${nf(k.now.rank)}</small></span></div>`), lon: k.lon, lat: k.lat }));
    view.setMarkers(marks);
  }
  function overview(animate = true) {
    if (homeOn() || !X || X.zero) return;
    const p = pad(), w = innerWidth - p.left - p.right, h = innerHeight - p.top - p.bottom, px = isPhone() ? Math.min(innerWidth * .94, h * .94) : Math.min(w * 1.25, h * 1.15);
    const ks = X.sc.shown.slice(0, 400), med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    let c: [number, number] = ks.length ? [med(ks.map(k => X.sc.lon[k])), med(ks.map(k => X.sc.lat[k]))] : [0, 20];
    if (ks.length) {   // halfway between the best match and the bulk of the matches, so the #1 window is never on the limb of the globe
      const b = ks[0], dLon = ((c[0] - X.sc.lon[b] + 540) % 360) - 180;
      c = [((X.sc.lon[b] + dLon / 2 + 540) % 360) - 180, (X.sc.lat[b] + c[1]) / 2];
    }
    // a camera move made before the globe projection is applied is lost: wait for the style
    void view.loaded.then(() => {
      if (animate) view.fly(c[0], c[1], zoomForGlobe(px), p); else view.jumpTo({ center: c, zoom: zoomForGlobe(px), padding: p });
      lastPad = JSON.stringify(p);
    });
  }
  function flyZone(z: number) {
    const b = tc!.bounds[z], p = pad(), W = Math.max(200, innerWidth - p.left - p.right), H = Math.max(200, innerHeight - p.top - p.bottom), mercY = (la: number) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / (2 * Math.PI);
    const dx = Math.max((b[2] - b[0]) / 360, 1e-4), dy = Math.max(mercY(b[3]) - mercY(b[1]), 1e-4), zoom = Math.min(10.5, Math.log2(Math.min(W / (dx * 512), H / (dy * 512))) - .15);
    view.fly((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, zoom, p);
  }

  // ---------- state changes
  let pending = 0, first = true, pendingRegion: string | null = null;
  function refresh(anim = false) { compute(); renderLeft(); renderPanel(anim); syncMap(); }
  function recompute(fit = false) {
    refresh(); if (fit || first) { if (S.zone == null) overview(!first); else flyZone(S.zone); first = false; }
    if (pendingRegion) { const i = m.regions.findIndex(r => r.id === pendingRegion); pendingRegion = null; if (i >= 0) goZone(i); }
  }
  const sched = (fit = false) => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => recompute(fit)); };
  function goZone(z: number, w: number | null = null) { dd = null; store.set({ zone: z, selected: w }); refresh(true); flyZone(z); if (isPhone()) { setSnap(1); dock.scrollTop = 0; } }
  function goOverview() { dd = null; store.set({ zone: null, selected: null }); refresh(true); overview(true); }
  const loadDet = () => { det = null; const id = S.target; loadDetail(id).then(d => { if (S.target !== id) return; det = { i: d.i, j: d.j }; if (S.zone != null) renderPanel(false); }).catch(() => {}); };
  async function switchTarget() {
    const id = S.target; store.set({ selected: null, hover: null }); dd = null; data = await loadTarget(id); if (S.target !== id) return;
    loadDet(); recompute(true);
  }
  for (const d of dims) bindSlider(`w-${d}`, v => store.set({ weights: { ...S.weights, [d]: v } }));
  bindSlider('min', v => store.set({ minScore: v }));
  function bindSlider(id: string, set: (v: number) => void) {
    const el = $<HTMLInputElement>(`#${id}`, root); el.addEventListener('input', () => { const v = Number(el.value); el.style.setProperty('--p', `${((v - +el.min) / (+el.max - +el.min)) * 100}%`); $(`#${id}-o`, root).textContent = id === 'min' ? String(v) : v.toFixed(1); set(v); });
  }
  store.subscribe(ch => { if (ch.includes('weights') || ch.includes('minScore')) sched(); if (ch.includes('target')) { store.set({ zone: null }); switchTarget(); } if (ch.includes('hover')) view.mark('hl', S.hover); });
  $('#ex-reset', root).addEventListener('click', () => { store.set({ weights: Object.fromEntries(dims.map(d => [d, 1])), minScore: 60 }); });
  view.onHover = (k, x, y) => {
    view.mark('hl', k);
    if (k == null || isPhone()) { tip.hidden = true; return; }
    tip.innerHTML = `<b class="tnum">${f1(X.sc.s[k])}</b> <span>${esc(regionOf(k).name)}</span>`; tip.hidden = false; tip.style.transform = `translate(${Math.min(x + 14, innerWidth - 260)}px, ${y + 14}px)`;
  };
  view.onPick = k => { if (S.zone === X.sc.site[k]) { store.set({ selected: k }); renderPanel(false); view.mark('sel', k); } else goZone(X.sc.site[k], k); };

  // ---------- focus: a card opens into a dialog, the stage blurs behind it
  let focusFrom: HTMLElement | null = null;
  function openFocus(id: CardId, from: HTMLElement) {
    const c = CARD[id](); if (!c) return; openCard = id; focusFrom = from;
    modalEl.innerHTML = `<div class="ex-m-in"><div class="ex-m-head"><div><span class="ex-cap" id="ex-m-title">${c.cap}</span>${c.num}<p>${c.txt}</p></div><button type="button" class="ex-x" data-close aria-label="Close">${icon.close}</button></div><div class="ex-detail">${DETAIL[id]()}</div></div>`;
    focusEl.hidden = false; document.body.classList.add('is-focus'); tween(modalEl); drawSc(modalEl);
    requestAnimationFrame(() => focusEl.classList.add('on'));
    if (!reduced()) {
      const a = from.getBoundingClientRect(), b = modalEl.getBoundingClientRect(); modalEl.classList.add('is-flip');
      modalEl.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`, transformOrigin: '0 0', opacity: .4 }, { transform: 'none', transformOrigin: '0 0', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => modalEl.classList.remove('is-flip');
    }
    setTimeout(() => modalEl.querySelector<HTMLElement>('.ex-x')?.focus(), reduced() ? 0 : 300);
  }
  function closeFocus(quick = false) {
    if (focusEl.hidden) return; const from = focusFrom?.isConnected ? focusFrom : panelEl.querySelector<HTMLElement>(`[data-card="${openCard}"]`); openCard = null;
    document.body.classList.remove('is-focus'); focusEl.classList.remove('on');
    const done = () => { focusEl.hidden = true; modalEl.innerHTML = ''; if (from && !quick) from.focus({ preventScroll: true }); };
    if (reduced() || quick || !from) { done(); return; }
    const a = from.getBoundingClientRect(), b = modalEl.getBoundingClientRect(); modalEl.classList.add('is-flip');
    modalEl.animate([{ transform: 'none', transformOrigin: '0 0', opacity: 1 }, { transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`, transformOrigin: '0 0', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { modalEl.classList.remove('is-flip'); done(); };
  }

  // ---------- events
  root.addEventListener('click', e => {
    const el = e.target as HTMLElement, a = el.closest<HTMLElement>('[data-dd],[data-t],[data-z],[data-act],[data-card],[data-goz],[data-gow],[data-close]');
    if (dd && !(a && (a.dataset.dd || a.dataset.t || a.dataset.z))) { dd = null; renderLeft(); }
    if (!a) { if (el.id === 'ex-focus') closeFocus(); return; }
    if (a.dataset.dd) { dd = dd === a.dataset.dd ? null : (a.dataset.dd as 't' | 'z'); renderLeft(); return; }
    if (a.dataset.t) { dd = null; store.set({ target: a.dataset.t }); return; }
    if (a.dataset.z) { const z = Number(a.dataset.z); if (z < 0) goOverview(); else goZone(z); return; }
    if (a.dataset.act === 'overview') { goOverview(); return; }
    if (a.dataset.act === 'prev' || a.dataset.act === 'next') { const k = X.Z[S.zone!].rank - 1 + (a.dataset.act === 'next' ? 1 : -1); goZone(X.Zs[(k + NZ) % NZ].zone); return; }
    if (a.dataset.card) { openFocus(a.dataset.card as CardId, a); return; }
    if (a.dataset.goz != null && !el.closest('a')) { closeFocus(true); goZone(Number(a.dataset.goz)); return; }
    if (a.dataset.gow != null && !el.closest('a')) { const w = Number(a.dataset.gow); closeFocus(true); goZone(X.sc.site[w], w); return; }
    if (a.dataset.close != null) closeFocus();
  });
  document.addEventListener('keydown', e => { if (e.key !== 'Escape' || root.hidden) return; if (!focusEl.hidden) closeFocus(); else if (dd) { dd = null; renderLeft(); } });
  addEventListener('hashchange', () => closeFocus(true));

  // ---------- credits
  const credEl = $('#credits', root), credBtn = $('#credits-btn', root), credPop = popover(credEl, credBtn);
  credBtn.addEventListener('click', () => { credEl.style.cssText = ''; credPop.toggle(); credEl.style.left = credEl.style.top = ''; });
  $('#credits-close', root).addEventListener('click', () => credPop.close());

  // ---------- boot
  const ready = Promise.all([
    loadTarget(S.target), getJSON<KnownSite[]>('known_sites').catch(() => [] as KnownSite[]), getJSON<NullStats>('stats/null').catch(() => null),
    getJSON<{ rows: { reference: string }[] }>('known_analogs').catch(() => ({ rows: [] })), getJSON<Record<string, any>>('far_horizons').catch(() => null), getJSON<Record<string, string>>('credits').catch(() => ({})), // eslint-disable-line @typescript-eslint/no-explicit-any
  ]).then(([d, ks, n, ka, fh, cr]) => {
    data = d; known0 = ks; nul = n; far = fh; credits = cr;
    const lunar = new Set(m.targets.filter(t => t.body === 'moon').map(t => t.id)); nMoonTests = ka.rows.filter(r => lunar.has(r.reference)).length;
    loadDet(); recompute(); requestAnimationFrame(() => setSnap(snap));
    for (const t of m.targets) if (t.id !== S.target) loadTarget(t.id).then(x => { bestOf.set(t.id, baseBest(x)); renderLeft(); }).catch(() => {});
  });
  return { store, view, ready,
    show(on: boolean) { $('#explore', root).classList.toggle('off', !on); ($('#explore', root) as HTMLElement).inert = !on; const cr = document.getElementById('crumbs'); if (cr) cr.hidden = !on; if (on) setSnap(snap); },
    overview,
    focus(p: { target?: string; region?: string }) {
      pendingRegion = p.region ?? null;
      if (p.target && m.targets.some(t => t.id === p.target) && p.target !== S.target) store.set({ target: p.target });
      else if (pendingRegion && X) { const i = m.regions.findIndex(r => r.id === pendingRegion); pendingRegion = null; if (i >= 0) goZone(i); }
    } };
}
