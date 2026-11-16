// AI-assisted (Claude Code); reviewed by the author.
/**
 * Mission Rehearsal controls, grouped by the step they change:
 * - `routeBar`  (step 1): target, Earth analog, click tool (Orbit / Set A / Set B), swap A and B
 * - `viewerBar` (top of the 3D frame): camera mode, vertical scale
 * - `roverBar`  (bottom of the 3D frame): legend, slope mask, drive + scrub the rover
 * - `sunBlock`  (step 2): Sun elevation and azimuth, Earth view source, play the Sun, Sun-direction range
 *
 * All nodes are built once; `sync()` updates them in place so slider drags and focus are never interrupted.
 */
import { h } from './dom.ts';
import type { Manifest } from '../../types.ts';
import type { CameraMode, PointerTool } from './scene.ts';
import type { SimWindow } from './sim.ts';

export type EarthSunMode = 'rehearsal' | 'mirror';

export interface SunReach {
  /** Earth site name used in copy */
  site: string;
  /** "Moon" or "Mars" */
  body: string;
  /** grid azimuths (deg, 5 deg bin centres) the Earth Sun reaches in the elevation band within 12 months */
  reachAz: number[];
  elevBandDeg: [number, number];
  /** Earth Sun grid azimuth on the selected rehearsal date, if any */
  earthAzDeg: number | null;
}

export interface MissionControlsState {
  targetId: string;
  windowRank: number;
  windows: SimWindow[];
  exag: number;
  cameraMode: CameraMode;
  pointerTool: PointerTool;
  showSlopeMask: boolean;
  sunElevDeg: number;
  sunHourAngleDeg: number;
  sunGridAzDeg: number;
  earthSunMode: EarthSunMode;
  playingSun: boolean;
  drivingRover: boolean;
  roverProgress: number;
  reach: SunReach | null;
  webgl: boolean;
}

export interface MissionControlsCallbacks {
  onSelectTarget: (targetId: string) => void;
  onSelectWindow: (rank: number) => void;
  onChangeExag: (exag: number) => void;
  onChangeCameraMode: (mode: CameraMode) => void;
  onResetCamera: () => void;
  onChangePointerTool: (tool: PointerTool) => void;
  onToggleSlopeMask: (show: boolean) => void;
  onChangeSun: (elevDeg: number, hourAngleDeg: number) => void;
  onChangeEarthSunMode: (mode: EarthSunMode) => void;
  onTogglePlaySun: () => void;
  onToggleDriveRover: () => void;
  onScrubRover: (progress: number) => void;
  onSwapRoute: () => void;
}

const EXAG_MIN = 1;
const EXAG_MAX = 5;
const EXAG_STEP = 0.5;

function setRangeValue(input: HTMLInputElement, val: number, min: number, max: number): void {
  if (document.activeElement !== input) input.value = String(val);
  const pct = Math.max(0, Math.min(100, ((val - min) / Math.max(1e-9, max - min)) * 100));
  input.style.setProperty('--p', `${pct.toFixed(1)}%`);
}

function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** angular distance from `az` to the nearest reachable bin (5 deg bins, centres in `reach`) */
export function reachGapDeg(az: number, reach: number[]): number {
  if (!reach.length) return 180;
  let best = 180;
  for (const c of reach) {
    const lo = c - 2.5;
    const hi = c + 2.5;
    const a = norm360(az);
    if (a >= lo && a < hi) return 0;
    const d = Math.min(Math.abs(norm360(a - lo + 180) - 180), Math.abs(norm360(a - hi + 180) - 180));
    if (d < best) best = d;
  }
  return best;
}

/** contiguous runs of reachable 5 deg bins as [startDeg, endDeg) in 0..360 */
export function reachRuns(reach: number[]): Array<[number, number]> {
  const bins = new Set(reach.map((c) => Math.floor(c / 5)));
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let b = 0; b <= 72; b++) {
    const on = b < 72 && bins.has(b);
    if (on && start < 0) start = b;
    if (!on && start >= 0) {
      runs.push([start * 5, b * 5]);
      start = -1;
    }
  }
  return runs;
}

/** a 0-360 deg horizon strip: reachable runs, the lunar Sun mark and (optionally) the Earth Sun mark and the gap */
export function buildAzimuthStrip(
  reach: number[],
  moonAz: number,
  earthAz: number | null,
  opts: { gap?: boolean; label: string },
): HTMLElement {
  const pct = (a: number) => `${((norm360(a) / 360) * 100).toFixed(2)}%`;
  const bar = h('div', { class: 'mission-az', role: 'img', 'aria-label': opts.label });
  for (const [a, b] of reachRuns(reach)) {
    const seg = h('i', { class: 'mission-az-reach' });
    seg.style.left = pct(a);
    seg.style.width = `${(((b - a) / 360) * 100).toFixed(2)}%`;
    bar.appendChild(seg);
  }
  if (opts.gap && reach.length) {
    // dashed span from the lunar Sun to the nearest reachable edge
    const a = norm360(moonAz);
    let nearest = a;
    let bestD = 999;
    for (const [lo, hi] of reachRuns(reach)) {
      for (const edge of [lo, hi]) {
        const d = Math.abs(norm360(edge - a + 180) - 180);
        if (d < bestD) {
          bestD = d;
          nearest = edge;
        }
      }
    }
    const from = Math.min(a, nearest);
    const to = Math.max(a, nearest);
    if (to - from <= 180) {
      const gap = h('i', { class: 'mission-az-gap' });
      gap.style.left = pct(from);
      gap.style.width = `${(((to - from) / 360) * 100).toFixed(2)}%`;
      bar.appendChild(gap);
    }
  }
  if (earthAz !== null) {
    const e = h('i', { class: 'mission-az-mark mission-az-mark--earth' });
    e.style.left = pct(earthAz);
    bar.appendChild(e);
  }
  const mk = h('i', { class: 'mission-az-mark mission-az-mark--moon' });
  mk.style.left = pct(moonAz);
  bar.appendChild(mk);

  return h(
    'div',
    { class: 'mission-az-wrap' },
    bar,
    h(
      'div',
      { class: 'mission-az-ticks', 'aria-hidden': 'true' },
      h('span', null, 'N'),
      h('span', null, 'E'),
      h('span', null, 'S'),
      h('span', null, 'W'),
      h('span', null, 'N'),
    ),
  );
}

function segButton(label: string, onclick: () => void, title?: string): HTMLButtonElement {
  return h('button', { type: 'button', 'aria-pressed': 'false', title, onclick }, label) as HTMLButtonElement;
}

export class MissionControls {
  readonly routeBar: HTMLElement;
  readonly viewerBar: HTMLElement;
  readonly roverBar: HTMLElement;
  readonly sunBlock: HTMLElement;
  readonly windowSelect: HTMLSelectElement;

  private state: MissionControlsState;
  private targetsSig = '';
  private windowsSig = '';
  private reachSig = '';

  private targetSelect: HTMLSelectElement;
  private toolButtons = new Map<PointerTool, HTMLButtonElement>();
  private camButtons = new Map<CameraMode, HTMLButtonElement>();
  private exagVal: HTMLElement;
  private exagLess: HTMLButtonElement;
  private exagMore: HTMLButtonElement;
  private slopeCheckbox: HTMLInputElement;
  private driveBtn: HTMLButtonElement;
  private roverSlider: HTMLInputElement;
  private roverVal: HTMLElement;
  private elevSlider: HTMLInputElement;
  private elevVal: HTMLElement;
  private haSlider: HTMLInputElement;
  private azVal: HTMLElement;
  private reachNote: HTMLElement;
  private earthSunButtons = new Map<EarthSunMode, HTMLButtonElement>();
  private playSunBtn: HTMLButtonElement;
  private rangeSlot: HTMLElement;
  private rangeCaption: HTMLElement;

  constructor(
    private manifest: Manifest,
    initial: MissionControlsState,
    private cb: MissionControlsCallbacks,
  ) {
    this.state = initial;

    // ── Step 1 · route bar ──────────────────────────────────────────────
    this.targetSelect = h('select', {
      id: 'mission-target-select',
      class: 'mission-select',
      onchange: () => this.cb.onSelectTarget(this.targetSelect.value),
    }) as HTMLSelectElement;
    this.windowSelect = h('select', {
      id: 'mission-window-select',
      class: 'mission-select',
      onchange: () => this.cb.onSelectWindow(Number(this.windowSelect.value)),
    }) as HTMLSelectElement;

    const tools: Array<{ id: PointerTool; label: string; title: string }> = [
      { id: 'orbit', label: 'Orbit', title: 'Drag to orbit, wheel to zoom' },
      { id: 'start', label: 'Set A', title: 'Click a view to place the start' },
      { id: 'end', label: 'Set B', title: 'Click a view to place the end' },
    ];
    const toolSeg = h(
      'div',
      { class: 'mission-seg', role: 'group', 'aria-label': 'Click a view to' },
      ...tools.map((t) => {
        const b = segButton(t.label, () => this.cb.onChangePointerTool(t.id), t.title);
        this.toolButtons.set(t.id, b);
        return b;
      }),
      h(
        'button',
        { type: 'button', title: 'Swap start and end', 'aria-label': 'Swap A and B', onclick: () => this.cb.onSwapRoute() },
        'A ⇄ B',
      ),
    );

    this.routeBar = h(
      'div',
      { class: 'mission-route-bar' },
      h(
        'label',
        { class: 'mission-field mission-field--target', for: 'mission-target-select' },
        h('span', { class: 'mission-cap' }, 'Target'),
        this.targetSelect,
      ),
      h(
        'label',
        { class: 'mission-field mission-field--analog', for: 'mission-window-select' },
        h('span', { class: 'mission-cap' }, 'Earth analog'),
        this.windowSelect,
      ),
      toolSeg,
    );

    // ── 3D frame · toolbar ──────────────────────────────────────────────
    const cams: Array<{ id: CameraMode; label: string; title: string }> = [
      { id: 'orbital', label: 'Orbital 3D', title: 'Synchronized orbit camera' },
      { id: 'astronaut', label: 'Astronaut 1.7 m', title: 'Eye height 1.7 m above the surface' },
      { id: 'rover', label: 'Rover', title: 'Chase camera behind the rover' },
      { id: 'topdown', label: '2D map', title: 'Top-down hillshade and cast shadows' },
    ];
    const camSeg = h(
      'div',
      { class: 'mission-seg', role: 'group', 'aria-label': 'Camera' },
      ...cams.map((c) => {
        const b = segButton(c.label, () => this.cb.onChangeCameraMode(c.id), c.title);
        this.camButtons.set(c.id, b);
        return b;
      }),
    );

    this.exagVal = h('output', { class: 'mission-stepper-val', 'aria-live': 'polite' }, '');
    this.exagLess = h(
      'button',
      {
        type: 'button',
        'aria-label': 'Less vertical exaggeration',
        onclick: () => this.cb.onChangeExag(Math.max(EXAG_MIN, this.state.exag - EXAG_STEP)),
      },
      '−',
    ) as HTMLButtonElement;
    this.exagMore = h(
      'button',
      {
        type: 'button',
        'aria-label': 'More vertical exaggeration',
        onclick: () => this.cb.onChangeExag(Math.min(EXAG_MAX, this.state.exag + EXAG_STEP)),
      },
      '+',
    ) as HTMLButtonElement;

    this.viewerBar = h(
      'div',
      { class: 'mission-viewer-bar' },
      camSeg,
      h(
        'div',
        { class: 'mission-viewer-bar-end' },
        h('span', { class: 'mission-cap', id: 'mission-exag-cap' }, 'Vert. scale'),
        h(
          'div',
          { class: 'mission-stepper', role: 'group', 'aria-labelledby': 'mission-exag-cap' },
          this.exagLess,
          this.exagVal,
          this.exagMore,
        ),
        h(
          'button',
          { type: 'button', class: 'mission-btn mission-btn--quiet', onclick: () => this.cb.onResetCamera() },
          'Reset view',
        ),
      ),
    );

    // ── 3D frame · legend + rover ───────────────────────────────────────
    this.slopeCheckbox = h('input', {
      id: 'mission-slope-mask',
      type: 'checkbox',
      onchange: () => this.cb.onToggleSlopeMask(this.slopeCheckbox.checked),
    }) as HTMLInputElement;

    this.driveBtn = h(
      'button',
      { type: 'button', class: 'mission-btn', 'aria-pressed': 'false', onclick: () => this.cb.onToggleDriveRover() },
      'Drive',
    ) as HTMLButtonElement;
    this.roverVal = h('output', { class: 'mission-rover-val', for: 'mission-rover-scrub' }, '');
    this.roverSlider = h('input', {
      id: 'mission-rover-scrub',
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      'aria-label': 'Rover position along the route',
      oninput: () => {
        const v = Number(this.roverSlider.value);
        setRangeValue(this.roverSlider, v, 0, 100);
        this.roverVal.textContent = `${Math.round(v)} %`;
        this.cb.onScrubRover(v / 100);
      },
    }) as HTMLInputElement;

    this.roverBar = h(
      'div',
      { class: 'mission-viewer-foot' },
      h(
        'ul',
        { class: 'mission-legend', 'aria-label': 'Legend' },
        h('li', null, h('i', { class: 'mission-key mission-key--lit' }), 'Lit'),
        h('li', null, h('i', { class: 'mission-key mission-key--shadow' }), 'Shadow'),
        h(
          'li',
          null,
          h(
            'label',
            { class: 'mission-wall-toggle', for: 'mission-slope-mask' },
            this.slopeCheckbox,
            h('i', { class: 'mission-key mission-key--wall' }),
            'Slope > 20°',
          ),
        ),
        h('li', null, h('i', { class: 'mission-key mission-key--route' }), 'Route'),
        h(
          'li',
          null,
          h('i', { class: 'mission-pin' }, 'A'),
          h('i', { class: 'mission-pin' }, 'B'),
          'Start, end',
        ),
      ),
      h('div', { class: 'mission-rover' }, this.driveBtn, this.roverSlider, this.roverVal),
    );

    // ── Step 2 · Sun ────────────────────────────────────────────────────
    this.elevVal = h('output', { class: 'mission-readout', for: 'mission-sun-elev' }, '');
    this.elevSlider = h('input', {
      id: 'mission-sun-elev',
      type: 'range',
      min: '0.5',
      max: '20',
      step: '0.5',
      oninput: () => {
        const v = Number(this.elevSlider.value);
        setRangeValue(this.elevSlider, v, 0.5, 20);
        this.elevVal.textContent = `${v.toFixed(1)}°`;
        this.cb.onChangeSun(v, this.state.sunHourAngleDeg);
      },
    }) as HTMLInputElement;

    this.azVal = h('output', { class: 'mission-readout', for: 'mission-sun-ha' }, '');
    this.reachNote = h('span', { class: 'mission-reach-note' }, '');
    this.haSlider = h('input', {
      id: 'mission-sun-ha',
      type: 'range',
      min: '-180',
      max: '180',
      step: '5',
      oninput: () => {
        const v = Number(this.haSlider.value);
        setRangeValue(this.haSlider, v, -180, 180);
        this.cb.onChangeSun(this.state.sunElevDeg, v);
      },
    }) as HTMLInputElement;

    const earthSunSeg = h(
      'div',
      { class: 'mission-seg mission-seg--sm', role: 'group', 'aria-label': 'Earth view Sun' },
      ...(
        [
          { id: 'rehearsal', label: 'Rehearsal date' },
          { id: 'mirror', label: 'Mirror target Sun' },
        ] as Array<{ id: EarthSunMode; label: string }>
      ).map((o) => {
        const b = segButton(o.label, () => this.cb.onChangeEarthSunMode(o.id));
        this.earthSunButtons.set(o.id, b);
        return b;
      }),
    );

    this.playSunBtn = h(
      'button',
      { type: 'button', class: 'mission-btn', 'aria-pressed': 'false', onclick: () => this.cb.onTogglePlaySun() },
      'Play Sun',
    ) as HTMLButtonElement;

    this.rangeSlot = h('div', { class: 'mission-range-slot' });
    this.rangeCaption = h('p', { class: 'mission-range-caption' }, '');

    this.sunBlock = h(
      'div',
      { class: 'mission-sun' },
      h(
        'div',
        { class: 'mission-sun-sliders' },
        h(
          'div',
          { class: 'mission-slider mission-slider--elev' },
          h(
            'div',
            { class: 'mission-slider-head' },
            h('label', { class: 'mission-cap', for: 'mission-sun-elev' }, 'Elevation'),
            this.elevVal,
          ),
          this.elevSlider,
          h('div', { class: 'mission-slider-ends', 'aria-hidden': 'true' }, h('span', null, '0.5°'), h('span', null, '20°')),
        ),
        h(
          'div',
          { class: 'mission-slider mission-slider--az' },
          h(
            'div',
            { class: 'mission-slider-head' },
            h('label', { class: 'mission-cap', for: 'mission-sun-ha' }, 'Azimuth'),
            h('span', { class: 'mission-slider-head-end' }, this.reachNote, this.azVal),
          ),
          this.haSlider,
          h(
            'div',
            { class: 'mission-slider-ends', 'aria-hidden': 'true' },
            h('span', null, 'Earlier'),
            h('span', null, 'Later'),
          ),
        ),
        this.playSunBtn,
      ),
      h(
        'div',
        { class: 'mission-range' },
        h(
          'div',
          { class: 'mission-range-head' },
          h('span', { class: 'mission-cap' }, 'Sun-direction range'),
          h('span', { class: 'mission-range-earth' }, h('span', { class: 'mission-cap' }, 'Earth view'), earthSunSeg),
        ),
        this.rangeSlot,
        this.rangeCaption,
      ),
    );

    this.sync(initial);
  }

  sync(state: MissionControlsState): void {
    this.state = state;
    const m = this.manifest;

    const tSig = m.targets.map((t) => t.id).join('|');
    if (this.targetsSig !== tSig) {
      const moon = m.targets.filter((t) => t.body === 'moon');
      const mars = m.targets.filter((t) => t.body === 'mars');
      this.targetSelect.replaceChildren(
        h('optgroup', { label: 'Moon · south pole' }, ...moon.map((t) => h('option', { value: t.id }, `Moon · ${t.name}`))),
        h('optgroup', { label: 'Mars' }, ...mars.map((t) => h('option', { value: t.id }, `Mars · ${t.name}`))),
      );
      this.targetsSig = tSig;
    }
    if (this.targetSelect.value !== state.targetId) this.targetSelect.value = state.targetId;

    const wSig = state.windows.map((w) => `${w.rank}:${w.site}:${w.i}:${w.j}:${w.score}`).join('|');
    if (this.windowsSig !== wSig) {
      this.windowSelect.replaceChildren(
        ...state.windows.map((w) =>
          h(
            'option',
            { value: String(w.rank) },
            `#${w.rank} ${w.region}${w.place ? `, ${w.place}` : ''} · score ${Math.round(w.score)}`,
          ),
        ),
      );
      this.windowsSig = wSig;
    }
    if (this.windowSelect.value !== String(state.windowRank)) this.windowSelect.value = String(state.windowRank);

    for (const [id, b] of this.toolButtons) b.setAttribute('aria-pressed', String(state.pointerTool === id));
    for (const [id, b] of this.camButtons) {
      b.setAttribute('aria-pressed', String(state.cameraMode === id));
      b.disabled = !state.webgl && id !== 'topdown';
    }

    this.exagVal.textContent = `${state.exag.toFixed(1)}×`;
    this.exagLess.disabled = state.exag <= EXAG_MIN;
    this.exagMore.disabled = state.exag >= EXAG_MAX;

    this.slopeCheckbox.checked = state.showSlopeMask;

    const rp = Math.round(state.roverProgress * 100);
    setRangeValue(this.roverSlider, rp, 0, 100);
    this.roverVal.textContent = `${rp} %`;
    this.driveBtn.setAttribute('aria-pressed', String(state.drivingRover));
    this.driveBtn.textContent = state.drivingRover ? 'Pause' : 'Drive';

    setRangeValue(this.elevSlider, state.sunElevDeg, 0.5, 20);
    this.elevVal.textContent = `${state.sunElevDeg.toFixed(1)}°`;
    setRangeValue(this.haSlider, Math.round(state.sunHourAngleDeg), -180, 180);
    const az = Math.round(norm360(state.sunGridAzDeg));
    this.azVal.textContent = `${az}°`;
    this.haSlider.setAttribute('aria-valuetext', `Sun azimuth ${az} degrees`);

    this.playSunBtn.setAttribute('aria-pressed', String(state.playingSun));
    this.playSunBtn.textContent = state.playingSun ? 'Pause Sun' : 'Play Sun';
    for (const [id, b] of this.earthSunButtons) b.setAttribute('aria-pressed', String(state.earthSunMode === id));

    const r = state.reach;
    if (!r) {
      this.reachNote.textContent = '';
      this.reachNote.removeAttribute('data-state');
      this.rangeSlot.replaceChildren();
      this.rangeCaption.textContent = '';
      this.reachSig = '';
      return;
    }
    const gap = reachGapDeg(state.sunGridAzDeg, r.reachAz);
    this.reachNote.dataset.state = gap === 0 ? 'in' : 'out';
    this.reachNote.textContent = gap === 0 ? `Inside ${r.site}'s range` : `${Math.round(gap)}° outside ${r.site}'s range`;

    const sig = `${r.site}|${r.reachAz.join(',')}|${az}|${r.earthAzDeg === null ? '' : Math.round(r.earthAzDeg)}`;
    if (sig !== this.reachSig) {
      this.reachSig = sig;
      this.rangeSlot.replaceChildren(
        buildAzimuthStrip(r.reachAz, state.sunGridAzDeg, r.earthAzDeg, {
          gap: gap > 0,
          label: `${r.body} Sun at ${az}°; ${r.site} reaches ${r.reachAz.length * 5}° of horizon`,
        }),
      );
      this.rangeCaption.replaceChildren(
        h('i', { class: 'mission-key mission-key--reach' }),
        `${r.site} reaches ${r.reachAz.length * 5}° of horizon at Sun elevation ${r.elevBandDeg[0]}–${r.elevBandDeg[1]}° in the next 12 months.`,
        h('i', { class: 'mission-key mission-key--moonmark' }),
        `${r.body} Sun`,
        ...(r.earthAzDeg !== null ? [h('i', { class: 'mission-key mission-key--earthmark' }), 'Earth Sun on the date'] : []),
      );
    }
  }
}
