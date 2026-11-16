// AI-assisted (Claude Code); reviewed by the author.
/**
 * Traverse telemetry: the planned route on the target and on its Earth twin, side by side.
 */
import { h } from './dom.ts';
import { SLOPE_MAX_DEG, type RouteTelemetry } from './sim.ts';

export interface TelemetryRenderInput {
  /** "Moon" or "Mars" */
  targetBody: string;
  targetTel: RouteTelemetry;
  earthTel: RouteTelemetry;
  /** grid spacing, m */
  dx: number;
}

const NBSP = ' ';

function fmtDrive(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm}${NBSP}min`;
  return `${hh}${NBSP}h ${mm}${NBSP}min`;
}

export function renderTelemetryPanel(container: HTMLElement, input: TelemetryRenderInput): void {
  const t = input.targetTel;
  const e = input.earthTel;
  const rows: Array<[string, string, string]> = [
    ['Length', `${t.length_km.toFixed(2)}${NBSP}km`, `${e.length_km.toFixed(2)}${NBSP}km`],
    [
      'Climb / descent',
      `+${Math.round(t.climb_m)} / −${Math.round(t.descent_m)}${NBSP}m`,
      `+${Math.round(e.climb_m)} / −${Math.round(e.descent_m)}${NBSP}m`,
    ],
    [
      'Mean / max slope',
      `${t.mean_slope_deg.toFixed(1)}° / ${t.max_slope_deg.toFixed(1)}°`,
      `${e.mean_slope_deg.toFixed(1)}° / ${e.max_slope_deg.toFixed(1)}°`,
    ],
    ['Route lit', `${Math.round(t.litShareNow * 100)}${NBSP}%`, `${Math.round(e.litShareNow * 100)}${NBSP}%`],
    ['Solar yield', `${Math.round(t.solarEnergyRel * 100)}${NBSP}%`, `${Math.round(e.solarEnergyRel * 100)}${NBSP}%`],
    ['Drive time', fmtDrive(t.driveHours), fmtDrive(e.driveHours)],
  ];

  const sec = h(
    'section',
    { class: 'mission-telemetry', 'aria-labelledby': 'mission-telemetry-title' },
    h(
      'div',
      { class: 'mission-sec-head' },
      h('h2', { class: 'mission-sec-title', id: 'mission-telemetry-title' }, 'Traverse telemetry'),
      h(
        'p',
        { class: 'mission-sec-lede' },
        `Least-cost route, ${input.dx}${NBSP}m grid, slopes over ${SLOPE_MAX_DEG}° are walls. Solar yield is the share of a flat, unshadowed panel.`,
      ),
    ),
    h(
      'table',
      { class: 'mission-tel' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Metric')),
          h('th', { scope: 'col' }, input.targetBody),
          h('th', { scope: 'col' }, 'Earth'),
        ),
      ),
      h(
        'tbody',
        null,
        ...rows.map(([k, a, b]) => h('tr', null, h('th', { scope: 'row' }, k), h('td', null, a), h('td', null, b))),
      ),
    ),
  );
  container.replaceChildren(sec);
}
