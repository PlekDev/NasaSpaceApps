// Parity of web/src/sim/shadows.ts with pen/shadows.py and pen/features.slope_deg on the committed grids.
// Fixtures: python -I web/tools/exports/sim.py --fixtures. AI-assisted (Claude); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeGrid } from '../src/sim/grid.ts';
import { castShadow, shadowFraction, slopeDeg } from '../src/sim/shadows.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/sim/parity.json', import.meta.url), 'utf8'));
const SIM = new URL('../../data/processed/sim/', import.meta.url);
export const gridOf = g => { const b = readFileSync(new URL(g.file, SIM)); return decodeGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), g); };
const bits = (b64, n) => { const by = Buffer.from(b64, 'base64'), out = new Uint8Array(n); for (let k = 0; k < n; k++) out[k] = (by[k >> 3] >> (k & 7)) & 1; return out; };

for (const g of fx.grids) {
  const grid = gridOf(g), N = grid.n * grid.n;
  test(`castShadow matches Python on ${g.name} (≥ 99 % of cells for every Sun)`, () => {
    fx.cases.forEach(([e, a], k) => {
      const py = bits(g.masks[k], N), ts = castShadow(grid, e, a);
      let same = 0; for (let i = 0; i < N; i++) same += py[i] === ts[i] ? 1 : 0;
      assert.ok(same / N >= 0.99, `elev ${e} az ${a}: ${(100 * same / N).toFixed(2)} %`);
      if (a === 270) assert.equal(same, N, 'no rotation: identical');
    });
  });
  test(`shadowFraction (2°, 8 azimuths) matches Python on ${g.name}`, () => {
    const py = Buffer.from(g.frac8, 'base64'), ts = shadowFraction(grid, 2);
    let same = 0; for (let i = 0; i < N; i++) same += Math.round(ts[i] * 8) === py[i] ? 1 : 0;
    assert.ok(same / N >= 0.99, `${(100 * same / N).toFixed(2)} %`);
  });
  test(`slopeDeg matches Python on ${g.name} (1e-3°)`, () => {
    const ts = slopeDeg(grid);
    g.slope_cells.forEach((c, k) => assert.ok(Math.abs(ts[c] - g.slope[k]) < 1e-3, `cell ${c}: ${ts[c]} vs ${g.slope[k]}`));
  });
}
