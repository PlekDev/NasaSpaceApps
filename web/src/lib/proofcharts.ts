// AI-assisted (Claude Code); reviewed by the author.
/** The Proof charts, drawn in the app's current style: square marks, hairline grid, one steel colour for the main series, amber for what the
 *  reader should look at (the headline target, the observed value), direct value labels instead of legends where possible.
 *  Colour carries meaning here as in Statistics: terrain = steel, illumination = amber, combined = white. These functions only build ECharts
 *  options from data (no DOM except reading the CSS tokens in `palette()`), so they redraw when the theme flips. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

export interface Pal { t1: string; t2: string; t3: string; line: string; strong: string; acc: string; warn: string; ok: string; panel: string; ramp: string[] }
export function palette(): Pal {
  const cs = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const g = (n: string, d: string) => (cs?.getPropertyValue(n).trim() || d);
  return { t1: g('--text-1', '#eef2f6'), t2: g('--text-2', '#b6c2cf'), t3: g('--text-3', '#8a99ab'), line: g('--line', 'rgba(170,200,230,.16)'), strong: g('--line-strong', 'rgba(170,200,230,.34)'),
    acc: g('--accent', '#94bce3'), warn: g('--warn', '#e0b060'), ok: g('--ok', '#86cba7'), panel: g('--panel-solid', '#0e1722'),
    ramp: [g('--ramp-0', '#1c3d6e'), g('--ramp-1', '#2a78d6'), g('--ramp-2', '#6da7ec'), g('--ramp-3', '#ffd166')] };
}

const SQ = 'rect';
const anim = { animationDuration: 650, animationEasing: 'cubicOut' };
const legendBase = (p: Pal, data: any[], extra: Rec = {}) => ({ top: 0, left: 0, itemWidth: 12, itemHeight: 12, itemGap: 18, icon: SQ, data, textStyle: { color: p.t2, fontSize: 14 }, ...extra });
const axisName = (p: Pal, name: string) => ({ name, nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: p.t3, fontSize: 13 } });
const pct = (v: number) => `${Math.round(v * 100)} %`;
const sgn = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

/* ---------- 1A · where Pu'u Hiwahine lands ---------- */
export interface PuuRow { label: string; share: number; tip: string }
/** Share of the Mauna Kea area scoring as high as NASA's site, one bar per lunar target (best first); the best is amber, the 5 % line is p = 0.05. */
export function puuBars(p: Pal, rows: PuuRow[]): Rec {
  const cats = rows.map(r => r.label).reverse(), data = rows.map((r, i) => ({ value: r.share, itemStyle: { color: i === 0 ? p.warn : p.acc, opacity: i === 0 ? 1 : 0.78 } })).reverse();
  return { ...anim, grid: { left: 8, right: 64, top: 24, bottom: 36, containLabel: true },
    xAxis: { type: 'value', min: 0, axisLabel: { formatter: '{value} %' }, ...axisName(p, 'share of the Mauna Kea area that scores as high or higher') },
    yAxis: { type: 'category', data: cats, axisTick: { show: false }, axisLabel: { fontSize: 14, color: p.t1 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: { dataIndex: number }[]) => rows[rows.length - 1 - ps[0].dataIndex].tip },
    series: [{ type: 'bar', data, barWidth: 20, label: { show: true, position: 'right', color: p.t1, fontSize: 14, fontWeight: 600, formatter: (q: { value: number }) => `${q.value} %` },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: p.t3, type: 'dashed', width: 1 }, label: { color: p.t3, formatter: 'p = 0.05', position: 'end' }, data: [{ xAxis: 5 }] } }] };
}

/* ---------- 1B · the null distributions ---------- */
export function nullHist(p: Pal, mids: number[], global: number[], matched: number[], observed: number, obsLabel: string): Rec {
  const sh = (c: number[]) => { const t = c.reduce((a, b) => a + b, 0) || 1; return c.map(x => x / t); }, g = sh(global), r = sh(matched), w = mids.length > 1 ? (mids[1] - mids[0]) * 0.86 : 1;
  return { ...anim, legend: legendBase(p, ['global null', 'region-matched null']), grid: { left: 8, right: 24, top: 40, bottom: 44, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 100, ...axisName(p, 'median percentile of the known sites (combined score)') },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${Math.round(v * 100)} %` } },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${(v * 100).toFixed(1)} %` },
    series: [{ name: 'global null', type: 'bar', barWidth: Math.max(2, w * 5), data: mids.map((x, i) => [x, g[i]]), itemStyle: { color: p.acc, opacity: 0.5 } },
      { name: 'region-matched null', type: 'line', step: 'middle', symbol: 'none', itemStyle: { color: p.t1 }, lineStyle: { color: p.t1, width: 2 }, data: mids.map((x, i) => [x, r[i]]),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: p.warn, width: 2.5 }, label: { color: p.warn, fontSize: 14, fontWeight: 600, formatter: obsLabel, position: 'insideEndTop' }, data: [{ xAxis: observed }] } }] };
}

/* ---------- 1C · AUC with its interval, three scores per target ---------- */
export interface AucRow { label: string; auc: Record<string, number>; ci: Record<string, [number, number]> }
const SCORE_COL = (p: Pal): Record<string, string> => ({ combined: p.t1, terrain: p.acc, illum: p.warn });
const SCORE_NAME: Record<string, string> = { combined: 'Combined', terrain: 'Terrain', illum: 'Illumination' };
export function aucForest(p: Pal, rows: AucRow[], _moonN = 0): Rec {
  const scores = ['combined', 'terrain', 'illum'], col = SCORE_COL(p), cats = rows.map(r => r.label), shape = ['circle', 'rect', 'diamond'];
  const off = (si: number, api: any) => (si - 1) * api.size([0, 1])[1] * 0.24;
  const whisk = (si: number) => ({ type: 'custom', name: SCORE_NAME[scores[si]], silent: true, z: 2, itemStyle: { color: col[scores[si]] }, encode: { x: [1, 2], y: 0 },
    data: rows.map((r, i) => [i, ...r.ci[scores[si]]]),
    renderItem: (_: unknown, api: any) => { const y = api.value(0), a = api.coord([api.value(1), y]), b = api.coord([api.value(2), y]), dy = off(si, api), st = { stroke: col[scores[si]], lineWidth: 1.6, opacity: 0.8 };
      return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1] + dy, x2: b[0], y2: b[1] + dy }, style: st }, { type: 'line', shape: { x1: a[0], y1: a[1] + dy - 4, x2: a[0], y2: a[1] + dy + 4 }, style: st }, { type: 'line', shape: { x1: b[0], y1: b[1] + dy - 4, x2: b[0], y2: b[1] + dy + 4 }, style: st }] }; } });
  const dot = (si: number) => ({ type: 'custom', name: SCORE_NAME[scores[si]], z: 3, itemStyle: { color: col[scores[si]] }, encode: { x: 1, y: 0 }, data: rows.map((r, i) => [i, r.auc[scores[si]], ...r.ci[scores[si]]]),
    renderItem: (_: unknown, api: any) => { const c = api.coord([api.value(1), api.value(0)]), y = c[1] + off(si, api), r = 5.5, f = { fill: col[scores[si]], stroke: p.panel, lineWidth: 1 };
      return shape[si] === 'rect' ? { type: 'rect', shape: { x: c[0] - r, y: y - r, width: 2 * r, height: 2 * r }, style: f } : shape[si] === 'diamond' ? { type: 'polygon', shape: { points: [[c[0], y - r - 2], [c[0] + r + 2, y], [c[0], y + r + 2], [c[0] - r - 2, y]] }, style: f } : { type: 'circle', shape: { cx: c[0], cy: y, r }, style: f }; } });
  return { ...anim, legend: legendBase(p, scores.map(s => SCORE_NAME[s])), grid: { left: 8, right: 20, top: 44, bottom: 44, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1, ...axisName(p, 'AUC · 0.5 = no separation'), axisLabel: { formatter: (v: number) => v.toFixed(1) } },
    yAxis: { type: 'category', data: cats, inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: p.t1 } },
    tooltip: { trigger: 'item', formatter: (q: { seriesName: string; value: number[] }) => `${cats[q.value[0]]} · ${q.seriesName}<br>AUC ${q.value[1].toFixed(2)} [${q.value[2].toFixed(2)}–${q.value[3].toFixed(2)}]` },
    series: [...scores.map((_, i) => whisk(i)), ...scores.map((_, i) => dot(i)),
      { type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { color: p.t3, type: 'dashed', width: 1 }, label: { show: false }, data: [{ xAxis: 0.5 }] } }] };
}

/* ---------- 1D · control regions ---------- */
export interface DistRow { p50: number; p90: number; max: number }
export function controlRanges(p: Pal, cats: string[], groups: { name: string; get: (i: number) => DistRow }[]): Rec {
  const cols = [p.acc, p.warn, p.t1, p.t3], shapes = ['circle', 'rect', 'triangle', 'diamond'], n = groups.length;
  const off = (gi: number, api: any) => (gi - (n - 1) / 2) * api.size([0, 1])[1] * (0.78 / n);
  const series = groups.flatMap((g, gi) => [
    { type: 'custom', name: g.name, silent: true, z: 2, itemStyle: { color: cols[gi % 4] }, encode: { x: [1, 2], y: 0 }, data: cats.map((_, i) => [i, g.get(i).p50, g.get(i).p90]),
      renderItem: (_: unknown, api: any) => { const a = api.coord([api.value(1), api.value(0)]), b = api.coord([api.value(2), api.value(0)]), dy = off(gi, api);
        return { type: 'rect', shape: { x: a[0], y: a[1] + dy - 3, width: Math.max(2, b[0] - a[0]), height: 6 }, style: { fill: cols[gi % 4], opacity: 0.55 } }; } },
    { type: 'custom', name: g.name, z: 3, itemStyle: { color: cols[gi % 4] }, encode: { x: 1, y: 0 }, data: cats.map((_, i) => [i, g.get(i).max, g.get(i).p50, g.get(i).p90]),
      renderItem: (_: unknown, api: any) => { const c = api.coord([api.value(1), api.value(0)]), y = c[1] + off(gi, api), r = 5, f = { fill: cols[gi % 4], stroke: p.panel, lineWidth: 1 }, s = shapes[gi % 4];
        return s === 'rect' ? { type: 'rect', shape: { x: c[0] - r, y: y - r, width: 2 * r, height: 2 * r }, style: f } : s === 'triangle' ? { type: 'polygon', shape: { points: [[c[0], y - r - 1], [c[0] - r, y + r], [c[0] + r, y + r]] }, style: f }
          : s === 'diamond' ? { type: 'polygon', shape: { points: [[c[0], y - r - 2], [c[0] + r + 2, y], [c[0], y + r + 2], [c[0] - r - 2, y]] }, style: f } : { type: 'circle', shape: { cx: c[0], cy: y, r }, style: f }; } }]);
  return { ...anim, legend: legendBase(p, groups.map(g => g.name), { type: 'scroll' }), grid: { left: 8, right: 20, top: 48, bottom: 44, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 100, ...axisName(p, 'combined score · bar = P50 to P90, marker = highest window') },
    yAxis: { type: 'category', data: cats, inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: p.t1 } },
    tooltip: { trigger: 'item', formatter: (q: { seriesName: string; value: number[] }) => (q.value.length > 3 ? `${cats[q.value[0]]} · ${q.seriesName}<br>P50 ${q.value[2].toFixed(1)} · P90 ${q.value[3].toFixed(1)} · max ${q.value[1].toFixed(1)}` : '') },
    series };
}

/* ---------- 3A · bootstrap interval of the top windows ---------- */
export interface BootPt { score: number; lo: number; hi: number; tip: string }
export function bootstrapCI(p: Pal, pts: BootPt[]): Rec {
  return { ...anim, grid: { left: 8, right: 20, top: 24, bottom: 52, containLabel: true },
    xAxis: { type: 'category', data: pts.map((_, i) => `#${i + 1}`), ...axisName(p, 'window rank, equal weights'), axisTick: { show: false } },
    yAxis: { type: 'value', scale: true, name: 'score', nameTextStyle: { color: p.t3, fontSize: 13 } },
    tooltip: { trigger: 'item', formatter: (q: { dataIndex: number }) => pts[q.dataIndex].tip },
    series: [{ type: 'custom', silent: true, z: 2, encode: { x: 0, y: [1, 2] }, data: pts.map((q, i) => [i, q.lo, q.hi]),
      renderItem: (_: unknown, api: any) => { const a = api.coord([api.value(0), api.value(1)]), c = api.coord([api.value(0), api.value(2)]), st = { stroke: p.acc, lineWidth: 2, opacity: 0.8 };
        return { type: 'group', children: [{ type: 'line', shape: { x1: a[0], y1: a[1], x2: c[0], y2: c[1] }, style: st }, { type: 'line', shape: { x1: a[0] - 5, y1: a[1], x2: a[0] + 5, y2: a[1] }, style: st }, { type: 'line', shape: { x1: c[0] - 5, y1: c[1], x2: c[0] + 5, y2: c[1] }, style: st }] }; } },
      { type: 'scatter', symbol: SQ, symbolSize: 10, z: 3, data: pts.map((q, i) => ({ value: q.score, itemStyle: { color: i === 0 ? p.warn : p.t1, borderColor: p.panel, borderWidth: 1 } })) }] };
}

/* ---------- 3B · stability under random weights ---------- */
export function stabilityBars(p: Pal, cats: string[], p1: number[], p10: number[]): Rec {
  const lbl = { show: true, position: 'right', color: p.t1, fontSize: 13, formatter: (q: { value: number }) => pct(q.value) };
  return { ...anim, legend: legendBase(p, ['stays #1', 'stays in the top 10']), grid: { left: 8, right: 64, top: 40, bottom: 36, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => pct(v) } },
    yAxis: { type: 'category', data: cats, inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: p.t1 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => pct(v) },
    series: [{ name: 'stays #1', type: 'bar', data: p1, barWidth: 11, itemStyle: { color: p.warn }, label: lbl }, { name: 'stays in the top 10', type: 'bar', data: p10, barWidth: 11, itemStyle: { color: p.acc, opacity: 0.8 }, label: lbl }] };
}

/* ---------- 3D · tornado and decomposition ---------- */
export interface TorPt { label: string; low: number; high: number }
export function tornado(p: Pal, rows: TorPt[]): Rec {
  const lbl = (pos: string) => ({ show: true, position: pos, color: p.t1, fontSize: 13, formatter: (q: { value: number }) => sgn(q.value) });
  return { ...anim, legend: legendBase(p, ['−1 IQR', '+1 IQR']), grid: { left: 8, right: 48, top: 40, bottom: 44, containLabel: true },
    xAxis: { type: 'value', ...axisName(p, 'change of the score (points)') },
    yAxis: { type: 'category', data: rows.map(r => r.label), inverse: true, axisTick: { show: false }, axisLine: { onZero: true }, axisLabel: { fontSize: 14, color: p.t1 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => sgn(v) },
    series: [{ name: '−1 IQR', type: 'bar', data: rows.map(r => r.low), barWidth: 12, itemStyle: { color: p.t3 }, label: lbl('left') }, { name: '+1 IQR', type: 'bar', data: rows.map(r => r.high), barWidth: 12, itemStyle: { color: p.acc }, label: lbl('right') }] };
}
const TERRAIN = new Set(['relief', 'slope_med', 'slope_p90', 'rough', 'hypso']);
export function decompStack(p: Pal, ids: string[], feats: { key: string; label: string; vals: number[] }[]): Rec {
  let ti = 0, ii = 0;
  const series = feats.map(f => { const terr = TERRAIN.has(f.key), k = terr ? ti++ : ii++, op = terr ? [1, 0.82, 0.66, 0.5, 0.36][k % 5] : [1, 0.6][k % 2];
    return { name: f.label, type: 'bar', stack: 'd2', data: f.vals, barWidth: 22, itemStyle: { color: terr ? p.acc : p.warn, opacity: op, borderColor: p.panel, borderWidth: 1 } }; });
  return { ...anim, legend: legendBase(p, feats.map(f => f.label), { type: 'scroll' }), grid: { left: 8, right: 20, top: 52, bottom: 52, containLabel: true },
    xAxis: { type: 'category', data: ids.map((_, i) => `#${i + 1}`), ...axisName(p, 'window rank, equal weights'), axisTick: { show: false } },
    yAxis: { type: 'value', max: 1, axisLabel: { formatter: (v: number) => pct(v) } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => pct(v) }, series };
}

/* ---------- ROC curves ---------- */
export function rocCurves(p: Pal, curves: { name: string; mars: boolean; auc: number; pts: number[][] }[]): Rec {
  return { ...anim, grid: { left: 8, right: 24, top: 24, bottom: 48, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1, ...axisName(p, 'false-positive rate'), axisLabel: { formatter: (v: number) => v.toFixed(1) } },
    yAxis: { type: 'value', min: 0, max: 1, name: 'true-positive rate', nameTextStyle: { color: p.t3, fontSize: 13 }, axisLabel: { formatter: (v: number) => v.toFixed(1) } },
    tooltip: { trigger: 'item', formatter: (q: { seriesName: string }) => { const c = curves.find(x => x.name === q.seriesName); return c ? `${c.name}: AUC ${c.auc.toFixed(2)}` : ''; } },
    series: [...curves.map((c, i) => ({ name: c.name, type: 'line', symbol: 'none', smooth: false, z: 2 + i, data: c.pts, lineStyle: { color: c.mars ? p.t2 : p.acc, type: c.mars ? 'dashed' : 'solid', width: 1.6, opacity: 0.6 },
      emphasis: { focus: 'series', lineStyle: { width: 3, opacity: 1, color: p.warn } }, endLabel: { show: false } })),
      { name: 'no separation', type: 'line', symbol: 'none', silent: true, data: [[0, 0], [1, 1]], lineStyle: { color: p.t3, type: 'dotted', width: 1 } }] };
}
