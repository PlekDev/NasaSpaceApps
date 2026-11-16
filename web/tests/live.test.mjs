// The live numbers on the Explore cards: ranks, zone statistics, known-site ranks and the weight sweep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { combine } from '../src/score.ts';
import { rankScores, histogram, zoneStats, siteRank, windowsAt, d2Arrays, combineAll, sweepRank, round1 } from '../src/lib/live.ts';

test('rankScores: best first, ties by file order, rounded to 0.1', () => {
  const r = rankScores([50.04, 70, 50.01, 70.02]);
  assert.deepEqual([...r.order], [1, 3, 0, 2]);                   // 70 and 70.02 tie at 70.0 -> file order; 50.04 and 50.01 tie at 50.0
  assert.deepEqual([...r.rank], [3, 1, 4, 2]);
});

test('histogram: 50 bins of 2 points, 100 lands in the last bin', () => {
  const h = histogram([0, 1.9, 2, 99.9, 100]);
  assert.equal(h.length, 50); assert.deepEqual([h[0], h[1], h[49]], [2, 1, 2]);
});

test('zoneStats: best, windows above the minimum and the zone rank', () => {
  const z = zoneStats([10, 90, 60, 61, 20], [0, 0, 1, 1, 2], 3, 60);
  assert.deepEqual(z.map(g => [g.n, g.best, g.bi, g.above, g.rank]), [[2, 90, 1, 1, 1], [2, 61, 3, 2, 2], [1, 20, 4, 0, 3]]);
});

test('siteRank counts windows strictly above the best window of the site', () => {
  assert.deepEqual(siteRank([5, 9, 7, 9.04], [0, 2]), { rank: 3, best: 7 });
  assert.deepEqual(siteRank([5, 9, 7, 9.04], [1]), { rank: 1, best: 9 });   // 9.04 rounds to 9.0: a tie, not above
});

test('windowsAt: a point belongs to the 6 km squares around it', () => {
  const lon = [10, 10.02, 10.5], lat = [0, 0.02, 0];
  assert.deepEqual(windowsAt(lon, lat, 10.01, 0.01, 6), [0, 1]);
});

test('combineAll equals combine() and handles all-zero weights', () => {
  const dim = [[50, 80, 95], [40, 90, 99]], d2 = d2Arrays(dim), counts = [5, 2];
  const s = combineAll(d2, [1, 1], counts);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(s[i] - combine([dim[0][i], dim[1][i]], [1, 1], counts)) < 1e-3);
  assert.deepEqual([...combineAll(d2, [0, 0], counts)], [0, 0, 0]);
});

test('sweepRank: 21 steps, the swept weight changes the rank', () => {
  const d2 = d2Arrays([[90, 40, 60], [40, 90, 60]]), sw = sweepRank(d2, [5, 2], [1, 1], 1, [0]);
  assert.equal(sw.length, 21); assert.deepEqual([sw[0].w, sw[20].w], [0, 2]);
  assert.ok(sw[0].rank <= sw[20].rank);                            // window 0 is strong on dimension 0 only: more weight on dimension 1 hurts it
});

const dir = new URL('../public/data/', import.meta.url), have = existsSync(new URL('known_sites.json', dir));
test('exported data: Pu\'u Hiwahine reproduces the exported blind ranks within a few positions (live containment test)', { skip: !have }, () => {
  const read = n => JSON.parse(readFileSync(new URL(n, dir), 'utf8')), m = read('manifest.json'), ks = read('known_sites.json'), kr = read('known_ranks.json');
  const puu = ks.find(k => /hiwahine/i.test(k.name)), dims = Object.keys(m.dims), counts = dims.map(d => m.dims[d].length);
  for (const t of m.targets.filter(x => x.body === 'moon')) {
    const d = read(`${t.id}.json`), sc = m.scale, lon = d.lon.map(v => v / sc.lonlat), lat = d.lat.map(v => v / sc.lonlat);
    const s = combineAll(d2Arrays(dims.map(k => d[`score_${k}`].map(v => v / sc.score))), [1, 1], counts);
    const got = siteRank(s, windowsAt(lon, lat, puu.lon, puu.lat, m.window_km)).rank, want = Object.entries(kr[t.id]).find(([n]) => /hiwahine/i.test(n))[1].rank;
    assert.ok(Math.abs(got - want) <= 3, `${t.id}: live #${got} vs exported #${want}`);
  }
});
