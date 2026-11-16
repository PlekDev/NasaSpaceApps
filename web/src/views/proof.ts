// AI-assisted (Claude, Anthropic); reviewed by the team.
// #/proof · "Proof" (the annex, last in the menu): the 3 proofs: (1) blind test, (2) light model vs NASA (Diego Lizárraga's proof_light.ts), (3) robustness.
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
/** Corrected p-values: 3 decimals below 0.01, else 2 significant digits (0.0246 -> 0.025, 0.148 -> 0.15). */
export const fmtPc = (p: number) => (p < 0.001 ? '< 0.001' : p < 0.01 ? p.toFixed(3) : String(Number(p.toPrecision(2))));
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
  const nS = roc[moon[0]].n_sites, same = moon.every(t => roc[t].sites.join('|') === roc[moon[0]].sites.join('|'));
  const ill1 = above === moon.length
    ? `Low-Sun illumination suggests that NASA's lunar analog sites stand out: AUC ${range(ill, f2)}, with the 95 % CI above 0.5 for all ${moon.length} lunar targets, by a small margin (lower bounds ${range(lows, f2)}).`
    : `Illumination AUC is ${range(ill, f2)} for the lunar targets; its 95 % CI is above 0.5 for ${above} of ${moon.length}.`;
  const shared = same ? ` The ${moon.length} lunar targets share the same ${nS} known sites, so their AUCs are nearly equal (≈ ${f2(ill.reduce((a, b) => a + b, 0) / ill.length)}) and are not independent evidence.` : '';
  const terr = terrIncl === moon.length ? ' Terrain alone does not (its CI includes 0.5 for every lunar target).' : ` Terrain CI includes 0.5 for ${terrIncl} of ${moon.length} lunar targets.`;
  return `${ill1}${shared}${terr} For Mars the score does not separate the known sites (AUC ${range(marsAuc, f2)}).`;
}

/** 3: section title from stability.json. */
export function stabilityTitle(stab: Record<string, StabRow>, targets: string[]): string {
  const p10 = targets.map(t => stab[t].p_top10[stab[t].top1_equal_weights] ?? 0), lo = Math.min(...p10);
  const taus = targets.flatMap(t => Object.entries(stab[t]).filter(([k]) => k.startsWith('kendall_tau_')).map(([, v]) => v as number));
  const tau = `Kendall τ = ${range(taus, f2)}`;
  return lo >= 0.84
    ? `The #1 window stays in the top 10 under at least ${Math.floor(lo * 100)} % of slider weightings for every target; ranks move more across window sizes (${tau})`
    : `How far the top windows move with slider weights (#1 in the top 10 under ${Math.floor(lo * 100)}–${Math.floor(Math.max(...p10) * 100)} % of weightings) and window size (${tau})`;
}

/** 1A table rows and summary: Pu'u Hiwahine per lunar target. Two universes are kept apart: rank among the 10,424 windows,
 *  and share of the valid area of the Mauna Kea region. */
export function puuSummary(n: NullStats, name: (id: string) => string): string {
  const rows = Object.entries(n.pu_uhiwahine).sort((a, b) => a[1].rank - b[1].rank);
  return `Share of the valid area of the Mauna Kea region that scores as high as NASA's test site or higher, per lunar target: `
    + rows.map(([t, v]) => `${name(t)} ${pct1(v.p_value_region_matched)} % (p ${fmtP(v.p_value_region_matched)}, Bonferroni ${fmtP(v.p_bonferroni)})`).join('; ') + '.';
}

/** Card 1: the headline target's region-matched p, one universe (share of the Mauna Kea area) only. */
/** Corrections of the Pu'u Hiwahine p: over the lunar targets (null.json) and over all lunar site-target tests of the
 *  known-analog test (nMoonTests, counted from known_analogs.json), since the best of those results is the one we report. */
export function puuCorrections(n: NullStats, nMoonTests: number) {
  const v = n.pu_uhiwahine[n.headline_target];
  if (!v) return null;
  return { p: v.p_value_region_matched, pTargets: v.p_bonferroni, nTargets: Object.keys(n.pu_uhiwahine).length,
           pTests: Math.min(1, v.p_value_region_matched * nMoonTests), nTests: nMoonTests };
}
const corrTxt = (c: NonNullable<ReturnType<typeof puuCorrections>>) =>
  `${fmtPc(c.pTargets)} corrected for ${c.nTargets} lunar targets; ${fmtPc(c.pTests)} corrected for all ${c.nTests} site–target tests`;

/** Lead sentence: one universe (share of the Mauna Kea area), both corrections. */
export function leadLine(n: NullStats, name: (id: string) => string, nMoonTests: number): string {
  const c = puuCorrections(n, nMoonTests);
  if (!c) return n.headline;
  return `Only ${(100 * c.p).toFixed(1)} % of Mauna Kea scores as high as NASA's exact test site for ${name(n.headline_target)}: `
    + `p = ${fmtP(c.p)} (${corrTxt(c)}).`;
}

export function card1(n: NullStats, name: (id: string) => string, nMoonTests: number): string {
  const c = puuCorrections(n, nMoonTests);
  return c ? `p = ${fmtP(c.p)} for ${name(n.headline_target)} within Mauna Kea (${corrTxt(c)})` : n.headline;
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

/** 1B: the group test, with the exact p-values of null.json. */
export function nullLine(n: NullStats, nSites: number, nRegions: number): string {
  const p = n.p_value, sig = p.global.combined < 0.05;
  return `As a group, the ${nSites} known sites ${sig ? 'rank significantly higher' : 'do not rank significantly higher'} than random points of our ${nRegions} regions `
    + `(combined score: p = ${fmtP(p.global.combined)} global, ${fmtP(p.region_matched.combined)} region-matched; illumination alone: p = ${fmtP(p.global.illum)} global, `
    + `${fmtP(p.region_matched.illum)} region-matched)${sig ? '' : '; those regions were chosen because they are analogs, so a random point in them is already a reasonable analog'}.`;
}

/** The limits, generated from the stats files that are real (a stub contributes nothing). */
export function notSupported(S: Stats, moon: string[], mars: string[], name: (id: string) => string, nSites: number, nMoonTests = 0, nRegions = 14): string[] {
  const out: string[] = [];
  if (isReal(S.null)) {
    const ok6 = Object.entries(S.null.pu_uhiwahine).filter(([, v]) => v.p_bonferroni < 0.05).map(([t]) => name(t));
    const okAll = nMoonTests ? Object.entries(S.null.pu_uhiwahine).filter(([, v]) => v.p_value_region_matched * nMoonTests < 0.05).map(([t]) => name(t)) : ok6;
    out.push(`The ${nSites} known sites as a group do not beat random points of our ${nRegions} regions (combined p = ${fmtP(S.null.p_value.global.combined)} global, `
      + `${fmtP(S.null.p_value.region_matched.combined)} region-matched; illumination p = ${fmtP(S.null.p_value.global.illum)} global).`);
    const c = puuCorrections(S.null, nMoonTests);
    if (c) out.push(`The Pu'u Hiwahine result is significant only before the widest correction: ${ok6.length ? ok6.join(' and ') : 'no lunar target'} stays below 0.05 after correcting for ${c.nTargets} lunar targets, `
      + `but ${okAll.length ? `only ${okAll.join(' and ')}` : 'none'} after correcting for all ${c.nTests} lunar site–target tests (p = ${fmtPc(c.pTests)} for ${name(S.null.headline_target)}). `
      + `We do not claim the site was chosen in advance.`);
  }
  if (isReal(S.roc)) out.push(`For Mars the score does not separate the known analog sites (AUC ${range(mars.map(t => S.roc[t].auc), f2)}): those sites were chosen for chemistry, climate or ice rather than terrain, and Arcadia is a flat plain (flat-plains degeneracy).`);
  if (isReal(S.bootstrap)) { const hi = Math.max(...[...moon, ...mars].map(t => (S.bootstrap[t] as BootRow[])[0].rank_ci95[1])); out.push(`The exact #1 window is not guaranteed: under bootstrap resampling of the reference its rank CI reaches up to #${hi}. Say "top window" with its CI, never "the best place".`); }
  if (isReal(S.stability)) { const j = [...moon, ...mars].map(t => S.stability[t].jaccard_top10_3_6 as number); out.push(`The exact top-10 windows change with window size (Jaccard overlap 3 km vs 6 km ≤ ${f2(Math.max(...j))}); claims should be about regions, not single windows.`); }
  if (isReal(S.controls)) {
    const c = S.controls as unknown as Record<string, CtrlTarget> & { regions: CtrlRegion[] }, alps = c.regions.find(r => /alps/.test(r.id));
    const mal = moon.find(t => /malapert/.test(t));
    if (alps && mal && c[mal]?.controls[alps.id]) out.push(`A high terrain score alone does not mean "lunar": the Alps reach a terrain score of ${f1(c[mal].controls[alps.id].terrain.max)} for ${name(mal)}; illumination is what keeps them out of the top.`);
  }
  return out;
}

/* ---------- view ---------- */
const FILES = ['null', 'roc', 'bootstrap', 'stability', 'tornado', 'decomp', 'controls'] as const;
const pending = (what: string) => `<p class="proof-pending">${esc(what)}: results pending.</p>`;

export async function render(el: HTMLElement, m: Manifest, _params: Params): Promise<void> {
  void import('./proof.css');
  const [{ mountChart }, { getJSON }, PC, { onCleanup }] = await Promise.all([import('../lib/chart'), import('../data'), import('../lib/proofcharts'), import('../lib/lifecycle')]);
  const [got, ka0] = await Promise.all([Promise.all(FILES.map(f => getJSON<Meta>(`stats/${f}`).catch(() => null))),
    getJSON<{ rows: { reference: string }[] }>('known_analogs').catch(() => ({ rows: [] }))]);
  const S = Object.fromEntries(FILES.map((f, i) => [f, got[i]])) as unknown as Stats;
  const hosts = new Map<HTMLElement, ReturnType<typeof mountChart>>();   // one chart per host: a redraw (theme flip, target change) updates it in place
  const mc = (host: HTMLElement, o: Parameters<typeof mountChart>[1], opts: Parameters<typeof mountChart>[2]) => {
    const old = hosts.get(host);
    if (old) { old.update(o, { replace: true, summary: opts.summary }); return old; }
    const h = mountChart(host, o, { fs: 14, ...opts }); hosts.set(host, h); return h;
  };
  const P = () => PC.palette();
  const charts: (() => void)[] = [];   // every chart is a function of the theme palette and of the selected target
  const name = (id: string) => m.targets.find(t => t.id === id)?.name ?? id;
  const region = (wid: string) => { const r = m.regions.find(x => wid.startsWith(`${x.id}_`)); return r ? r.name : wid; };
  const moon = m.targets.filter(t => t.body === 'moon').map(t => t.id), mars = m.targets.filter(t => t.body === 'mars').map(t => t.id);
  const all = [...moon, ...mars];
  const nMoonTests = ka0.rows.filter(r => moon.includes(r.reference)).length;   // lunar (site, target) tests of the known-analog test
  const okNull = isReal(S.null), okRoc = isReal(S.roc), okBoot = isReal(S.bootstrap), okStab = isReal(S.stability);
  const okCtrl = isReal(S.controls), okTor = isReal(S.tornado), okDec = isReal(S.decomp);
  const CT = S.controls as unknown as Record<string, CtrlTarget>, CR = okCtrl ? (S.controls as unknown as { regions: CtrlRegion[] }).regions : [];
  const arcadia = mars.find(t => /arcadia/.test(t));
  const flabel = (k: string) => m.feature_labels[k] ?? k;
  const title3 = okStab ? stabilityTitle(S.stability, all) : 'Robustness';
  const nSites = okNull ? ((S.null._meta?.params as Record<string, unknown> | undefined)?.n_sites as number ?? 0) : 0;
  const nTests = okNull ? ((S.null._meta?.params as Record<string, unknown> | undefined)?.n_tests as number ?? 0) : 0;
  const pickDefault = okNull && S.null.headline_target ? S.null.headline_target : moon[0];

  el.innerHTML = `<div class="page-in wide proof">
    <p class="dossier-kicker">Annex · how the claims were checked</p>
    <h1>Proof</h1>
    <p class="lead">${okNull ? esc(leadLine(S.null, name, nMoonTests)) : 'Validation results are being computed.'}</p>
    <nav class="proof-cards" aria-label="The three proofs">
      <button type="button" class="proof-card" data-goto="proof-1"><span class="proof-num">1</span><b>Blind test</b><span>${okNull ? esc(card1(S.null, name, nMoonTests)) : 'pending'}</span></button>
      <button type="button" class="proof-card" data-goto="proof-2"><span class="proof-num">2</span><b>Light vs NASA</b><span id="proof-card-2">Light model against NASA LOLA illumination</span></button>
      <button type="button" class="proof-card" data-goto="proof-3"><span class="proof-num">3</span><b>Robustness</b><span>${esc(title3)}</span></button>
    </nav>

    <section class="vsec proof-sec" id="proof-1" aria-labelledby="proof-1-h">
      <h2 id="proof-1-h">1 · Blind test: P.E.N. finds NASA's lunar test site on Mauna Kea without being told</h2>
      <h3>Pu'u Hiwahine, NASA's 2012 lunar-polar field-test site, per lunar target</h3>
      ${okNull ? `<div class="proof-chart proof-h-sm" id="proof-1a"></div><div class="tbl" id="proof-1a-tbl"></div>
        <p class="note">Rank: position of the site's best 6 km window among all ${nf(Object.values(S.null.pu_uhiwahine)[0]?.of ?? 0)} Earth windows for that target. Share of Mauna Kea: share of the valid area of the Mauna Kea region (150 m lattice) whose best window scores as high or higher; this is the region-matched p. Bonferroni corrections, capped at 1: p × ${Object.keys(S.null.pu_uhiwahine).length} lunar targets, and p × ${nMoonTests} lunar site–target tests of the known-analog test (we report the best of those results, so the wider correction is the fair one).</p>` : pending('Blind test')}
      <h3>As a group, are the NASA analog sites special?</h3>
      ${okNull ? `<p class="prose-p">${esc(nullLine(S.null, nSites, m.regions.length))}</p><div class="proof-chart proof-h-md" id="proof-1b"></div>
        <p class="note">Global null: ${esc(S.null.questions.global)} Region-matched null: ${esc(S.null.questions.region_matched)} ${nf(S.null.n_perm)} random sets each (seed ${S.null.seed}); p = (1 + #null ≥ observed) / (N + 1).</p>` : pending('Null test')}
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
      <details class="proof-more"><summary>Read more: method and tables of the blind test</summary>
        ${okNull ? `<p class="prose-p">The statistic is the one of the known-analog test: each known site → the 6 km windows that contain it → best percentile of their score among all windows of the target → median over the ${nTests} (site, target) tests. The null replaces each site by a random point of the valid area (inside at least one window), drawn on a ${esc(String((S.null._meta?.params as Record<string, unknown> | undefined)?.lattice_m ?? ''))} m lattice.</p>
        <div class="tbl"><table><caption>Null distributions of the median percentile</caption><thead><tr><th scope="col">Score</th><th scope="col">Observed</th><th scope="col">Global: mean [P5–P95]</th><th scope="col">p global</th><th scope="col">Region-matched: mean [P5–P95]</th><th scope="col">p region</th></tr></thead>
        <tbody>${SCORES.map(k => { const g = S.null.null_summary.global[k], r = S.null.null_summary.region_matched[k]; return `<tr><th scope="row">${SCORE_LABEL[k]}</th><td class="tnum">${f1(S.null.observed[`median_pct_${k}`])}</td><td class="tnum">${f1(g.mean)} [${f1(g.p05)}–${f1(g.p95)}]</td><td class="tnum">${fmtP(S.null.p_value.global[k])}</td><td class="tnum">${f1(r.mean)} [${f1(r.p05)}–${f1(r.p95)}]</td><td class="tnum">${fmtP(S.null.p_value.region_matched[k])}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
        ${okRoc ? `<h3>ROC curves, combined score</h3><div class="proof-chart proof-h-md" id="proof-roc"></div>` : ''}
        <h3>Every known analog site and target</h3><div class="tbl scroll" id="proof-ka"></div>
        ${okCtrl ? `<h3>Control tiles: rank of their best window if inserted among the official windows</h3><div class="tbl" id="proof-ctrl"></div>` : ''}
      </details>
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
      <h3>Window size: 3, 6 and 12 km</h3>
      ${okStab ? `<div class="tbl" id="proof-3c"></div>
        <p class="note">Kendall τ-b between the regional rankings (best window per region, ${S.stability[all[0]].n_regions} regions) at two window sizes; 1 = same order. Jaccard: overlap of the footprints of the top-10 windows (area of intersection / union); 0 = no overlap. At 12 km the lunar reference rests on very few reference windows, so the 12 km columns are the weakest.</p>` : pending('Window size')}
      <details class="proof-more"><summary>Read more: method of the robustness tests</summary>
        <ul class="proof-lines">
          ${okBoot ? `<li>Bootstrap: ${nf(Number((S.bootstrap._meta?.params as Record<string, unknown> | undefined)?.bootstrap ?? 0))} replicates; reference windows per target: ${all.map(t => `${esc(name(t))} ${S.bootstrap.n_ref[t]}`).join(', ')}. The IQR is fixed to the main run.</li>` : ''}
          ${okStab ? `<li>Weights: ${esc(String((S.stability._meta?.params as Record<string, unknown> | undefined)?.weights ?? ''))}; with two dimensions only the ratio matters. These replace the Dirichlet weights of the original plan so the test covers exactly the weightings a user can choose.</li>` : ''}
          ${okTor ? `<li>Tornado: deterministic; ±1 IQR on one feature of the top window, all else fixed.</li>` : ''}
          <li>All statistics use seed ${esc(String((S.null as Meta)?._meta?.seed ?? ''))} and record their date, parameters and input hashes in <code>data/processed/stats/</code>.</li>
        </ul>
        <h3>Windows of the top 10 kept when illumination is re-weighted</h3><div class="tbl" id="proof-sens"></div>
      </details>
    </section>

    <section class="vsec proof-sec" id="proof-limits" aria-labelledby="proof-limits-h">
      <h2 id="proof-limits-h">What the statistics do NOT support</h2>
      <ul class="proof-lines">${notSupported(S, moon, mars, name, nSites, nMoonTests, m.regions.length).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>

    <section class="vsec proof-sec" id="proof-all" aria-labelledby="proof-all-h">
      <h2 id="proof-all-h">Appendix · All scores</h2>
      <p class="prose-p">The top-window score in every Earth region against every target, from the exported data.</p>
      <div id="proof-hm"></div>
    </section>
  </div>`;

  // in-page navigation without touching location.hash (the router treats any hash as a route)
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.querySelectorAll<HTMLButtonElement>('.proof-card[data-goto]').forEach(b => b.addEventListener('click', ev => {
    ev.preventDefault();
    document.getElementById(b.dataset.goto!)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }));

  // ---- 1A · Pu'u Hiwahine
  if (okNull) {
    const rows = Object.entries(S.null.pu_uhiwahine).sort((a, b) => a[1].rank - b[1].rank);
    el.querySelector('#proof-1a-tbl')!.innerHTML = `<table><caption>Pu'u Hiwahine (Mauna Kea) per lunar target</caption>
      <thead><tr><th scope="col">Target</th><th scope="col">Rank of ${nf(rows[0]?.[1].of ?? 0)} windows</th><th scope="col">Share of Mauna Kea as high or higher</th><th scope="col">p (region)</th><th scope="col">p × ${Object.keys(S.null.pu_uhiwahine).length} targets</th><th scope="col">p × ${nMoonTests} tests</th></tr></thead>
      <tbody>${rows.map(([t, v]) => `<tr><th scope="row">${esc(name(t))}</th><td class="tnum">#${nf(v.rank)} of ${nf(v.of)}</td><td class="tnum">${pct1(v.p_value_region_matched)} %</td><td class="tnum">${fmtP(v.p_value_region_matched)}</td><td class="tnum">${fmtPc(v.p_bonferroni)}</td><td class="tnum">${fmtPc(Math.min(1, v.p_value_region_matched * nMoonTests))}</td></tr>`).join('')}</tbody></table>`;
    charts.push(() => mc(el.querySelector('#proof-1a')!, PC.puuBars(P(), rows.map(([t, v]) => ({ label: name(t), share: +(100 * v.p_value_region_matched).toFixed(1),
      tip: `${esc(name(t))}<br>${pct1(v.p_value_region_matched)} % of Mauna Kea as high or higher<br>p ${fmtP(v.p_value_region_matched)} · Bonferroni ${fmtP(v.p_bonferroni)}` }))), { summary: puuSummary(S.null, name) }));
  }

  // ---- 1C · AUC with CI, 3 scores x 9 targets
  if (okRoc) {
    const sum = `AUC with 95 % CI per target, for the combined, terrain and illumination scores. ` + all.map(t => `${name(t)}: `
      + SCORES.map(s => `${SCORE_LABEL[s].toLowerCase()} ${f2(S.roc[t].auc_by_score[s])} [${f2(S.roc[t].auc_ci95_by_score[s][0])}–${f2(S.roc[t].auc_ci95_by_score[s][1])}]`).join(', ')).join('; ') + '.';
    charts.push(() => mc(el.querySelector('#proof-1c')!, PC.aucForest(P(), all.map(t => ({ label: name(t), auc: S.roc[t].auc_by_score, ci: S.roc[t].auc_ci95_by_score as Record<string, [number, number]> })), moon.length), { summary: sum }));
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
  const draw3a = (t: string) => {
    if (!okBoot) return;
    const rows = S.bootstrap[t] as BootRow[], b = rows[0];
    el.querySelector('#proof-3a-line')!.textContent = `${name(t)}: the top window (${region(b.window_id)}) scores ${f1(b.score)} [95 % CI ${f1(b.ci95[0])}–${f1(b.ci95[1])}]; its rank ranges #${b.rank_ci95[0]}–#${b.rank_ci95[1]} under resampling (${S.bootstrap.n_ref[t]} reference windows).`;
    const summary = `${name(t)}: scores of the top 20 windows with 95 % bootstrap CI. ` + rows.map((r, i) => `#${i + 1} ${region(r.window_id)} ${f1(r.score)} [${f1(r.ci95[0])}–${f1(r.ci95[1])}]`).join('; ') + '.';
    mc(el.querySelector('#proof-3a')!, PC.bootstrapCI(P(), rows.map((r, i) => ({ score: r.score, lo: r.ci95[0], hi: r.ci95[1],
      tip: `#${i + 1} · ${esc(region(r.window_id))}<br>score ${f1(r.score)} [${f1(r.ci95[0])}–${f1(r.ci95[1])}]<br>rank CI #${r.rank_ci95[0]}–#${r.rank_ci95[1]}` }))), { summary });
  };
  // ---- 3D · tornado and D^2 decomposition (per selected target)
  type TorRow = { feature: string; low: number; high: number; removed: number };
  const draw3d = (t: string) => {
    if (okTor) {
      const rows = S.tornado[t] as TorRow[], top = rows[0];
      const w0 = okBoot ? (S.bootstrap[t] as BootRow[])[0] : null;
      el.querySelector('#proof-3d-line')!.textContent = `${name(t)}${w0 ? `, top window in ${region(w0.window_id)}` : ''}: the score is most sensitive to ${flabel(top.feature)} (−1 IQR: ${top.low > 0 ? '+' : ''}${f1(top.low)}; +1 IQR: ${top.high > 0 ? '+' : ''}${f1(top.high)} points).`;
      const summary = `${name(t)}, top window: change of the combined score when each feature moves by −1 / +1 IQR: ` + (S.tornado[t] as TorRow[]).map(r => `${flabel(r.feature)} ${f1(r.low)} / ${f1(r.high)}`).join('; ') + '.';
      mc(el.querySelector('#proof-3d')!, PC.tornado(P(), rows.map(r => ({ label: flabel(r.feature), low: r.low, high: r.high }))), { summary });
    }
    if (okDec) {
      const dec = S.decomp[t] as Record<string, Record<string, number>>, ids = Object.keys(dec), feats = Object.keys(dec[ids[0]]);
      const summary = `${name(t)}: share of each feature in the squared distance of the top 20 windows. Top window: ` + feats.map(f => [f, dec[ids[0]][f]] as [string, number]).sort((a, b) => b[1] - a[1]).map(([f, v]) => `${flabel(f)} ${Math.round(v * 100)} %`).join(', ') + '.';
      mc(el.querySelector('#proof-3d2')!, PC.decompStack(P(), ids, feats.map(f => ({ key: f, label: flabel(f), vals: ids.map(id => dec[id][f]) }))), { summary });
    }
  };
  sel.addEventListener('change', () => { draw3a(sel.value); draw3d(sel.value); });

  // ---- 1D · controls vs the 14 regions
  if (okCtrl) {
    const groups = [{ name: 'Our 14 regions', get: (t: string) => CT[t].candidates }, ...CR.map(r => ({ name: ctrlName(r), get: (t: string) => CT[t].controls[r.id] as Dist }))];
    const summary = `Combined score P50, P90 and maximum per target, our 14 regions against the control tiles. ` + all.map(t => `${name(t)}: `
      + groups.map(g => { const d = g.get(t); return `${g.name} ${f1(d.p50)}/${f1(d.p90)}/${f1(d.max)}`; }).join(', ')).join('; ') + '. ' + controlsLines(CT, CR, moon, name, arcadia).join(' ');
    charts.push(() => mc(el.querySelector('#proof-1d')!, PC.controlRanges(P(), all.map(name), groups.map(g => ({ name: g.name, get: (i: number) => g.get(all[i]) }))), { summary }));
  }

  // ---- 3B · weight stability
  if (okStab) {
    const p1 = all.map(t => S.stability[t].p_top1[S.stability[t].top1_equal_weights] ?? 0);
    const p10 = all.map(t => S.stability[t].p_top10[S.stability[t].top1_equal_weights] ?? 0);
    charts.push(() => mc(el.querySelector('#proof-3b')!, PC.stabilityBars(P(), all.map(name), p1, p10), { summary: `Share of random slider weightings in which each target's equal-weight #1 window stays #1 and stays in the top 10: `
      + all.map(t => `${name(t)} ${Math.round(100 * (S.stability[t].p_top1[S.stability[t].top1_equal_weights] ?? 0))} % and ${Math.round(100 * (S.stability[t].p_top10[S.stability[t].top1_equal_weights] ?? 0))} %`).join('; ') + '.' }));
  }

  // ---- 1B · null histograms
  if (okNull) {
    const H = S.null.null_hist, bins = H.global.bins, mids = bins.slice(0, -1).map((b, i) => (b + bins[i + 1]) / 2);
    const obs = S.null.observed.median_pct_combined;
    charts.push(() => mc(el.querySelector('#proof-1b')!, PC.nullHist(P(), mids, H.global.counts, H.region_matched.counts, obs, `observed ${f1(obs)}`),
      { summary: `Distribution of the median percentile of ${nSites} random sites under the global null (mean ${f1(S.null.null_summary.global.combined.mean)}) and the region-matched null (mean ${f1(S.null.null_summary.region_matched.combined.mean)}), against the observed ${f1(obs)}. ${nullLine(S.null, nSites, m.regions.length)}` }));
  }

  // ---- Read more · ROC curves
  if (okRoc) {
    charts.push(() => mc(el.querySelector('#proof-roc')!, PC.rocCurves(P(), all.map(t => ({ name: name(t), mars: mars.includes(t), auc: S.roc[t].auc, pts: S.roc[t].fpr.map((x, k) => [x, S.roc[t].tpr[k]]) }))),
      { summary: `ROC curves of the combined score per target (Mars dashed). AUC: ${all.map(t => `${name(t)} ${f2(S.roc[t].auc)}`).join(', ')}.` }));
  }

  const paintAll = () => { charts.forEach(f => f()); draw3a(sel.value); draw3d(sel.value); };
  paintAll();
  const themeObs = new MutationObserver(paintAll); themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  onCleanup(() => themeObs.disconnect());

  // ---- Read more · known analog table, controls table, sensitivity table
  Promise.all([getJSON<{ rows: Record<string, number | string>[] }>('known_analogs'), getJSON<Record<string, Record<string, { rank: number; n: number }>>>('known_ranks'),
    getJSON<{ illumination_weight: number[]; top10_overlap_vs_equal: Record<string, number[]> }>('sensitivity'), getJSON<unknown>('matrix')]).then(([ka, kr, sens, mx]) => {
    const rows = ka.rows.slice().sort((a, b) => String(a.reference).localeCompare(String(b.reference)) || Number(b.score_combined_pct_best) - Number(a.score_combined_pct_best));
    el.querySelector('#proof-ka')!.innerHTML = `<table><caption>Known analog sites: percentile of the best window containing the site among all Earth windows of the target (50 = random)</caption>
      <thead><tr><th scope="col">Target</th><th scope="col">Known site</th><th scope="col">Rank of best</th><th scope="col">Combined</th><th scope="col">Terrain</th><th scope="col">Illumination</th></tr></thead>
      <tbody>${rows.map(r => { const k = kr[String(r.reference)]?.[String(r.site)]; return `<tr><th scope="row">${esc(name(String(r.reference)))}</th><td>${esc(String(r.site))}</td><td class="tnum">${k ? `#${nf(k.rank)}` : '—'}</td>${['score_combined_pct_best', 'score_terrain_pct_best', 'score_illumination_pct_best'].map(c => `<td class="tnum">${f1(Number(r[c]))}</td>`).join('')}</tr>`; }).join('')}</tbody></table>`;
    const W = sens.illumination_weight;
    el.querySelector('#proof-sens')!.innerHTML = `<table><caption>Top-10 windows kept vs equal weights, by illumination weight (terrain fixed at 1)</caption><thead><tr><th scope="col">Target</th>${W.map(w => `<th scope="col">×${w}</th>`).join('')}</tr></thead>
      <tbody>${Object.entries(sens.top10_overlap_vs_equal).map(([t, a]) => `<tr><th scope="row">${esc(name(t))}</th>${a.map(v => `<td class="tnum">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    import('./heatmap').then(({ mountHeatmap }) => mountHeatmap(el.querySelector('#proof-hm')!, m, mx as never));
  }).catch(() => { /* optional tables: the rest of the view stays */ });
  if (okCtrl) {
    el.querySelector('#proof-ctrl')!.innerHTML = `<table><caption>Best control window: rank if inserted among the ${nf(CT[all[0]].controls[CR[0].id].of)} official windows (the official ranking does not change)</caption>
      <thead><tr><th scope="col">Target</th>${CR.map(r => `<th scope="col">${esc(ctrlName(r))}</th>`).join('')}</tr></thead>
      <tbody>${all.map(t => `<tr><th scope="row">${esc(name(t))}</th>${CR.map(r => `<td class="tnum">#${nf(CT[t].controls[r.id].best_rank_if_inserted)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ---- 3C · window size, Kendall tau and Jaccard (heat table on theme tokens)
  if (okStab) {
    const cols = ['kendall_tau_3_6', 'kendall_tau_6_12', 'kendall_tau_3_12', 'jaccard_top10_3_6', 'jaccard_top10_6_12', 'jaccard_top10_3_12'];
    const head = (c: string) => `${c.startsWith('kendall') ? 'τ' : 'Jaccard'} ${c.split('_').slice(-2).join('–')} km`;
    el.querySelector('#proof-3c')!.innerHTML = `<table class="proof-heat"><caption>Agreement between window sizes per target</caption>
      <thead><tr><th scope="col">Target</th>${cols.map(c => `<th scope="col">${head(c)}</th>`).join('')}</tr></thead>
      <tbody>${all.map(t => `<tr><th scope="row">${esc(name(t))}</th>${cols.map(c => { const v = Number(S.stability[t][c]); return `<td class="tnum" style="--v:${Math.max(0, Math.min(1, v)).toFixed(2)}">${f2(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  }
}
