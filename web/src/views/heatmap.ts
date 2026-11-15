import { esc, cap } from '../format';
import { ramp } from '../score';
import type { Manifest } from '../types';

interface Matrix { dims: string[]; targets: string[]; regions: string[]; v: Record<string, (number | null)[][]> }

/** Fig. 2 as data: best-window score per Earth region (rows) x target (columns), one panel per dimension. Sortable by any row or column. */
export function mountHeatmap(root: HTMLElement, m: Manifest, mx: Matrix) {
  const R = mx.regions.map(id => m.regions.find(r => r.id === id)!), T = mx.targets.map(id => m.targets.find(t => t.id === id)!);
  const mean = (a: (number | null)[]) => { const x = a.filter((v): v is number => v != null); return x.reduce((s, v) => s + v, 0) / (x.length || 1); };
  let rowKey: number | 'mean' = 'mean', rowDir = -1, colKey: number | 'order' = 'order', colDir = -1;
  let panel = 'combined';
  const draw = () => {
    const panels = panel === 'all' ? mx.dims : [panel], comb = mx.v.combined;
    const rows = R.map((_, i) => i).sort((a, b) => rowKey === 'mean' ? rowDir * (mean(comb[a]) - mean(comb[b])) : rowDir * ((comb[a][rowKey as number] ?? -1) - (comb[b][rowKey as number] ?? -1)));
    const cols = T.map((_, j) => j).sort((a, b) => colKey === 'order' ? 0 : colDir * ((comb[colKey as number][a] ?? -1) - (comb[colKey as number][b] ?? -1)));
    root.innerHTML = `<div class="hm-bar"><div class="seg" role="group" aria-label="Panel">${['all', ...mx.dims].map(d => `<button data-p="${d}" aria-pressed="${panel === d}">${cap(d)}</button>`).join('')}</div>
      <span class="muted tiny">Click a column to sort regions by that target; click a region to sort targets by it. <button class="link" data-reset>Reset</button></span></div>
      <div class="hm-scroll"><table class="hm" role="grid" aria-label="Similarity score of the best window in each Earth region against each target">
      <thead><tr><th class="corner"></th>${panels.map(d => `<th class="ph" colspan="${cols.length}" scope="colgroup">${cap(d)}</th>`).join('')}</tr>
      <tr><th class="corner" scope="col"><button class="link" data-sort-mean>Region${rowKey === 'mean' ? ' ↓' : ''}</button></th>${panels.map(() => cols.map(j => `<th scope="col" class="ch"><button data-col="${j}" aria-label="Sort regions by ${esc(T[j].name)}" title="${esc(T[j].name)}"><span>${esc(T[j].body === 'mars' ? 'Mars' : 'Moon')}</span><b>${esc(T[j].name)}</b></button></th>`).join('')).join('')}</tr></thead>
      <tbody>${rows.map(i => `<tr><th scope="row" class="rh"><button data-row="${i}" title="Sort targets by this region">${esc(R[i].name)}</button></th>${panels.map(d => cols.map(j => {
        const v = mx.v[d][i][j]; if (v == null) return '<td class="na">–</td>';
        return `<td tabindex="-1" style="background:${ramp(v, 20)};color:${v > 62 ? '#0b0f17' : '#fff'}" title="${esc(R[i].name)} · ${esc(T[j].name)} · ${cap(d)}: ${v.toFixed(1)}" aria-label="${esc(R[i].name)}, ${esc(T[j].name)}, ${d} ${v.toFixed(1)}">${v.toFixed(0)}</td>`; }).join('')).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="d-note">Similarity score (0–100) of the best 6 km window in each Earth region. 100 = identical features; ~37 = one inter-quartile range apart on average. Default order: regions by mean combined score.</p>`;
    root.querySelectorAll<HTMLButtonElement>('[data-p]').forEach(b => b.addEventListener('click', () => { panel = b.dataset.p!; draw(); }));
    root.querySelectorAll<HTMLButtonElement>('[data-col]').forEach(b => b.addEventListener('click', () => { const j = +b.dataset.col!; rowDir = rowKey === j ? -rowDir : -1; rowKey = j; draw(); }));
    root.querySelectorAll<HTMLButtonElement>('[data-row]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.row!; colDir = colKey === i ? -colDir : -1; colKey = i; draw(); }));
    root.querySelector('[data-sort-mean]')?.addEventListener('click', () => { rowKey = 'mean'; rowDir = -1; draw(); });
    root.querySelector('[data-reset]')?.addEventListener('click', () => { rowKey = 'mean'; rowDir = -1; colKey = 'order'; draw(); });
  };
  draw();
}
