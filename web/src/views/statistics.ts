// AI-assisted (Claude Code); reviewed by the author.
/** #/statistics: the interactive statistics of the ranking. One control bar (target, score, region, threshold) drives every panel;
 *  each panel has one short takeaway generated from the data and a "How to read" hint. Numbers are computed here from the exported
 *  per-window scores (data/<target>.json) or read from matrix.json, sensitivity.json, known_ranks.json and stats/*.json; none is typed.
 *  Wording rule (as in Proof): "windows", "scores", never "the best place". */
import type { Manifest } from '../types';
import type { Params } from '../lib/routes';
import { histogram } from '../lib/live';
import { onCleanup } from '../lib/lifecycle';
import { quantile, regionSummary, type RegionSummary, shareAtLeast, cumulative, pearson, spearman, quadrants, targetSimilarity, argmax, meanShares, corrWords, f1, f2, nf } from '../lib/statview';

type Dim = 'combined' | 'terrain' | 'illumination';
const DIMS: { id: Dim; label: string; col: string }[] = [
  { id: 'combined', label: 'Combined', col: 'combined' }, { id: 'terrain', label: 'Terrain', col: 'score_terrain' }, { id: 'illumination', label: 'Illumination', col: 'score_illumination' },
];
const WEIGHTS = ['0', '¼', '½', '1', '2', '4'];
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const rm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

interface Win { n: number; site: Int16Array; s: Record<Dim, Float32Array> }

const CARDS: { id: string; n: string; title: string; span: string }[] = [
  { id: 'dist', n: '02', title: 'Score distribution', span: 'w6' },
  { id: 'regions', n: '03', title: 'Regions compared', span: 'w6' },
  { id: 'scatter', n: '04', title: 'Terrain against illumination', span: 'w6' },
  { id: 'drivers', n: '05', title: 'What makes the top windows look like the target', span: 'w6' },
  { id: 'matrix', n: '06', title: 'Region by target', span: 'w12' },
  { id: 'sim', n: '07', title: 'Do the targets agree?', span: 'w6' },
  { id: 'sens', n: '08', title: 'How much do the weights matter?', span: 'w6' },
  { id: 'unc', n: '09', title: 'Uncertainty of the top windows', span: 'w6' },
  { id: 'known', n: '10', title: 'Where NASA\'s analog sites land', span: 'w6' },
];
/** Long-form text of the expanded view: what the panel shows, how to read it, what to be careful about. */
const DETAIL: Record<string, { what: string; read: string[]; care: string; tools: string[] }> = {
  dist: {
    what: 'The score of every 6 km window of the chosen target, grouped in 2-point bands. A score is how close the window is to the reference site on the Moon or Mars (100 = indistinguishable, 0 = nothing alike).',
    read: ['Each bar counts windows in a band; taller means more windows.', 'Bars to the right of the dashed line pass your threshold and are drawn darker.', 'Pick a region and its windows appear in blue on top of the grey total, so you can see whether that region sits higher or lower than the whole.', 'Cumulative turns the bars into a curve: the height at a score is the share of windows at or below it. A curve that rises late means most windows score high.'],
    care: 'Windows overlap and are not independent samples, so the shape describes the data we scored, not a random sample of Earth.', tools: ['dim', 'cum', 'thr'] },
  regions: {
    what: 'Each Earth region summarised by the scores of its windows. It answers "where on Earth does this target\'s terrain and light show up, and how consistently?"',
    read: ['The blue bar spans the 10th to 90th percentile of the region; the white tick is the median; the amber dot is the single highest window.', 'A long bar means the region is varied; a bar far to the right means most of it resembles the target.', 'Sort by a different measure to change the question: the median asks "is the region typical?", the highest window asks "is there at least one very close match?".', 'Click a row (or use the region menu) to filter every panel to that region; click it again to clear.'],
    care: 'A high maximum can come from one window. Compare it with the median and with how many windows pass the threshold before calling a region good.', tools: ['dim', 'sort', 'thr', 'zone'] },
  scatter: {
    what: 'The two ingredients of the score for every window: how well its terrain matches (horizontal) and how well its sunlight matches (vertical). The combined score is built from both.',
    read: ['A dot far right and high matches on both. A dot in a corner matches on one only.', 'The dashed lines are the threshold; the quadrants they make are counted in the numbers.', 'A tight diagonal would mean the two scores say the same thing; a cloud means they carry different information.', 'Scroll to zoom and drag to pan; Reset zoom returns to the whole plane. Hover a dot for its three scores.'],
    care: 'Correlation here only says the two scores rise together across our windows; it does not mean terrain causes illumination.', tools: ['thr', 'zone', 'reset'] },
  drivers: {
    what: 'For the best windows of this target, which feature accounts for most of the gap to the reference site. The score is a distance; this splits that distance by feature.',
    read: ['Each bar is the average share of the squared distance a feature explains across the exported top windows; the bars add up to 100 %.', 'Blue bars are terrain features, amber bars are illumination (shadow) features.', 'A long bar is the feature where even the best windows still differ most from the target.'],
    care: 'This describes the top windows exported (20 per target), not all 10,424. It explains the distance, not whether the site is scientifically useful.', tools: [] },
  matrix: {
    what: 'The whole comparison at once: for each Earth region (row) and each target (column), the best window found, on the score you chose.',
    read: ['Dark blue is a weak match, amber a strong one; the number is the score.', 'Look down a column to see which regions imitate one target best, and across a row to see which targets a region can stand in for.', 'Click any cell to move every panel to that target and region; the outlined cell is your current selection.', 'Rows are sorted by their best cell, so strong regions rise to the bottom.'],
    care: 'The cell is the single best window, not an average. It tells you that a good match exists, not how much of the region is good.', tools: ['dim'] },
  sim: {
    what: 'Whether two targets agree about which regions look like them. Each pair of targets is compared through how they order the 14 regions.',
    read: ['1 means the two targets order the regions identically; 0 means no relation; negative means they disagree.', 'The diagonal is each target with itself, so it is always 1.', 'Click a column to select that target and see everything else for it.'],
    care: 'Fourteen regions is a small sample, so differences of a few hundredths mean nothing.', tools: ['dim'] },
  sens: {
    what: 'How much the ranking changes when the two kinds of score (terrain, illumination) are weighted differently. A ranking that barely moves can be trusted more.',
    read: ['Left is terrain only, right is illumination weighted four times the terrain; 1 is the default, equal weights.', 'The vertical axis counts how many of the 10 best windows with equal weights are still in the top 10.', 'The blue line is your target; the grey lines are the other eight, for comparison.'],
    care: 'This is the weight of illumination against terrain only. The model has other choices (window size, features) that Proof tests separately.', tools: [] },
  unc: {
    what: 'How certain each top score is. The reference site is itself estimated from a handful of reference windows, so each score has a margin of error; we measure it by resampling those windows.',
    read: ['The dot is the window\'s score; the bar is its 95 % interval.', 'If two bars overlap, those two windows cannot be told apart with confidence.', 'Hover for the interval of the window\'s rank.'],
    care: 'Only the top 20 windows are exported, and only for the combined score, so the panel does not change with the score selector.', tools: [] },
  known: {
    what: 'A reality check: NASA already uses some Earth places as practice sites for the Moon and Mars. Where do those places fall among all the windows we scored?',
    read: ['Each bar is a known site\'s percentile for the chosen target: 100 means it is in the very best window, 50 means it is average.', 'Dots are the same site for the other targets.', 'The dashed line marks the top 10 %.'],
    care: 'Only a few sites exist per target, so this is a description of what we see, not a statistical test. The tests are in Proof.', tools: [] },
};
const EXPAND = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9.5 2H14v4.5M6.5 14H2V9.5M14 2 9 7M2 14l5-5"/></svg>';
const SORTS: Record<string, string> = { p90: '90th percentile', p50: 'median', max: 'highest window', above: 'windows above the threshold' };
const table = (head: string[], rows: (string | number)[][]) => `<table class="st-t"><thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="n"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td class="n">${c}</td>` : `<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table>`;

export async function render(el: HTMLElement, m: Manifest, params: Params): Promise<void> {
  void import('./statistics.css');
  const [{ mountChart }, { getJSON, loadTarget }] = await Promise.all([import('../lib/chart'), import('../data')]);
  const opt = <T>(f: string) => getJSON<T>(f).catch(() => null as T | null);
  const [matrix, sens, known, boot, decomp, valid] = await Promise.all([opt<Rec>('matrix'), opt<Rec>('sensitivity'), opt<Rec>('known_ranks'), opt<Rec>('stats/bootstrap'), opt<Rec>('stats/decomp'), opt<Rec>('validation')]);
  void valid;
  const targets = m.targets, regions = m.regions, nR = regions.length;
  const tname = (id: string) => targets.find(t => t.id === id)?.name ?? id;
  const rname = (z: number) => regions[z]?.name ?? String(z);
  const rShort = (z: number) => rname(z).replace(/ volcanic field| \(.*\)/g, '').replace('Mauna Kea / Mauna Loa saddle', 'Mauna Kea saddle').replace(' impact crater', '').replace('Axel Heiberg Island high Arctic', 'Axel Heiberg');
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const S = {
    target: targets.find(t => t.id === params.target)?.id ?? targets.find(t => t.id === 'moon_malapert')?.id ?? targets[0].id,
    dim: (['combined', 'terrain', 'illumination'].includes(params.score) ? params.score : 'combined') as Dim,
    zone: Number.isInteger(+params.region) && params.region !== '' && +params.region >= 0 && +params.region < nR ? +params.region : -1,
    thr: Math.min(95, Math.max(5, Number(params.min) || 60)),
    cum: false, sort: 'p90' as 'p90' | 'p50' | 'max' | 'above', w: null as Win | null,
  };
  const cache = new Map<string, Promise<Win>>();
  const load = (id: string): Promise<Win> => {
    if (!cache.has(id)) cache.set(id, loadTarget(id).then(d => {
      const k = 1 / m.scale.score, mk = (c: string) => { const a = d[c] as number[], o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * k; return o; };
      return { n: d.n, site: Int16Array.from(d.site as number[]), s: { combined: mk('combined'), terrain: mk('score_terrain'), illumination: mk('score_illumination') } };
    }));
    return cache.get(id)!;
  };

  el.innerHTML = `<div class="page-in wide stat">
    <h1>Statistics</h1>
    <p class="lead">Every window of every target, scored and summarised. Pick a <b>target</b>, a <b>score</b> and, if you like, a <b>region</b>: all nine panels follow. Each panel starts with what it shows; <b>Expand</b> opens it full size with a longer explanation, its numbers and extra controls.</p>
    <div class="st-bar" role="group" aria-label="Statistics controls">
      <label class="st-f"><span>Target</span><select id="st-target">${['moon', 'mars'].map(b => `<optgroup label="${b === 'moon' ? 'Moon' : 'Mars'}">${targets.filter(t => t.body === b).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <div class="st-f"><span>Score</span><div class="seg" id="st-dim">${DIMS.map(d => `<button type="button" data-d="${d.id}" aria-pressed="false">${d.label}</button>`).join('')}</div></div>
      <label class="st-f st-thr"><span>Threshold <b id="st-thr-v"></b></span><input id="st-thr" type="range" min="5" max="95" step="1" aria-label="Score threshold"></label>
      <label class="st-f"><span>Region</span><select id="st-zone">${'<option value="-1">All regions</option>' + regions.map((r, i) => `<option value="${i}">${esc(r.name)}</option>`).join('')}</select></label>
    </div>
    <section class="st-kpis" aria-label="Key figures" id="st-kpis"></section>
    <div class="st-grid">${CARDS.map(c => `<article class="st-card ${c.span}" id="st-${c.id}">
      <header><span class="st-n">${c.n}</span><h2>${c.title}</h2><button type="button" class="st-open" data-open="${c.id}" aria-label="Open ${c.title} in detail">${EXPAND}<span>Expand</span></button></header>
      <p class="st-take" id="st-${c.id}-take"></p>
      ${c.id === 'dist' ? `<div class="st-tools"><div class="seg" id="st-cum"><button type="button" data-c="0" aria-pressed="true">Histogram</button><button type="button" data-c="1" aria-pressed="false">Cumulative</button></div></div>` : ''}
      <div class="st-chart" id="st-${c.id}-c"></div>
      <p class="st-foot" id="st-${c.id}-f"></p>
    </article>`).join('')}</div>
    <div id="st-focus" hidden><div class="st-modal" role="dialog" aria-modal="true" aria-labelledby="st-d-title">
      <header><span class="st-n" id="st-d-n"></span><h2 id="st-d-title"></h2><button type="button" class="st-close" id="st-d-close" aria-label="Close">Close <span aria-hidden="true">✕</span></button></header>
      <div class="st-d-body">
        <div class="st-d-main"><div class="st-d-tools" id="st-d-tools"></div><div class="st-d-chart" id="st-d-chart"></div><p class="st-foot" id="st-d-foot"></p></div>
        <aside class="st-d-side">
          <section><h3>Right now</h3><p id="st-d-take"></p></section>
          <section><h3>What it shows</h3><p id="st-d-what"></p></section>
          <section><h3>How to read it</h3><ul id="st-d-read"></ul></section>
          <section id="st-d-facts-sec"><h3>The numbers</h3><div id="st-d-facts"></div></section>
          <section><h3>Be careful</h3><p id="st-d-care"></p></section>
        </aside>
      </div></div></div>
    <p class="st-annex">How were these checked? <a href="#/proof">Proof</a> keeps the blind test, the comparison with NASA LOLA and the robustness tests that stand behind these numbers.</p>
  </div>`;
  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const TAKE: Record<string, string> = {}, FACTS: Record<string, string> = {}, FOOT: Record<string, string> = {};
  const dlg = $('#st-focus');
  const take = (id: string, html: string) => { TAKE[id] = html; $(`#st-${id}-take`).innerHTML = html; if (DLG.id === id) $('#st-d-take').innerHTML = html; };
  const foot = (id: string, t: string) => { FOOT[id] = t; $(`#st-${id}-f`).textContent = t; if (DLG.id === id) $('#st-d-foot').textContent = t; };
  const facts = (id: string, html: string) => { FACTS[id] = html; if (DLG.id === id) $('#st-d-facts').innerHTML = html; };

  // one chart handle per panel, plus one for the expanded view
  type Handle = ReturnType<typeof mountChart>;
  const H: Record<string, Handle | undefined> = {};
  const DLG = { id: '', h: null as Handle | null, opener: null as HTMLElement | null };
  const OPT: Record<string, { option: Rec; summary: string; click?: (p: Rec) => void }> = {};
  let regionsFull: string[] = [];
  const bind = (h: Handle, click?: (p: Rec) => void) => { const i = h.instance; if (!i) return; i.off('click'); if (click) i.on('click', click); };
  const draw = (id: string, option: Rec, summary: string, click?: (p: Rec) => void) => {
    OPT[id] = { option, summary, click };
    const host = $(`#st-${id}-c`);
    if (!H[id]) H[id] = mountChart(host, option, { summary }); else H[id]!.update(option, { replace: true, summary });
    bind(H[id]!, click);
    if (DLG.id === id) drawDialog();
    return H[id]!;
  };
  /** The expanded view draws the same option, with zoom on the dense charts and full region names. */
  const big = (id: string, o: Rec): Rec => {
    if (id === 'scatter') return { ...o, dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none' }] };
    if (id === 'dist') return { ...o, dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }] };
    if (id === 'regions') return { ...o, yAxis: { ...o.yAxis, data: regionsFull, axisLabel: { ...o.yAxis.axisLabel, width: 280, fontSize: 12 } }, grid: { ...o.grid, left: 12 } };
    return o;
  };
  function drawDialog() {
    const o = OPT[DLG.id]; if (!o) return;
    const host = $('#st-d-chart'), opt = big(DLG.id, o.option);
    if (!DLG.h) DLG.h = mountChart(host, opt, { summary: o.summary, managed: false }); else DLG.h.update(opt, { replace: true, summary: o.summary });
    bind(DLG.h, o.click);
  }
  const TOOL_HTML: Record<string, () => string> = {
    dim: () => `<div class="st-f"><span>Score</span><div class="seg">${DIMS.map(d => `<button type="button" data-d="${d.id}" aria-pressed="${S.dim === d.id}">${d.label}</button>`).join('')}</div></div>`,
    cum: () => `<div class="st-f"><span>View</span><div class="seg"><button type="button" data-c="0" aria-pressed="${!S.cum}">Histogram</button><button type="button" data-c="1" aria-pressed="${S.cum}">Cumulative</button></div></div>`,
    thr: () => `<label class="st-f st-thr"><span>Threshold <b data-thr-v>${S.thr}</b></span><input type="range" min="5" max="95" step="1" value="${S.thr}" data-thr aria-label="Score threshold"></label>`,
    sort: () => `<label class="st-f"><span>Sort by</span><select data-sort>${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${S.sort === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`,
    zone: () => `<label class="st-f"><span>Region</span><select data-zone><option value="-1">All regions</option>${regions.map((r, i) => `<option value="${i}"${S.zone === i ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>`,
    reset: () => `<div class="st-f"><span>Zoom</span><button type="button" class="st-btn" data-reset>Reset zoom</button></div>`,
  };
  function openDialog(id: string, opener: HTMLElement) {
    const c = CARDS.find(x => x.id === id)!, d = DETAIL[id];
    DLG.id = id; DLG.opener = opener;
    $('#st-d-n').textContent = c.n; $('#st-d-title').textContent = c.title;
    $('#st-d-what').textContent = d.what; $('#st-d-read').innerHTML = d.read.map(r => `<li>${r}</li>`).join(''); $('#st-d-care').textContent = d.care;
    $('#st-d-take').innerHTML = TAKE[id] ?? ''; $('#st-d-foot').textContent = FOOT[id] ?? '';
    $('#st-d-facts').innerHTML = FACTS[id] ?? ''; $('#st-d-facts-sec').hidden = !FACTS[id];
    $('#st-d-tools').innerHTML = d.tools.map(t => TOOL_HTML[t]()).join(''); $('#st-d-tools').hidden = !d.tools.length;
    dlg.hidden = false; dlg.classList.remove('closing'); document.documentElement.classList.add('st-lock');
    requestAnimationFrame(() => { drawDialog(); $<HTMLButtonElement>('#st-d-close').focus(); });
  }
  function closeDialog() {
    if (dlg.hidden) return;
    const done = () => { dlg.hidden = true; dlg.classList.remove('closing'); DLG.h?.dispose(); DLG.h = null; DLG.id = ''; document.documentElement.classList.remove('st-lock'); DLG.opener?.focus(); };
    if (rm()) { done(); return; }
    dlg.classList.add('closing'); setTimeout(done, 140);
  }
  /** Keep the expanded view's controls in step with the state (the page-level controls and the dialog share one state). */
  function syncTools() {
    const t = $('#st-d-tools');
    t.querySelectorAll<HTMLButtonElement>('[data-d]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === S.dim)));
    t.querySelectorAll<HTMLButtonElement>('[data-c]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.c === '1') === S.cum)));
    const th = t.querySelector<HTMLInputElement>('[data-thr]'); if (th && document.activeElement !== th) th.value = String(S.thr);
    t.querySelectorAll('[data-thr-v]').forEach(x => { x.textContent = String(S.thr); });
    const so = t.querySelector<HTMLSelectElement>('[data-sort]'); if (so) so.value = S.sort;
    const zo = t.querySelector<HTMLSelectElement>('[data-zone]'); if (zo) zo.value = String(S.zone);
  }
  el.querySelectorAll<HTMLButtonElement>('.st-open').forEach(b => b.addEventListener('click', () => openDialog(b.dataset.open!, b)));
  $('#st-d-close').addEventListener('click', closeDialog);
  dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); });
  const onKey = (e: KeyboardEvent) => {
    if (dlg.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
    if (e.key === 'Tab') { const f = [...dlg.querySelectorAll<HTMLElement>('button, select, input, a[href]')].filter(x => !x.hidden && x.offsetParent); if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  };
  document.addEventListener('keydown', onKey);
  const C = () => ({ t1: css('--text-1'), t2: css('--text-2'), t3: css('--text-3'), line: css('--line'), strong: css('--line-strong'), acc: css('--accent'), warn: css('--warn'), ok: css('--ok'), panel: css('--panel-solid'),
    ramp: [css('--ramp-0'), css('--ramp-1'), css('--ramp-2'), css('--ramp-3')] });
  const grid = { left: 8, right: 16, top: 12, bottom: 8, containLabel: true };
  const tip = (html: string) => ({ trigger: 'item', confine: true, formatter: () => html });

  /* ---------- KPI strip: animated count-up ---------- */
  const kpiVals: Record<string, number> = {};
  function kpis(v: { n: number; top: number; topRegion: string; med: number; share: number; nReg: number }) {
    const items = [
      { k: 'n', label: 'Windows scored', val: v.n, fmt: (x: number) => nf(Math.round(x)), sub: S.zone >= 0 ? `windows in ${rShort(S.zone)}` : `6 km windows of ${tname(S.target)}` },
      { k: 'top', label: 'Highest score', val: v.top, fmt: (x: number) => f1(x), sub: v.topRegion },
      { k: 'med', label: 'Median score', val: v.med, fmt: (x: number) => f1(x), sub: 'half the windows score below' },
      { k: 'share', label: `At or above ${S.thr}`, val: v.share * 100, fmt: (x: number) => `${f1(x)} %`, sub: `${nf(Math.round(v.share * v.n))} windows` },
      { k: 'reg', label: 'Regions reaching it', val: v.nReg, fmt: (x: number) => `${Math.round(x)} / ${nR}`, sub: 'with at least one window' },
    ];
    const host = $('#st-kpis');
    if (!host.children.length) host.innerHTML = items.map(i => `<div class="st-kpi" data-k="${i.k}"><span class="st-kl">${i.label}</span><b class="st-kv"></b><span class="st-ks"></span></div>`).join('');
    for (const i of items) {
      const box = host.querySelector<HTMLElement>(`[data-k="${i.k}"]`)!, b = box.querySelector<HTMLElement>('.st-kv')!;
      box.querySelector('.st-kl')!.textContent = i.label; box.querySelector('.st-ks')!.textContent = i.sub;
      const from = kpiVals[i.k] ?? 0, to = i.val; kpiVals[i.k] = to;
      if (rm() || from === to) { b.textContent = i.fmt(to); continue; }
      const t0 = performance.now(), dur = 520;
      const step = (t: number) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); b.textContent = i.fmt(from + (to - from) * e); if (p < 1 && b.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }

  /* ---------- panels that depend on the target's windows ---------- */
  function paintWindows(w: Win) {
    const c = C(), s = w.s[S.dim], inZone = S.zone >= 0;
    const rs = regionSummary(s, w.site, nR, S.thr);
    const all = histogram(s), zs = inZone ? histogram(Array.from(s).filter((_, i) => w.site[i] === S.zone)) : null;
    const share = shareAtLeast(s, S.thr), zN = inZone ? rs[S.zone].n : 0;
    const topI = argmax(rs.map(r => r.max)), sorted = Float32Array.from(s).sort(), med = sorted[Math.floor(sorted.length / 2)];
    kpis({ n: inZone ? zN : w.n, top: inZone ? rs[S.zone].max : rs[topI].max, topRegion: inZone ? rShort(S.zone) : rShort(topI), med: inZone ? rs[S.zone].p50 : med, share: inZone ? (zN ? rs[S.zone].above / zN : 0) : share, nReg: rs.filter(r => r.above > 0).length });

    /* 02 distribution */
    const bins = Array.from({ length: 50 }, (_, i) => `${i * 2}`), tb = Math.floor(S.thr / 2);
    const cdfAll = cumulative(all), cdfZ = zs ? cumulative(zs) : null;
    const lbl = DIMS.find(d => d.id === S.dim)!.label.toLowerCase();
    const p90 = sorted[Math.floor(sorted.length * .9)];
    take('dist', inZone
      ? `<b>${esc(rShort(S.zone))}</b> has ${nf(zN)} windows; <b>${f1((rs[S.zone].above / Math.max(1, zN)) * 100)} %</b> reach ${S.thr}, against ${f1(share * 100)} % of all windows of ${esc(tname(S.target))}.`
      : `<b>${f1(share * 100)} %</b> of the ${nf(w.n)} windows reach ${S.thr} on the ${lbl} score. The median is ${f1(med)} and the top 10 % start at ${f1(p90)}.`);
    const mark = { symbol: 'none', silent: true, lineStyle: { color: c.warn, type: 'dashed', width: 1.5 }, label: { color: c.warn, formatter: `≥ ${S.thr}`, position: 'insideEndTop' }, data: [{ xAxis: tb }] };
    draw('dist', S.cum ? {
      grid: { ...grid, top: 20 }, tooltip: { trigger: 'axis', confine: true, valueFormatter: (v: number) => `${(v * 100).toFixed(1)} %` },
      xAxis: { type: 'category', data: bins, boundaryGap: false, axisLabel: { interval: 4 }, name: `${lbl} score`, nameLocation: 'middle', nameGap: 28 },
      yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => `${v * 100} %` } },
      series: [{ name: 'All windows', type: 'line', data: cdfAll, showSymbol: false, smooth: .2, lineStyle: { width: 2.5, color: c.t3 }, areaStyle: { color: c.t3, opacity: .12 }, markLine: mark },
        ...(cdfZ ? [{ name: rShort(S.zone), type: 'line', data: cdfZ, showSymbol: false, smooth: .2, lineStyle: { width: 2.5, color: c.acc }, z: 3 }] : [])],
    } : {
      grid: { ...grid, top: 20 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
      xAxis: { type: 'category', data: bins, axisLabel: { interval: 4 }, name: `${lbl} score`, nameLocation: 'middle', nameGap: 28 },
      yAxis: { type: 'value', name: 'windows', axisLabel: { formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)) } },
      series: [{ name: 'All windows', type: 'bar', data: all.map((v, i) => ({ value: v, itemStyle: { color: c.t3, opacity: i >= tb ? .95 : .35 } })), barGap: '-100%', barCategoryGap: '8%', markLine: mark },
        ...(zs ? [{ name: rShort(S.zone), type: 'bar', data: zs, itemStyle: { color: c.acc }, barGap: '-100%', z: 3 }] : [])],
    }, `Distribution of the ${lbl} score of ${tname(S.target)}; ${f1(share * 100)} percent of windows reach ${S.thr}.`);
    const pc = (a: ArrayLike<number>) => [.05, .25, .5, .75, .9, .95, .99, 1].map(q => f1(quantile(a, q)));
    const zSorted = inZone ? Float32Array.from(s.filter((_, i) => w.site[i] === S.zone)).sort() : null, pcA = pc(sorted), pcZ = zSorted ? pc(zSorted) : null;
    facts('dist', table(['Percentile', 'All windows', ...(pcZ ? [esc(rShort(S.zone))] : [])], ['5th', '25th', 'Median', '75th', '90th', '95th', '99th', 'Highest'].map((l, i) => [l, pcA[i], ...(pcZ ? [pcZ[i]] : [])])) + `<p class="st-mini">${nf(Math.round(share * w.n))} of ${nf(w.n)} windows (${f1(share * 100)} %) are at ${S.thr} or above.</p>`);
    foot('dist', `${nf(w.n)} windows of 6 km, score 0–100. The dashed line is the threshold (${S.thr}); bars right of it are darker.`);

    /* 03 regions */
    const key = S.sort, order = rs.filter(r => r.n).sort((a, b) => a[key] - b[key] || a.zone - b.zone), cats = order.map(r => rShort(r.zone));
    regionsFull = order.map(r => rname(r.zone));
    const best = order[order.length - 1], second = order[order.length - 2], vf = (r: RegionSummary) => (key === 'above' ? nf(r.above) : f1(r[key]));
    const nPass = rs.filter(r => r.above > 0).length;
    take('regions', `By ${SORTS[key]}, <b>${esc(rShort(best.zone))}</b> comes first (${vf(best)})${second ? `, then ${esc(rShort(second.zone))} (${vf(second)})` : ''}. ${nPass === nR ? `Every region has at least one window at ${S.thr} or above.` : `${nR - nPass} regions have no window at ${S.thr} or above.`}`);
    const rowsDesc = [...order].reverse();
    facts('regions', table(['Region', 'Windows', 'P10', 'Median', 'P90', 'Max', `≥ ${S.thr}`], rowsDesc.map(r => [esc(rShort(r.zone)), nf(r.n), f1(r.p10), f1(r.p50), f1(r.p90), f1(r.max), nf(r.above)])));
    draw('regions', {
      grid: { left: 8, right: 26, top: 6, bottom: 22, containLabel: true },
      tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => { const r = order[p.dataIndex]; return `<b>${esc(rname(r.zone))}</b><br>${nf(r.n)} windows<br>P10–P90: ${f1(r.p10)}–${f1(r.p90)}<br>Median: ${f1(r.p50)}<br>Highest: ${f1(r.max)}<br>At or above ${S.thr}: ${nf(r.above)}<br><i>Click to ${S.zone === r.zone ? 'clear' : 'filter'}</i>`; } },
      xAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: c.line } } },
      yAxis: { type: 'category', data: cats, axisLabel: { fontSize: 11, width: 118, overflow: 'truncate', color: c.t2 }, axisTick: { show: false } },
      series: [
        { type: 'bar', stack: 'r', data: order.map(r => r.p10), itemStyle: { color: 'transparent' }, tooltip: { show: false }, emphasis: { disabled: true } },
        { type: 'bar', stack: 'r', barWidth: 10, data: order.map(r => ({ value: r.p90 - r.p10, itemStyle: { color: S.zone < 0 || r.zone === S.zone ? c.acc : c.strong, opacity: S.zone < 0 || r.zone === S.zone ? .9 : .5 } })), cursor: 'pointer' },
        { type: 'scatter', symbol: 'rect', symbolSize: [2, 18], data: order.map((r, i) => [r.p50, i]), itemStyle: { color: c.t1 }, z: 4, cursor: 'pointer' },
        { type: 'scatter', symbolSize: 9, data: order.map((r, i) => [r.max, i]), itemStyle: { color: c.warn, borderColor: c.panel, borderWidth: 1 }, z: 5, cursor: 'pointer' },
      ],
    }, `Score range of each of the ${nR} regions, sorted by ${SORTS[key]}; ${rShort(best.zone)} comes first.`, (p: Rec) => { const r = order[p.dataIndex]; if (r) setZone(S.zone === r.zone ? -1 : r.zone); });
    foot('regions', 'Bar: 10th to 90th percentile. White tick: median. Amber dot: the highest window. Click a row to filter every panel to that region.');

    /* 04 scatter */
    const T = w.s.terrain, I = w.s.illumination, q = quadrants(T, I, S.thr, S.thr), rho = spearman(T, I);
    const dots: number[][] = [], zdots: number[][] = [];
    for (let i = 0; i < w.n; i++) (inZone && w.site[i] === S.zone ? zdots : dots).push([T[i], I[i], w.s.combined[i]]);
    const lo = [0, 0];
    take('scatter', `Terrain and illumination show <b>${corrWords(rho)}</b> (Spearman ρ ${f2(rho)}). Only <b>${f1(q.both / w.n * 100)} %</b> of windows reach ${S.thr} on both; ${f1(q.onlyY / w.n * 100)} % do it on illumination alone, ${f1(q.onlyX / w.n * 100)} % on terrain alone.`);
    void lo;
    const thrLines = { symbol: 'none', silent: true, lineStyle: { color: c.warn, type: 'dashed', width: 1 }, label: { show: false }, data: [{ xAxis: S.thr }, { yAxis: S.thr }] };
    draw('scatter', {
      grid: { left: 8, right: 14, top: 14, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => `Terrain ${f1(p.value[0])}<br>Illumination ${f1(p.value[1])}<br>Combined ${f1(p.value[2])}` },
      xAxis: { type: 'value', min: 0, max: 100, name: 'terrain score', nameLocation: 'middle', nameGap: 28, splitLine: { lineStyle: { color: c.line } } },
      yAxis: { type: 'value', min: 0, max: 100, name: 'illumination score', nameLocation: 'middle', nameGap: 36, splitLine: { lineStyle: { color: c.line } } },
      visualMap: { show: false, type: 'continuous', min: 0, max: 90, dimension: 2, seriesIndex: 0, inRange: { color: inZone ? [c.t3, c.t3] : [c.ramp[0], c.ramp[1], c.ramp[2], c.ramp[3]] } },
      series: [{ type: 'scatter', symbolSize: 4, data: dots, itemStyle: { opacity: inZone ? .2 : .7 }, markLine: thrLines, progressive: 3000, animationDuration: 600 },
        ...(inZone ? [{ type: 'scatter', symbolSize: 7, data: zdots, itemStyle: { color: c.warn, borderColor: c.panel, borderWidth: .6, opacity: .95 }, z: 4 }] : [])],
    }, `Terrain score against illumination score of every window; Spearman correlation ${f2(rho)}.`);
    const pr = pearson(T, I);
    facts('scatter', table(['Measure', 'Value'], [['Spearman ρ (rank)', f2(rho)], ['Pearson r (linear)', f2(pr)], [`Both ≥ ${S.thr}`, `${nf(q.both)} (${f1(q.both / w.n * 100)} %)`], [`Illumination only`, `${nf(q.onlyY)} (${f1(q.onlyY / w.n * 100)} %)`], [`Terrain only`, `${nf(q.onlyX)} (${f1(q.onlyX / w.n * 100)} %)`], ['Neither', `${nf(q.neither)} (${f1(q.neither / w.n * 100)} %)`]]));
    foot('scatter', `${nf(w.n)} windows. Colour is the combined score (dark blue low, amber high) when no region is picked. Expand to zoom and pan.`);
  }

  /* ---------- panels that do not need the windows ---------- */
  function paintStatic() {
    const c = C(), dimK = S.dim, ti = targets.findIndex(t => t.id === S.target);
    const short = targets.map(t => t.name.replace(' Plateau', '').replace(' crater', '').replace('Shackleton Connecting Ridge', 'Connecting Ridge').replace(' Mensae', '').replace('Planitia', 'Pl.'));

    /* 06 matrix */
    if (matrix) {
      const V: number[][] = matrix.v[dimK], cells: Rec[] = [];
      const rowOrder = Array.from({ length: nR }, (_, r) => r).sort((a, b) => Math.max(...V[a]) - Math.max(...V[b]));
      rowOrder.forEach((r, y) => V[r].forEach((v, x) => cells.push({ value: [x, y, v], r, label: { color: v > 72 ? '#0b1a2a' : '#fff' }, itemStyle: (x === ti && r === S.zone) || (x === ti && S.zone < 0 && false) ? { borderColor: c.t1, borderWidth: 2.5 } : x === ti ? { borderColor: c.t3, borderWidth: 1 } : undefined })));
      const winners = targets.map((_, x) => argmax(V.map(row => row[x]))), cnt: Record<number, number> = {}; winners.forEach(r => { cnt[r] = (cnt[r] ?? 0) + 1; });
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      take('matrix', `<b>${esc(rShort(+top[0]))}</b> has the highest ${DIMS.find(d => d.id === dimK)!.label.toLowerCase()} score for <b>${top[1]} of ${targets.length}</b> targets. Click a cell to jump to it.`);
      draw('matrix', {
        grid: { left: 8, right: 10, top: 6, bottom: 54, containLabel: true },
        tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => `<b>${esc(rname(p.data.r))}</b><br>${esc(tname(targets[p.value[0]].id))}<br>Highest window: ${f1(p.value[2])}` },
        xAxis: { type: 'category', data: short, position: 'bottom', axisLabel: { interval: 0, rotate: 32, fontSize: 11 }, splitArea: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'category', data: rowOrder.map(rShort), axisLabel: { fontSize: 11, color: c.t2 }, axisTick: { show: false } },
        visualMap: { show: false, min: 20, max: 95, inRange: { color: [c.ramp[0], c.ramp[1], c.ramp[2], c.ramp[3]] } },
        series: [{ type: 'heatmap', data: cells, label: { show: true, fontSize: 10, color: '#fff', formatter: (p: Rec) => String(Math.round(p.value[2])) }, itemStyle: { borderColor: css('--panel-solid'), borderWidth: 1 }, emphasis: { itemStyle: { borderColor: c.t1, borderWidth: 2 } }, cursor: 'pointer' }],
      }, `Highest score of each region for each target, ${dimK} score.`, (p: Rec) => { if (p.data?.r != null) { S.target = targets[p.value[0]].id; S.zone = p.data.r; sync(true); } });
      facts('matrix', table(['Target', 'Best region', 'Score'], targets.map((t, x) => [esc(short[x]), esc(rShort(winners[x])), f1(V[winners[x]][x])])));

      foot('matrix', 'Each cell is the highest 6 km window of that region for that target (0–100). Rows are sorted by their best cell.');

      /* 07 similarity */
      const sim = targetSimilarity(V), mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      const idx = (b: string) => targets.map((t, i) => (t.body === b ? i : -1)).filter(i => i >= 0), mo = idx('moon'), ma = idx('mars');
      const pairs = (A: number[], B: number[]) => A.flatMap(i => B.filter(j => (A === B ? j > i : true)).map(j => sim[i][j]));
      const mm = mean(pairs(mo, mo)), aa = mean(pairs(ma, ma)), cross = mean(pairs(mo, ma));
      take('sim', `Lunar targets agree on how they rank regions (mean ρ <b>${f2(mm)}</b>); Mars targets agree less (<b>${f2(aa)}</b>); Moon against Mars <b>${f2(cross)}</b>.`);
      const sc: Rec[] = []; sim.forEach((row, y) => row.forEach((v, x) => sc.push({ value: [x, y, +v.toFixed(2)], itemStyle: x === ti || y === ti ? { borderColor: c.t3, borderWidth: 1 } : undefined })));
      draw('sim', {
        grid: { left: 4, right: 6, top: 4, bottom: 56, containLabel: true },
        tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => `${esc(short[p.value[0]])} · ${esc(short[p.value[1]])}<br>ρ ${f2(p.value[2])}` },
        xAxis: { type: 'category', data: short, axisLabel: { interval: 0, rotate: 40, fontSize: 10 }, axisTick: { show: false } },
        yAxis: { type: 'category', data: short, axisLabel: { fontSize: 10 }, axisTick: { show: false }, inverse: true },
        visualMap: { show: false, min: -.2, max: 1, inRange: { color: [c.ramp[0], c.ramp[1], c.ramp[2], c.ramp[3]] } },
        series: [{ type: 'heatmap', data: sc, label: { show: false }, itemStyle: { borderColor: css('--panel-solid'), borderWidth: 1 }, emphasis: { itemStyle: { borderColor: c.t1, borderWidth: 2 } }, cursor: 'pointer' }],
      }, 'Correlation between targets of their region rankings.', (p: Rec) => { S.target = targets[p.value[0]].id; sync(true); });
      const pl: { a: number; b: number; r: number }[] = []; for (let i = 0; i < sim.length; i++) for (let j = i + 1; j < sim.length; j++) pl.push({ a: i, b: j, r: sim[i][j] }); pl.sort((x, y) => y.r - x.r);
      const pn = (e: { a: number; b: number; r: number }) => `${esc(short[e.a])} · ${esc(short[e.b])}`;
      facts('sim', table(['Group', 'Mean ρ'], [['Moon with Moon', f2(mm)], ['Mars with Mars', f2(aa)], ['Moon with Mars', f2(cross)]]) + table(['Pair', 'ρ'], [...pl.slice(0, 3).map(e => [pn(e), f2(e.r)]), ...pl.slice(-2).map(e => [pn(e), f2(e.r)])]) + '<p class="st-mini">Top three pairs agree most; the last two agree least.</p>');

      foot('sim', `Spearman ρ over ${nR} regions, ${DIMS.find(d => d.id === dimK)!.label.toLowerCase()} score. Click a column to select that target.`);
    } else { take('matrix', 'The score matrix is not available.'); take('sim', ''); }

    /* 08 sensitivity */
    if (sens) {
      const ov: Rec = sens.top10_overlap_vs_equal, mine: number[] = ov[S.target];
      take('sens', mine ? `With terrain only, <b>${mine[0]} of 10</b> top windows stay in the top 10; when illumination counts four times as much, <b>${mine[5]}</b> do. ${Math.min(...mine) >= 8 ? 'The ranking is stable.' : Math.min(...mine) <= 4 ? 'This target\'s ranking depends strongly on the weights.' : 'It shifts moderately with the weights.'}` : '');
      draw('sens', {
        grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true }, tooltip: { trigger: 'axis', confine: true },
        legend: { show: false },
        xAxis: { type: 'category', data: WEIGHTS, name: 'illumination weight', nameLocation: 'middle', nameGap: 28, boundaryGap: false },
        yAxis: { type: 'value', min: 0, max: 10, interval: 2 },
        series: [...Object.entries(ov).filter(([id]) => id !== S.target).map(([id, v]) => ({ name: tname(id), type: 'line', data: v, showSymbol: false, lineStyle: { width: 1, color: c.t3, opacity: .45 }, silent: false, emphasis: { lineStyle: { width: 2, opacity: 1 } } })),
          ...(mine ? [{ name: tname(S.target), type: 'line', data: mine, symbolSize: 8, lineStyle: { width: 3, color: c.acc }, itemStyle: { color: c.acc }, z: 5,
            markLine: { symbol: 'none', silent: true, lineStyle: { color: c.warn, type: 'dashed' }, label: { color: c.warn, formatter: 'equal weights' }, data: [{ xAxis: 3 }] } }] : [])],
      }, `Overlap of the top 10 windows with equal weights as the illumination weight changes, for ${tname(S.target)} and the other targets.`);
      facts('sens', table(['Illumination weight', 'Top-10 kept'], WEIGHTS.map((wt, i) => [wt, `${mine[i]} of 10`])));
      foot('sens', 'Vertical axis: how many of the 10 top windows of equal weighting stay in the top 10. Selected target in blue, the other eight in grey. At weight 1 all scores count equally, so the overlap is 10 by definition.');
    } else take('sens', 'The weight sensitivity file is not available.');

    /* 09 uncertainty */
    const rows: Rec[] | undefined = boot?.[S.target];
    if (rows?.length) {
      const rr = rows.slice(0, 20), topS = rr[0].score, overl = rr.filter(r => r.ci95[1] >= topS && r.ci95[0] <= topS).length;
      take('unc', `The top window scores <b>${f1(topS)}</b> (95 % interval ${f1(rr[0].ci95[0])}–${f1(rr[0].ci95[1])}), and <b>${overl} of the top ${rr.length}</b> windows have an interval that contains that score: they cannot be told apart reliably.`);
      const labels = rr.map((r, i) => `#${i + 1} ${rShort(Math.max(0, regions.findIndex(g => r.window_id.startsWith(`${g.id}_`))))}`);
      draw('unc', {
        grid: { left: 8, right: 18, top: 6, bottom: 22, containLabel: true },
        tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => { const r = rr[p.dataIndex]; return `<b>${esc(labels[p.dataIndex])}</b><br>Score ${f1(r.score)} (95 % ${f1(r.ci95[0])}–${f1(r.ci95[1])})<br>Rank 95 % interval ${r.rank_ci95[0]}–${r.rank_ci95[1]}`; } },
        xAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: c.line } } },
        yAxis: { type: 'category', data: labels, inverse: true, axisLabel: { fontSize: 10, width: 130, overflow: 'truncate' }, axisTick: { show: false } },
        series: [{ type: 'bar', stack: 'u', silent: true, data: rr.map(r => r.ci95[0]), itemStyle: { color: 'transparent' }, tooltip: { show: false } },
          { type: 'bar', stack: 'u', barWidth: 5, data: rr.map(r => r.ci95[1] - r.ci95[0]), itemStyle: { color: c.acc, opacity: .55 } },
          { type: 'scatter', symbolSize: 8, data: rr.map((r, i) => [r.score, i]), itemStyle: { color: c.t1, borderColor: c.panel, borderWidth: 1 }, z: 5 }],
      }, `Score and 95 percent interval of the top 20 windows of ${tname(S.target)}.`);
      facts('unc', table(['Window', 'Score', '95 % interval', 'Rank interval'], rr.slice(0, 10).map((r, i) => [esc(labels[i]), f1(r.score), `${f1(r.ci95[0])}–${f1(r.ci95[1])}`, `${r.rank_ci95[0]}–${r.rank_ci95[1]}`])) + '<p class="st-mini">First ten windows shown.</p>');
      foot('unc', `Bootstrap over the ${boot!.n_ref?.[S.target] ?? ''} reference windows of the target. Only the top 20 windows are exported. Combined score.`);
    } else take('unc', 'Interval estimates are not available for this target.');

    /* 05 drivers */
    const dd: Rec | undefined = decomp?.[S.target];
    if (dd) {
      const sh = meanShares(Object.values(dd) as Record<string, number>[]), lab = (k: string) => m.feature_labels[k] ?? k;
      take('drivers', `Across its top ${Object.keys(dd).length} windows, <b>${esc(lab(sh[0].key))}</b> explains the most (${Math.round(sh[0].share * 100)} %), then ${esc(lab(sh[1].key))} (${Math.round(sh[1].share * 100)} %).`);
      draw('drivers', {
        grid: { left: 8, right: 36, top: 4, bottom: 8, containLabel: true }, tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => `${esc(p.name)}: ${Math.round(p.value * 100)} % of the distance` },
        xAxis: { type: 'value', max: Math.max(.5, Math.ceil(sh[0].share * 20) / 20), axisLabel: { formatter: (v: number) => `${Math.round(v * 100)} %` }, splitLine: { lineStyle: { color: c.line } } },
        yAxis: { type: 'category', data: sh.map(x => lab(x.key)), inverse: true, axisLabel: { fontSize: 12 }, axisTick: { show: false } },
        series: [{ type: 'bar', barWidth: 14, data: sh.map(x => ({ value: x.share, itemStyle: { color: /shadow/.test(x.key) ? c.warn : c.acc } })), label: { show: true, position: 'right', formatter: (p: Rec) => `${Math.round(p.value * 100)} %`, color: c.t2, fontSize: 11 } }],
      }, `Share of the distance to the target explained by each feature for ${tname(S.target)}.`);
      facts('drivers', table(['Feature', 'Share'], sh.map(x => [esc(lab(x.key)), `${(x.share * 100).toFixed(1)} %`])));
      foot('drivers', 'Terrain features in blue, illumination features in amber. Mean over the exported top windows.');
    } else take('drivers', 'The feature breakdown is not available.');

    /* 10 known sites */
    const kr: Rec | undefined = known?.[S.target];
    if (kr && known) {
      const sites = Object.keys(kr).sort((a, b) => kr[a].pct - kr[b].pct), hi = sites[sites.length - 1];
      const above90 = sites.filter(s => kr[s].pct >= 90).length;
      take('known', `<b>${above90} of ${sites.length}</b> known NASA analog site${above90 === 1 ? ' falls' : 's fall'} in the top 10 % of windows for ${esc(tname(S.target))}; the highest is <b>${esc(hi)}</b> at the ${f1(kr[hi].pct)}th percentile.`);
      const others = Object.keys(known).filter(t => t !== S.target);
      draw('known', {
        grid: { left: 8, right: 36, top: 6, bottom: 24, containLabel: true }, tooltip: { trigger: 'item', confine: true, formatter: (p: Rec) => `<b>${esc(p.name ?? sites[p.dataIndex])}</b><br>${f1(p.value[0] ?? p.value)}th percentile${p.seriesName ? `<br>${esc(p.seriesName)}` : ''}` },
        xAxis: { type: 'value', min: 0, max: 100, name: 'percentile among all windows', nameLocation: 'middle', nameGap: 28, splitLine: { lineStyle: { color: c.line } } },
        yAxis: { type: 'category', data: sites, axisLabel: { fontSize: 11, width: 210, overflow: 'truncate' }, axisTick: { show: false } },
        series: [{ type: 'bar', barWidth: 12, name: tname(S.target), data: sites.map(s => ({ value: kr[s].pct, name: s, itemStyle: { color: kr[s].pct >= 90 ? c.acc : c.strong } })), label: { show: true, position: 'right', formatter: (p: Rec) => f1(p.value), color: c.t2, fontSize: 11 },
          markLine: { symbol: 'none', silent: true, lineStyle: { color: c.warn, type: 'dashed' }, label: { color: c.warn, formatter: 'top 10 %' }, data: [{ xAxis: 90 }] } },
          { type: 'scatter', symbolSize: 6, name: 'other targets', data: others.flatMap(t => sites.map((s, i) => ({ value: [known[t][s]?.pct, i], name: s, seriesName: tname(t) }))).filter(d => d.value[0] != null), itemStyle: { color: c.t3, opacity: .55 } }],
      }, `Percentile of each known NASA analog site for ${tname(S.target)}.`);
      facts('known', table(['Site', 'Percentile', 'Rank'], [...sites].reverse().map(x => [esc(x), f1(kr[x].pct), `${nf(kr[x].rank)} of ${nf(kr[x].n)}`])));
      foot('known', 'Percentile = share of all windows of the target that score lower than the best window containing the site. Eight sites in all, so read this as description, not proof; see Proof for the tests.');
    } else take('known', 'No known analog sites were tested for this target.');
  }

  /* ---------- state plumbing ---------- */
  async function sync(urlToo = false) {
    $<HTMLSelectElement>('#st-target').value = S.target;
    el.querySelectorAll<HTMLButtonElement>('#st-dim button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === S.dim)));
    $<HTMLInputElement>('#st-thr').value = String(S.thr); $('#st-thr-v').textContent = String(S.thr);
    $<HTMLSelectElement>('#st-zone').value = String(S.zone); syncTools();
    if (urlToo) history.replaceState(null, '', `#/statistics?target=${S.target}${S.dim !== 'combined' ? `&score=${S.dim}` : ''}${S.zone >= 0 ? `&region=${S.zone}` : ''}`);
    const tok = S.target; S.w = await load(S.target); if (tok !== S.target) return;
    paintWindows(S.w); paintStatic();
  }
  const setZone = (z: number) => { S.zone = z; sync(true); };
  $<HTMLSelectElement>('#st-target').addEventListener('change', e => { S.target = (e.target as HTMLSelectElement).value; sync(true); });
  el.querySelectorAll<HTMLButtonElement>('#st-dim button').forEach(b => b.addEventListener('click', () => { S.dim = b.dataset.d as Dim; sync(true); }));
  let raf = 0; $<HTMLInputElement>('#st-thr').addEventListener('input', e => setThr(+(e.target as HTMLInputElement).value));
  $<HTMLSelectElement>('#st-zone').addEventListener('change', e => setZone(+(e.target as HTMLSelectElement).value));
  const setThr = (v: number) => { S.thr = v; $<HTMLInputElement>('#st-thr').value = String(v); $('#st-thr-v').textContent = String(v); syncTools(); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (S.w) paintWindows(S.w); }); };
  $('#st-d-tools').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    if (b.dataset.d) { S.dim = b.dataset.d as Dim; sync(true); }
    else if (b.dataset.c) { S.cum = b.dataset.c === '1'; syncTools(); el.querySelectorAll('#st-cum button').forEach(x => x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.c === (S.cum ? '1' : '0')))); if (S.w) paintWindows(S.w); }
    else if ('reset' in b.dataset) DLG.h?.instance?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  });
  $('#st-d-tools').addEventListener('input', e => { const t = e.target as HTMLInputElement; if ('thr' in t.dataset) setThr(+t.value); });
  $('#st-d-tools').addEventListener('change', e => { const t = e.target as HTMLSelectElement; if ('sort' in t.dataset) { S.sort = t.value as typeof S.sort; if (S.w) paintWindows(S.w); } else if ('zone' in t.dataset) setZone(+t.value); });
  onCleanup(() => { document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('st-lock'); DLG.h?.dispose(); DLG.h = null; });
  el.querySelectorAll<HTMLButtonElement>('#st-cum button').forEach(b => b.addEventListener('click', () => { S.cum = b.dataset.c === '1'; syncTools(); el.querySelectorAll('#st-cum button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (S.w) paintWindows(S.w); }));
  void pearson;
  await sync();
  el.querySelectorAll<HTMLElement>('.st-card').forEach((c, i) => { c.style.setProperty('--i', String(i)); });
}
