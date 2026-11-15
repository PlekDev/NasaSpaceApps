// AI-assisted (Claude, Anthropic); reviewed by the team.
// Reverse search (U8): "what could you rehearse here?" For one Earth window, rank the 9 targets (6 Moon + 3 Mars) by the
// score this window already has for each of them, with what is similar and what differs. Only existing exported data:
// <target>.json (scores) and <target>.detail.json (i, j and scaled differences d_k). No new computation, no typed numbers.
// Self-contained (type-only imports) so node --test can load it directly, like proof.ts and model.ts.
import type { Manifest, TargetData } from '../types';

export interface ReverseData {
  manifest: Manifest;
  targets: Record<string, TargetData>;                       // loadTarget(id) for every target
  details: Record<string, Record<string, number[]>>;         // loadDetail(id) for every target
}
export interface Driver { feature: string; label: string; d: number; share: number }
export interface ReverseRow {
  id: string; name: string; body: string;
  combined: number; dims: Record<string, number>;            // scores 0-100
  rank: number; n: number;                                    // position of this window among all windows of the target (1 = top)
  similar: string[]; differs: string[]; drivers: Driver[];   // drivers: share of each feature in D^2, largest first
}

// same thresholds as pen/scoring.py explain() and the analog card (detail.ts)
const THR_SIMILAR = 0.5, THR_DIFF = 1.5;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nf = (n: number) => n.toLocaleString('en-US');

/** "<region id>_<i>_<j>" (the id detail.ts builds); the region id itself may contain underscores. */
export function parseWindowId(id: string): { region: string; i: number; j: number } | null {
  const m = /^(.+)_(\d+)_(\d+)$/.exec(id);
  return m ? { region: m[1], i: Number(m[2]), j: Number(m[3]) } : null;
}

/** Load everything renderReverse needs, with the app's own cached loaders (pass loadTarget and loadDetail from data.ts). */
export async function loadReverseData(m: Manifest, loadTarget: (id: string) => Promise<TargetData>,
  loadDetail: (id: string) => Promise<Record<string, number[]>>): Promise<ReverseData> {
  const ids = m.targets.map(t => t.id);
  const [ts, ds] = await Promise.all([Promise.all(ids.map(loadTarget)), Promise.all(ids.map(loadDetail))]);
  return { manifest: m, targets: Object.fromEntries(ids.map((id, n) => [id, ts[n]])), details: Object.fromEntries(ids.map((id, n) => [id, ds[n]])) };
}

const rowIndex = new WeakMap<object, Map<string, number>>();
function findRow(d: TargetData, det: Record<string, number[]>, region: number, i: number, j: number): number {
  let idx = rowIndex.get(det);
  if (!idx) {
    idx = new Map();
    for (let k = 0; k < d.n; k++) idx.set(`${d.site[k]}_${det.i[k]}_${det.j[k]}`, k);
    rowIndex.set(det, idx);
  }
  return idx.get(`${region}_${i}_${j}`) ?? -1;
}

/** The 9 targets ranked for one Earth window (best first), or null if the window is unknown. */
export function reverseRank(windowId: string, data: ReverseData): ReverseRow[] | null {
  const w = parseWindowId(windowId), m = data.manifest;
  if (!w) return null;
  const region = m.regions.findIndex(r => r.id === w.region);
  if (region < 0) return null;
  const sc = m.scale, feats = Object.values(m.dims).flat();
  const rows: ReverseRow[] = [];
  for (const t of m.targets) {
    const d = data.targets[t.id], det = data.details[t.id];
    if (!d || !det) continue;
    const k = findRow(d, det, region, w.i, w.j);
    if (k < 0) continue;
    const c = d.combined[k];
    let rank = 1;                                            // stable order, ties keep file order (as web/tools/export_data.py)
    for (let q = 0; q < d.n; q++) if (d.combined[q] > c || (d.combined[q] === c && q < k)) rank++;
    const dims = Object.fromEntries(Object.keys(m.dims).map(dim => [dim, (d[`score_${dim}`] as number[])[k] / sc.score]));
    const dv = feats.map(f => ({ f, v: det[`d_${f}`][k] / sc.d }));
    const tot = dv.reduce((a, x) => a + x.v * x.v, 0);
    rows.push({
      id: t.id, name: t.name, body: t.body, combined: c / sc.score, dims, rank, n: d.n,
      similar: dv.filter(x => Math.abs(x.v) <= THR_SIMILAR).map(x => m.feature_labels[x.f] ?? x.f),
      differs: dv.filter(x => Math.abs(x.v) >= THR_DIFF).map(x => `${m.feature_labels[x.f] ?? x.f} (${x.v > 0 ? 'higher' : 'lower'} on Earth)`),
      drivers: dv.map(x => ({ feature: x.f, label: m.feature_labels[x.f] ?? x.f, d: x.v, share: tot > 0 ? (x.v * x.v) / tot : 1 / dv.length }))
        .sort((a, b) => b.share - a.share),
    });
  }
  return rows.sort((a, b) => b.combined - a.combined || a.rank / a.n - b.rank / b.n);
}

const topPct = (r: ReverseRow) => (100 * r.rank) / r.n;
const pctTxt = (p: number) => (p < 0.1 ? '< 0.1' : p < 10 ? p.toFixed(1) : p.toFixed(0));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence for the top of the panel and for screen readers. */
export function reverseSummary(rows: ReverseRow[], regionName: string): string {
  if (!rows.length) return 'No target data for this window.';
  const b = rows[0], main = b.drivers[0];
  return `This window of ${regionName} is most like ${b.name} (${b.body === 'moon' ? 'Moon' : cap(b.body)}): score ${b.combined.toFixed(1)}, `
    + `#${nf(b.rank)} of ${nf(b.n)} Earth windows (top ${pctTxt(topPct(b))} %). `
    + (main && main.share >= 0.5 ? `Most of the remaining difference is ${main.label} (${Math.round(main.share * 100)} % of the squared distance).` : '');
}

/** Render the reverse-search panel into el. Paul mounts it in Explore: renderReverse(el, `${region}_${i}_${j}`, data). */
export function renderReverse(el: HTMLElement, windowId: string, data: ReverseData): void {
  const rows = reverseRank(windowId, data);
  const w = parseWindowId(windowId);
  const region = w ? data.manifest.regions.find(r => r.id === w.region) : undefined;
  if (!rows || !rows.length || !region) {
    el.innerHTML = `<p class="muted">No scores for this window.</p>`;
    return;
  }
  const dims = Object.keys(data.manifest.dims);
  const body = (b: string) => (b === 'moon' ? 'Moon' : cap(b));
  const tr = rows.map(r => {
    const drv = r.drivers[0];
    return `<tr>
      <th scope="row">${esc(r.name)} <span class="muted">· ${esc(body(r.body))}</span></th>
      <td class="tnum">${r.combined.toFixed(1)}</td>
      ${dims.map(dm => `<td class="tnum">${r.dims[dm].toFixed(1)}</td>`).join('')}
      <td class="tnum">#${nf(r.rank)} <span class="muted">top ${pctTxt(topPct(r))} %</span></td>
      <td>${r.similar.length ? esc(r.similar.join(' · ')) : '—'}</td>
      <td>${r.differs.length ? esc(r.differs.join(' · ')) : '—'}${drv ? ` <span class="muted">· largest gap: ${esc(drv.label)} ${Math.round(drv.share * 100)} %</span>` : ''}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <section aria-labelledby="rv-h">
      <h3 id="rv-h">What could you rehearse here?</h3>
      <p>${esc(reverseSummary(rows, region.name))}</p>
      <div class="tbl"><table>
        <caption>The ${rows.length} targets ranked by this window's score. Rank = position of this window among all ${nf(rows[0].n)} Earth windows for that target.</caption>
        <thead><tr><th scope="col">Target</th><th scope="col">Score</th>${dims.map(dm => `<th scope="col">${esc(cap(dm))}</th>`).join('')}<th scope="col">Rank</th><th scope="col">Similar in</th><th scope="col">Differs in</th></tr></thead>
        <tbody>${tr}</tbody>
      </table></div>
      <p class="d-note">Scaled differences: (Earth − target) / IQR of all Earth windows. |d| ≤ ${THR_SIMILAR} = similar, |d| ≥ ${THR_DIFF} = different. "Largest gap" = share of that feature in the squared distance.</p>
    </section>`;
}
