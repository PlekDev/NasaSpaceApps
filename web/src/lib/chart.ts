// AI-assisted (Claude Code); reviewed by the author.
/* ───────────────────────────────────────────────────────────────────────────────────────────────
   chart.ts: the one way to draw a chart in P.E.N. (Apache ECharts, modular, themed from tokens.css)

   Import it only from a view (the view chunk loads it lazily; ECharts never enters the first-load bundle).

     import { mountChart } from '../lib/chart';
     const h = mountChart(el, option, { summary: 'Histogram of 10,000 random draws; our result lies at the far right.' });
     h.update(newOption);          // merge (default) or  h.update(newOption, { replace: true, summary: '…' })
     h.dispose();                  // optional: the router disposes every chart when the route is left (lib/lifecycle.ts)

   API
     mountChart(el, option, { summary, renderer?, label? }) -> { update, resize, dispose, instance }
       summary   REQUIRED plain-text description of what the chart shows (its message and key numbers). It is rendered as
                 visually hidden text and linked with aria-describedby, so screen-reader users get the same conclusion.
       renderer  'canvas' (default) or 'svg'.   label  optional aria-label of the chart region.
     renderSVG(option, { width, height, vars? }) -> string     server-side SVG (no DOM): tests, print, dossier export
     buildTheme(vars) -> theme object (pure); readVars() reads the CSS variables of :root

   Behaviour
     • Theme is built from the CSS variables in tokens.css (--text-*, --line*, --panel-solid, --series-1..7, --ramp-0..3, --font-ui)
       and rebuilt live when html[data-theme] flips between dark and light.
     • A ResizeObserver keeps the chart fitted; resize and theme changes are coalesced with requestAnimationFrame.
     • prefers-reduced-motion: animation is off.
     • Colour is never the only channel: pass dashed lines / symbols / labels in your option when series must be told apart.
   Registered chart types: line, bar, scatter, heatmap, custom, boxplot.  Components: grid, tooltip, legend, title, dataset, transform,
   dataZoom, visualMap, markLine, markArea, markPoint.  Need another one? add it to the two `use()` lists below (this file is Paul's).
   ─────────────────────────────────────────────────────────────────────────────────────────────── */
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, HeatmapChart, CustomChart, BoxplotChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, TransformComponent, DataZoomComponent,
  VisualMapComponent, MarkLineComponent, MarkAreaComponent, MarkPointComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { onCleanup } from './lifecycle.ts';

echarts.use([LineChart, BarChart, ScatterChart, HeatmapChart, CustomChart, BoxplotChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, TransformComponent, DataZoomComponent,
  VisualMapComponent, MarkLineComponent, MarkAreaComponent, MarkPointComponent, CanvasRenderer, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;
export type ChartInstance = echarts.ECharts;
export type Vars = Record<string, string>;

const NAMES = ['--text-1', '--text-2', '--text-3', '--line', '--line-strong', '--panel-solid', '--accent', '--warn', '--ok', '--font-ui',
  '--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--ramp-0', '--ramp-1', '--ramp-2', '--ramp-3'];
export const FALLBACK: Vars = {   // dark theme values, used only when the CSS variables cannot be read (SSR, tests)
  '--text-1': '#eceff4', '--text-2': '#a9b1bf', '--text-3': '#8a93a2', '--line': 'rgba(255,255,255,0.09)', '--line-strong': 'rgba(255,255,255,0.18)',
  '--panel-solid': '#0f1520', '--accent': '#3987e5', '--warn': '#d9a548', '--ok': '#5db38b', '--font-ui': 'Inter, sans-serif',
  '--series-1': '#3987e5', '--series-2': '#e69f00', '--series-3': '#009e73', '--series-4': '#cc79a7', '--series-5': '#d55e00', '--series-6': '#56b4e9', '--series-7': '#f0e442',
  '--ramp-0': '#1c3d6e', '--ramp-1': '#2a78d6', '--ramp-2': '#6da7ec', '--ramp-3': '#ffd166',
};
export function readVars(): Vars {
  const cs = getComputedStyle(document.documentElement), out: Vars = {};
  for (const n of NAMES) out[n] = cs.getPropertyValue(n).trim() || FALLBACK[n];
  return out;
}

/** ECharts theme from token values. Pure. */
export function buildTheme(v: Vars = FALLBACK) {
  const g = (n: string) => v[n] ?? FALLBACK[n];
  const axis = { axisLine: { lineStyle: { color: g('--line-strong') } }, axisTick: { lineStyle: { color: g('--line-strong') } },
    axisLabel: { color: g('--text-3'), fontSize: 12 }, nameTextStyle: { color: g('--text-2'), fontSize: 12 }, splitLine: { lineStyle: { color: g('--line') } },
    splitArea: { show: false } };
  return {
    color: [1, 2, 3, 4, 5, 6, 7].map(i => g(`--series-${i}`)),
    backgroundColor: 'transparent',
    textStyle: { color: g('--text-2'), fontFamily: g('--font-ui'), fontSize: 12 },
    title: { textStyle: { color: g('--text-1'), fontWeight: 600, fontSize: 14 }, subtextStyle: { color: g('--text-3') } },
    legend: { textStyle: { color: g('--text-2') }, pageTextStyle: { color: g('--text-2') } },
    tooltip: { backgroundColor: g('--panel-solid'), borderColor: g('--line-strong'), borderWidth: 1, textStyle: { color: g('--text-1'), fontSize: 13 }, extraCssText: 'border-radius:10px;box-shadow:none;' },
    categoryAxis: axis, valueAxis: axis, logAxis: axis, timeAxis: axis,
    line: { symbolSize: 6, lineStyle: { width: 2.25 } }, bar: { itemStyle: { borderRadius: [3, 3, 0, 0] } },
    visualMap: { textStyle: { color: g('--text-3') } },
    dataZoom: { textStyle: { color: g('--text-3') }, borderColor: g('--line'), fillerColor: 'rgba(57,135,229,0.15)' },
    markLine: { lineStyle: { color: g('--text-2') }, label: { color: g('--text-2') } },
  };
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const withMotion = (o: ChartOption): ChartOption => ({ ...(o as object), animation: !reduced() && (o as { animation?: boolean }).animation !== false });

export interface MountOptions { summary: string; renderer?: 'canvas' | 'svg'; label?: string }
export interface ChartHandle { update(option: ChartOption, opts?: { replace?: boolean; summary?: string }): void; resize(): void; dispose(): void; readonly instance: ChartInstance | null }

let uid = 0;
export function mountChart(el: HTMLElement, option: ChartOption, { summary, renderer = 'canvas', label }: MountOptions): ChartHandle {
  if (!summary || !summary.trim()) throw new Error('mountChart: `summary` (a plain-text description of the chart) is required');
  const id = `chart-sum-${++uid}`;
  el.classList.add('chart-host'); el.textContent = '';
  const box = document.createElement('div'); box.className = 'chart-canvas'; box.setAttribute('role', 'img'); box.setAttribute('aria-describedby', id);
  if (label) box.setAttribute('aria-label', label);
  const sum = document.createElement('p'); sum.id = id; sum.className = 'sr-only'; sum.textContent = summary;
  el.append(box, sum);

  let opt = option, inst: ChartInstance | null = null, raf = 0, dead = false;
  const build = () => {
    inst?.dispose();
    inst = echarts.init(box, buildTheme(readVars()) as never, { renderer });
    inst.setOption(withMotion(opt), true);
  };
  const later = (f: () => void) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!dead) f(); }); };
  build();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => later(() => inst?.resize())) : null; ro?.observe(box);
  const mo = new MutationObserver(() => later(build)); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const handle: ChartHandle = {
    update(next, o = {}) { opt = o.replace ? next : { ...(opt as object), ...(next as object) }; if (o.summary) sum.textContent = o.summary; inst?.setOption(withMotion(opt), !!o.replace); },
    resize() { inst?.resize(); },
    dispose() { if (dead) return; dead = true; cancelAnimationFrame(raf); ro?.disconnect(); mo.disconnect(); inst?.dispose(); inst = null; el.classList.remove('chart-host'); el.textContent = ''; },
    get instance() { return inst; },
  };
  onCleanup(handle.dispose);
  return handle;
}

/** Server-side SVG string (no DOM): for tests, print/dossier export and static fallbacks. */
export function renderSVG(option: ChartOption, { width, height, vars = FALLBACK }: { width: number; height: number; vars?: Vars }): string {
  const c = echarts.init(null as never, buildTheme(vars) as never, { renderer: 'svg', ssr: true, width, height });
  c.setOption({ ...(option as object), animation: false } as ChartOption);
  const svg = c.renderToSVGString(); c.dispose(); return svg;
}
