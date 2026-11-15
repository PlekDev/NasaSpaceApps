// AI-assisted (Claude Code); reviewed by the author.
// A throwaway chart rendered server-side (SVG, no DOM) proves chart.ts: modular ECharts, theme from token values, required summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSVG, buildTheme, FALLBACK, mountChart } from '../src/lib/chart.ts';

const option = { xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [3, 5, 2] }] };

test('renderSVG draws a throwaway bar chart with the dark theme colours', () => {
  const svg = renderSVG(option, { width: 400, height: 240 });
  assert.match(svg, /^<svg/); assert.ok(svg.includes('width="400"') && svg.includes('height="240"'));
  assert.ok(svg.toLowerCase().includes(FALLBACK['--series-1'].toLowerCase()), 'bar uses --series-1');
  assert.ok(svg.toLowerCase().includes(FALLBACK['--text-3'].toLowerCase()), 'axis labels use --text-3');
});

test('the theme follows the CSS variables: light values give a different chart', () => {
  const light = { ...FALLBACK, '--series-1': '#1a62c4', '--text-3': '#566070' };
  const a = renderSVG(option, { width: 300, height: 200 }), b = renderSVG(option, { width: 300, height: 200, vars: light });
  assert.notEqual(a, b); assert.ok(b.toLowerCase().includes('#1a62c4'));
  assert.equal(buildTheme(light).color[0], '#1a62c4'); assert.equal(buildTheme(light).color.length, 7);
});

test('mountChart refuses to draw without a plain-text summary', () => {
  for (const bad of [undefined, '', '   ']) assert.throws(() => mountChart({}, option, { summary: bad }), /summary/);
});

test('ECharts is modular: chart.ts pulls echarts/core, not the full bundle', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/lib/chart.ts', import.meta.url), 'utf8');
  assert.match(src, /from 'echarts\/core'/); assert.doesNotMatch(src, /from 'echarts'/);
});
