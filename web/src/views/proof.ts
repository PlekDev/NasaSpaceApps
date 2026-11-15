// AI-assisted (Claude, Anthropic); reviewed by the team.
// #/proof · "The 3 proofs": (1) blind test, (2) light model vs NASA (Diego Lizárraga's proof_light.ts), (3) robustness.
// Every number comes from web/public/data/stats/*.json (web/tools/exports/stats.py <- scripts/stats/*.py) or light/;
// none is typed here. A file marked "_stub": true shows "Results pending" instead of numbers. Keys starting with "_"
// are metadata, never targets. Wording rule: "top window" with its bootstrap CI, never "the best place".
// Runtime imports are dynamic (inside render) so node --test can load the pure text builders below.
import type { Manifest } from '../types';
import type { Params } from '../lib/routes';

/* ---------- data shapes (scripts/stats/*.py) ---------- */
type Meta = { _stub?: boolean; _meta?: Record<string, unknown> };
export interface NullStats extends Meta {
  n_perm: number; seed: number; headline: string; headline_target: string; questions: Record<string, string>;
  observed: Record<string, number>; p_value: Record<'global' | 'region_matched', Record<'combined' | 'terrain' | 'illum', number>>;
  null_summary: Record<string, Record<string, { mean: number; p05: number; p95: number }>>;
  pu_uhiwahine: Record<string, { rank: number; of: number; p_value_region_matched: number; p_bonferroni: number; pct_all_windows: number; frac_region_above: number }>;
  null_hist: Record<string, { score: string; bins: number[]; counts: number[] }>;
}
export interface RocRow { fpr: number[]; tpr: number[]; auc: number; auc_ci95: [number, number]; auc_by_score: Record<string, number>; auc_ci95_by_score: Record<string, [number, number]>; n_pos: number; n_neg: number; n_sites: number; sites: string[]; warning?: string }
export interface BootRow { window_id: string; site: string; score: number; ci95: [number, number]; rank_ci95: [number, number] }
export interface StabRow { p_top1: Record<string, number>; p_top10: Record<string, number>; top1_equal_weights: string; n_regions: number; [k: string]: unknown }
export interface Stats { null: NullStats; roc: Meta & Record<string, RocRow>; bootstrap: Meta & { n_ref: Record<string, number> } & Record<string, BootRow[]>;
  stability: Meta & Record<string, StabRow>; tornado: Meta & Record<string, unknown>; decomp: Meta & Record<string, unknown>; controls: Meta & Record<string, unknown> }

export const SCORES = ['combined', 'terrain', 'illum'] as const;
const SCORE_LABEL: Record<string, string> = { combined: 'Combined', terrain: 'Terrain', illum: 'Illumination' };
export const isReal = (o: Meta | undefined | null): boolean => !!o && o._stub !== true;
/** Target ids of a stats file (keys that do not start with "_" and are not shared fields). */
export const targetKeys = (o: object, skip: string[] = []) => Object.keys(o).filter(k => !k.startsWith('_') && !skip.includes(k));

/* ---------- number formatting ---------- */
export const fmtP = (p: number) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2);
const pct1 = (x: number) => (100 * x).toFixed(1);
const range = (a: number[], f: (x: number) => string) => { const lo = Math.min(...a), hi = Math.max(...a); return f(lo) === f(hi) ? f(lo) : `${f(lo)}–${f(hi)}`; };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nf = (n: number) => n.toLocaleString('en-US');

/* ---------- conclusions, generated from the data ---------- */
/** 1C: what separates the known analog sites (ROC/AUC). */
export function aucLine(roc: Record<string, RocRow>, moon: string[], mars: string[]): string {
  const ill = moon.map(t => roc[t].auc_by_score.illum), lows = moon.map(t => roc[t].auc_ci95_by_score.illum[0]);
  const above = lows.filter(x => x > 0.5).length;
  const terrIncl = moon.filter(t => roc[t].auc_ci95_by_score.terrain[0] <= 0.5).length;
  const marsAuc = mars.map(t => roc[t].auc);
  const ill1 = above === moon.length
    ? `Low-Sun illumination separates NASA's lunar analog sites: AUC ${range(ill, f2)}, with the 95 % CI above 0.5 for all ${moon.length} lunar targets, by a small margin (lower bounds ${range(lows, f2)}).`
    : `Illumination AUC is ${range(ill, f2)} for the lunar targets; its 95 % CI is above 0.5 for ${above} of ${moon.length}.`;
  const terr = terrIncl === moon.length ? ' Terrain alone does not (its CI includes 0.5 for every lunar target).' : ` Terrain CI includes 0.5 for ${terrIncl} of ${moon.length} lunar targets.`;
  return `${ill1}${terr} For Mars the score does not separate the known sites (AUC ${range(marsAuc, f2)}).`;
}

/** 3: section title from stability.json. */
export function stabilityTitle(stab: Record<string, StabRow>, targets: string[]): string {
  const p1 = targets.map(t => stab[t].p_top1[stab[t].top1_equal_weights] ?? 0);
  const taus = targets.flatMap(t => Object.entries(stab[t]).filter(([k]) => k.startsWith('kendall_tau_')).map(([, v]) => v as number));
  return `Top windows are stable under slider weights (P(#1 stays #1) = ${range(p1, f2)}); less so across window sizes (Kendall τ = ${range(taus, f2)})`;
}

/** 1A table rows and summary: Pu'u Hiwahine per lunar target. Two universes are kept apart: rank among the 10,424 windows,
 *  and share of the valid area of the Mauna Kea region. */
export function puuSummary(n: NullStats, name: (id: string) => string): string {
  const rows = Object.entries(n.pu_uhiwahine).sort((a, b) => a[1].rank - b[1].rank);
  return `Share of the valid area of the Mauna Kea region that scores as high as NASA's test site or higher, per lunar target: `
    + rows.map(([t, v]) => `${name(t)} ${pct1(v.p_value_region_matched)} % (p ${fmtP(v.p_value_region_matched)}, Bonferroni ${fmtP(v.p_bonferroni)})`).join('; ') + '.';
}

/** Card 1: the headline target's region-matched p, one universe (share of the Mauna Kea area) only. */
export function card1(n: NullStats, name: (id: string) => string): string {
  const v = n.pu_uhiwahine[n.headline_target];
  return v ? `${name(n.headline_target)}: p = ${fmtP(v.p_value_region_matched)} within Mauna Kea (${fmtP(v.p_bonferroni)} after Bonferroni)` : n.headline;
}

/* ---------- controls (scripts/stats/controls.py) ---------- */
export interface Dist { p50: number; p90: number; max: number; n_windows: number }
export interface CtrlStat extends Dist { best_rank_if_inserted: number; of: number; p90_rank_among_regions: number; n_regions: number; terrain: Dist; illumination: Dist }
export interface CtrlTarget { candidates: Dist; by_region: Record<string, Dist>; controls: Record<string, CtrlStat>; control: Dist }
export interface CtrlRegion { id: string; label: string; tile: string; why: string }
export const ctrlName = (r: CtrlRegion) => r.label.split(' (')[0];

/** 1D: three sentences, each with its statistic named, generated from controls.json. */
export function controlsLines(c: Record<string, CtrlTarget>, regions: CtrlRegion[], moon: string[], name: (id: string) => string, arcadia?: string): string[] {
  const alps = regions.find(r => /alps/.test(r.id)), soft = regions.filter(r => r !== alps);
  const out: string[] = [];
  const below = (r: CtrlRegion) => moon.filter(t => c[t].controls[r.id] && c[t].controls[r.id].p90_rank_among_regions > c[t].controls[r.id].n_regions).length;
  if (soft.length) {
    const all = soft.every(r => below(r) === moon.length);
    out.push(all ? `${soft.map(ctrlName).join(' and ')} fall below all ${c[moon[0]].controls[soft[0].id].n_regions} regions at P90 for every lunar target.`
      : soft.map(r => `${ctrlName(r)} falls below all regions at P90 for ${below(r)} of ${moon.length} lunar targets.`).join(' '));
  }
  if (alps) {
    const ranked = moon.filter(t => c[t].controls[alps.id]).sort((a, b) => c[a].controls[alps.id].best_rank_if_inserted - c[b].controls[alps.id].best_rank_if_inserted);
    const top = ranked.slice(0, 2), a0 = c[top[0]].controls[alps.id];
    out.push(`The Alps are the hard control: their best window would rank `
      + top.map(t => `#${nf(c[t].controls[alps.id].best_rank_if_inserted)} for ${name(t)}`).join(' and ') + ` (of ${nf(a0.of)}); `
      + `for ${name(top[0])} their terrain score reaches ${f1(a0.terrain.max)} but their illumination score only ${f1(a0.illumination.max)}.`);
  }
  if (arcadia && c[arcadia]) {
    const ca = c[arcadia], above = soft.filter(r => ca.controls[r.id] && ca.controls[r.id].p50 > ca.candidates.p50);
    if (above.length) out.push(`For ${name(arcadia)}, flat plains score above the median of our regions (P50 `
      + above.map(r => `${f1(ca.controls[r.id].p50)} ${ctrlName(r)}`).join(', ') + ` vs ${f1(ca.candidates.p50)}): the flat-plains degeneracy.`);
  }
  return out;
}

/* ---------- view ---------- */
const FILES = ['null', 'roc', 'bootstrap', 'stability', 'tornado', 'decomp', 'controls'] as const;
const pending = (what: string) => `<p class="proof-pending">${esc(what)}: results pending.</p>`;

export async function render(el: HTMLElement, m: Manifest, _params: Params): Promise<void> {
  void import('./proof.css');
  const [{ mountChart }, { getJSON }] = await Promise.all([import('../lib/chart'), import('../data')]);
  const got = await Promise.all(FILES.map(f => getJSON<Meta>(`stats/${f}`).catch(() => null)));
  const S = Object.fromEntries(FILES.map((f, i) => [f, got[i]])) as unknown as Stats;
  const name = (id: string) => m.targets.find(t => t.id === id)?.name ?? id;
  const region = (wid: string) => { const r = m.regions.find(x => wid.startsWith(`${x.id}_`)); return r ? r.name : wid; };
  const moon = m.targets.filter(t => t.body === 'moon').map(t => t.id), mars = m.targets.filter(t => t.body === 'mars').map(t => t.id);
  const all = [...moon, ...mars];
  const okNull = isReal(S.null), okRoc = isReal(S.roc), okBoot = isReal(S.bootstrap), okStab = isReal(S.stability);
  const okCtrl = isReal(S.controls), okTor = isReal(S.tornado), okDec = isReal(S.decomp);
  const CT = S.controls as unknown as Record<string, CtrlTarget>, CR = okCtrl ? (S.controls as unknown as { regions: CtrlRegion[] }).regions : [];
  const arcadia = mars.find(t => /arcadia/.test(t));
  const flabel = (k: string) => m.feature_labels[k] ?? k;
  const title3 = okStab ? stabilityTitle(S.stability, all) : 'Robustness';
  const pickDefault = okNull && S.null.headline_target ? S.null.headline_target : moon[0];

  el.innerHTML = `<div class="page-in wide proof">
    <h1>The 3 proofs</h1>
    <p class="lead">${okNull ? esc(S.null.headline) + '.' : 'Validation results are being computed.'}</p>
    <nav class="proof-cards" aria-label="The three proofs">
      <a class="proof-card" href="#proof-1"><span class="proof-num">1</span><b>Blind test</b><span>${okNull ? esc(card1(S.null, name)) : 'pending'}</span></a>
      <a class="proof-card" href="#proof-2"><span class="proof-num">2</span><b>Light vs NASA</b><span id="proof-card-2">Light model against NASA LOLA illumination</span></a>
      <a class="proof-card" href="#proof-3"><span class="proof-num">3</span><b>Robustness</b><span>${esc(title3)}</span></a>
    </nav>

    <section class="vsec proof-sec" id="proof-1" aria-labelledby="proof-1-h">
      <h2 id="proof-1-h">1 · Blind test: P.E.N. finds NASA's lunar test site on Mauna Kea without being told</h2>
      <h3>Pu'u Hiwahine, NASA's 2012 lunar-polar field-test site, per lunar target</h3>
      ${okNull ? `<div class="proof-chart proof-h-sm" id="proof-1a"></div><div class="tbl" id="proof-1a-tbl"></div>
        <p class="note">Rank: position of the site's best 6 km window among all ${nf(Object.values(S.null.pu_uhiwahine)[0]?.of ?? 0)} Earth windows for that target. Share of Mauna Kea: share of the valid area of the Mauna Kea region (150 m lattice) whose best window scores as high or higher; this is the region-matched p. Bonferroni: p × ${Object.keys(S.null.pu_uhiwahine).length} lunar targets, capped at 1.</p>` : pending('Blind test')}
      <h3>What separates NASA's analog sites from the rest?</h3>
      ${okRoc ? `<p class="prose-p">${esc(aucLine(S.roc, moon, mars))}</p><div class="proof-chart proof-h-lg" id="proof-1c"></div>
        <p class="note">AUC = probability that a window containing a known analog site scores higher than a random other window (0.5 = no separation). Whiskers: 95 % CI, cluster bootstrap over sites (${nf(Number((S.roc._meta?.params as Record<string, unknown> | undefined)?.bootstrap ?? 0))} replicates). Only ${S.roc[moon[0]].n_sites} lunar and ${S.roc[mars[0]].n_sites} Mars sites, so this is descriptive.</p>` : pending('ROC')}
      <h3>Control regions: does P.E.N. rank ordinary terrain high?</h3>
      ${okCtrl ? `<ul class="proof-lines">${controlsLines(CT, CR, moon, name, arcadia).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="proof-chart proof-h-xl" id="proof-1d"></div>
        <p class="note">Bars: P50 to P90 of the combined score of all 6 km windows; marker: the maximum. Controls are scored with the same IQR and references as the main run and are not added to the official ranking.</p>
        <details class="proof-more"><summary>Read more: why these control tiles</summary>
          <ul class="proof-lines">${CR.map(r => `<li><b>${esc(r.label)}</b>, Copernicus GLO-30 tile ${esc(r.tile.replace(/_00/g, '').replace('_', ' '))}. ${esc(r.why)}</li>`).join('')}</ul>
          <p class="note">An Amazon rainforest tile was considered and rejected: the Copernicus DEM is a surface model, so its roughness would be that of the forest canopy, not the ground.</p>
        </details>` : pending('Controls')}
    </section>

    <section class="vsec proof-sec" id="proof-2" aria-labelledby="proof-2-h">
      <h2 id="proof-2-h">2 · Light vs NASA</h2>
      <div id="proof-light"><p class="proof-pending">Loading…</p></div>
    </section>

    <section class="vsec proof-sec" id="proof-3" aria-labelledby="proof-3-h">
      <h2 id="proof-3-h">3 · ${esc(title3)}</h2>
      <label class="proof-pick">Target <select id="proof-target">${all.map(t => `<option value="${t}"${t === pickDefault ? ' selected' : ''}>${esc(name(t))}</option>`).join('')}</select></label>
      <h3>Score of the top 20 windows, with 95 % bootstrap CI</h3>
      ${okBoot ? `<p class="prose-p" id="proof-3a-line"></p><div class="proof-chart proof-h-md" id="proof-3a"></div>
        <p class="note">Each of ${nf(Number((S.bootstrap._meta?.params as Record<string, unknown> | undefined)?.bootstrap ?? 0))} replicates resamples the target's own reference windows and rescores every Earth window with the same IQR. Hover a point for the rank CI.</p>` : pending('Bootstrap')}
      <h3>Does the #1 window survive the app's slider weights?</h3>
      ${okStab ? `<div class="proof-chart proof-h-lg" id="proof-3b"></div>
        <p class="note">${nf(Number((S.stability._meta?.params as Record<string, unknown> | undefined)?.n_draws ?? 0))} random weightings, each dimension log-uniform in [0.25, 4] (the slider range). #1 = the equal-weight #1 window of each target.</p>` : pending('Stability')}
      <h3>Which feature moves the score of the top window?</h3>
      ${okTor ? `<p class="prose-p" id="proof-3d-line"></p><div class="proof-chart proof-h-md" id="proof-3d"></div>
        <p class="note">Change of the combined score of the target's top window when one feature moves by −1 or +1 IQR (all else fixed). Large drops on both sides mean the window already matches that feature.</p>` : pending('Tornado')}
      ${okDec ? `<h3>What the distance is made of, top 20 windows</h3><div class="proof-chart proof-h-md" id="proof-3d2"></div>
        <p class="note">Share of each feature in the squared distance d²/Σd² of the combined score: a large share is where the Earth window still differs from the target.</p>` : ''}
    </section>
  </div>`;

  // ---- 1A · Pu'u Hiwahine
  if (okNull) {
    const rows = Object.entries(S.null.pu_uhiwahine).sort((a, b) => a[1].rank - b[1].rank);
    el.querySelector('#proof-1a-tbl')!.innerHTML = `<table><caption>Pu'u Hiwahine (Mauna Kea) per lunar target</caption>
      <thead><tr><th scope="col">Target</th><th scope="col">Rank of 10,424 windows</th><th scope="col">Share of Mauna Kea as high or higher</th><th scope="col">p (region)</th><th scope="col">p (Bonferroni)</th></tr></thead>
      <tbody>${rows.map(([t, v]) => `<tr><th scope="row">${esc(name(t))}</th><td class="tnum">#${nf(v.rank)} of ${nf(v.of)}</td><td class="tnum">${pct1(v.p_value_region_matched)} %</td><td class="tnum">${fmtP(v.p_value_region_matched)}</td><td class="tnum">${fmtP(v.p_bonferroni)}</td></tr>`).join('')}</tbody></table>`;
    const cats = rows.map(([t]) => name(t)).reverse(), vals = rows.map(([, v]) => +(100 * v.p_value_region_matched).toFixed(1)).reverse();
    mountChart(el.querySelector('#proof-1a')!, {
      grid: { left: 8, right: 56, top: 8, bottom: 28, containLabel: true },
      xAxis: { type: 'value', name: '% of Mauna Kea area', nameLocation: 'middle', nameGap: 24, min: 0 },
      yAxis: { type: 'category', data: cats },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: { dataIndex: number }[]) => { const [t, v] = rows[rows.length - 1 - ps[0].dataIndex]; return `${esc(name(t))}<br>${pct1(v.p_value_region_matched)} % of Mauna Kea as high or higher<br>p ${fmtP(v.p_value_region_matched)} · Bonferroni ${fmtP(v.p_bonferroni)}`; } },
      series: [{ type: 'bar', data: vals, barMaxWidth: 22, label: { show: true, position: 'right', formatter: '{c} %', textBorderWidth: 0, textBorderColor: 'transparent', textShadowBlur: 0 } }],
    }, { summary: puuSummary(S.null, name) });
  }

  // ---- 1C · AUC with CI, 3 scores x 9 targets
  if (okRoc) {
    const cats = [...all].reverse(), sym = ['circle', 'rect', 'triangle'];
    const whisker = (si: number) => ({
      type: 'custom', name: SCORE_LABEL[SCORES[si]], z: 2, silent: true,
      renderItem: (_p: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[]; visual: (k: string) => string }) => {
        const y = api.value(0), a = api.coord([api.value(1), y]), b = api.coord([api.value(2), y]), dy = (si - 1) * api.size([0, 1])[1] * 0.26;
        const style = { stroke: api.visual('color'), lineWidth: 1.5 };
        return { type: 'group', children: [
          { type: 'line', shape: { x1: a[0], y1: a[1] + dy, x2: b[0], y2: b[1] + dy }, style },
          { type: 'line', shape: { x1: a[0], y1: a[1] + dy - 4, x2: a[0], y2: a[1] + dy + 4 }, style },
          { type: 'line', shape: { x1: b[0], y1: b[1] + dy - 4, x2: b[0], y2: b[1] + dy + 4 }, style }] };
      },
      encode: { x: [1, 2], y: 0 },
      data: cats.map((t, i) => [i, ...S.roc[t].auc_ci95_by_score[SCORES[si]]]),
    });
    const point = (si: number) => ({
      type: 'custom', name: SCORE_LABEL[SCORES[si]], z: 3,
      renderItem: (_p: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[]; visual: (k: string) => string }) => {
        const c = api.coord([api.value(1), api.value(0)]), dy = (si - 1) * api.size([0, 1])[1] * 0.26, r = 5, fill = api.visual('color');
        const shape = sym[si] === 'rect' ? { type: 'rect', shape: { x: c[0] - r, y: c[1] + dy - r, width: 2 * r, height: 2 * r } }
          : sym[si] === 'triangle' ? { type: 'polygon', shape: { points: [[c[0], c[1] + dy - r - 1], [c[0] - r, c[1] + dy + r], [c[0] + r, c[1] + dy + r]] } }
          : { type: 'circle', shape: { cx: c[0], cy: c[1] + dy, r } };
        return { ...shape, style: { fill } };
      },
      encode: { x: 1, y: 0 },
      data: cats.map((t, i) => [i, S.roc[t].auc_by_score[SCORES[si]], ...S.roc[t].auc_ci95_by_score[SCORES[si]]]),
    });
    const sum = `AUC with 95 % CI per target, for the combined, terrain and illumination scores. ` + all.map(t => `${name(t)}: `
      + SCORES.map(s => `${SCORE_LABEL[s].toLowerCase()} ${f2(S.roc[t].auc_by_score[s])} [${f2(S.roc[t].auc_ci95_by_score[s][0])}–${f2(S.roc[t].auc_ci95_by_score[s][1])}]`).join(', ')).join('; ') + '.';
    mountChart(el.querySelector('#proof-1c')!, {
      legend: { top: 0, data: SCORES.map((s, i) => ({ name: SCORE_LABEL[s], icon: sym[i] })) },
      grid: { left: 8, right: 16, top: 32, bottom: 32, containLabel: true },
      xAxis: { type: 'value', min: 0, max: 1, name: 'AUC (0.5 = no separation)', nameLocation: 'middle', nameGap: 24 },
      yAxis: { type: 'category', data: cats.map(name) },
      tooltip: { trigger: 'item', formatter: (p: { seriesName: string; value: number[] }) => `${esc(name(cats[p.value[0]]))} · ${esc(p.seriesName)}<br>AUC ${f2(p.value[1])} [${f2(p.value[2])}–${f2(p.value[3])}]` },
      series: [...SCORES.map((_, i) => whisker(i)), ...SCORES.map((_, i) => point(i)),
        { type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed' }, label: { show: false }, data: [{ xAxis: 0.5 }] } }],
    }, { summary: sum });
  }

  // ---- 2 · light model vs NASA (Diego Lizárraga's component)
  const lightHost = el.querySelector<HTMLElement>('#proof-light')!;
  import('./proof_light').then(async ({ loadLightProof, renderLightProof }) => {
    const data = await loadLightProof();
    renderLightProof(lightHost, data);
    const o = data.summary.overall, card = el.querySelector('#proof-card-2');
    if (card) card.textContent = `Spearman ρ ${o.rho_far[0].toFixed(2)}–${o.rho_far[1].toFixed(2)} against NASA LOLA at ${o.n_sites} lunar sites`;
  }).catch(() => { lightHost.innerHTML = pending('Light model'); });

  // ---- 3A · bootstrap CI of the top-20 (per selected target)
  const sel = el.querySelector<HTMLSelectElement>('#proof-target')!;
  let h3a: ReturnType<typeof mountChart> | null = null;
  const draw3a = (t: string) => {
    if (!okBoot) return;
    const rows = S.bootstrap[t] as BootRow[], b = rows[0];
    el.querySelector('#proof-3a-line')!.textContent = `${name(t)}: the top window (${region(b.window_id)}) scores ${f1(b.score)} [95 % CI ${f1(b.ci95[0])}–${f1(b.ci95[1])}]; its rank ranges #${b.rank_ci95[0]}–#${b.rank_ci95[1]} under resampling (${S.bootstrap.n_ref[t]} reference windows).`;
    const opt = {
      grid: { left: 8, right: 16, top: 32, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: rows.map((_, i) => `#${i + 1}`), name: 'window rank (equal weights)', nameLocation: 'middle', nameGap: 28 },
      yAxis: { type: 'value', name: 'score', scale: true },
      tooltip: { trigger: 'item', formatter: (p: { dataIndex: number }) => { const r = rows[p.dataIndex]; return `#${p.dataIndex + 1} · ${esc(region(r.window_id))}<br>score ${f1(r.score)} [${f1(r.ci95[0])}–${f1(r.ci95[1])}]<br>rank CI #${r.rank_ci95[0]}–#${r.rank_ci95[1]}`; } },
      series: [{
        type: 'custom', silent: true, encode: { x: 0, y: [1, 2] }, data: rows.map((r, i) => [i, r.ci95[0], r.ci95[1]]),
        renderItem: (_p: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; visual: (k: string) => string }) => {
          const a = api.coord([api.value(0), api.value(1)]), c = api.coord([api.value(0), api.value(2)]), style = { stroke: api.visual('color'), lineWidth: 1.5 };
          return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: c[0], y2: c[1] }, style },
            { type: 'line', shape: { x1: a[0] - 4, y1: a[1], x2: a[0] + 4, y2: a[1] }, style }, { type: 'line', shape: { x1: c[0] - 4, y1: c[1], x2: c[0] + 4, y2: c[1] }, style }] };
        },
      }, { type: 'scatter', symbolSize: 8, data: rows.map(r => r.score) }],
    };
    const summary = `${name(t)}: scores of the top 20 windows with 95 % bootstrap CI. ` + rows.map((r, i) => `#${i + 1} ${region(r.window_id)} ${f1(r.score)} [${f1(r.ci95[0])}–${f1(r.ci95[1])}]`).join('; ') + '.';
    if (h3a) h3a.update(opt, { replace: true, summary }); else h3a = mountChart(el.querySelector('#proof-3a')!, opt, { summary });
  };
  // ---- 3D · tornado and D^2 decomposition (per selected target)
  type TorRow = { feature: string; low: number; high: number; removed: number };
  let h3d: ReturnType<typeof mountChart> | null = null, h3d2: ReturnType<typeof mountChart> | null = null;
  const draw3d = (t: string) => {
    if (okTor) {
      const rows = (S.tornado[t] as TorRow[]).slice().reverse(), top = (S.tornado[t] as TorRow[])[0];
      const w0 = okBoot ? (S.bootstrap[t] as BootRow[])[0] : null;
      el.querySelector('#proof-3d-line')!.textContent = `${name(t)}${w0 ? `, top window in ${region(w0.window_id)}` : ''}: the score is most sensitive to ${flabel(top.feature)} (−1 IQR: ${top.low > 0 ? '+' : ''}${f1(top.low)}; +1 IQR: ${top.high > 0 ? '+' : ''}${f1(top.high)} points).`;
      const lbl = { show: true, fontSize: 11, textBorderWidth: 0, textBorderColor: 'transparent', formatter: (p: { value: number }) => `${p.value > 0 ? '+' : ''}${f1(p.value)}` };
      const opt = {
        legend: { top: 0 }, grid: { left: 8, right: 40, top: 32, bottom: 32, containLabel: true },
        xAxis: { type: 'value', name: 'change in score (points)', nameLocation: 'middle', nameGap: 24 },
        yAxis: { type: 'category', data: rows.map(r => flabel(r.feature)) },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v > 0 ? '+' : ''}${f1(v)}` },
        series: [{ name: '−1 IQR', type: 'bar', data: rows.map(r => r.low), barMaxWidth: 12, label: { ...lbl, position: 'left' } },
          { name: '+1 IQR', type: 'bar', data: rows.map(r => r.high), barMaxWidth: 12, itemStyle: { opacity: 0.75 }, label: { ...lbl, position: 'right' } }],
      };
      const summary = `${name(t)}, top window: change of the combined score when each feature moves by −1 / +1 IQR: ` + (S.tornado[t] as TorRow[]).map(r => `${flabel(r.feature)} ${f1(r.low)} / ${f1(r.high)}`).join('; ') + '.';
      if (h3d) h3d.update(opt, { replace: true, summary }); else h3d = mountChart(el.querySelector('#proof-3d')!, opt, { summary });
    }
    if (okDec) {
      const dec = S.decomp[t] as Record<string, Record<string, number>>, ids = Object.keys(dec), feats = Object.keys(dec[ids[0]]);
      const opt = {
        legend: { top: 0, type: 'scroll' }, grid: { left: 8, right: 16, top: 36, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: ids.map((_, i) => `#${i + 1}`), name: 'window rank (equal weights)', nameLocation: 'middle', nameGap: 28 },
        yAxis: { type: 'value', max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)} %` } },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${Math.round(v * 100)} %` },
        series: feats.map(f => ({ name: flabel(f), type: 'bar', stack: 'd2', data: ids.map(id => dec[id][f]), barMaxWidth: 26 })),
      };
      const summary = `${name(t)}: share of each feature in the squared distance of the top 20 windows. Top window: ` + feats.map(f => [f, dec[ids[0]][f]] as [string, number]).sort((a, b) => b[1] - a[1]).map(([f, v]) => `${flabel(f)} ${Math.round(v * 100)} %`).join(', ') + '.';
      if (h3d2) h3d2.update(opt, { replace: true, summary }); else h3d2 = mountChart(el.querySelector('#proof-3d2')!, opt, { summary });
    }
  };

  draw3a(sel.value); draw3d(sel.value);
  sel.addEventListener('change', () => { draw3a(sel.value); draw3d(sel.value); });

  // ---- 1D · controls vs the 14 regions
  if (okCtrl) {
    const cats = [...all].reverse();
    const groups = [{ name: 'Our 14 regions', get: (t: string) => CT[t].candidates }, ...CR.map(r => ({ name: ctrlName(r), get: (t: string) => CT[t].controls[r.id] as Dist }))];
    const sym = ['circle', 'rect', 'triangle', 'diamond'], n = groups.length;
    type Api = { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[]; visual: (k: string) => string };
    const off = (gi: number, api: Api) => (gi - (n - 1) / 2) * api.size([0, 1])[1] * (0.8 / n);
    const series = groups.flatMap((g, gi) => [
      { type: 'custom', name: g.name, silent: true, encode: { x: [1, 2], y: 0 }, data: cats.map((t, i) => [i, g.get(t).p50, g.get(t).p90]),
        renderItem: (_p: unknown, api: Api) => { const a = api.coord([api.value(1), api.value(0)]), b = api.coord([api.value(2), api.value(0)]), dy = off(gi, api);
          return { type: 'rect', shape: { x: a[0], y: a[1] + dy - 3, width: Math.max(2, b[0] - a[0]), height: 6 }, style: { fill: api.visual('color') } }; } },
      { type: 'custom', name: g.name, encode: { x: 1, y: 0 }, data: cats.map((t, i) => [i, g.get(t).max, g.get(t).p50, g.get(t).p90]),
        renderItem: (_p: unknown, api: Api) => { const c = api.coord([api.value(1), api.value(0)]), dy = off(gi, api), r = 4.5, y = c[1] + dy, fill = api.visual('color');
          const s = sym[gi % sym.length];
          return s === 'rect' ? { type: 'rect', shape: { x: c[0] - r, y: y - r, width: 2 * r, height: 2 * r }, style: { fill } }
            : s === 'triangle' ? { type: 'polygon', shape: { points: [[c[0], y - r - 1], [c[0] - r, y + r], [c[0] + r, y + r]] }, style: { fill } }
            : s === 'diamond' ? { type: 'polygon', shape: { points: [[c[0], y - r - 1], [c[0] + r + 1, y], [c[0], y + r + 1], [c[0] - r - 1, y]] }, style: { fill } }
            : { type: 'circle', shape: { cx: c[0], cy: y, r }, style: { fill } }; } },
    ]);
    const summary = `Combined score P50, P90 and maximum per target, our 14 regions against the control tiles. ` + all.map(t => `${name(t)}: `
      + groups.map(g => { const d = g.get(t); return `${g.name} ${f1(d.p50)}/${f1(d.p90)}/${f1(d.max)}`; }).join(', ')).join('; ') + '. ' + controlsLines(CT, CR, moon, name, arcadia).join(' ');
    mountChart(el.querySelector('#proof-1d')!, {
      legend: { top: 0, data: groups.map((g, i) => ({ name: g.name, icon: sym[i % sym.length] })) },
      grid: { left: 8, right: 16, top: 40, bottom: 32, containLabel: true },
      xAxis: { type: 'value', min: 0, max: 100, name: 'combined score (bar P50–P90, marker = max)', nameLocation: 'middle', nameGap: 24 },
      yAxis: { type: 'category', data: cats.map(name) },
      tooltip: { trigger: 'item', formatter: (p: { seriesName: string; value: number[] }) => p.value.length > 3 ? `${esc(name(cats[p.value[0]]))} · ${esc(p.seriesName)}<br>P50 ${f1(p.value[2])} · P90 ${f1(p.value[3])} · max ${f1(p.value[1])}` : '' },
      series,
    }, { summary });
  }

  // ---- 3B · weight stability
  if (okStab) {
    const cats = [...all].reverse();
    const p1 = cats.map(t => S.stability[t].p_top1[S.stability[t].top1_equal_weights] ?? 0);
    const p10 = cats.map(t => S.stability[t].p_top10[S.stability[t].top1_equal_weights] ?? 0);
    mountChart(el.querySelector('#proof-3b')!, {
      legend: { top: 0 },
      grid: { left: 8, right: 56, top: 32, bottom: 32, containLabel: true },
      xAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)} %` } },
      yAxis: { type: 'category', data: cats.map(name) },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${Math.round(v * 100)} %` },
      series: [
        { name: 'stays #1', type: 'bar', data: p1, barMaxWidth: 12, label: { show: true, position: 'right', fontSize: 11, textBorderWidth: 0, textBorderColor: 'transparent', textShadowBlur: 0, formatter: (p: { value: number }) => `${Math.round(p.value * 100)} %` } },
        { name: 'stays in the top 10', type: 'bar', data: p10, barMaxWidth: 12, itemStyle: { opacity: 0.75 }, label: { show: true, position: 'right', fontSize: 11, textBorderWidth: 0, textBorderColor: 'transparent', textShadowBlur: 0, formatter: (p: { value: number }) => `${Math.round(p.value * 100)} %` } },
      ],
    }, { summary: `Share of random slider weightings in which each target's equal-weight #1 window stays #1 and stays in the top 10: `
      + all.map(t => `${name(t)} ${Math.round(100 * (S.stability[t].p_top1[S.stability[t].top1_equal_weights] ?? 0))} % and ${Math.round(100 * (S.stability[t].p_top10[S.stability[t].top1_equal_weights] ?? 0))} %`).join('; ') + '.' });
  }
}
