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
    targetVal: string;
    earthVal: string;
    deltaVal: string;
  }> = [
    {
      metric: 'Least-cost traverse length',
      targetVal: `${input.targetTel.length_km.toFixed(2)} km`,
      earthVal: `${input.earthTel.length_km.toFixed(2)} km`,
      deltaVal: `${(input.earthTel.length_km - input.targetTel.length_km >= 0 ? '+' : '') + (input.earthTel.length_km - input.targetTel.length_km).toFixed(2)} km (${input.targetTel.waypoints} vs ${input.earthTel.waypoints} steps)`,
    },
    {
      metric: 'Cumulative climb / descent',
      targetVal: `+${Math.round(input.targetTel.climb_m)} / -${Math.round(input.targetTel.descent_m)} m`,
      earthVal: `+${Math.round(input.earthTel.climb_m)} / -${Math.round(input.earthTel.descent_m)} m`,
      deltaVal: `Δclimb ${(input.earthTel.climb_m - input.targetTel.climb_m >= 0 ? '+' : '') + Math.round(input.earthTel.climb_m - input.targetTel.climb_m)} m (1× relief)`,
    },
    {
      metric: 'Mean / Max route slope',
      targetVal: `${input.targetTel.mean_slope_deg.toFixed(1)}° / ${input.targetTel.max_slope_deg.toFixed(1)}°`,
      earthVal: `${input.earthTel.mean_slope_deg.toFixed(1)}° / ${input.earthTel.max_slope_deg.toFixed(1)}°`,
      deltaVal: `A* wall at ${SLOPE_MAX_DEG}° grade`,
    },
    {
      metric: 'Window impassable area (> 20°)',
      targetVal: `${(input.targetTel.share_window_impassable * 100).toFixed(1)} %`,
      earthVal: `${(input.earthTel.share_window_impassable * 100).toFixed(1)} %`,
      deltaVal: `${((input.earthTel.share_window_impassable - input.targetTel.share_window_impassable) * 100 >= 0 ? '+' : '') + ((input.earthTel.share_window_impassable - input.targetTel.share_window_impassable) * 100).toFixed(1)} pp across 6×6 km`,
    },
    {
      metric: 'Traverse lit share (current Sun)',
      targetVal: `${(input.targetTel.litShareNow * 100).toFixed(1)} %`,
      earthVal: `${(input.earthTel.litShareNow * 100).toFixed(1)} %`,
      deltaVal: `${instantFidelityPct}% match · window shadow ${tWinShadowPct}% / ${eWinShadowPct}%`,
    },
    {
      metric: 'Rover solar collector yield',
      targetVal: `${(input.targetTel.solarEnergyRel * 100).toFixed(0)} %`,
      earthVal: `${(input.earthTel.solarEnergyRel * 100).toFixed(0)} %`,
      deltaVal: `${((input.earthTel.solarEnergyRel - input.targetTel.solarEnergyRel) * 100 >= 0 ? '+' : '') + ((input.earthTel.solarEnergyRel - input.targetTel.solarEnergyRel) * 100).toFixed(0)} pp vs flat unshadowed`,
    },
    {
      metric: 'Estimated drive duration',
      targetVal: `${input.targetTel.driveHours.toFixed(2)} h`,
      earthVal: `${input.earthTel.driveHours.toFixed(2)} h`,
      deltaVal: `${(input.earthTel.driveHours - input.targetTel.driveHours >= 0 ? '+' : '') + (input.earthTel.driveHours - input.targetTel.driveHours).toFixed(2)} h at 0.50 m/s`,
    },
  ];

  const statCards = h(
    'div',
    { class: 'mission-stat-cards' },
    h(
      'div',
      { class: 'panel mission-stat-card' },
      h('span', { class: 'label' }, 'Traverse length'),
      h('b', { class: 'tnum mission-stat-val' }, `${input.targetTel.length_km.toFixed(2)} km`),
      h('span', { class: 'mission-stat-sub tnum' }, `Earth twin ${input.earthTel.length_km.toFixed(2)} km`),
    ),
    h(
      'div',
      { class: 'panel mission-stat-card' },
      h('span', { class: 'label' }, 'Climb / descent'),
      h(
        'b',
        { class: 'tnum mission-stat-val' },
        `+${Math.round(input.targetTel.climb_m)} / -${Math.round(input.targetTel.descent_m)} m`,
      ),
      h(
        'span',
        { class: 'mission-stat-sub tnum' },
        `Earth +${Math.round(input.earthTel.climb_m)} / -${Math.round(input.earthTel.descent_m)} m`,
      ),
    ),
    h(
      'div',
      { class: 'panel mission-stat-card' },
      h('span', { class: 'label' }, 'Mean / max slope'),
      h(
        'b',
        { class: 'tnum mission-stat-val' },
        `${input.targetTel.mean_slope_deg.toFixed(1)}° / ${input.targetTel.max_slope_deg.toFixed(1)}°`,
      ),
      h(
        'span',
        { class: 'mission-stat-sub tnum' },
        `Earth ${input.earthTel.mean_slope_deg.toFixed(1)}° / ${input.earthTel.max_slope_deg.toFixed(1)}° (${SLOPE_MAX_DEG}° wall)`,
      ),
    ),
    h(
      'div',
      { class: 'panel mission-stat-card' },
      h('span', { class: 'label' }, 'Instant light match'),
      h('b', { class: 'tnum mission-stat-val' }, `${instantFidelityPct}%`),
      h(
        'span',
        { class: 'mission-stat-sub tnum' },
        `${agreeCount}/${tLitProf.length} waypoints · rover ${Math.round(input.roverProgress * 100)}%`,
      ),
    ),
  );

  const profileChart = buildProfileChart(input, tLitProf, eLitProf);

  const section = h(
    'section',
    { class: 'vsec mission-sec', 'aria-label': 'Traverse and telemetry' },
    h(
      'div',
      { class: 'mission-sec-head' },
      h('h2', null, 'Traverse and telemetry'),
      h(
        'p',
        { class: 'mission-sec-lede' },
        'Side-by-side A* route mechanics (30 m grid, > 20° slope wall) and 101-sample elevation and shadow profile.',
      ),
    ),

    statCards,

    profileChart,

    h(
      'div',
      {
        class: 'tbl mission-table-wrap',
        tabIndex: 0,
        role: 'region',
        'aria-label': 'Side-by-side traverse telemetry comparison',
      },
      h(
        'table',
        { class: 'mission-telemetry-table' },
        h(
          'caption',
          null,
          `Route comparison between ${input.targetLabel} (${input.targetBody}) and ${input.earthLabel} along planned 30 m grid traverses`,
        ),
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, 'Metric'),
            h('th', { scope: 'col' }, `Target · ${input.targetLabel}`),
            h('th', { scope: 'col' }, `Earth · ${input.earthLabel}`),
            h('th', { scope: 'col' }, 'Delta / basis'),
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
              h('td', { class: 'tnum mission-val-target' }, r.targetVal),
              h('td', { class: 'tnum mission-val-earth' }, r.earthVal),
              h('td', { class: 'tnum mission-val-delta' }, r.deltaVal),
            ),
          ),
        ),
      ),
    ),
  );

  container.replaceChildren(section);
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
  const H = 188;
  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xOf = (i: number) => padL + (i / (samples - 1)) * plotW;
  const yOf = (v: number) => padT + (1 - (v - minRel) / span) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'mission-profile-svg',
    role: 'img',
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
      stroke: 'var(--line-strong)',
      'stroke-dasharray': '4 4',
    }),
  );

  // Y axis labels
  const topLabel = svgEl('text', {
    x: padL - 8,
    y: padT + 9,
    'text-anchor': 'end',
    fill: 'var(--text-2)',
    'font-size': 11,
    'font-family': 'var(--font-ui)',
  });
  topLabel.textContent = `${maxRel >= 0 ? '+' : ''}${Math.round(maxRel)} m`;
  svg.appendChild(topLabel);

  const botLabel = svgEl('text', {
    x: padL - 8,
    y: padT + plotH,
    'text-anchor': 'end',
    fill: 'var(--text-2)',
    'font-size': 11,
    'font-family': 'var(--font-ui)',
  });
  botLabel.textContent = `${minRel >= 0 ? '+' : ''}${Math.round(minRel)} m`;
  svg.appendChild(botLabel);

  // Elevation polylines (Okabe-Ito series tokens)
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
      stroke: 'var(--series-2)',
      'stroke-width': 2.25,
    }),
  );
  svg.appendChild(
    svgEl('path', {
      d: makePath(eRel),
      fill: 'none',
      stroke: 'var(--series-1)',
      'stroke-width': 2.25,
      'stroke-dasharray': '6 3',
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
    fill: 'var(--text-2)',
    'font-size': 10.5,
    'font-family': 'var(--font-ui)',
  });
  lblT.textContent = 'Target';
  svg.appendChild(lblT);

  const lblE = svgEl('text', {
    x: padL - 8,
    y: stripY2 + 8,
    'text-anchor': 'end',
    fill: 'var(--text-2)',
    'font-size': 10.5,
    'font-family': 'var(--font-ui)',
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
        fill: tLitProf[i] ? 'var(--ramp-3)' : 'var(--ramp-0)',
      }),
    );
    svg.appendChild(
      svgEl('rect', {
        x: cx.toFixed(1),
        y: stripY2,
        width: cellW.toFixed(1),
        height: 9,
        fill: eLitProf[i] ? 'var(--ramp-3)' : 'var(--ramp-0)',
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
      stroke: 'var(--ok)',
      'stroke-width': 2,
    }),
  );
  svg.appendChild(
    svgEl('circle', {
      cx: rx,
      cy: yOf(tRel[Math.min(samples - 1, Math.round(input.roverProgress * (samples - 1)))]),
      r: 4.5,
      fill: 'var(--ok)',
    }),
  );

  // Click on SVG to scrub rover position
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
    { class: 'panel mission-profile-box' },
    h(
      'div',
      { class: 'mission-profile-legend' },
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-target-elev' }), 'Target Δelev (m)'),
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-earth-elev' }), 'Earth Δelev (m)'),
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-lit' }), 'Sunlit cell'),
      h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-shadow' }), 'Cast shadow'),
      h('span', { class: 'mission-legend-hint tnum' }, 'Click profile to move rover along traverse'),
    ),
    svg,
  );
}
