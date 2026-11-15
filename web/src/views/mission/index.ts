// AI-assisted (Claude Code); reviewed by the author.
/**
 * Mission Rehearsal 3D (U6 / A1) & "Rehearse this traverse on Earth, on this date" (U7 / A2).
 *
 * Renders two synchronized 3D scenes (Moon/Mars target vs. top-5 Earth analog window)
 * on 200x200 30 m grids with P.E.N.'s validated ray-cast shadows, least-cost A*
 * traverse planning (slope > 20 deg wall), Orbital / Astronaut 1.7 m / Rover follow
 * cameras, 2D Canvas fallback, side-by-side telemetry, and 365-day NOAA solar
 * rehearsal scheduling with .ics download and #/dossier integration.
 */
import './mission.css';
import { h } from './dom.ts';
import type { Params } from '../../lib/routes.ts';
import type { Manifest } from '../../types.ts';
import {
  renderPrimaryControls,
  renderSecondaryControls,
  type EarthSunMode,
  type MissionControlsCallbacks,
  type MissionControlsState,
} from './controls.ts';
import { renderRehearsePanel } from './rehearse.ts';
import {
  MissionDualScene,
  type CameraMode,
  type PointerTool,
} from './scene.ts';
import {
  castShadow,
  loadSimGrid,
  loadSimTarget,
  rehearse,
  routeBetween,
  shadowFraction,
  solarPosition,
  sunFromHourAngle,
  telemetry,
  type CostLayers,
  type Grid,
  type RehearsalPlan,
  type RouteTelemetry,
  type SimTargetMeta,
  type SimWindow,
  type SunAngles,
} from './sim.ts';
import { renderTelemetryPanel } from './telemetry.ts';
import { headlineTarget } from '../../lib/headline.ts';

function resolveTargetId(m: Manifest, raw?: string): string {
  if (!raw) return m.targets[0]?.id ?? 'moon_malapert';
  const exact = m.targets.find((t) => t.id === raw);
  if (exact) return exact.id;
  const suffix = m.targets.find(
    (t) => t.id.endsWith(`_${raw}`) || t.name.toLowerCase().includes(raw.toLowerCase()),
  );
  return suffix ? suffix.id : (m.targets[0]?.id ?? 'moon_malapert');
}

export async function render(
  el: HTMLElement,
  m: Manifest,
  params: Params,
): Promise<() => void> {
  let disposed = false;

  // Initial state from URL parameters
  // without ?target= open on the blind-test headline target (Malapert), as Home and Explore do
  let targetId = params.target ? resolveTargetId(m, params.target) : ((await headlineTarget(m)) ?? resolveTargetId(m));
  let windowRank = Math.max(1, Math.min(5, Number(params.rank || params.window) || 1));
  let exag = Math.max(1, Math.min(5, Number(params.exag) || 2.5));
  let cameraMode: CameraMode =
    params.cam === 'astronaut' || params.cam === 'rover' || params.cam === 'topdown'
      ? params.cam
      : 'orbital';
  let pointerTool: PointerTool = 'orbit';
  let showSlopeMask = true;

  let sunElevDeg = targetId.startsWith('mars_') ? 8.0 : 2.5;
  let sunHourAngleDeg = -35;
  let earthSunMode: EarthSunMode = 'rehearsal';

  let startFrac: [number, number] = [0.8, 0.18];
  let endFrac: [number, number] = [0.2, 0.82];
  let roverProgress = 0.25;

  let playingSun = false;
  let drivingRover = false;
  let animTimer = 0;

  // Cached simulation state for current target + Earth window
  let simMeta: SimTargetMeta | null = null;
  let targetGrid: Grid | null = null;
  let earthWin: SimWindow | null = null;
  let earthGrid: Grid | null = null;

  let targetSun: SunAngles = sunFromHourAngle(-84.9, sunHourAngleDeg, -1.5, sunElevDeg);
  let earthSun: SunAngles = { elevDeg: 3.0, azDeg: 145, gridAzDeg: 145 };

  let targetLayers: CostLayers | null = null;
  let targetRoute: Array<[number, number]> = [];
  let targetTel: RouteTelemetry | null = null;

  let earthLayers: CostLayers | null = null;
  let earthRoute: Array<[number, number]> = [];
  let earthTel: RouteTelemetry | null = null;

  let rehearsalPlan: RehearsalPlan | null = null;
  let selectedRehearsalIdx = 0;

  // DOM Containers
  const primaryControlsSlot = h('div', { class: 'mission-controls-slot' });
  const secondaryControlsSlot = h('div', { class: 'mission-workbench-slot' });

  const targetTitleEl = h('h2', { class: 'mission-viewport-title' }, 'Loading target terrain…');
  const targetMetaEl = h('p', { class: 'mission-viewport-meta tnum' }, '200×200 grid · 30 m/px (6×6 km)');
  const targetCanvas = h('canvas', {
    class: 'mission-canvas',
    width: 640,
    height: 430,
    'aria-label': 'Target planetary terrain 3D rehearsal viewport',
  }) as HTMLCanvasElement;

  const earthTitleEl = h('h2', { class: 'mission-viewport-title' }, 'Loading Earth analog window…');
  const earthMetaEl = h('p', { class: 'mission-viewport-meta tnum' }, '200×200 grid · 30 m/px (6×6 km)');
  const earthCanvas = h('canvas', {
    class: 'mission-canvas',
    width: 640,
    height: 430,
    'aria-label': 'Earth analog terrain 3D rehearsal viewport',
  }) as HTMLCanvasElement;

  const rehearseSlot = h('div', { class: 'mission-rehearse-slot' });
  const telemetrySlot = h('div', { class: 'mission-telemetry-slot' });

  const page = h(
    'div',
    { class: 'page-in wide mission mission-page' },
    h(
      'header',
      { class: 'mission-header' },
      h('h1', null, 'Mission rehearsal'),
      h(
        'p',
        { class: 'lead mission-lead' },
        'Drive a least-cost rover traverse (< 20° grade) across a Moon or Mars site and its matched Earth twin under grazing low-angle sunlight — then compute the exact UTC dates when Earth’s sky reproduces that illumination.',
      ),
    ),

    // Single-row primary controls above the synchronized 3D twin viewports
    primaryControlsSlot,

    // Side-by-side 3D Viewports
    h(
      'section',
      { class: 'mission-viewports-grid', 'aria-label': 'Synchronized 3D terrain rehearsal viewports' },
      // Left: Planetary Target
      h(
        'article',
        { class: 'panel mission-viewport-card' },
        h(
          'div',
          { class: 'mission-viewport-head' },
          h(
            'div',
            { class: 'mission-viewport-id' },
            h('span', { class: 'label' }, 'Planetary Reference · 6×6 km'),
            targetTitleEl,
          ),
          targetMetaEl,
        ),
        h('div', { class: 'mission-canvas-wrap' }, targetCanvas),
        h(
          'div',
          { class: 'mission-viewport-foot' },
          h(
            'div',
            { class: 'mission-legend-inline' },
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-start' }), 'Start (A)'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-end' }), 'End (B)'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-lit' }), 'Lit'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-shadow' }), 'Shadowed'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-impassable' }), '> 20° wall'),
          ),
          h('span', { class: 'mission-hint tnum' }, 'Drag to orbit · Wheel to zoom · Shift+Click to set B'),
        ),
      ),

      // Right: Earth Analog Window
      h(
        'article',
        { class: 'panel mission-viewport-card' },
        h(
          'div',
          { class: 'mission-viewport-head' },
          h(
            'div',
            { class: 'mission-viewport-id' },
            h('span', { class: 'label' }, 'Matched Earth Analog · 6×6 km'),
            earthTitleEl,
          ),
          earthMetaEl,
        ),
        h('div', { class: 'mission-canvas-wrap' }, earthCanvas),
        h(
          'div',
          { class: 'mission-viewport-foot' },
          h(
            'div',
            { class: 'mission-legend-inline' },
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-start' }), 'Start (A)'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-end' }), 'End (B)'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-lit' }), 'Lit'),
            h('span', { class: 'mission-legend-item' }, h('i', { class: 'mission-swatch swatch-shadow' }), 'Shadowed'),
          ),
          h('span', { class: 'mission-hint tnum' }, 'Synchronized camera & vertical scale'),
        ),
      ),
    ),

    // Sun & traverse workbench controls cleanly seated below the 3D viewports
    secondaryControlsSlot,

    // A2 Star Feature: "Rehearse this traverse on Earth, on this date"
    rehearseSlot,

    // Side-by-side Traverse Telemetry & 101-Sample Profile
    telemetrySlot,
  );

  el.replaceChildren(page);

  const dualScene = new MissionDualScene({
    targetCanvas,
    earthCanvas,
    onPickPoint: (which, frac) => {
      if (which === 'start') {
        startFrac = frac;
      } else {
        endFrac = frac;
      }
      recomputeSimulation(true);
    },
  });

  // Initialize WebGL before applying initial 3D camera state (falls back cleanly to 2D Canvas)
  await dualScene.init();
  if (disposed) {
    dualScene.dispose();
    return () => {};
  }
  if (!dualScene.hasWebGLSupport()) {
    cameraMode = 'topdown';
  }
  dualScene.setExaggeration(exag);
  dualScene.setCameraMode(cameraMode);

  function buildControlsState(): MissionControlsState {
    const activeRehearsalWin = rehearsalPlan?.windows[selectedRehearsalIdx] ?? rehearsalPlan?.best;
    return {
      targetId,
      windowRank,
      windows: simMeta?.windows ?? [],
      exag,
      cameraMode,
      pointerTool,
      showSlopeMask,
      sunElevDeg,
      sunHourAngleDeg,
      sunGridAzDeg: targetSun.gridAzDeg,
      earthSunMode,
      earthSunSummary: activeRehearsalWin ? `${activeRehearsalWin.date}` : '',
      playingSun,
      drivingRover,
      roverProgress,
      startFrac,
      endFrac,
    };
  }

  function renderControls(): void {
    const st = buildControlsState();
    renderPrimaryControls(primaryControlsSlot, m, st, controlsCallbacks);
    renderSecondaryControls(secondaryControlsSlot, st, controlsCallbacks);
  }

  const controlsCallbacks: MissionControlsCallbacks = {
    onSelectTarget: (newId) => {
      void loadTargetAndWindow(newId, 1);
    },
    onSelectWindow: (newRank) => {
      if (!simMeta) return;
      windowRank = newRank;
      earthWin = simMeta.windows[windowRank - 1] ?? simMeta.windows[0];
      void loadSimGrid(earthWin, simMeta.n, simMeta.dx).then((g) => {
        if (disposed) return;
        earthGrid = g;
        selectedRehearsalIdx = 0;
        recomputeSimulation(true);
      });
    },
    onChangeExag: (k) => {
      exag = k;
      dualScene.setExaggeration(exag);
      renderControls();
    },
    onChangeCameraMode: (mode) => {
      cameraMode = !dualScene.hasWebGLSupport() ? 'topdown' : mode;
      dualScene.setCameraMode(cameraMode);
      renderControls();
    },
    onResetCamera: () => {
      dualScene.resetCamera();
    },
    onChangePointerTool: (tool) => {
      pointerTool = tool;
      dualScene.setPointerTool(tool);
      renderControls();
    },
    onToggleSlopeMask: (show) => {
      showSlopeMask = show;
      dualScene.setShowSlopeMask(show);
      renderControls();
    },
    onChangeSun: (newElev, newHa) => {
      sunElevDeg = newElev;
      sunHourAngleDeg = newHa;
      recomputeSimulation(true);
    },
    onChangeEarthSunMode: (mode) => {
      earthSunMode = mode;
      recomputeSimulation(false);
    },
    onTogglePlaySun: () => {
      playingSun = !playingSun;
      syncAnimationLoop();
      renderControls();
    },
    onToggleDriveRover: () => {
      drivingRover = !drivingRover;
      syncAnimationLoop();
      renderControls();
    },
    onScrubRover: (prog) => {
      roverProgress = prog;
      dualScene.setRoverProgress(roverProgress);
      renderControls();
      renderTelemetryCurrent();
    },
    onSwapRoute: () => {
      const tmp = startFrac;
      startFrac = endFrac;
      endFrac = tmp;
      recomputeSimulation(true);
    },
  };

  function renderTelemetryCurrent(): void {
    if (
      !simMeta ||
      !targetGrid ||
      !earthGrid ||
      !earthWin ||
      !targetLayers ||
      !earthLayers ||
      !targetTel ||
      !earthTel
    ) {
      return;
    }
    const tInfo = m.targets.find((t) => t.id === targetId);
    const targetShortName = tInfo?.name ?? simMeta.label;
    renderTelemetryPanel(telemetrySlot, {
      targetLabel: targetShortName,
      targetBody: simMeta.body === 'mars' ? 'Mars' : 'Moon',
      targetGrid,
      targetLayers,
      targetRoute,
      targetTel,
      targetSun,
      earthLabel: earthWin.region,
      earthPlace: earthWin.place,
      earthGrid,
      earthLayers,
      earthRoute,
      earthTel,
      earthSun,
      roverProgress,
      onScrubRover: (prog) => {
        roverProgress = prog;
        dualScene.setRoverProgress(roverProgress);
        renderControls();
        renderTelemetryCurrent();
      },
    });
  }

  async function loadTargetAndWindow(newTargetId: string, desiredRank: number): Promise<void> {
    try {
      await loadTargetAndWindowOrThrow(newTargetId, desiredRank);
    } catch (e) {
      if (disposed) return;
      const box = document.createElement('p');
      box.className = 'mission-error'; box.setAttribute('role', 'alert');
      box.textContent = `Mission Rehearsal needs the exported terrain grids, and they could not be loaded: ${e instanceof Error ? e.message : String(e)}`;
      page.prepend(box);
    }
  }

  async function loadTargetAndWindowOrThrow(newTargetId: string, desiredRank: number): Promise<void> {
    targetId = newTargetId;
    simMeta = await loadSimTarget(targetId, m);
    if (disposed) return;

    // Pick window by rank or string match (`site_i_j`)
    if (params.window && isNaN(Number(params.window))) {
      const byKey = simMeta.windows.find(
        (w) => `${w.site}_${w.i}_${w.j}` === params.window || w.site === params.window,
      );
      if (byKey) desiredRank = byKey.rank;
    }
    windowRank = Math.max(1, Math.min(simMeta.windows.length, desiredRank));
    earthWin = simMeta.windows[windowRank - 1] ?? simMeta.windows[0];

    const [tG, eG] = await Promise.all([
      loadSimGrid(simMeta.grid, simMeta.n, simMeta.dx),
      loadSimGrid(earthWin, simMeta.n, simMeta.dx),
    ]);
    if (disposed) return;

    targetGrid = tG;
    earthGrid = eG;
    selectedRehearsalIdx = 0;
    recomputeSimulation(true);
  }

  function recomputeSimulation(rerunRehearsalSearch: boolean): void {
    if (!simMeta || !targetGrid || !earthGrid || !earthWin) return;

    const decl = simMeta.body === 'moon' ? -1.5 : 0;
    // the window's own centre and grid orientation (near the pole the grid is turned up to ~6 deg from north)
    targetSun = sunFromHourAngle(simMeta.grid.lat ?? simMeta.center.lat, sunHourAngleDeg, decl, sunElevDeg, simMeta.grid.up_az ?? 0);

    const tShadow = castShadow(targetGrid, targetSun.elevDeg, targetSun.gridAzDeg);
    const tPlanned = routeBetween(targetGrid, tShadow, startFrac, endFrac);
    targetLayers = tPlanned.layers;
    targetRoute = tPlanned.route;
    targetTel = telemetry(targetGrid, targetLayers, targetRoute, targetSun.elevDeg);

    // Compute Earth route under nominal low-Sun geometry first so rehearse() evaluates along the Earth route
    const nominalEarthShadow = castShadow(earthGrid, targetSun.elevDeg, targetSun.gridAzDeg);
    const eNominalPlanned = routeBetween(earthGrid, nominalEarthShadow, startFrac, endFrac);

    if (rerunRehearsalSearch || !rehearsalPlan) {
      rehearsalPlan = rehearse({
        targetGrid,
        targetRoute,
        targetSun: { elevDeg: targetSun.elevDeg, gridAzDeg: targetSun.gridAzDeg },
        earthGrid,
        earthRoute: eNominalPlanned.route,
        earthLat: earthWin.lat,
        earthLon: earthWin.lon,
        earthUpAzDeg: earthWin.up_az ?? 0,
        elevMinDeg: 0,
        elevMaxDeg: 7,
        azTolDeg: 10,
        maxResults: 8,
      });
      if (selectedRehearsalIdx >= rehearsalPlan.windows.length) {
        selectedRehearsalIdx = 0;
      }
    }

    const activeRehearsalWin = rehearsalPlan.windows[selectedRehearsalIdx] ?? rehearsalPlan.best;
    if (earthSunMode === 'rehearsal' && activeRehearsalWin) {
      earthSun = solarPosition(earthWin.lat, earthWin.lon, Date.parse(activeRehearsalWin.peakIso), earthWin.up_az ?? 0);
    } else {
      earthSun = {
        elevDeg: targetSun.elevDeg,
        azDeg: targetSun.azDeg,
        gridAzDeg: targetSun.gridAzDeg,
      };
    }

    const eShadow = castShadow(earthGrid, earthSun.elevDeg, earthSun.gridAzDeg);
    const ePlanned = routeBetween(earthGrid, eShadow, startFrac, endFrac);
    earthLayers = ePlanned.layers;
    earthRoute = ePlanned.route;
    earthTel = telemetry(earthGrid, earthLayers, earthRoute, earthSun.elevDeg);

    updateUI();
  }

  function updateUI(): void {
    if (
      !simMeta ||
      !targetGrid ||
      !earthGrid ||
      !earthWin ||
      !targetLayers ||
      !earthLayers ||
      !targetTel ||
      !earthTel ||
      !rehearsalPlan
    ) {
      return;
    }

    const tInfo = m.targets.find((t) => t.id === targetId);
    const targetShortName = tInfo?.name ?? simMeta.label;
    const activeRehearsalWin = rehearsalPlan.windows[selectedRehearsalIdx] ?? rehearsalPlan.best;

    // Clean 1-line summary in viewport headers
    targetTitleEl.textContent = simMeta.label;
    targetMetaEl.textContent = `${simMeta.center.lat.toFixed(1)}°, ${simMeta.center.lon.toFixed(1)}° · Sun ${targetSun.elevDeg.toFixed(1)}° · ${(shadowFraction(targetLayers.shadow) * 100).toFixed(0)}% shadow · ${targetTel.length_km.toFixed(2)} km`;

    earthTitleEl.textContent = `#${earthWin.rank} · ${earthWin.region}${earthWin.place ? ` (${earthWin.place})` : ''}`;
    earthMetaEl.textContent =
      earthSunMode === 'rehearsal' && activeRehearsalWin
        ? `${activeRehearsalWin.date} ${activeRehearsalWin.startIso.slice(11, 16)} UTC · Sun ${earthSun.elevDeg.toFixed(1)}° · ${(shadowFraction(earthLayers.shadow) * 100).toFixed(0)}% shadow · ${earthTel.length_km.toFixed(2)} km`
        : `${earthWin.lat.toFixed(2)}°, ${earthWin.lon.toFixed(2)}° · Sun ${earthSun.elevDeg.toFixed(1)}° · ${(shadowFraction(earthLayers.shadow) * 100).toFixed(0)}% shadow · ${earthTel.length_km.toFixed(2)} km`;

    // Update Controls in place
    renderControls();

    // Update 3D / 2D Scene Data
    dualScene.setData(
      {
        body: simMeta.body,
        title: simMeta.label,
        subtitle: '',
        grid: targetGrid,
        layers: targetLayers,
        route: targetRoute,
        sun: targetSun,
      },
      {
        body: 'earth',
        title: earthWin.region,
        subtitle: earthWin.place,
        grid: earthGrid,
        layers: earthLayers,
        route: earthRoute,
        sun: earthSun,
      },
    );

    // Render Rehearse Panel (A2 / U7)
    renderRehearsePanel(rehearseSlot, {
      targetId,
      targetName: targetShortName,
      targetLabel: simMeta.label,
      earthWin,
      earthRoute,
      routeKm: earthTel.length_km,
      plan: rehearsalPlan,
      selectedIdx: selectedRehearsalIdx,
      isEarthSyncedToWindow: earthSunMode === 'rehearsal',
      onSelectWindow: (idx, syncSun) => {
        selectedRehearsalIdx = idx;
        if (syncSun) earthSunMode = 'rehearsal';
        recomputeSimulation(false);
      },
    });

    // Render Side-by-Side Telemetry Panel
    renderTelemetryCurrent();
  }

  function syncAnimationLoop(): void {
    if (animTimer) {
      window.clearInterval(animTimer);
      animTimer = 0;
    }
    if (!playingSun && !drivingRover) return;
    animTimer = window.setInterval(() => {
      if (disposed) return;
      if (drivingRover && !playingSun) {
        roverProgress = (roverProgress + 0.015) % 1;
        dualScene.setRoverProgress(roverProgress);
        renderControls();
        renderTelemetryCurrent();
      } else if (playingSun) {
        if (drivingRover) {
          roverProgress = (roverProgress + 0.015) % 1;
          dualScene.setRoverProgress(roverProgress);
        }
        sunHourAngleDeg = ((sunHourAngleDeg + 190) % 360) - 180;
        recomputeSimulation(true);
      }
    }, 140);
  }

  await loadTargetAndWindow(targetId, windowRank);

  return () => {
    disposed = true;
    if (animTimer) {
      window.clearInterval(animTimer);
      animTimer = 0;
    }
    dualScene.dispose();
  };
}
