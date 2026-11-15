// AI-assisted (Claude Code); reviewed by the author.
/**
 * Interactive control bar for Mission Rehearsal 3D:
 * Target & Earth window selection, vertical exaggeration (1x-5x),
 * solar geometry & diurnal animation, route waypoint tools, and camera/rover modes.
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
  onApplyPresetRoute: (start: [number, number], end: [number, number]) => void;
  onSwapRoute: () => void;
}

export function renderControlsBar(
  container: HTMLElement,
  manifest: Manifest,
  state: MissionControlsState,
  cb: MissionControlsCallbacks,
): void {
  const moonTargets = manifest.targets.filter((t) => t.body === 'moon');
  const marsTargets = manifest.targets.filter((t) => t.body === 'mars');

  const targetSelect = h(
    'select',
    {
      id: 'mission-target-select',
      class: 'mission-select',
      'aria-label': 'Select planetary target site',
      onchange: (e: Event) => cb.onSelectTarget((e.target as HTMLSelectElement).value),
    },
    h(
      'optgroup',
      { label: 'Moon · Artemis South Pole (LOLA 30 m)' },
      ...moonTargets.map((t) =>
        h(
          'option',
          { value: t.id, ...(t.id === state.targetId ? { selected: 'selected' } : {}) },
          `Moon · ${t.name}`,
        ),
      ),
    ),
    h(
      'optgroup',
      { label: 'Mars · Candidate Landing Zones (MOLA 30 m)' },
      ...marsTargets.map((t) =>
        h(
          'option',
          { value: t.id, ...(t.id === state.targetId ? { selected: 'selected' } : {}) },
          `Mars · ${t.name}`,
        ),
      ),
    ),
  ) as HTMLSelectElement;
  targetSelect.value = state.targetId;

  const winSelect = h(
    'select',
    {
      id: 'mission-window-select',
      class: 'mission-select',
      'aria-label': 'Select top-5 Earth analog window',
      onchange: (e: Event) => cb.onSelectWindow(Number((e.target as HTMLSelectElement).value)),
    },
    ...state.windows.map((w) =>
      h(
        'option',
        { value: String(w.rank), ...(w.rank === state.windowRank ? { selected: 'selected' } : {}) },
        `#${w.rank} · ${w.region}${w.place ? ` (${w.place})` : ''} — ${w.score.toFixed(1)} %`,
      ),
    ),
  ) as HTMLSelectElement;
  winSelect.value = String(state.windowRank);

  const camModes: Array<{ id: CameraMode; label: string; title: string }> = [
    { id: 'orbital', label: 'Orbital 3D', title: 'Synchronized 3D orbit camera' },
    { id: 'astronaut', label: 'Astronaut 1.7 m', title: 'First-person eye height at 1.7 m above local surface' },
    { id: 'rover', label: 'Rover follow', title: 'Chase camera behind the traversing rover' },
    { id: 'topdown', label: '2D Map', title: 'Top-down hillshade + cast shadow map (no-WebGL fallback)' },
  ];

  const pointerTools: Array<{ id: PointerTool; label: string }> = [
    { id: 'orbit', label: 'Orbit / Zoom' },
    { id: 'start', label: 'Pick Start (A)' },
    { id: 'end', label: 'Pick End (B)' },
  ];

  const presets: Array<{ label: string; s: [number, number]; e: [number, number] }> = [
    { label: 'Diagonal SW→NE', s: [0.82, 0.16], e: [0.18, 0.84] },
    { label: 'Diagonal NW→SE', s: [0.16, 0.16], e: [0.84, 0.84] },
    { label: 'South→North', s: [0.86, 0.5], e: [0.14, 0.5] },
    { label: 'West→East', s: [0.5, 0.14], e: [0.5, 0.86] },
  ];

  const bar = h(
    'section',
    { class: 'panel mission-controls-panel', 'aria-label': 'Mission rehearsal controls' },

    // Row 1: Target, Earth Window, Vertical Exaggeration, Camera Mode
    h(
      'div',
      { class: 'mission-controls-grid' },

      // Target & Earth Window selectors
      h(
        'div',
        { class: 'mission-ctrl-group' },
        h('label', { class: 'mission-ctrl-label', for: 'mission-target-select' }, '1. Planetary target (6×6 km)'),
        targetSelect,
        h(
          'label',
          { class: 'mission-ctrl-label mission-mt-2', for: 'mission-window-select' },
          '2. Top-5 Earth analog window',
        ),
        winSelect,
      ),

      // Camera & Vertical Exaggeration
      h(
        'div',
        { class: 'mission-ctrl-group' },
        h(
          'div',
          { class: 'mission-ctrl-header' },
          h('span', { class: 'mission-ctrl-label' }, '3. Synchronized camera & relief'),
          h(
            'span',
            { class: 'mission-exag-badge num', 'aria-live': 'polite' },
            `Vert. exaggeration: ${state.exag.toFixed(1)}×`,
          ),
        ),
        h(
          'div',
          { class: 'mission-btn-row', role: 'group', 'aria-label': 'Camera view modes' },
          ...camModes.map((m) =>
            h(
              'button',
              {
                type: 'button',
                class: `mission-seg-btn ${state.cameraMode === m.id ? 'active' : ''}`,
                title: m.title,
                'aria-pressed': state.cameraMode === m.id ? 'true' : 'false',
                onclick: () => cb.onChangeCameraMode(m.id),
              },
              m.label,
            ),
          ),
        ),
        h(
          'div',
          { class: 'mission-slider-row' },
          h(
            'label',
            { class: 'mission-slider-lbl', for: 'mission-exag-slider' },
            'Vertical scale (1×–5×)',
          ),
          h('input', {
            id: 'mission-exag-slider',
            type: 'range',
            min: '1',
            max: '5',
            step: '0.5',
            value: String(state.exag),
            class: 'mission-range',
            oninput: (e: Event) => cb.onChangeExag(Number((e.target as HTMLInputElement).value)),
          }),
          h('span', { class: 'mission-slider-val num' }, `${state.exag.toFixed(1)}×`),
          h(
            'button',
            {
              type: 'button',
              class: 'mission-mini-btn',
              onclick: () => cb.onResetCamera(),
              title: 'Reset orbital camera angle and zoom',
            },
            'Reset cam',
          ),
        ),
      ),

      // Solar Geometry & Diurnal Animation
      h(
        'div',
        { class: 'mission-ctrl-group' },
        h(
          'div',
          { class: 'mission-ctrl-header' },
          h('span', { class: 'mission-ctrl-label' }, '4. Solar illumination & cast shadows'),
          h(
            'button',
            {
              type: 'button',
              class: `mission-play-btn ${state.playingSun ? 'playing' : ''}`,
              'aria-pressed': state.playingSun ? 'true' : 'false',
              onclick: () => cb.onTogglePlaySun(),
            },
            state.playingSun ? 'Pause Sun' : 'Play Sun cycle',
          ),
        ),
        h(
          'div',
          { class: 'mission-slider-row' },
          h('label', { class: 'mission-slider-lbl', for: 'mission-sun-elev' }, 'Sun elevation'),
          h('input', {
            id: 'mission-sun-elev',
            type: 'range',
            min: '0.5',
            max: '20',
            step: '0.5',
            value: String(state.sunElevDeg),
            class: 'mission-range',
            oninput: (e: Event) =>
              cb.onChangeSun(Number((e.target as HTMLInputElement).value), state.sunHourAngleDeg),
          }),
          h('span', { class: 'mission-slider-val num' }, `${state.sunElevDeg.toFixed(1)}°`),
        ),
        h(
          'div',
          { class: 'mission-slider-row' },
          h('label', { class: 'mission-slider-lbl', for: 'mission-sun-ha' }, 'Hour angle / az'),
          h('input', {
            id: 'mission-sun-ha',
            type: 'range',
            min: '-180',
            max: '180',
            step: '5',
            value: String(Math.round(state.sunHourAngleDeg)),
            class: 'mission-range',
            oninput: (e: Event) =>
              cb.onChangeSun(state.sunElevDeg, Number((e.target as HTMLInputElement).value)),
          }),
          h('span', { class: 'mission-slider-val num' }, `az ${Math.round(state.sunGridAzDeg)}°`),
        ),
        h(
          'div',
          { class: 'mission-earth-sun-toggle' },
          h(
            'button',
            {
              type: 'button',
              class: `mission-seg-btn ${state.earthSunMode === 'rehearsal' ? 'active' : ''}`,
              'aria-pressed': state.earthSunMode === 'rehearsal' ? 'true' : 'false',
              onclick: () => cb.onChangeEarthSunMode('rehearsal'),
            },
            'Earth: Rehearsal date Sun',
          ),
          h(
            'button',
            {
              type: 'button',
              class: `mission-seg-btn ${state.earthSunMode === 'mirror' ? 'active' : ''}`,
              'aria-pressed': state.earthSunMode === 'mirror' ? 'true' : 'false',
              onclick: () => cb.onChangeEarthSunMode('mirror'),
            },
            'Earth: Mirror target Sun',
          ),
        ),
      ),

      // Route Planning & Rover Drive
      h(
        'div',
        { class: 'mission-ctrl-group' },
        h(
          'div',
          { class: 'mission-ctrl-header' },
          h('span', { class: 'mission-ctrl-label' }, '5. Least-cost A* traverse & rover drive'),
          h(
            'button',
            {
              type: 'button',
              class: `mission-play-btn ${state.drivingRover ? 'playing' : ''}`,
              'aria-pressed': state.drivingRover ? 'true' : 'false',
              onclick: () => cb.onToggleDriveRover(),
            },
            state.drivingRover ? 'Pause rover' : 'Drive rover',
          ),
        ),
        h(
          'div',
          { class: 'mission-btn-row', role: 'group', 'aria-label': 'Terrain click action' },
          ...pointerTools.map((pt) =>
            h(
              'button',
              {
                type: 'button',
                class: `mission-seg-btn ${state.pointerTool === pt.id ? 'active' : ''}`,
                'aria-pressed': state.pointerTool === pt.id ? 'true' : 'false',
                onclick: () => cb.onChangePointerTool(pt.id),
              },
              pt.label,
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'mission-mini-btn',
              title: 'Reverse Start (A) and End (B)',
              onclick: () => cb.onSwapRoute(),
            },
            'A ↔ B',
          ),
        ),
        h(
          'div',
          { class: 'mission-slider-row' },
          h('label', { class: 'mission-slider-lbl', for: 'mission-rover-scrub' }, 'Rover position'),
          h('input', {
            id: 'mission-rover-scrub',
            type: 'range',
            min: '0',
            max: '100',
            step: '1',
            value: String(Math.round(state.roverProgress * 100)),
            class: 'mission-range',
            oninput: (e: Event) => cb.onScrubRover(Number((e.target as HTMLInputElement).value) / 100),
          }),
          h('span', { class: 'mission-slider-val num' }, `${Math.round(state.roverProgress * 100)}%`),
        ),
        h(
          'div',
          { class: 'mission-presets-row' },
          ...presets.map((p) =>
            h(
              'button',
              {
                type: 'button',
                class: 'mission-chip-btn',
                onclick: () => cb.onApplyPresetRoute(p.s, p.e),
              },
              p.label,
            ),
          ),
          h(
            'label',
            { class: 'mission-slope-toggle' },
            h('input', {
              type: 'checkbox',
              ...(state.showSlopeMask ? { checked: 'checked' } : {}),
              onchange: (e: Event) => cb.onToggleSlopeMask((e.target as HTMLInputElement).checked),
            }),
            ' >20° wall',
          ),
        ),
      ),
    ),
  );

  container.replaceChildren(bar);
}
