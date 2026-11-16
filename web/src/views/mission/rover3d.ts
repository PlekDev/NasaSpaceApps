// AI-assisted (Claude Code); reviewed by the author.
/**
 * Procedural planetary rover for the Mission 3D scenes: a rocker-bogie chassis with six wheels, a white body,
 * a gold-foil electronics box, a tilted solar array, a camera mast, a high-gain antenna and a stowed arm.
 * Built from three.js primitives only (no model file). Forward is +z, up is +y, the wheels rest on y = 0.
 * The model is drawn about 30x life size so it stays visible over a 6 km window.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RoverModel {
  group: any;
  /** wheel meshes, spun about their axle by `spin()` */
  wheels: any[];
  /** sun light that follows the rover */
  light: any;
  /** turn the wheels to match a distance driven (world units) */
  spin(distance: number): void;
  /** point the rover's key light along the Sun (grid azimuth, elevation, degrees) */
  setSun(gridAzDeg: number, elevDeg: number): void;
  dispose(): void;
}

const DEG = Math.PI / 180;
const WHEEL_R = 13;

export function buildRover(THREE: any): RoverModel {
  const group = new THREE.Group();
  group.name = 'rover';
  group.rotation.order = 'YXZ';

  const geos: any[] = [];
  const mats: any[] = [];
  const mat = (color: number, opts: Record<string, unknown> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08, flatShading: true, ...opts });
    mats.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    return g;
  };
  const cyl = (rt: number, rb: number, h: number, seg = 16) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geos.push(g);
    return g;
  };
  const add = (parent: any, geo: any, m: any, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const white = mat(0xe4e7eb);
  const grey = mat(0x9aa3ad, { metalness: 0.35, roughness: 0.45 });
  const dark = mat(0x2a2f36, { roughness: 0.85 });
  const tread = mat(0x1a1d22, { roughness: 0.95 });
  const gold = mat(0xc89b2c, { metalness: 0.65, roughness: 0.32 });
  const cell = mat(0x1d3352, { metalness: 0.3, roughness: 0.28 });
  const frame = mat(0xb9c0c8, { metalness: 0.4, roughness: 0.4 });
  const lens = mat(0x0b0e12, { metalness: 0.6, roughness: 0.15 });

  // ── body ──────────────────────────────────────────────────────────────
  const BODY_Y = 40;
  add(group, box(62, 22, 92), white, 0, BODY_Y, 0); // main body
  add(group, box(66, 3, 96), grey, 0, BODY_Y - 12, 0); // belly plate
  add(group, box(40, 18, 26), gold, 0, BODY_Y + 2, -52); // rear electronics box (foil)
  add(group, box(44, 2, 30), grey, 0, BODY_Y + 12, -52);

  // solar array: framed, tilted toward the rear, with a cell grid
  const array = new THREE.Group();
  array.position.set(0, BODY_Y + 16, -4);
  array.rotation.x = -8 * DEG;
  group.add(array);
  add(array, box(84, 2.4, 76), frame, 0, 0, 0);
  const cellsW = 4;
  const cellsD = 3;
  const cw = 84 / cellsW;
  const cd = 76 / cellsD;
  for (let i = 0; i < cellsW; i++) {
    for (let j = 0; j < cellsD; j++) {
      add(array, box(cw - 2.4, 1, cd - 2.4), cell, -42 + cw * (i + 0.5), 1.6, -38 + cd * (j + 0.5));
    }
  }
  add(array, box(4, 10, 4), grey, 0, -5, 0); // array post

  // ── mast with the camera head ─────────────────────────────────────────
  const mast = new THREE.Group();
  mast.position.set(-20, BODY_Y + 11, 36);
  group.add(mast);
  add(mast, cyl(3.2, 3.8, 62, 10), grey, 0, 31, 0);
  add(mast, box(10, 6, 10), grey, 0, 64, 0); // pan unit
  const head = new THREE.Group();
  head.position.set(0, 72, 2);
  mast.add(head);
  add(head, box(30, 11, 13), white, 0, 0, 0);
  for (const x of [-8, 8]) {
    const eye = add(head, cyl(3.4, 3.4, 4, 14), lens, x, 0, 7.6);
    eye.rotation.x = Math.PI / 2;
  }
  add(head, box(6, 4, 5), dark, 12, 6.5, 0); // light sensor

  // ── high-gain antenna on the rear right ───────────────────────────────
  const hga = new THREE.Group();
  hga.position.set(22, BODY_Y + 14, -38);
  group.add(hga);
  add(hga, cyl(1.8, 1.8, 20, 8), grey, 0, 10, 0);
  const dish = add(hga, cyl(13, 9, 3, 24), white, 0, 22, 0);
  dish.rotation.x = -55 * DEG;
  add(hga, cyl(1.2, 1.2, 9, 6), grey, 0, 25, 3).rotation.x = -55 * DEG;

  // ── stowed arm across the front ───────────────────────────────────────
  const arm = new THREE.Group();
  arm.position.set(20, BODY_Y - 4, 48);
  group.add(arm);
  add(arm, box(5, 5, 14), grey, 0, 0, 0);
  const upper = add(arm, box(40, 4, 4), grey, -18, 2, 7);
  upper.rotation.y = 4 * DEG;
  add(arm, box(10, 8, 8), dark, -40, 2, 8); // turret

  // ── rocker-bogie and wheels ───────────────────────────────────────────
  const wheels: any[] = [];
  const wheelGeo = cyl(WHEEL_R, WHEEL_R, 10, 20);
  const hubGeo = cyl(5, 5, 11, 12);
  const cleatGeo = box(11, 2, 3);
  const WZ = [40, 2, -38]; // front, middle, rear
  for (const side of [-1, 1]) {
    const x = side * 44;
    for (const z of WZ) {
      const wheel = new THREE.Group();
      wheel.position.set(x, WHEEL_R, z);
      group.add(wheel);
      const spinner = new THREE.Group(); // spins about x
      wheel.add(spinner);
      const tire = new THREE.Mesh(wheelGeo, tread);
      tire.rotation.z = Math.PI / 2;
      spinner.add(tire);
      const hub = new THREE.Mesh(hubGeo, grey);
      hub.rotation.z = Math.PI / 2;
      spinner.add(hub);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const cleat = new THREE.Mesh(cleatGeo, dark);
        cleat.position.set(0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R);
        cleat.rotation.x = a;
        spinner.add(cleat);
      }
      wheels.push(spinner);
      // short fork from the beam to the wheel
      add(group, box(3, 12, 3), grey, x + side * -6, WHEEL_R + 8, z);
    }
    // rocker: front wheel to the body pivot; bogie: middle to rear wheel
    const rocker = add(group, box(3.4, 3.4, 52), grey, x - side * 6, WHEEL_R + 18, 22);
    rocker.rotation.x = 14 * DEG;
    const bogie = add(group, box(3.4, 3.4, 44), grey, x - side * 6, WHEEL_R + 14, -18);
    bogie.rotation.x = -8 * DEG;
    add(group, box(8, 8, 8), dark, x - side * 8, BODY_Y - 8, 6); // differential pivot
  }

  // key light along the Sun, so the rover shades like the terrain under it
  const light = new THREE.DirectionalLight(0xfff3dc, 2.6);
  light.position.set(300, 120, 0);
  light.target = group;
  const fill = new THREE.HemisphereLight(0xcfd8e6, 0x2a2f38, 1.1);
  group.add(fill);

  let spun = 0;
  return {
    group,
    wheels,
    light,
    spin(distance: number) {
      const a = distance / WHEEL_R;
      if (Math.abs(a - spun) < 1e-4) return;
      spun = a;
      for (const w of wheels) w.rotation.x = a;
    },
    setSun(gridAzDeg: number, elevDeg: number) {
      // grid frame: north = -z, east = +x
      const az = gridAzDeg * DEG;
      const el = Math.max(2, elevDeg) * DEG;
      const d = 600;
      light.position.set(
        group.position.x + Math.sin(az) * Math.cos(el) * d,
        group.position.y + Math.sin(el) * d,
        group.position.z - Math.cos(az) * Math.cos(el) * d,
      );
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
