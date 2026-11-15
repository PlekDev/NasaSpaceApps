// AI-assisted (Claude Code); reviewed by the author.
/**
 * Side-by-side Traverse Telemetry & 101-Sample Illumination/Elevation Profile
 * for the Mission Rehearsal 3D view.
 */
import { h } from './dom.ts';
import {
  SLOPE_MAX_DEG,
  litProfile,
  routeElevationProfile,
  shadowFraction,
  type CostLayers,
  type Grid,
  type RouteTelemetry,
  type SunAngles,
} from './sim.ts';

export interface TelemetryRenderInput {
  targetLabel: string;
  targetBody: string;
  targetGrid: Grid;
  targetLayers: CostLayers;
  targetRoute: ReadonlyArray<readonly [number, number]>;
  targetTel: RouteTelemetry;
  targetSun: SunAngles;

  earthLabel: string;
  earthPlace: string;
  earthGrid: Grid;
  earthLayers: CostLayers;
  earthRoute: ReadonlyArray<readonly [number, number]>;
  earthTel: RouteTelemetry;
  earthSun: SunAngles;

  roverProgress: number;
  onScrubRover?: (progress: number) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function renderTelemetryPanel(
  container: HTMLElement,
  input: TelemetryRenderInput,
): void {
  const tWinShadowPct = (shadowFraction(input.targetLayers.shadow) * 100).toFixed(1);
  const eWinShadowPct = (shadowFraction(input.earthLayers.shadow) * 100).toFixed(1);

  const tLitProf = litProfile(input.targetLayers.shadow, input.targetGrid.cols, input.targetRoute, 101);
  const eLitProf = litProfile(input.earthLayers.shadow, input.earthGrid.cols, input.earthRoute, 101);
  let agreeCount = 0;
  for (let i = 0; i < tLitProf.length; i++) {
    if (tLitProf[i] === eLitProf[i]) agreeCount++;
  }
  const instantFidelityPct = ((agreeCount / Math.max(1, tLitProf.length)) * 100).toFixed(1);

  const rows: Array<{
    metric: string;
    unit: string;
    targetVal: string;
    earthVal: string;
    deltaVal: string;
    note: string;
  }> = [
    {
      metric: 'Least-cost traverse length',
      unit: 'km',
      targetVal: `${input.targetTel.length_km.toFixed(2)} km`,
      earthVal: `${input.earthTel.length_km.toFixed(2)} km`,
      deltaVal: `${(input.earthTel.length_km - input.targetTel.length_km >= 0 ? '+' : '') + (input.earthTel.length_km - input.targetTel.length_km).toFixed(2)} km`,
      note: `${input.targetTel.waypoints} vs ${input.earthTel.waypoints} grid steps (30 m cells)`,
    },
    {
      metric: 'Cumulative climb / descent',
      unit: 'm',
      targetVal: `+${Math.round(input.targetTel.climb_m)} / -${Math.round(input.targetTel.descent_m)} m`,
      earthVal: `+${Math.round(input.earthTel.climb_m)} / -${Math.round(input.earthTel.descent_m)} m`,
      deltaVal: `Δclimb ${(input.earthTel.climb_m - input.targetTel.climb_m >= 0 ? '+' : '') + Math.round(input.earthTel.climb_m - input.targetTel.climb_m)} m`,
      note: 'True unexaggerated vertical relief along route',
    },
    {
      metric: 'Mean / Max route slope',
      unit: 'deg',
      targetVal: `${input.targetTel.mean_slope_deg.toFixed(1)}° / ${input.targetTel.max_slope_deg.toFixed(1)}°`,
      earthVal: `${input.earthTel.mean_slope_deg.toFixed(1)}° / ${input.earthTel.max_slope_deg.toFixed(1)}°`,
      deltaVal: `Limit ${SLOPE_MAX_DEG}°`,
      note: 'A* planner treats slope > 20° as impassable wall',
    },
    {
      metric: 'Window impassable area (> 20°)',
      unit: '%',
      targetVal: `${(input.targetTel.share_window_impassable * 100).toFixed(1)} %`,
      earthVal: `${(input.earthTel.share_window_impassable * 100).toFixed(1)} %`,
      deltaVal: `${((input.earthTel.share_window_impassable - input.targetTel.share_window_impassable) * 100 >= 0 ? '+' : '') + ((input.earthTel.share_window_impassable - input.targetTel.share_window_impassable) * 100).toFixed(1)} pp`,
      note: 'Share of 6×6 km window exceeding 20° grade',
    },
    {
      metric: 'Traverse lit share (current Sun)',
      unit: '%',
      targetVal: `${(input.targetTel.litShareNow * 100).toFixed(1)} %`,
      earthVal: `${(input.earthTel.litShareNow * 100).toFixed(1)} %`,
      deltaVal: `${instantFidelityPct} % match`,
      note: `Window in shadow: ${tWinShadowPct}% (${input.targetBody}) vs ${eWinShadowPct}% (Earth)`,
    },
    {
      metric: 'Rover solar collector yield',
      unit: '%',
      targetVal: `${(input.targetTel.solarEnergyRel * 100).toFixed(0)} %`,
      earthVal: `${(input.earthTel.solarEnergyRel * 100).toFixed(0)} %`,
      deltaVal: `${((input.earthTel.solarEnergyRel - input.targetTel.solarEnergyRel) * 100 >= 0 ? '+' : '') + ((input.earthTel.solarEnergyRel - input.targetTel.solarEnergyRel) * 100).toFixed(0)} pp`,
      note: 'Relative to flat unshadowed collector at current Sun elevation',
    },
    {
      metric: 'Estimated drive duration',
      unit: 'h',
      targetVal: `${input.targetTel.driveHours.toFixed(2)} h`,
      earthVal: `${input.earthTel.driveHours.toFixed(2)} h`,
      deltaVal: `${(input.earthTel.driveHours - input.targetTel.driveHours >= 0 ? '+' : '') + (input.earthTel.driveHours - input.targetTel.driveHours).toFixed(2)} h`,
      note: 'Nominal 0.50 m/s scaled by local grade resistance',
    },
  ];

  const profileChart = buildProfileChart(input, tLitProf, eLitProf);

  const card = h(
    'section',
    { class: 'panel mission-telemetry-card', 'aria-label': 'Side-by-side traverse telemetry' },
    h(
      'div',
      { class: 'mission-section-head' },
      h(
        'div',
        null,
        h('div', { class: 'eyebrow' }, 'Side-by-side traverse telemetry'),
        h('h2', { class: 'h2' }, 'Route mechanics & illumination budget'),
      ),
      h(
        'div',
        { class: 'mission-telemetry-badges' },
        h(
          'span',
          { class: 'mission-pill mission-pill-gold' },
          `Instant light agreement: ${instantFidelityPct}%`,
        ),
        h(
          'span',
          { class: 'mission-pill' },
          `Rover at ${Math.round(input.roverProgress * 100)}% of traverse`,
        ),
      ),
    ),

    profileChart,

    h(
      'div',
      { class: 'mission-table-wrap' },
      h(
        'table',
        { class: 'mission-telemetry-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, 'Telemetry metric'),
            h('th', { scope: 'col', class: 'num' }, `Target · ${input.targetLabel}`),
            h('th', { scope: 'col', class: 'num' }, `Earth · ${input.earthLabel}`),
            h('th', { scope: 'col', class: 'num' }, 'Comparison'),
            h('th', { scope: 'col' }, 'Physical basis'),
          ),
        ),
        h(
          'tbody',
          null,
          ...rows.map((r) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, r.metric),
              h('td', { class: 'num mission-val-target' }, r.targetVal),
              h('td', { class: 'num mission-val-earth' }, r.earthVal),
              h('td', { class: 'num mission-val-delta' }, r.deltaVal),
              h('td', { class: 'mission-val-note' }, r.note),
            ),
          ),
        ),
      ),
    ),
  );

  container.replaceChildren(card);
}

function buildProfileChart(
  input: TelemetryRenderInput,
  tLitProf: Uint8Array,
  eLitProf: Uint8Array,
): HTMLElement {
  const samples = 101;
  const tElev = routeElevationProfile(input.targetGrid, input.targetRoute, samples);
  const eElev = routeElevationProfile(input.earthGrid, input.earthRoute, samples);

  // Relative elevation delta from start cell (m) so Moon/Mars and Earth curves share a clean vertical scale
  const tRel = new Float32Array(samples);
  const eRel = new Float32Array(samples);
  let minRel = -10;
  let maxRel = 10;
  for (let i = 0; i < samples; i++) {
    tRel[i] = tElev[i] - (tElev[0] ?? 0);
    eRel[i] = eElev[i] - (eElev[0] ?? 0);
    if (tRel[i] < minRel) minRel = tRel[i];
    if (tRel[i] > maxRel) maxRel = tRel[i];
    if (eRel[i] < minRel) minRel = eRel[i];
    if (eRel[i] > maxRel) maxRel = eRel[i];
  }
  const span = Math.max(20, maxRel - minRel);

  const W = 860;
  const H = 185;
  const padL = 54;
  const padR = 20;
  const padT = 18;
  const padB = 54;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (i: number) => padL + (i / (samples - 1)) * plotW;
  const yOf = (v: number) => padT + (1 - (v - minRel) / span) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'mission-profile-svg',
    'aria-label': '101-sample elevation and illumination profile along target and Earth routes',
  });

  // Zero delta reference line
  const yZero = yOf(0);
  svg.appendChild(
    svgEl('line', {
      x1: padL,
      y1: yZero,
      x2: W - padR,
      y2: yZero,
      stroke: 'rgba(255,255,255,0.14)',
      'stroke-dasharray': '4 4',
    }),
  );

  // Y axis labels
  const topLabel = svgEl('text', {
    x: padL - 8,
    y: padT + 8,
    'text-anchor': 'end',
    fill: '#9aa6bc',
    'font-size': 10,
    'font-family': 'JetBrains Mono, monospace',
  });
  topLabel.textContent = `${maxRel >= 0 ? '+' : ''}${Math.round(maxRel)} m`;
  svg.appendChild(topLabel);

  const botLabel = svgEl('text', {
    x: padL - 8,
    y: padT + plotH,
    'text-anchor': 'end',
    fill: '#9aa6bc',
    'font-size': 10,
    'font-family': 'JetBrains Mono, monospace',
  });
  botLabel.textContent = `${minRel >= 0 ? '+' : ''}${Math.round(minRel)} m`;
  svg.appendChild(botLabel);

  // Elevation polylines
  const makePath = (arr: Float32Array) => {
    let d = '';
    for (let i = 0; i < samples; i++) {
      d += `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(arr[i]).toFixed(1)} `;
    }
    return d.trim();
  };

  svg.appendChild(
    svgEl('path', {
      d: makePath(tRel),
      fill: 'none',
      stroke: '#ffd166',
      'stroke-width': 2.2,
    }),
  );
  svg.appendChild(
    svgEl('path', {
      d: makePath(eRel),
      fill: 'none',
      stroke: '#38bdf8',
      'stroke-width': 2.2,
      'stroke-dasharray': '5 3',
    }),
  );

  // Bottom 2 strips: 101-sample Lit/Shadow bar for Target and Earth
  const stripY1 = padT + plotH + 12;
  const stripY2 = stripY1 + 14;
  const cellW = plotW / samples + 0.4;

  const lblT = svgEl('text', {
    x: padL - 8,
    y: stripY1 + 8,
    'text-anchor': 'end',
    fill: '#9aa6bc',
    'font-size': 9.5,
    'font-family': 'JetBrains Mono, monospace',
  });
  lblT.textContent = 'Target';
  svg.appendChild(lblT);

  const lblE = svgEl('text', {
    x: padL - 8,
    y: stripY2 + 8,
    'text-anchor': 'end',
    fill: '#9aa6bc',
    'font-size': 9.5,
    'font-family': 'JetBrains Mono, monospace',
  });
  lblE.textContent = 'Earth';
  svg.appendChild(lblE);

  for (let i = 0; i < samples; i++) {
    const cx = padL + (i / samples) * plotW;
    svg.appendChild(
      svgEl('rect', {
        x: cx.toFixed(1),
        y: stripY1,
        width: cellW.toFixed(1),
        height: 9,
        fill: tLitProf[i] ? '#ffd166' : '#2b4c7e',
      }),
    );
    svg.appendChild(
      svgEl('rect', {
        x: cx.toFixed(1),
        y: stripY2,
        width: cellW.toFixed(1),
        height: 9,
        fill: eLitProf[i] ? '#ffd166' : '#2b4c7e',
      }),
    );
  }

  // Current Rover progress marker line
  const rx = padL + Math.max(0, Math.min(1, input.roverProgress)) * plotW;
  svg.appendChild(
    svgEl('line', {
      x1: rx,
      y1: padT,
      x2: rx,
      y2: stripY2 + 10,
      stroke: '#36d399',
      'stroke-width': 2,
    }),
  );
  svg.appendChild(
    svgEl('circle', {
      cx: rx,
      cy: yOf(tRel[Math.min(samples - 1, Math.round(input.roverProgress * (samples - 1)))]),
      r: 4.5,
      fill: '#36d399',
    }),
  );

  // Click / drag on SVG to scrub rover position
  if (input.onScrubRover) {
    const scrubFromEvent = (ev: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const svgX = ((ev.clientX - rect.left) / rect.width) * W;
      const t = Math.max(0, Math.min(1, (svgX - padL) / plotW));
      input.onScrubRover!(t);
    };
    svg.addEventListener('click', scrubFromEvent);
  }

  return h(
    'div',
    { class: 'mission-profile-box' },
    h(
      'div',
      { class: 'mission-profile-legend' },
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'swatch swatch-target-elev' }), `Target Δelev (m)`),
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'swatch swatch-earth-elev' }), `Earth Δelev (m)`),
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'swatch swatch-lit' }), 'Sunlit route cell'),
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'swatch swatch-shadow' }), 'Cast-shadow route cell'),
      h('span', { class: 'mission-legend-hint' }, 'Click profile to move rover along traverse'),
    ),
    svg,
  );
}
