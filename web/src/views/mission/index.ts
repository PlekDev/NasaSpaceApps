// AI-assisted (Claude Code); reviewed by the author.
/**
 * Mission Rehearsal 3D (U6 / A1) & "Rehearse this traverse on Earth, on this date" (U7 / A2).
 *
 * Reads as three steps: 1 plan the route (two synchronized 3D scenes, Moon/Mars target vs. an Earth analog
 * window, on 200x200 30 m grids with P.E.N.'s validated ray-cast shadows and a least-cost route that treats
 * slopes over 20 deg as walls), 2 set the target Sun, 3 when does Earth match (a 365-day NOAA solar scan
 * with .ics download and #/dossier hand-off). The verdict sits beside the 3D views so it is on the first screen.
 */
import './mission.css';
import { h } from './dom.ts';
import type { Params } from '../../lib/routes.ts';
import type { Manifest } from '../../types.ts';
import { MissionControls, type EarthSunMode, type MissionControlsCallbacks, type MissionControlsState } from './controls.ts';
import { fmtDate, renderVerdict, renderWindows, updateVerdictRover, type VerdictState } from './rehearse.ts';
import { MissionDualScene, type CameraMode, type PointerTool } from './scene.ts';
import {
  castShadow,
  earthLowSunDirections,
  litProfile,
  loadSimGrid,
  loadSimTarget,
  rehearse,
  routeBetween,
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

/** elevation band of the Earth scan (deg) */
const SCAN_ELEV: [number, number] = [0, 7];

function resolveTargetId(m: Manifest, raw?: string): string {
  if (!raw) return m.targets[0]?.id ?? 'moon_malapert';
  const exact = m.targets.find((t) => t.id === raw);
  if (exact) return exact.id;
  const suffix = m.targets.find(
    (t) => t.id.endsWith(`_${raw}`) || t.name.toLowerCase().includes(raw.toLowerCase()),
  );
  return suffix ? suffix.id : (m.targets[0]?.id ?? 'moon_malapert');
}

function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** one 3D view: canvas plus the overlays drawn over it */
function buildViewport(which: 'target' | 'earth') {
  const canvas = h('canvas', {
    class: 'mission-canvas',
    width: 640,
    height: 400,
    'aria-label': which === 'target' ? 'Target terrain, 3D' : 'Earth analog terrain, 3D',
  }) as HTMLCanvasElement;
  const title = h('p', { class: 'mission-vp-title' }, which === 'target' ? 'Loading target…' : 'Loading Earth analog…');
  const meta = h('p', { class: 'mission-vp-meta' }, '');
  const badge = h('p', { class: 'mission-exag-badge' }, '');
  const wrap = h(
    'div',
    { class: 'mission-vp' },
    canvas,
    h('div', { class: 'mission-vp-id' }, title, meta),
    badge,
  );
  return { wrap, canvas, title, meta, badge };
}

export async function render(el: HTMLElement, m: Manifest, params: Params): Promise<() => void> {
  let disposed = false;

  // Initial state from URL parameters
  let targetId = resolveTargetId(m, params.target);
  let windowRank = Math.max(1, Math.min(5, Number(params.rank || params.window) || 1));
  let exag = Math.max(1, Math.min(5, Number(params.exag) || 2.5));
  let cameraMode: CameraMode =
    params.cam === 'astronaut' || params.cam === 'rover' || params.cam === 'topdown' ? params.cam : 'orbital';
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
  let scanTimer = 0;
  let scanToken = 0;

  // Simulation state for the current target + Earth window
  let simMeta: SimTargetMeta | null = null;
  let targetGrid: Grid | null = null;
  let earthWin: SimWindow | null = null;
  let earthGrid: Grid | null = null;

  let targetSun: SunAngles = sunFromHourAngle(-84.9, sunHourAngleDeg, -1.5, sunElevDeg);
  let earthSun: SunAngles = { elevDeg: 3.0, azDeg: 145, gridAzDeg: 145 };

  let targetLayers: CostLayers | null = null;
  let targetRoute: Array<[number, number]> = [];
  let targetTel: RouteTelemetry | null = null;
  let targetProfile: Uint8Array | null = null;

  let earthLayers: CostLayers | null = null;
  let earthRoute: Array<[number, number]> = [];
  let earthTel: RouteTelemetry | null = null;

  let rehearsalPlan: RehearsalPlan | null = null;
  let verdictState: VerdictState = 'loading';
  let selectedRehearsalIdx = 0;

  let reachKey = '';
  let reachAz: number[] = [];

  // ── DOM ──────────────────────────────────────────────────────────────
  const tVp = buildViewport('target');
  const eVp = buildViewport('earth');
  const verdictSlot = h('div', { class: 'mission-verdict-slot' });
  const windowsSlot = h('div', { class: 'mission-windows-slot' });
  const telemetrySlot = h('div', { class: 'mission-telemetry-slot' });
  const hint = h('span', { class: 'mission-step-hint' }, 'Shift+click a view to move B');
  const sunStepTitle = h('h2', { class: 'mission-step-title' }, 'Set the Sun');
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' }, '');
  let shownState: VerdictState | null = null;
  let shownFidelity: number | null = null;

  const callbacks: MissionControlsCallbacks = {
    onSelectTarget: (newId) => {
      void loadTargetAndWindow(newId, 1);
    },
    onSelectWindow: (newRank) => {
      if (!simMeta) return;
      windowRank = newRank;
      earthWin = simMeta.windows[windowRank - 1] ?? simMeta.windows[0];
      const win = earthWin;
      void loadSimGrid(win, simMeta.n, simMeta.dx).then((g) => {
        if (disposed || win !== earthWin) return;
        earthGrid = g;
        selectedRehearsalIdx = 0;
        recomputeSimulation(true);
      });
    },
    onChangeExag: (k) => {
      exag = k;
      dualScene.setExaggeration(exag);
      syncControls();
      updateOverlays();
    },
    onChangeCameraMode: (mode) => {
      cameraMode = !dualScene.hasWebGLSupport() ? 'topdown' : mode;
      dualScene.setCameraMode(cameraMode);
      syncControls();
    },
    onResetCamera: () => dualScene.resetCamera(),
    onChangePointerTool: (tool) => {
      pointerTool = tool;
      dualScene.setPointerTool(tool);
      hint.textContent = tool === 'start' ? 'Click a view to place A' : tool === 'end' ? 'Click a view to place B' : 'Shift+click a view to move B';
      syncControls();
    },
    onToggleSlopeMask: (show) => {
      showSlopeMask = show;
      dualScene.setShowSlopeMask(show);
      syncControls();
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
      syncControls();
    },
    onToggleDriveRover: () => {
      drivingRover = !drivingRover;
      syncAnimationLoop();
      syncControls();
    },
    onScrubRover: (prog) => setRover(prog),
    onSwapRoute: () => {
      const tmp = startFrac;
      startFrac = endFrac;
      endFrac = tmp;
      recomputeSimulation(true);
    },
  };

  const controls = new MissionControls(m, buildControlsState(false), callbacks);

  const page = h(
    'div',
    { class: 'page-in wide mission mission-page' },
    h(
      'header',
      { class: 'mission-header' },
      h('h1', null, 'Mission rehearsal'),
      h(
        'p',
        { class: 'mission-lead' },
        'Drive a rover across a Moon or Mars site and its Earth twin under the same low Sun, then find the dates when Earth’s sky matches.',
      ),
    ),
    h(
      'div',
      { class: 'mission-main' },
      h(
        'div',
        { class: 'mission-stage' },
        h(
          'section',
          { class: 'mission-step mission-step--route', 'aria-labelledby': 'mission-step1' },
          h(
            'div',
            { class: 'mission-step-head' },
            h('span', { class: 'mission-step-num', 'aria-hidden': 'true' }, '1'),
            h('h2', { class: 'mission-step-title', id: 'mission-step1' }, 'Plan the route'),
            hint,
          ),
          controls.routeBar,
        ),
        h(
          'div',
          { class: 'panel mission-viewer' },
          controls.viewerBar,
          h('div', { class: 'mission-viewports', role: 'group', 'aria-label': 'Target and Earth terrain, synchronized' }, tVp.wrap, eVp.wrap),
          controls.roverBar,
        ),
        h(
          'section',
          { class: 'mission-step mission-step--sun', 'aria-labelledby': 'mission-step2' },
          h(
            'div',
            { class: 'mission-step-head' },
            h('span', { class: 'mission-step-num', 'aria-hidden': 'true' }, '2'),
            sunStepTitle,
          ),
          controls.sunBlock,
        ),
      ),
      h('aside', { class: 'mission-aside', 'aria-label': 'Step 3, when does Earth match' }, verdictSlot),
    ),
    h('div', { class: 'mission-lower' }, windowsSlot, telemetrySlot),
    status,
  );
  sunStepTitle.id = 'mission-step2';

  el.replaceChildren(page);
  // the entrance plays once per visit (mission.css .is-entering); content is whole without it
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    page.classList.add('is-entering');
    window.setTimeout(() => page.classList.remove('is-entering'), 1600);
  }

  const dualScene = new MissionDualScene({
    targetCanvas: tVp.canvas,
    earthCanvas: eVp.canvas,
    onPickPoint: (which, frac) => {
      if (which === 'start') startFrac = frac;
      else endFrac = frac;
      recomputeSimulation(true);
    },
  });

  // WebGL first; falls back to the 2D canvas map
  await dualScene.init();
  if (disposed) {
    dualScene.dispose();
    return () => {};
  }
  if (!dualScene.hasWebGLSupport()) cameraMode = 'topdown';
  dualScene.setExaggeration(exag);
  dualScene.setCameraMode(cameraMode);
  dualScene.setShowSlopeMask(showSlopeMask);

  function bodyName(): string {
    return simMeta?.body === 'mars' ? 'Mars' : 'Moon';
  }

  function activeWindow() {
    return rehearsalPlan ? (rehearsalPlan.windows[selectedRehearsalIdx] ?? rehearsalPlan.best) : null;
  }

  function buildControlsState(webgl = true): MissionControlsState {
    const active = activeWindow();
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
      playingSun,
      drivingRover,
      roverProgress,
      webgl,
      reach: earthWin
        ? {
            site: earthWin.region,
            body: bodyName(),
            reachAz,
            elevBandDeg: SCAN_ELEV,
            earthAzDeg: earthSunMode === 'rehearsal' && active && verdictState !== 'loading' ? active.earthGridAzDeg : null,
          }
        : null,
    };
  }

  function syncControls(): void {
    sunStepTitle.textContent = `Set the Sun on ${bodyName() === 'Mars' ? 'Mars' : 'the Moon'}`;
    controls.sync(buildControlsState(dualScene.hasWebGLSupport()));
  }

  function setRover(prog: number): void {
    roverProgress = prog;
    dualScene.setRoverProgress(roverProgress);
    syncControls();
    updateVerdictRover(verdictSlot, roverProgress);
  }

  function ensureReach(): void {
    if (!earthWin) return;
    const key = `${earthWin.site}_${earthWin.i}_${earthWin.j}`;
    if (key === reachKey) return;
    reachKey = key;
    reachAz = earthLowSunDirections(earthWin.lat, earthWin.lon, SCAN_ELEV[0], SCAN_ELEV[1], earthWin.up_az ?? 0);
  }

  async function loadTargetAndWindow(newTargetId: string, desiredRank: number): Promise<void> {
    try {
      await loadTargetAndWindowOrThrow(newTargetId, desiredRank);
    } catch (e) {
      if (disposed) return;
      const box = document.createElement('p');
      box.className = 'mission-error';
      box.setAttribute('role', 'alert');
      box.textContent = `Mission Rehearsal needs the exported terrain grids, and they could not be loaded: ${e instanceof Error ? e.message : String(e)}`;
      page.prepend(box);
    }
  }

  async function loadTargetAndWindowOrThrow(newTargetId: string, desiredRank: number): Promise<void> {
    targetId = newTargetId;
    simMeta = await loadSimTarget(targetId, m);
    if (disposed) return;

    // window by rank or by key (`site_i_j`)
    if (params.window && isNaN(Number(params.window))) {
      const byKey = simMeta.windows.find((w) => `${w.site}_${w.i}_${w.j}` === params.window || w.site === params.window);
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

  /** target Sun, shadows, route and telemetry */
  function computeTarget(): void {
    if (!simMeta || !targetGrid) return;
    const decl = simMeta.body === 'moon' ? -1.5 : 0;
    // the window's own centre and grid orientation (near the pole the grid is turned up to ~6 deg from north)
    targetSun = sunFromHourAngle(simMeta.grid.lat ?? simMeta.center.lat, sunHourAngleDeg, decl, sunElevDeg, simMeta.grid.up_az ?? 0);
    const tShadow = castShadow(targetGrid, targetSun.elevDeg, targetSun.gridAzDeg);
    const planned = routeBetween(targetGrid, tShadow, startFrac, endFrac);
    targetLayers = planned.layers;
    targetRoute = planned.route;
    targetTel = telemetry(targetGrid, targetLayers, targetRoute, targetSun.elevDeg);
    targetProfile = litProfile(targetLayers.shadow, targetGrid.cols, targetRoute, 101);
  }

  /** the 365-day scan at the Earth window */
  function runScan(): void {
    if (!simMeta || !targetGrid || !earthGrid || !earthWin) return;
    // Earth route under the target's low Sun, so the scan scores the Earth route
    const nominal = castShadow(earthGrid, targetSun.elevDeg, targetSun.gridAzDeg);
    const eNominal = routeBetween(earthGrid, nominal, startFrac, endFrac);
    rehearsalPlan = rehearse({
      targetGrid,
      targetRoute,
      targetSun: { elevDeg: targetSun.elevDeg, gridAzDeg: targetSun.gridAzDeg },
      earthGrid,
      earthRoute: eNominal.route,
      earthLat: earthWin.lat,
      earthLon: earthWin.lon,
      earthUpAzDeg: earthWin.up_az ?? 0,
      elevMinDeg: SCAN_ELEV[0],
      elevMaxDeg: SCAN_ELEV[1],
      azTolDeg: 10,
      maxResults: 30,
    });
    if (selectedRehearsalIdx >= rehearsalPlan.windows.length) selectedRehearsalIdx = 0;
    verdictState = rehearsalPlan.best && rehearsalPlan.exactAzimuthMatch ? 'good' : 'nomatch';
  }

  /** Earth Sun (rehearsal date or mirrored target Sun), shadows, route and telemetry */
  function computeEarth(): void {
    if (!earthGrid || !earthWin) return;
    const active = activeWindow();
    if (earthSunMode === 'rehearsal' && active) {
      earthSun = solarPosition(earthWin.lat, earthWin.lon, Date.parse(active.peakIso), earthWin.up_az ?? 0);
    } else {
      earthSun = { elevDeg: targetSun.elevDeg, azDeg: targetSun.azDeg, gridAzDeg: targetSun.gridAzDeg };
    }
    const eShadow = castShadow(earthGrid, earthSun.elevDeg, earthSun.gridAzDeg);
    const planned = routeBetween(earthGrid, eShadow, startFrac, endFrac);
    earthLayers = planned.layers;
    earthRoute = planned.route;
    earthTel = telemetry(earthGrid, earthLayers, earthRoute, earthSun.elevDeg);
  }

  function recomputeSimulation(rerunScan: boolean): void {
    if (!simMeta || !targetGrid || !earthGrid || !earthWin) return;
    ensureReach();
    computeTarget();

    if (!rerunScan && rehearsalPlan) {
      computeEarth();
      updateUI();
      return;
    }

    // While the Sun plays, scan inline: a loading flash on every frame would only flicker.
    if (playingSun) {
      runScan();
      computeEarth();
      updateUI();
      return;
    }

    // Show the loading verdict, let the browser paint it, then scan. Rapid slider input only scans once.
    verdictState = 'loading';
    if (!earthLayers || earthSunMode === 'mirror') computeEarth();
    updateUI();
    window.clearTimeout(scanTimer);
    const token = ++scanToken;
    scanTimer = window.setTimeout(() => {
      if (disposed || token !== scanToken) return;
      runScan();
      computeEarth();
      updateUI();
    }, 60);
  }

  function updateOverlays(): void {
    if (!simMeta || !earthWin || !targetTel || !earthTel) return;
    const tInfo = m.targets.find((t) => t.id === targetId);
    const active = activeWindow();
    const km = ((simMeta.n * simMeta.dx) / 1000).toFixed(0);
    const scale = `Vert ×${exag.toFixed(1)} · ${km} × ${km} km · ${simMeta.dx} m/px`;

    tVp.title.textContent = `${bodyName()} · ${tInfo?.name ?? simMeta.label}`;
    tVp.meta.textContent = `Sun ${targetSun.elevDeg.toFixed(1)}° el, ${Math.round(norm360(targetSun.gridAzDeg))}° az · route ${Math.round(targetTel.litShareNow * 100)} % lit`;
    tVp.badge.textContent = scale;

    eVp.title.textContent = `Earth · ${earthWin.region}`;
    const when =
      earthSunMode === 'rehearsal' && active && verdictState !== 'loading'
        ? `${fmtDate(active.date, false)} ${active.peakIso.slice(11, 16)} UTC`
        : earthSunMode === 'mirror'
          ? 'Mirrored Sun'
          : 'Scanning…';
    eVp.meta.textContent = `${when} · Sun ${earthSun.elevDeg.toFixed(1)}° el, ${Math.round(norm360(earthSun.gridAzDeg))}° az · route ${Math.round(earthTel.litShareNow * 100)} % lit`;
    eVp.badge.textContent = scale;
  }

  function updateUI(): void {
    if (!simMeta || !targetGrid || !earthGrid || !earthWin || !targetLayers || !earthLayers || !targetTel || !earthTel) {
      return;
    }
    const tInfo = m.targets.find((t) => t.id === targetId);
    const targetShortName = tInfo?.name ?? simMeta.label;

    syncControls();
    updateOverlays();

    dualScene.setData(
      { body: simMeta.body, title: simMeta.label, subtitle: '', grid: targetGrid, layers: targetLayers, route: targetRoute, sun: targetSun },
      { body: 'earth', title: earthWin.region, subtitle: earthWin.place, grid: earthGrid, layers: earthLayers, route: earthRoute, sun: earthSun },
    );

    const onSelectWindow = (idx: number) => {
      selectedRehearsalIdx = idx;
      earthSunMode = 'rehearsal';
      recomputeSimulation(false);
    };

    renderVerdict(verdictSlot, {
      state: verdictState,
      targetId,
      targetBody: bodyName(),
      targetName: targetShortName,
      targetLabel: simMeta.label,
      earthWin,
      earthRoute,
      routeKm: earthTel.length_km,
      plan: verdictState === 'loading' ? null : rehearsalPlan,
      targetProfile,
      targetAzDeg: targetSun.gridAzDeg,
      selectedIdx: selectedRehearsalIdx,
      roverProgress,
      reachAz,
      onSelectWindow,
      onSnapSun: (gridAz) => snapSunTo(gridAz),
      onPickAnotherSite: () => {
        controls.windowSelect.focus();
        controls.windowSelect.scrollIntoView({ block: 'center', behavior: 'auto' });
      },
      reveal: shownState === 'loading' && verdictState !== 'loading',
      fromFidelity: shownFidelity,
    });
    const shownWin = verdictState === 'loading' ? null : activeWindow();
    if (verdictState !== shownState || (shownWin?.fidelity ?? null) !== shownFidelity) {
      status.textContent =
        verdictState === 'loading'
          ? `Scanning 365 days at ${earthWin.region}…`
          : verdictState === 'good' && shownWin
            ? `Rehearse on ${fmtDate(shownWin.date)}, ${shownWin.startIso.slice(11, 16)} to ${shownWin.endIso.slice(11, 16)} UTC. Fidelity ${shownWin.fidelity.toFixed(1)} %.`
            : `No date at ${earthWin.region} has this Sun direction.${shownWin ? ` Best fidelity ${shownWin.fidelity.toFixed(1)} %.` : ''}`;
    }
    shownState = verdictState;
    shownFidelity = shownWin?.fidelity ?? null;

    renderWindows(windowsSlot, {
      site: earthWin.region,
      plan: verdictState === 'loading' ? null : rehearsalPlan,
      selectedIdx: selectedRehearsalIdx,
      onSelectWindow,
    });

    renderTelemetryPanel(telemetrySlot, { targetBody: bodyName(), targetTel, earthTel, dx: simMeta.dx });
  }

  /** move the target Sun (hour-angle slider, 5 deg steps) to the direction closest to `gridAz` */
  function snapSunTo(gridAz: number): void {
    if (!simMeta) return;
    const decl = simMeta.body === 'moon' ? -1.5 : 0;
    const lat = simMeta.grid.lat ?? simMeta.center.lat;
    let bestHa = sunHourAngleDeg;
    let bestD = Infinity;
    for (let ha = -180; ha <= 180; ha += 5) {
      const s = sunFromHourAngle(lat, ha, decl, sunElevDeg, simMeta.grid.up_az ?? 0);
      const d = Math.abs(norm360(s.gridAzDeg - gridAz + 180) - 180);
      if (d < bestD) {
        bestD = d;
        bestHa = ha;
      }
    }
    sunHourAngleDeg = bestHa;
    selectedRehearsalIdx = 0;
    recomputeSimulation(true);
  }

  function syncAnimationLoop(): void {
    if (animTimer) {
      window.clearInterval(animTimer);
      animTimer = 0;
    }
    if (!playingSun && !drivingRover) return;
    animTimer = window.setInterval(() => {
      if (disposed) return;
      if (drivingRover) setRover((roverProgress + 0.015) % 1);
      if (playingSun) {
        sunHourAngleDeg = ((sunHourAngleDeg + 190) % 360) - 180;
        recomputeSimulation(true);
      }
    }, 140);
  }

  await loadTargetAndWindow(targetId, windowRank);

  return () => {
    disposed = true;
    if (animTimer) window.clearInterval(animTimer);
    window.clearTimeout(scanTimer);
    animTimer = 0;
    dualScene.dispose();
  };
}
