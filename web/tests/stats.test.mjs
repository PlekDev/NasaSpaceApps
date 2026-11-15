// AI-assisted (Claude Code); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciFor, decompFor, decompSummary } from '../src/lib/stats.ts';

const boot = { _stub: false, _meta: { params: { bootstrap: 1000 } }, moon_x: [{ window_id: 'earth_a_1_2', score: 79.3, ci95: [60.3, 89.9], rank_ci95: [1, 78] }] };
const decomp = { _stub: false, moon_x: { earth_a_1_2: { relief: 0.6, rough: 0.3, hypso: 0.1, bogus: 'x' } } };
const labels = { relief: 'local relief', rough: '150 m roughness', hypso: 'hypsometry' };

test('CI: a top window gets its interval and rank range; others get nothing (absent, not empty)', () => {
  assert.deepEqual(ciFor(boot, 'moon_x', 'earth_a_1_2'), { score: 79.3, lo: 60.3, hi: 89.9, rankLo: 1, rankHi: 78, resamples: 1000 });
  assert.equal(ciFor(boot, 'moon_x', 'earth_a_9_9'), null); assert.equal(ciFor(boot, 'moon_y', 'earth_a_1_2'), null);
});

test('stubbed or missing stats never produce a number', () => {
  for (const bad of [null, undefined, {}, { ...boot, _stub: true }, { ...boot, _stub: undefined }]) assert.equal(ciFor(bad, 'moon_x', 'earth_a_1_2'), null);
  for (const bad of [null, undefined, { ...decomp, _stub: true }, { ...decomp, _stub: 'false' }]) assert.equal(decompFor(bad, 'moon_x', 'earth_a_1_2', labels), null);
});

test('decomposition: largest first, labelled, non-numeric entries ignored, summary names the target', () => {
  const rows = decompFor(decomp, 'moon_x', 'earth_a_1_2', labels);
  assert.deepEqual(rows.map(r => r.feature), ['relief', 'rough', 'hypso']); assert.equal(rows[0].label, 'local relief');
  assert.equal(decompSummary(rows, 'Malapert Massif'), 'Local relief explains 60 % of the distance to Malapert Massif; 150 m roughness 30 %.');
  assert.equal(decompFor(decomp, 'moon_x', 'earth_zzz', labels), null);
});
