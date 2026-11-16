// AI-assisted (Claude Code); reviewed by the author.
/**
 * Split instrument controls for Mission Rehearsal 3D:
 * - `renderPrimaryControls`: clean single-row bar above the dual 3D viewports
 *   (Target, Matched Earth Window, Synchronized Camera Mode, Vertical Scale).
 * - `renderSecondaryControls`: spacious two-column workbench strip below the
 *   viewports (Solar Geometry & Rehearsal Sun, Rover Playback & Waypoints).
 *
 * Updates existing control DOM nodes in place via WeakMaps so slider drags
 * and keyboard focus are never interrupted.
 */
import { h } from './dom.ts';
import type { Manifest } from '../../types.ts';
import type { CameraMode, PointerTool } from './scene.ts';
import type { SimWindow } from './sim.ts';

export type EarthSunMode = 'rehearsal' | 'mirror';

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
  earthSunSummary: string;
  playingSun: boolean;
  drivingRover: boolean;
  roverProgress: number;
  startFrac: [number, number];
  endFrac: [number, number];
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

interface PrimaryController {
  root: HTMLElement;
  state: MissionControlsState;
  cb: MissionControlsCallbacks;
  targetsSig: string;
  windowsSig: string;
  targetSelect: HTMLSelectElement;
  winSelect: HTMLSelectElement;
  camButtons: Map<CameraMode, HTMLButtonElement>;
  exagSlider: HTMLInputElement;
  exagBadge: HTMLElement;
}

interface SecondaryController {
  root: HTMLElement;
  state: MissionControlsState;
  cb: MissionControlsCallbacks;
  sunElevSlider: HTMLInputElement;
  sunElevVal: HTMLElement;
  sunHaSlider: HTMLInputElement;
  sunHaVal: HTMLElement;
  playSunBtn: HTMLButtonElement;
  earthSunButtons: Map<EarthSunMode, HTMLButtonElement>;
  toolButtons: Map<PointerTool, HTMLButtonElement>;
  roverSlider: HTMLInputElement;
  roverVal: HTMLElement;
  driveRoverBtn: HTMLButtonElement;
  slopeCheckbox: HTMLInputElement;
}

const primaryControllers = new WeakMap<HTMLElement, PrimaryController>();
const secondaryControllers = new WeakMap<HTMLElement, SecondaryController>();

function setRangeValue(input: HTMLInputElement, val: number, min: number, max: number): void {
  if (document.activeElement !== input) {
    input.value = String(val);
  }
  const pct = Math.max(0, Math.min(100, ((val - min) / Math.max(1e-9, max - min)) * 100));
  input.style.setProperty('--p', `${pct.toFixed(1)}%`);
}

function buildTargetOptions(select: HTMLSelectElement, manifest: Manifest, targetId: string): void {
  const moonTargets = manifest.targets.filter((t) => t.body === 'moon');
  const marsTargets = manifest.targets.filter((t) => t.body === 'mars');
  select.replaceChildren(
    h(
      'optgroup',
      { label: 'Moon · Artemis South Pole (LOLA 30 m)' },
      ...moonTargets.map((t) => h('option', { value: t.id }, `Moon · ${t.name}`)),
    ),
    h(
      'optgroup',
      { label: 'Mars · Candidate Landing Zones (MOLA 30 m)' },
      ...marsTargets.map((t) => h('option', { value: t.id }, `Mars · ${t.name}`)),
    ),
  );
  select.value = targetId;
}

function buildWindowOptions(select: HTMLSelectElement, windows: SimWindow[], rank: number): void {
  select.replaceChildren(
    ...windows.map((w) =>
      h(
        'option',
        { value: String(w.rank) },
        `#${w.rank} · ${w.region}${w.place ? ` (${w.place})` : ''} — ${w.score.toFixed(1)}%`,
      ),
    ),
  );
  select.value = String(rank);
}

function syncPrimaryDOM(ctrl: PrimaryController, manifest: Manifest): void {
  const { state } = ctrl;

  const tSig = manifest.targets.map((t) => t.id).join('|');
  if (ctrl.targetsSig !== tSig) {
    buildTargetOptions(ctrl.targetSelect, manifest, state.targetId);
    ctrl.targetsSig = tSig;
  } else if (ctrl.targetSelect.value !== state.targetId) {
    ctrl.targetSelect.value = state.targetId;
  }

  const wSig = state.windows.map((w) => `${w.rank}:${w.site}:${w.i}:${w.j}:${w.score.toFixed(1)}`).join('|');
  if (ctrl.windowsSig !== wSig) {
    buildWindowOptions(ctrl.winSelect, state.windows, state.windowRank);
    ctrl.windowsSig = wSig;
  } else if (ctrl.winSelect.value !== String(state.windowRank)) {
    ctrl.winSelect.value = String(state.windowRank);
  }

  for (const [mode, btn] of ctrl.camButtons) {
    btn.setAttribute('aria-pressed', state.cameraMode === mode ? 'true' : 'false');
  }

  setRangeValue(ctrl.exagSlider, state.exag, 1, 5);
  ctrl.exagBadge.textContent = `${state.exag.toFixed(1)}×`;
}

function syncSecondaryDOM(ctrl: SecondaryController): void {
  const { state } = ctrl;

  setRangeValue(ctrl.sunElevSlider, state.sunElevDeg, 0.5, 20);
  ctrl.sunElevVal.textContent = `${state.sunElevDeg.toFixed(1)}°`;

  const roundedHa = Math.round(state.sunHourAngleDeg);
  setRangeValue(ctrl.sunHaSlider, roundedHa, -180, 180);
  ctrl.sunHaVal.textContent = `${Math.round(state.sunGridAzDeg)}° az`;

  ctrl.playSunBtn.setAttribute('aria-pressed', state.playingSun ? 'true' : 'false');
  ctrl.playSunBtn.classList.toggle('is-playing', state.playingSun);
  ctrl.playSunBtn.textContent = state.playingSun ? 'Pause Sun' : 'Play Sun';

  for (const [mode, btn] of ctrl.earthSunButtons) {
    btn.setAttribute('aria-pressed', state.earthSunMode === mode ? 'true' : 'false');
  }

  for (const [tool, btn] of ctrl.toolButtons) {
    btn.setAttribute('aria-pressed', state.pointerTool === tool ? 'true' : 'false');
  }

  const roverPct = Math.round(state.roverProgress * 100);
  setRangeValue(ctrl.roverSlider, roverPct, 0, 100);
  ctrl.roverVal.textContent = `${roverPct}%`;

  ctrl.driveRoverBtn.setAttribute('aria-pressed', state.drivingRover ? 'true' : 'false');
  ctrl.driveRoverBtn.classList.toggle('is-playing', state.drivingRover);
  ctrl.driveRoverBtn.textContent = state.drivingRover ? 'Pause rover' : 'Drive rover';

  ctrl.slopeCheckbox.checked = state.showSlopeMask;
}

export function renderPrimaryControls(
  container: HTMLElement,
  manifest: Manifest,
  state: MissionControlsState,
  cb: MissionControlsCallbacks,
): void {
  const existing = primaryControllers.get(container);
  if (existing && existing.root.parentElement === container) {
    existing.state = state;
    existing.cb = cb;
    syncPrimaryDOM(existing, manifest);
    return;
  }

  const ctrl: PrimaryController = {} as PrimaryController;
  ctrl.state = state;
  ctrl.cb = cb;
  ctrl.targetsSig = '';
  ctrl.windowsSig = '';
  ctrl.camButtons = new Map();

  const targetSelect = h('select', {
    id: 'mission-target-select',
    class: 'mission-select',
    'aria-label': 'Select planetary target site',
    onchange: () => ctrl.cb.onSelectTarget(targetSelect.value),
  }) as HTMLSelectElement;

  const winSelect = h('select', {
    id: 'mission-window-select',
    class: 'mission-select',
    'aria-label': 'Select top-5 Earth analog window',
    onchange: () => ctrl.cb.onSelectWindow(Number(winSelect.value)),
  }) as HTMLSelectElement;

  const camModes: Array<{ id: CameraMode; label: string; title: string }> = [
    { id: 'orbital', label: 'Orbital 3D', title: 'Synchronized 3D orbit camera' },
    { id: 'astronaut', label: 'Astronaut 1.7 m', title: 'First-person eye height at 1.7 m above local surface' },
    { id: 'rover', label: 'Rover', title: 'Chase camera behind the traversing rover' },
    { id: 'topdown', label: '2D Map', title: 'Top-down hillshade + cast shadow map' },
  ];

  const camSeg = h(
    'div',
    { class: 'seg mission-seg', role: 'group', 'aria-label': 'Camera view modes' },
    ...camModes.map((m) => {
      const btn = h(
        'button',
        {
          type: 'button',
          title: m.title,
          'aria-pressed': 'false',
          onclick: () => ctrl.cb.onChangeCameraMode(m.id),
        },
        m.label,
      ) as HTMLButtonElement;
      ctrl.camButtons.set(m.id, btn);
      return btn;
    }),
  );

  const exagBadge = h(
    'span',
    { class: 'mission-exag-badge tnum', 'aria-live': 'polite' },
    `${state.exag.toFixed(1)}×`,
  );

  const exagSlider = h('input', {
    id: 'mission-exag-slider',
    type: 'range',
    min: '1',
    max: '5',
    step: '0.5',
    value: String(state.exag),
    oninput: () => {
      const val = Number(exagSlider.value);
      setRangeValue(exagSlider, val, 1, 5);
      exagBadge.textContent = `${val.toFixed(1)}×`;
      ctrl.cb.onChangeExag(val);
    },
  }) as HTMLInputElement;

  const resetCamBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      onclick: () => ctrl.cb.onResetCamera(),
      title: 'Reset orbital camera angle and zoom',
    },
    'Reset',
  ) as HTMLButtonElement;

  const bar = h(
    'section',
    { class: 'panel mission-top-bar', 'aria-label': 'Mission target and camera controls' },
    h(
      'div',
      { class: 'mission-field' },
      h('label', { class: 'label', for: 'mission-target-select' }, 'Planetary target'),
      targetSelect,
    ),
    h(
      'div',
      { class: 'mission-field' },
      h('label', { class: 'label', for: 'mission-window-select' }, 'Earth analog window'),
      winSelect,
    ),
    h(
      'div',
      { class: 'mission-field' },
      h('span', { class: 'label' }, 'View'),
      camSeg,
    ),
    h(
      'div',
      { class: 'mission-field mission-field-exag' },
      h(
        'div',
        { class: 'mission-field-head' },
        h('label', { class: 'label', for: 'mission-exag-slider' }, 'Vertical scale (1×–5×)'),
        exagBadge,
      ),
      h(
        'div',
        { class: 'mission-exag-row' },
        exagSlider,
        resetCamBtn,
      ),
    ),
  );

  ctrl.root = bar;
  ctrl.targetSelect = targetSelect;
  ctrl.winSelect = winSelect;
  ctrl.exagSlider = exagSlider;
  ctrl.exagBadge = exagBadge;

  primaryControllers.set(container, ctrl);
  syncPrimaryDOM(ctrl, manifest);
  container.replaceChildren(bar);
}

export function renderSecondaryControls(
  container: HTMLElement,
  state: MissionControlsState,
  cb: MissionControlsCallbacks,
): void {
  const existing = secondaryControllers.get(container);
  if (existing && existing.root.parentElement === container) {
    existing.state = state;
    existing.cb = cb;
    syncSecondaryDOM(existing);
    return;
  }

  const ctrl: SecondaryController = {} as SecondaryController;
  ctrl.state = state;
  ctrl.cb = cb;
  ctrl.earthSunButtons = new Map();
  ctrl.toolButtons = new Map();

  const playSunBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn small mission-toggle-btn',
      'aria-pressed': 'false',
      onclick: () => ctrl.cb.onTogglePlaySun(),
    },
    'Play Sun',
  ) as HTMLButtonElement;

  const sunElevVal = h('output', { class: 'mission-slider-val tnum', for: 'mission-sun-elev' }, '');
  const sunElevSlider = h('input', {
    id: 'mission-sun-elev',
    type: 'range',
    min: '0.5',
    max: '20',
    step: '0.5',
    value: String(state.sunElevDeg),
    oninput: () => {
      const val = Number(sunElevSlider.value);
      setRangeValue(sunElevSlider, val, 0.5, 20);
      sunElevVal.textContent = `${val.toFixed(1)}°`;
      ctrl.cb.onChangeSun(val, ctrl.state.sunHourAngleDeg);
    },
  }) as HTMLInputElement;

  const sunHaVal = h('output', { class: 'mission-slider-val tnum', for: 'mission-sun-ha' }, '');
  const sunHaSlider = h('input', {
    id: 'mission-sun-ha',
    type: 'range',
    min: '-180',
    max: '180',
    step: '5',
    value: String(Math.round(state.sunHourAngleDeg)),
    oninput: () => {
      const val = Number(sunHaSlider.value);
      setRangeValue(sunHaSlider, val, -180, 180);
      ctrl.cb.onChangeSun(ctrl.state.sunElevDeg, val);
    },
  }) as HTMLInputElement;

  const earthSunOpts: Array<{ id: EarthSunMode; label: string }> = [
    { id: 'rehearsal', label: 'Rehearsal date' },
    { id: 'mirror', label: 'Mirror target' },
  ];
  const earthSunSeg = h(
    'div',
    { class: 'seg mission-seg', role: 'group', 'aria-label': 'Earth viewport Sun source' },
    ...earthSunOpts.map((opt) => {
      const btn = h(
        'button',
        {
          type: 'button',
          'aria-pressed': 'false',
          onclick: () => ctrl.cb.onChangeEarthSunMode(opt.id),
        },
        opt.label,
      ) as HTMLButtonElement;
      ctrl.earthSunButtons.set(opt.id, btn);
      return btn;
    }),
  );

  const driveRoverBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn small mission-toggle-btn',
      'aria-pressed': 'false',
      onclick: () => ctrl.cb.onToggleDriveRover(),
    },
    'Drive rover',
  ) as HTMLButtonElement;

  const pointerTools: Array<{ id: PointerTool; label: string }> = [
    { id: 'orbit', label: 'Orbit' },
    { id: 'start', label: 'Set A' },
    { id: 'end', label: 'Set B' },
  ];
  const toolSeg = h(
    'div',
    { class: 'seg mission-seg', role: 'group', 'aria-label': 'Terrain click action' },
    ...pointerTools.map((pt) => {
      const btn = h(
        'button',
        {
          type: 'button',
          'aria-pressed': 'false',
          onclick: () => ctrl.cb.onChangePointerTool(pt.id),
        },
        pt.label,
      ) as HTMLButtonElement;
      ctrl.toolButtons.set(pt.id, btn);
      return btn;
    }),
  );

  const swapBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      title: 'Reverse Start (A) and End (B)',
      onclick: () => ctrl.cb.onSwapRoute(),
    },
    'A ↔ B',
  ) as HTMLButtonElement;

  const roverVal = h('output', { class: 'mission-slider-val tnum', for: 'mission-rover-scrub' }, '');
  const roverSlider = h('input', {
    id: 'mission-rover-scrub',
    type: 'range',
    min: '0',
    max: '100',
    step: '1',
    value: String(Math.round(state.roverProgress * 100)),
    oninput: () => {
      const val = Number(roverSlider.value);
      setRangeValue(roverSlider, val, 0, 100);
      roverVal.textContent = `${Math.round(val)}%`;
      ctrl.cb.onScrubRover(val / 100);
    },
  }) as HTMLInputElement;

  const slopeCheckbox = h('input', {
    id: 'mission-slope-mask',
    type: 'checkbox',
    onchange: () => ctrl.cb.onToggleSlopeMask(slopeCheckbox.checked),
  }) as HTMLInputElement;

  const strip = h(
    'section',
    { class: 'panel mission-workbench-strip', 'aria-label': 'Sun geometry and traverse controls' },
    // Left column: Solar geometry
    h(
      'div',
      { class: 'mission-workbench-col' },
      h(
        'div',
        { class: 'mission-subpanel-head' },
        h('span', { class: 'label' }, 'Solar illumination & cast shadows'),
        h('div', { class: 'mission-inline-actions' }, earthSunSeg, playSunBtn),
      ),
      h(
        'div',
        { class: 'mission-sliders-duo' },
        h(
          'div',
          { class: 'mission-slider-row' },
          h('label', { class: 'mission-slider-lbl', for: 'mission-sun-elev' }, 'Sun elev'),
          sunElevSlider,
          sunElevVal,
        ),
        h(
          'div',
          { class: 'mission-slider-row' },
          h('label', { class: 'mission-slider-lbl', for: 'mission-sun-ha' }, 'Sun azimuth'),
          sunHaSlider,
          sunHaVal,
        ),
      ),
    ),

    // Right column: Rover & traverse
    h(
      'div',
      { class: 'mission-workbench-col' },
      h(
        'div',
        { class: 'mission-subpanel-head' },
        h('span', { class: 'label' }, 'Rover & waypoints (A* avoids > 20° slopes)'),
        h(
          'div',
          { class: 'mission-inline-actions' },
          toolSeg,
          swapBtn,
          driveRoverBtn,
        ),
      ),
      h(
        'div',
        { class: 'mission-traverse-row' },
        h(
          'div',
          { class: 'mission-slider-row mission-rover-row' },
          h('label', { class: 'mission-slider-lbl', for: 'mission-rover-scrub' }, 'Rover pos'),
          roverSlider,
          roverVal,
        ),
        h(
          'label',
          { class: 'mission-slope-toggle', for: 'mission-slope-mask' },
          slopeCheckbox,
          '> 20° wall',
        ),
      ),
    ),
  );

  ctrl.root = strip;
  ctrl.sunElevSlider = sunElevSlider;
  ctrl.sunElevVal = sunElevVal;
  ctrl.sunHaSlider = sunHaSlider;
  ctrl.sunHaVal = sunHaVal;
  ctrl.playSunBtn = playSunBtn;
  ctrl.roverSlider = roverSlider;
  ctrl.roverVal = roverVal;
  ctrl.driveRoverBtn = driveRoverBtn;
  ctrl.slopeCheckbox = slopeCheckbox;

  secondaryControllers.set(container, ctrl);
  syncSecondaryDOM(ctrl);
  container.replaceChildren(strip);
}
