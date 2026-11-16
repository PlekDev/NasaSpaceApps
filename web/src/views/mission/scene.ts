// AI-assisted (Claude Code); reviewed by the author.
/**
 * Synchronized Dual-Viewport 3D Terrain & Rover Renderer (Moon/Mars | Earth)
 * with automatic 2D Canvas top-down fallback when WebGL is unavailable.
 *
 * Uses P.E.N.'s validated ray-cast shadow model (`castShadow` + `hillshade`)
 * baked directly into the 200x200 terrain mesh texture so visual shadows
 * strictly match the pipeline's LOLA/MOLA metrics.
 */
import { loadThree } from '../../lib/three.ts';
import { buildRover, type RoverModel } from './rover3d.ts';
import {
  DEG,
  SLOPE_MAX_DEG,
  exaggerated,
  hillshade,
  type CostLayers,
  type Grid,
  type SunAngles,
} from './sim.ts';

export type CameraMode = 'orbital' | 'astronaut' | 'rover' | 'topdown';
export type PointerTool = 'orbit' | 'start' | 'end';

export interface SceneSideData {
  body: 'moon' | 'mars' | 'earth' | string;
  title: string;
  subtitle: string;
  grid: Grid;
  layers: CostLayers;
  route: ReadonlyArray<readonly [number, number]>;
  sun: SunAngles;
}

export interface DualSceneOptions {
  targetCanvas: HTMLCanvasElement;
  earthCanvas: HTMLCanvasElement;
  onPickPoint: (which: 'start' | 'end', frac: [number, number]) => void;
  onCameraModeChange?: (mode: CameraMode) => void;
}

interface SideWebGLObjects {
  scene: any;
  terrainMesh: any;
  terrainGeo: any;
  terrainTex: any;
  texBytes: Uint8Array;
  routeLine: any | null;
  roverGroup: any;
  rover: RoverModel;
  startPin: any;
  endPin: any;
  sunArrow: any;
  exagZ: Float32Array;
}

/* Terrain encoding shared by the 3D texture and the 2D map (Mission redesign):
 *  lit    = the body's hillshade, floored so no lit face goes darker than shadow, with a warm lift toward #ffd166
 *  shadow = #56698a, a steel blue a clear lightness step below lit, modulated lightly by relief
 *  wall   = 55 % #d55e00 over the ground (slope > 20 deg), a warm lightness step against shadow */
const LIT_TINT = [255, 209, 102];
const SHADOW_RGB = [86, 105, 138];
const WALL_RGB = [213, 94, 0];
export const ROUTE_RGB = [0.96, 0.97, 0.98];

function terrainRGB(
  out: Uint8Array | Uint8ClampedArray,
  p: number,
  shade: number,
  inShadow: boolean,
  wall: boolean,
  isMoon: boolean,
  isMars: boolean,
  idx: number,
  cols: number,
): void {
  let r: number;
  let g: number;
  let b: number;
  if (inShadow) {
    const k = 0.82 + 0.3 * Math.min(1, shade);
    r = SHADOW_RGB[0] * k;
    g = SHADOW_RGB[1] * k;
    b = SHADOW_RGB[2] * k;
  } else {
    const s = 0.55 + 0.45 * Math.min(1, shade);
    const base = isMoon ? [214, 218, 226] : isMars ? [234, 182, 146] : [200, 210, 218];
    r = base[0] * s * 0.82 + LIT_TINT[0] * s * 0.18;
    g = base[1] * s * 0.82 + LIT_TINT[1] * s * 0.18;
    b = base[2] * s * 0.82 + LIT_TINT[2] * s * 0.18;
  }
  if (wall) {
    // an even warm tint: a hatch at 30 m/px breaks into dashes, so the wall is a colour and lightness step instead
    r = r * 0.45 + WALL_RGB[0] * 0.55;
    g = g * 0.45 + WALL_RGB[1] * 0.55;
    b = b * 0.45 + WALL_RGB[2] * 0.55;
  }
  out[p] = Math.max(0, Math.min(255, r));
  out[p + 1] = Math.max(0, Math.min(255, g));
  out[p + 2] = Math.max(0, Math.min(255, b));
  out[p + 3] = 255;
}

export class MissionDualScene {
  private targetCanvas: HTMLCanvasElement;
  private earthCanvas: HTMLCanvasElement;
  private onPickPoint: (which: 'start' | 'end', frac: [number, number]) => void;

  private THREE: any = null;
  private glRenderer: any = null;
  private glCamera: any = null;
  private webglAvailable = false;
  private disposed = false;

  private targetSide: SideWebGLObjects | null = null;
  private earthSide: SideWebGLObjects | null = null;

  private targetData: SceneSideData | null = null;
  private earthData: SceneSideData | null = null;

  private exag = 2.5;
  private cameraMode: CameraMode = 'orbital';
  private pointerTool: PointerTool = 'orbit';
  private showSlopeMask = true;
  private roverProgress = 0; // 0..1 along route

  // Synchronized orbital / chase / astronaut camera state
  private orbitAz = -0.65; // radians
  private orbitEl = 0.62; // radians above horizon
  private orbitDist = 6600; // meters
  private panX = 0;
  private panZ = 0;
  private lookYawOffset = 0; // radians (astronaut / rover drag-look)
  private lookPitchOffset = 0; // radians (astronaut / rover drag-look)
  private chaseDist = 320; // meters behind rover in chase cam
  private camFov = 45; // degrees (wheel zoom in astronaut mode)

  private dragging = false;
  private dragPanning = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private resizeObserver: ResizeObserver | null = null;
  private rafId = 0;

  constructor(opts: DualSceneOptions) {
    this.targetCanvas = opts.targetCanvas;
    this.earthCanvas = opts.earthCanvas;
    this.onPickPoint = opts.onPickPoint;
    this.bindInteractions(this.targetCanvas, 'target');
    this.bindInteractions(this.earthCanvas, 'earth');
    this.setPointerTool(this.pointerTool);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.requestRender());
      this.resizeObserver.observe(this.targetCanvas);
      this.resizeObserver.observe(this.earthCanvas);
    }
  }

  async init(): Promise<boolean> {
    try {
      const THREE = await loadThree();
      if (this.disposed) return false;
      const offscreen = document.createElement('canvas');
      offscreen.width = 640;
      offscreen.height = 440;
      const glRenderer = new THREE.WebGLRenderer({
        canvas: offscreen,
        antialias: true,
        powerPreference: 'high-performance',
      });
      glRenderer.setPixelRatio(1);
      const glCamera = new THREE.PerspectiveCamera(45, 640 / 440, 2, 30000);

      this.THREE = THREE;
      this.glRenderer = glRenderer;
      this.glCamera = glCamera;
      this.webglAvailable = true;

      this.targetSide = this.createSideObjects('moon');
      this.earthSide = this.createSideObjects('earth');

      if (this.targetData) this.rebuildSide('target');
      if (this.earthData) this.rebuildSide('earth');
      this.requestRender();
      return true;
    } catch {
      this.webglAvailable = false;
      this.cameraMode = 'topdown';
      this.requestRender();
      return false;
    }
  }

  isWebGLActive(): boolean {
    return this.webglAvailable && this.cameraMode !== 'topdown';
  }

  hasWebGLSupport(): boolean {
    return this.webglAvailable;
  }

  setExaggeration(k: number): void {
    this.exag = Math.max(1, Math.min(5, k));
    if (this.webglAvailable) {
      if (this.targetData && this.targetSide) this.updateMeshGeometry(this.targetSide, this.targetData);
      if (this.earthData && this.earthSide) this.updateMeshGeometry(this.earthSide, this.earthData);
    }
    this.requestRender();
  }

  getExaggeration(): number {
    return this.exag;
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.lookYawOffset = 0;
    this.lookPitchOffset = 0;
    for (const side of [this.targetSide, this.earthSide]) {
      if (!side) continue;
      side.startPin.visible = mode === 'orbital';
      side.endPin.visible = mode === 'orbital';
    }
    this.requestRender();
  }

  getCameraMode(): CameraMode {
    return this.webglAvailable ? this.cameraMode : 'topdown';
  }

  setPointerTool(tool: PointerTool): void {
    this.pointerTool = tool;
    const cursor = tool === 'orbit' ? 'grab' : 'crosshair';
    this.targetCanvas.style.cursor = cursor;
    this.earthCanvas.style.cursor = cursor;
  }

  getPointerTool(): PointerTool {
    return this.pointerTool;
  }

  setShowSlopeMask(show: boolean): void {
    this.showSlopeMask = show;
    if (this.webglAvailable) {
      if (this.targetData && this.targetSide) this.updateMeshTexture(this.targetSide, this.targetData);
      if (this.earthData && this.earthSide) this.updateMeshTexture(this.earthSide, this.earthData);
    }
    this.requestRender();
  }

  setRoverProgress(t: number): void {
    this.roverProgress = Math.max(0, Math.min(1, t));
    if (this.webglAvailable) {
      if (this.targetData && this.targetSide) this.updateRoverPose(this.targetSide, this.targetData);
      if (this.earthData && this.earthSide) this.updateRoverPose(this.earthSide, this.earthData);
    }
    this.requestRender();
  }

  getRoverProgress(): number {
    return this.roverProgress;
  }

  resetCamera(): void {
    this.orbitAz = -0.65;
    this.orbitEl = 0.62;
    this.orbitDist = 6600;
    this.panX = 0;
    this.panZ = 0;
    this.lookYawOffset = 0;
    this.lookPitchOffset = 0;
    this.chaseDist = 320;
    this.camFov = 45;
    this.requestRender();
  }

  setData(target: SceneSideData, earth: SceneSideData): void {
    this.targetData = target;
    this.earthData = earth;
    if (this.webglAvailable) {
      this.rebuildSide('target');
      this.rebuildSide('earth');
    }
    this.requestRender();
  }

  private createSideObjects(body: string): SideWebGLObjects {
    const THREE = this.THREE;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(body === 'earth' ? 0x0b1220 : body === 'mars' ? 0x160e0b : 0x070a10);

    const n = 200;
    const sizeM = (n - 1) * 30;
    const terrainGeo = new THREE.PlaneGeometry(sizeM, sizeM, n - 1, n - 1);
    terrainGeo.rotateX(-Math.PI / 2);

    const texBytes = new Uint8Array(n * n * 4);
    const terrainTex = new THREE.DataTexture(texBytes, n, n, THREE.RGBAFormat);
    terrainTex.flipY = true;
    terrainTex.magFilter = THREE.LinearFilter;
    terrainTex.minFilter = THREE.LinearFilter;
    terrainTex.generateMipmaps = false;
    if ('SRGBColorSpace' in THREE) {
      terrainTex.colorSpace = THREE.SRGBColorSpace;
    }
    terrainTex.needsUpdate = true;

    const terrainMat = new THREE.MeshBasicMaterial({ map: terrainTex });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    // Subtle 1 km reference wireframe grid underneath
    const gridHelper = new THREE.GridHelper(6000, 6, 0x2c3b59, 0x1a2336);
    gridHelper.position.y = -420;
    scene.add(gridHelper);

    // Start (A) and End (B) vertical beacon pins
    const makePin = (hex: number) => {
      const group = new THREE.Group();
      // a thin survey stake with a square flag: reads at orbit distance, stays out of the way up close
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(3.5, 3.5, 170, 8),
        new THREE.MeshBasicMaterial({ color: 0x8a99ab }),
      );
      pole.position.y = 85;
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(34, 22, 3),
        new THREE.MeshBasicMaterial({ color: hex }),
      );
      head.position.set(17, 158, 0);
      group.add(pole, head);
      return group;
    };
    const startPin = makePin(0xeef2f6);
    const endPin = makePin(0xeef2f6);
    scene.add(startPin, endPin);

    // Rover: a rocker-bogie model lit by the scene's own Sun (rover3d.ts)
    const rover = buildRover(THREE);
    const roverGroup = rover.group;
    scene.add(roverGroup, rover.light);

    // Sun direction indicator arrow hovering above terrain
    const sunArrow = new THREE.Group();
    scene.add(sunArrow);

    return {
      scene,
      terrainMesh,
      terrainGeo,
      terrainTex,
      texBytes,
      routeLine: null,
      roverGroup,
      rover,
      startPin,
      endPin,
      sunArrow,
      exagZ: new Float32Array(n * n),
    };
  }

  private rebuildSide(which: 'target' | 'earth'): void {
    const side = which === 'target' ? this.targetSide : this.earthSide;
    const data = which === 'target' ? this.targetData : this.earthData;
    if (!side || !data || !this.THREE) return;

    const bgHex =
      data.body === 'earth' ? 0x0a1322 : data.body === 'mars' ? 0x170e0b : 0x070a0f;
    side.scene.background.setHex(bgHex);

    this.updateMeshTexture(side, data);
    this.updateMeshGeometry(side, data);
  }

  private updateMeshTexture(side: SideWebGLObjects, data: SceneSideData): void {
    const { grid, layers, sun, body } = data;
    const shade = hillshade(grid, sun.elevDeg, sun.gridAzDeg, layers.shadow, 0.22);
    const n = grid.rows * grid.cols;
    const bytes = side.texBytes;

    // Color palette tuned per body (Moon: regolith neutral; Mars: ochre; Earth: basalt/alpine slate)
    const isMoon = body === 'moon';
    const isMars = body === 'mars';

    for (let i = 0; i < n; i++) {
      const imp = this.showSlopeMask && layers.impassable[i] === 1;
      terrainRGB(bytes, i * 4, shade[i], layers.shadow[i] === 1, imp, isMoon, isMars, i, grid.cols);
    }

    side.terrainTex.needsUpdate = true;
  }

  private cellToWorld(grid: Grid, exagZ: Float32Array, r: number, c: number): [number, number, number] {
    const halfR = (grid.rows - 1) * 0.5;
    const halfC = (grid.cols - 1) * 0.5;
    const ri = Math.max(0, Math.min(grid.rows - 1, Math.round(r)));
    const ci = Math.max(0, Math.min(grid.cols - 1, Math.round(c)));
    const x = (c - halfC) * grid.dx;
    const z = (r - halfR) * grid.dx;
    const y = exagZ[ri * grid.cols + ci] ?? 0;
    return [x, y, z];
  }

  private updateMeshGeometry(side: SideWebGLObjects, data: SceneSideData): void {
    const THREE = this.THREE;
    const { grid, layers, route } = data;
    side.exagZ = exaggerated(grid, this.exag);

    const pos = side.terrainGeo.attributes.position;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < side.exagZ.length; i++) {
      arr[i * 3 + 1] = side.exagZ[i];
    }
    pos.needsUpdate = true;
    side.terrainGeo.computeVertexNormals();

    // Rebuild the 3D route line
    if (side.routeLine) {
      side.scene.remove(side.routeLine);
      side.routeLine.geometry.dispose();
      side.routeLine.material.dispose();
      side.routeLine = null;
    }

    if (route.length >= 2) {
      const pts: number[] = [];
      const cols: number[] = [];
      for (let k = 0; k < route.length; k++) {
        const [r, c] = route[k];
        const [wx, wy, wz] = this.cellToWorld(grid, side.exagZ, r, c);
        pts.push(wx, wy + 16, wz);
        // one light route colour: lit vs shadow is read from the terrain under it
        cols.push(ROUTE_RGB[0], ROUTE_RGB[1], ROUTE_RGB[2]);
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 });
      side.routeLine = new THREE.Line(lineGeo, lineMat);
      side.scene.add(side.routeLine);
    }

    // Position Start (A) and End (B) pins
    if (route.length >= 1) {
      const [sr, sc] = route[0];
      const [er, ec] = route[route.length - 1];
      const [sx, sy, sz] = this.cellToWorld(grid, side.exagZ, sr, sc);
      const [ex, ey, ez] = this.cellToWorld(grid, side.exagZ, er, ec);
      side.startPin.position.set(sx, sy, sz);
      side.endPin.position.set(ex, ey, ez);
      // stakes only in the orbital view; up close they stand between the camera and the rover
      side.startPin.visible = this.cameraMode === 'orbital';
      side.endPin.visible = this.cameraMode === 'orbital';
    } else {
      side.startPin.visible = false;
      side.endPin.visible = false;
    }

    this.updateRoverPose(side, data);
  }

  private sampleRoutePose(
    grid: Grid,
    exagZ: Float32Array,
    route: ReadonlyArray<readonly [number, number]>,
    t: number,
  ): { x: number; y: number; z: number; realY: number; headingRad: number; row: number; col: number } {
    if (route.length === 0) {
      return { x: 0, y: 0, z: 0, realY: 0, headingRad: 0, row: 100, col: 100 };
    }
    if (route.length === 1) {
      const [r, c] = route[0];
      const [x, y, z] = this.cellToWorld(grid, exagZ, r, c);
      return { x, y, z, realY: grid.z[r * grid.cols + c], headingRad: 0, row: r, col: c };
    }
    const idxFloat = Math.max(0, Math.min(route.length - 1, t * (route.length - 1)));
    const i0 = Math.min(route.length - 2, Math.floor(idxFloat));
    const i1 = i0 + 1;
    const frac = idxFloat - i0;
    const [r0, c0] = route[i0];
    const [r1, c1] = route[i1];
    const r = r0 + (r1 - r0) * frac;
    const c = c0 + (c1 - c0) * frac;
    const [x0, y0, z0] = this.cellToWorld(grid, exagZ, r0, c0);
    const [x1, y1, z1] = this.cellToWorld(grid, exagZ, r1, c1);
    const x = x0 + (x1 - x0) * frac;
    const y = y0 + (y1 - y0) * frac;
    const z = z0 + (z1 - z0) * frac;
    const rz0 = grid.z[r0 * grid.cols + c0];
    const rz1 = grid.z[r1 * grid.cols + c1];
    const realY = rz0 + (rz1 - rz0) * frac;
    const headingRad = Math.atan2(x1 - x0, z1 - z0);
    return { x, y, z, realY, headingRad, row: r, col: c };
  }

  private updateRoverPose(side: SideWebGLObjects, data: SceneSideData): void {
    const t = this.roverProgress;
    const pose = this.sampleRoutePose(data.grid, side.exagZ, data.route, t);
    side.roverGroup.position.set(pose.x, pose.y, pose.z);
    side.roverGroup.rotation.y = pose.headingRad;
    // pitch with the ground: compare the surface just ahead and just behind
    const a = this.sampleRoutePose(data.grid, side.exagZ, data.route, Math.max(0, t - 0.006));
    const b = this.sampleRoutePose(data.grid, side.exagZ, data.route, Math.min(1, t + 0.006));
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    const pitch = run > 1 ? Math.atan2(b.y - a.y, run) : 0;
    side.roverGroup.rotation.x = -Math.max(-0.45, Math.min(0.45, pitch));
    // wheels turn with the distance driven
    let len = 0;
    const r = data.route;
    for (let k = 1; k < r.length; k++) len += Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]);
    side.rover.spin(len * data.grid.dx * t);
    side.rover.setSun(data.sun.gridAzDeg, data.sun.elevDeg);
  }

  private configureCameraForSide(side: SideWebGLObjects, data: SceneSideData, aspect: number): void {
    const cam = this.glCamera;
    cam.aspect = aspect;
    cam.fov = this.cameraMode === 'astronaut' ? this.camFov : 45;
    cam.updateProjectionMatrix();

    const pose = this.sampleRoutePose(data.grid, side.exagZ, data.route, this.roverProgress);

    if (this.cameraMode === 'astronaut') {
      // Eye height 1.7 m above local terrain surface (scaled by exaggeration for mesh clearance)
      const eyeOffset = 1.7 * this.exag + 6;
      const yaw = pose.headingRad + this.lookYawOffset;
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      cam.position.set(pose.x, pose.y + eyeOffset, pose.z);
      // Look 240 m ahead along the view yaw + pitch offset
      const lookR = pose.row + (forwardZ * 240) / data.grid.dx;
      const lookC = pose.col + (forwardX * 240) / data.grid.dx;
      const [lx, ly, lz] = this.cellToWorld(data.grid, side.exagZ, lookR, lookC);
      const pitchY = Math.tan(this.lookPitchOffset) * 240;
      cam.lookAt(lx, ly + eyeOffset * 0.7 + pitchY, lz);
    } else if (this.cameraMode === 'rover') {
      // Chase camera orbiting behind the traversing rover
      const yaw = pose.headingRad + this.lookYawOffset;
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const heightOffset = Math.max(
        45,
        (this.chaseDist / 320) * (150 + 18 * this.exag) + Math.sin(this.lookPitchOffset) * 180,
      );
      cam.position.set(
        pose.x - forwardX * this.chaseDist,
        pose.y + heightOffset,
        pose.z - forwardZ * this.chaseDist,
      );
      cam.lookAt(
        pose.x + forwardX * 180,
        pose.y + 25 + Math.sin(this.lookPitchOffset) * 60,
        pose.z + forwardZ * 180,
      );
    } else {
      // Synchronized Orbital camera
      const cosEl = Math.cos(this.orbitEl);
      const cx = this.panX + this.orbitDist * cosEl * Math.sin(this.orbitAz);
      const cy = this.orbitDist * Math.sin(this.orbitEl);
      const cz = this.panZ + this.orbitDist * cosEl * Math.cos(this.orbitAz);
      cam.position.set(cx, cy, cz);
      cam.lookAt(this.panX, 0, this.panZ);
    }
  }

  requestRender(): void {
    if (this.disposed || this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.renderNow();
    });
  }

  renderNow(): void {
    if (this.disposed) return;
    if (this.targetData) {
      this.renderViewport(this.targetCanvas, this.targetSide, this.targetData);
    }
    if (this.earthData) {
      this.renderViewport(this.earthCanvas, this.earthSide, this.earthData);
    }
  }

  private renderViewport(
    canvas: HTMLCanvasElement,
    side: SideWebGLObjects | null,
    data: SceneSideData,
  ): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(280, Math.round((rect.width || canvas.width || 560) * dpr));
    const h = Math.max(220, Math.round((rect.height || canvas.height || 400) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.webglAvailable && side && this.cameraMode !== 'topdown') {
      this.glRenderer.setSize(w, h, false);
      this.configureCameraForSide(side, data, w / h);
      this.glRenderer.render(side.scene, this.glCamera);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(this.glRenderer.domElement, 0, 0, w, h);
      this.draw3DOverlayHUD(ctx, w, h, dpr, side, data);
    } else {
      this.render2DFallback(ctx, w, h, dpr, data);
    }
  }

  private projectToScreen(
    wx: number,
    wy: number,
    wz: number,
    w: number,
    h: number,
  ): { x: number; y: number; visible: boolean } {
    if (!this.THREE || !this.glCamera) return { x: 0, y: 0, visible: false };
    const v = new this.THREE.Vector3(wx, wy, wz);
    v.project(this.glCamera);
    if (v.z < -1 || v.z > 1) return { x: 0, y: 0, visible: false };
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: true,
    };
  }

  private draw3DOverlayHUD(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number,
    side: SideWebGLObjects,
    data: SceneSideData,
  ): void {
    ctx.save();
    // Project Start (A), End (B), and Rover badges
    if (data.route.length >= 1) {
      const [sr, sc] = data.route[0];
      const [er, ec] = data.route[data.route.length - 1];
      const [sx, sy, sz] = this.cellToWorld(data.grid, side.exagZ, sr, sc);
      const [ex, ey, ez] = this.cellToWorld(data.grid, side.exagZ, er, ec);

      const sp = this.projectToScreen(sx, sy + 220, sz, w, h);
      if (sp.visible) this.drawPinBadge(ctx, sp.x, sp.y, dpr, 'A');

      const ep = this.projectToScreen(ex, ey + 220, ez, w, h);
      if (ep.visible) this.drawPinBadge(ctx, ep.x, ep.y, dpr, 'B');

      const pose = this.sampleRoutePose(data.grid, side.exagZ, data.route, this.roverProgress);
      const rp = this.projectToScreen(pose.x, pose.y + 150, pose.z, w, h);
      if (rp.visible && this.cameraMode === 'orbital') {
        this.drawTag(ctx, rp.x, rp.y, dpr, `Rover · ${Math.round(pose.realY)} m`);
      }
    }

    // the compass turns with the camera: screen-up is the view direction
    const dir = new this.THREE.Vector3();
    this.glCamera.getWorldDirection(dir);
    const viewHeadingDeg = Math.hypot(dir.x, dir.z) > 1e-6 ? Math.atan2(dir.x, -dir.z) / DEG : 0;
    this.drawSunCompass(ctx, w - 34 * dpr, 34 * dpr, 22 * dpr, dpr, data.sun, viewHeadingDeg);
    ctx.restore();
  }

  private render2DFallback(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number,
    data: SceneSideData,
  ): void {
    const { grid, layers, route, sun, body } = data;
    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, w, h);

    const pad = 18 * dpr;
    const mapSize = Math.max(120, Math.min(w - pad * 2, h - pad * 2.4));
    const ox = Math.round((w - mapSize) * 0.5);
    const oy = Math.round((h - mapSize) * 0.46);

    // Build hillshade ImageData at 200x200 and draw scaled onto map rect
    const shade = hillshade(grid, sun.elevDeg, sun.gridAzDeg, layers.shadow, 0.22);
    const off = document.createElement('canvas');
    off.width = grid.cols;
    off.height = grid.rows;
    const octx = off.getContext('2d');
    if (octx) {
      const img = octx.createImageData(grid.cols, grid.rows);
      const bytes = img.data;
      const isMoon = body === 'moon';
      const isMars = body === 'mars';
      for (let i = 0; i < shade.length; i++) {
        const imp = this.showSlopeMask && layers.impassable[i] === 1;
        terrainRGB(bytes, i * 4, shade[i], layers.shadow[i] === 1, imp, isMoon, isMars, i, grid.cols);
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, ox, oy, mapSize, mapSize);
    }

    // Border around 6x6 km window
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(ox, oy, mapSize, mapSize);

    // Planned route: dark casing under a light line, so it reads on lit and shadowed ground alike
    if (route.length >= 2) {
      const pts = route.map(([r, c]) => [ox + (c / (grid.cols - 1)) * mapSize, oy + (r / (grid.rows - 1)) * mapSize] as const);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [style, width] of [['rgba(5,7,11,0.85)', 5], ['#f5f7fa', 2.5]] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width * dpr;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
      }
    }

    if (route.length >= 1) {
      const [sr, sc] = route[0];
      const [er, ec] = route[route.length - 1];
      this.drawPinBadge(
        ctx,
        ox + (sc / (grid.cols - 1)) * mapSize,
        oy + (sr / (grid.rows - 1)) * mapSize,
        dpr,
        'A',
      );
      this.drawPinBadge(
        ctx,
        ox + (ec / (grid.cols - 1)) * mapSize,
        oy + (er / (grid.rows - 1)) * mapSize,
        dpr,
        'B',
      );
      const pose = this.sampleRoutePose(grid, grid.z, route, this.roverProgress);
      this.drawPinBadge(
        ctx,
        ox + (pose.col / (grid.cols - 1)) * mapSize,
        oy + (pose.row / (grid.rows - 1)) * mapSize,
        dpr,
        'R',
        true,
      );
    }

    this.drawSunCompass(ctx, w - 34 * dpr, 34 * dpr, 22 * dpr, dpr, sun, 0);
  }

  /** round start / end / rover marks, as in the legend */
  private drawPinBadge(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number, label: string, rover = false): void {
    ctx.save();
    const r = 9 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = rover ? '#ffd166' : '#eef2f6';
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = 'rgba(5,7,11,0.85)';
    ctx.stroke();
    ctx.fillStyle = '#05070b';
    ctx.font = `600 ${Math.round(12 * dpr)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5 * dpr);
    ctx.restore();
  }

  /** square instrument tag with a leader line (the rover's elevation) */
  private drawTag(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number, text: string): void {
    ctx.save();
    ctx.font = `600 ${Math.round(12 * dpr)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const label = text.toUpperCase();
    const track = 0.96 * dpr; // +0.08 em at 12 px
    const tw = ctx.measureText(label).width + label.length * track;
    const pw = Math.round(tw + 14 * dpr);
    const ph = Math.round(20 * dpr);
    const rx = Math.round(x - pw / 2);
    const ry = Math.round(y - ph);
    ctx.fillStyle = 'rgba(5,7,11,0.82)';
    ctx.fillRect(rx, ry, pw, ph);
    ctx.strokeStyle = 'rgba(170,200,230,0.34)';
    ctx.lineWidth = dpr;
    ctx.strokeRect(rx + 0.5 * dpr, ry + 0.5 * dpr, pw - dpr, ph - dpr);
    ctx.beginPath();
    ctx.moveTo(x, ry + ph);
    ctx.lineTo(x, ry + ph + 10 * dpr);
    ctx.stroke();
    ctx.fillStyle = '#eef2f6';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let cx = rx + 7 * dpr;
    for (const ch of label) {
      ctx.fillText(ch, cx, ry + ph / 2 + 0.5 * dpr);
      cx += ctx.measureText(ch).width + track;
    }
    ctx.restore();
  }

  /** Sun compass that turns with the view: N and the Sun are drawn where they lie on screen */
  private drawSunCompass(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    dpr: number,
    sun: SunAngles,
    viewHeadingDeg: number,
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(5, 7, 11, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(170, 200, 230, 0.34)';
    ctx.lineWidth = dpr;
    ctx.stroke();

    const at = (headingDeg: number, rr: number): [number, number] => {
      const a = (headingDeg - viewHeadingDeg) * DEG;
      return [cx + Math.sin(a) * rr, cy - Math.cos(a) * rr];
    };
    const [nx, ny] = at(0, r - 7 * dpr);
    ctx.fillStyle = '#b6c2cf';
    ctx.font = `600 ${Math.round(11 * dpr)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    const [sx, sy] = at(sun.gridAzDeg, r - 4 * dpr);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(sx, sy, 3 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private bindInteractions(canvas: HTMLCanvasElement, which: 'target' | 'earth'): void {
    canvas.addEventListener('contextmenu', (ev: MouseEvent) => {
      if (this.isWebGLActive()) {
        ev.preventDefault();
      }
    });

    canvas.addEventListener('dblclick', () => {
      if (this.isWebGLActive()) {
        this.resetCamera();
      }
    });

    canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
      this.dragging = true;
      this.dragPanning = ev.button === 2 || ev.shiftKey;
      this.dragMoved = false;
      this.dragStartX = ev.clientX;
      this.dragStartY = ev.clientY;
      if (this.pointerTool === 'orbit') {
        canvas.style.cursor = 'grabbing';
      }
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // ignore synthetic events without pointer capture support
      }
    });

    canvas.addEventListener('pointermove', (ev: PointerEvent) => {
      if (!this.dragging) return;
      const dx = ev.clientX - this.dragStartX;
      const dy = ev.clientY - this.dragStartY;
      if (!this.dragMoved && Math.hypot(dx, dy) > 4) {
        this.dragMoved = true;
      }
      if (!this.dragMoved || !this.isWebGLActive()) return;

      const isPan = this.dragPanning || (ev.buttons & 2) !== 0 || ev.shiftKey;
      if (this.cameraMode === 'orbital') {
        if (isPan) {
          const panScale = this.orbitDist * 0.0012;
          const cosAz = Math.cos(this.orbitAz);
          const sinAz = Math.sin(this.orbitAz);
          // Screen X -> horizontal right (cosAz, -sinAz); Screen Y -> forward XZ (-sinAz, -cosAz)
          const nextX = this.panX - cosAz * dx * panScale - sinAz * dy * panScale;
          const nextZ = this.panZ + sinAz * dx * panScale - cosAz * dy * panScale;
          this.panX = Math.max(-3500, Math.min(3500, nextX));
          this.panZ = Math.max(-3500, Math.min(3500, nextZ));
        } else {
          this.orbitAz -= dx * 0.0075;
          this.orbitEl = Math.max(0.1, Math.min(1.48, this.orbitEl + dy * 0.0065));
        }
      } else {
        // Astronaut / Rover drag-look around traverse direction
        this.lookYawOffset -= dx * 0.006;
        this.lookPitchOffset = Math.max(-0.55, Math.min(0.55, this.lookPitchOffset - dy * 0.005));
      }

      this.dragStartX = ev.clientX;
      this.dragStartY = ev.clientY;
      this.requestRender();
    });

    const finishPointer = (ev: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dragPanning = false;
      canvas.style.cursor = this.pointerTool === 'orbit' ? 'grab' : 'crosshair';
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }

      if (!this.dragMoved) {
        const tool: 'start' | 'end' | null =
          this.pointerTool === 'start'
            ? 'start'
            : this.pointerTool === 'end'
              ? 'end'
              : ev.shiftKey
                ? 'end'
                : null;
        if (tool) {
          const frac = this.pickTerrainFraction(canvas, which, ev.clientX, ev.clientY);
          if (frac) this.onPickPoint(tool, frac);
        }
      }
    };

    canvas.addEventListener('pointerup', finishPointer);
    canvas.addEventListener('pointercancel', () => {
      this.dragging = false;
      this.dragPanning = false;
      canvas.style.cursor = this.pointerTool === 'orbit' ? 'grab' : 'crosshair';
    });

    canvas.addEventListener(
      'wheel',
      (ev: WheelEvent) => {
        if (!this.isWebGLActive()) return;
        ev.preventDefault();
        const factor = ev.deltaY > 0 ? 1.09 : 0.92;
        if (this.cameraMode === 'orbital') {
          this.orbitDist = Math.max(1600, Math.min(14000, this.orbitDist * factor));
        } else if (this.cameraMode === 'rover') {
          this.chaseDist = Math.max(120, Math.min(950, this.chaseDist * factor));
        } else if (this.cameraMode === 'astronaut') {
          this.camFov = Math.max(25, Math.min(70, this.camFov * factor));
        }
        this.requestRender();
      },
      { passive: false },
    );
  }

  private pickTerrainFraction(
    canvas: HTMLCanvasElement,
    which: 'target' | 'earth',
    clientX: number,
    clientY: number,
  ): [number, number] | null {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const side = which === 'target' ? this.targetSide : this.earthSide;
    const data = which === 'target' ? this.targetData : this.earthData;
    if (!data) return null;

    if (this.webglAvailable && side && this.cameraMode !== 'topdown' && this.THREE) {
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.configureCameraForSide(side, data, rect.width / rect.height);
      const raycaster = new this.THREE.Raycaster();
      raycaster.setFromCamera(new this.THREE.Vector2(ndcX, ndcY), this.glCamera);
      const hits = raycaster.intersectObject(side.terrainMesh, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const sizeM = (data.grid.rows - 1) * data.grid.dx;
        const fracR = Math.max(0, Math.min(1, pt.z / sizeM + 0.5));
        const fracC = Math.max(0, Math.min(1, pt.x / sizeM + 0.5));
        return [fracR, fracC];
      }
    }

    // 2D fallback coordinate mapping
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.width || rect.width * dpr;
    const h = canvas.height || rect.height * dpr;
    const pad = 18 * dpr;
    const mapSize = Math.max(120, Math.min(w - pad * 2, h - pad * 2.4));
    const ox = Math.round((w - mapSize) * 0.5);
    const oy = Math.round((h - mapSize) * 0.46);
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    const fracC = Math.max(0, Math.min(1, (px - ox) / mapSize));
    const fracR = Math.max(0, Math.min(1, (py - oy) / mapSize));
    return [fracR, fracC];
  }

  dispose(): void {
    this.disposed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    const disposeSide = (s: SideWebGLObjects | null) => {
      if (!s) return;
      s.terrainGeo?.dispose();
      s.terrainTex?.dispose();
      s.terrainMesh?.material?.dispose();
      s.rover?.dispose();
      if (s.routeLine) {
        s.routeLine.geometry?.dispose();
        s.routeLine.material?.dispose();
      }
    };
    disposeSide(this.targetSide);
    disposeSide(this.earthSide);
    if (this.glRenderer) {
      try {
        this.glRenderer.dispose();
      } catch {
        // ignore
      }
      this.glRenderer = null;
    }
  }
}
