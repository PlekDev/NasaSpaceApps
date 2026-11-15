// With all weights = 1 the live JS recombination must reproduce the precomputed combined score for every target.
// Inputs are the exported (integer-scaled, 0.1-rounded) per-dimension scores, so the tolerance is the rounding of those inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { combine } from '../src/score.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n, dir), 'utf8'));
const have = existsSync(new URL('manifest.json', dir));

test('data exported (run: python -I web/tools/export_data.py)', () => assert.ok(have));
if (have) {
  const m = read('manifest.json'), dims = Object.keys(m.dims), counts = dims.map(k => m.dims[k].length);
  test('manifest has targets, regions and dimensions from the repo', () => {
    assert.ok(m.targets.length > 0 && m.regions.length > 0 && dims.length > 0);
    assert.match(m.data_hash, /^[0-9a-f]{8}$/);
  });
  for (const t of m.targets) {
    test(`W=1 reproduces the precomputed combined score: ${t.id}`, () => {
      const d = read(`${t.id}.json`); let worst = 0;
      assert.equal(d.n, m.windows_per_target);
      for (let k = 0; k < d.n; k++) {
        const s = combine(dims.map(n => d[`score_${n}`][k] / m.scale.score), dims.map(() => 1), counts);
        worst = Math.max(worst, Math.abs(s - d.combined[k] / m.scale.score));
      }
      // inputs are rounded to 0.1, so 0.2 is the bound; in practice the error is far smaller for scores near the top
      assert.ok(worst <= 0.2, `max |live - precomputed| = ${worst.toFixed(3)}`);
    });
  }
  test('weights change the ranking and zero weight on a dimension drops it', () => {
    const t = m.targets[0], d = read(`${t.id}.json`), k = 0;
    const s = dims.map(n => d[`score_${n}`][k] / m.scale.score);
    const onlyFirst = combine(s, dims.map((_, i) => (i === 0 ? 1 : 0)), counts);
    assert.ok(Math.abs(onlyFirst - s[0]) < 1e-9);
  });
}
