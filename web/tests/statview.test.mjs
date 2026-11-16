// AI-assisted (Claude Code); reviewed by the author.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quantile, regionSummary, shareAtLeast, cumulative, pearson, ranks, spearman, quadrants, targetSimilarity, argmax, meanShares, corrWords } from '../src/lib/statview.ts';

test('quantile interpolates and handles edges', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], .5), 3);
  assert.equal(quantile([0, 10], .25), 2.5);
  assert.equal(quantile([7], .9), 7);
  assert.ok(Number.isNaN(quantile([], .5)));
});

test('regionSummary groups by zone and counts windows above the minimum', () => {
  const r = regionSummary([10, 20, 30, 40, 90], [0, 0, 1, 1, 1], 3, 35);
  assert.equal(r[0].n, 2); assert.equal(r[0].max, 20); assert.equal(r[0].above, 0);
  assert.equal(r[1].n, 3); assert.equal(r[1].p50, 40); assert.equal(r[1].above, 2);
  assert.equal(r[2].n, 0); assert.ok(Number.isNaN(r[2].p50));
});

test('shareAtLeast and cumulative', () => {
  assert.equal(shareAtLeast([10, 50, 60, 90], 50), .75);
  assert.equal(shareAtLeast([], 50), 0);
  assert.deepEqual(cumulative([1, 1, 2]), [.25, .5, 1]);
});

test('pearson and spearman', () => {
  assert.ok(Math.abs(pearson([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3], [3, 2, 1]) + 1) < 1e-12);
  assert.ok(Number.isNaN(pearson([1, 1, 1], [1, 2, 3])));
  assert.deepEqual([...ranks([10, 20, 20, 5])], [2, 3.5, 3.5, 1]);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [1, 8, 27, 64]) - 1) < 1e-12);   // monotone, not linear
});

test('quadrants splits the plane', () => {
  assert.deepEqual(quadrants([1, 9, 9, 1], [1, 9, 1, 9], 5, 5), { both: 1, onlyX: 1, onlyY: 1, neither: 1 });
});

test('targetSimilarity is symmetric with a unit diagonal', () => {
  const s = targetSimilarity([[1, 2, 9], [2, 4, 1], [3, 6, 5], [4, 8, 2]]);
  assert.ok(Math.abs(s[0][0] - 1) < 1e-12 && Math.abs(s[0][1] - 1) < 1e-12);
  assert.equal(s[0][2], s[2][0]);
});

test('argmax, meanShares, corrWords', () => {
  assert.equal(argmax([1, NaN, 7, 3]), 2); assert.equal(argmax([]), -1);
  const m = meanShares([{ a: 1, b: 0 }, { a: 0, b: 0.5 }]);
  assert.deepEqual(m.map(x => x.key), ['a', 'b']); assert.equal(m[0].share, .5);
  assert.match(corrWords(0.1), /almost no/); assert.match(corrWords(-.7), /strong negative/); assert.match(corrWords(NaN), /not defined/);
});
