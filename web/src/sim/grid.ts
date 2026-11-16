/** Terrain windows for Mission Rehearsal: decode the int16 grids written by web/tools/exports/sim.py.
 * Contract: web/tools/exports/README.md ("sim"). AI-assisted (Claude); reviewed by the author. */

/** A square height grid, row-major: z[r * n + c], metres. Row 0 is the grid's "up" edge, column 0 its left edge. */
export interface Grid { n: number; dx: number; z: Float32Array }

/** Per-grid metadata as written in sim/<target>.json (target grid and each Earth window). */
export interface GridMeta {
  file: string; offset: number; scale: number;
  /** window centre and the geographic azimuth (deg, clockwise from north) of the grid's "up" direction there */
  lat: number; lon: number; up_az: number;
  i: number; j: number; min: number; max: number; nodata_filled: number;
}
export interface EarthWindowMeta extends GridMeta {
  rank: number; site: string; region: string; place: string;
  score: number; terrain: number; illumination: number;
}
export interface TargetMeta {
  target: string; label: string; body: 'moon' | 'mars'; dx: number; n: number;
  center: { lat: number; lon: number; of: 'site' };
  grid: GridMeta; windows: EarthWindowMeta[];
}

export const NODATA = -32768;

/** Little-endian int16 -> float32 metres (height = offset + scale * value), the same float32 values the Python fixtures use. */
export function decodeGrid(buf: ArrayBuffer, meta: Pick<GridMeta, 'offset' | 'scale'>, n = 200, dx = 30): Grid {
  const v = new DataView(buf);
  if (buf.byteLength !== n * n * 2) throw new Error(`grid: expected ${n * n * 2} bytes, got ${buf.byteLength}`);
  const z = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    const q = v.getInt16(2 * k, true);
    z[k] = q === NODATA ? NaN : meta.offset + meta.scale * q;
  }
  return { n, dx, z };
}

/** Copy of a grid (heights in metres) with a vertical exaggeration, for meshes. Never use it for slopes or shadows. */
export function exaggerated(g: Grid, k: number): Float32Array {
  const out = new Float32Array(g.z.length), base = minOf(g.z);
  for (let i = 0; i < out.length; i++) out[i] = (g.z[i] - base) * k;
  return out;
}

export function minOf(a: ArrayLike<number>): number {
  let m = Infinity; for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m;
}
export function maxOf(a: ArrayLike<number>): number {
  let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m;
}
