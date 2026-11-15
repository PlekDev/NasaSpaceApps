// AI-assisted (Claude, Anthropic); reviewed by the team.
// Reverse search (src/components/reverse.ts) against the exported data: run `python -I web/tools/export_data.py` first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reverseRank, reverseSummary, parseWindowId } from '../src/components/reverse.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n, dir), 'utf8'));
const m = read('manifest.json');
const data = { manifest: m, targets: {}, details: {} };
for (const t of m.targets) { data.targets[t.id] = read(`${t.id}.json`); data.details[t.id] = read(`${t.id}.detail.json`); }
const wid = (t, k) => `${m.regions[data.targets[t].site[k]].id}_${data.details[t].i[k]}_${data.details[t].j[k]}`;
// independent rank: stable descending order of combined, ties keep file order (as web/tools/export_data.py)
const ranks = t => { const c = data.targets[t].combined, o = [...c.keys()].sort((a, b) => c[b] - c[a] || a - b), r = new Array(c.length); o.forEach((k, n) => { r[k] = n + 1; }); return r; };

test('parseWindowId keeps underscores in the region id', () => {
  assert.deepEqual(parseWindowId('earth_hawaii_mauna_kea_700_1700'), { region: 'earth_hawaii_mauna_kea', i: 700, j: 1700 });
  assert.equal(parseWindowId('nope'), null);
  assert.equal(reverseRank('earth_nowhere_1_2', data), null);
});

test('the top window of every target ranks #1 for that target', () => {
  for (const t of m.targets) {
    const r = ranks(t.id), k = r.indexOf(1), rows = reverseRank(wid(t.id, k), data);
    const row = rows.find(x => x.id === t.id);
    assert.equal(row.rank, 1, t.id);
    assert.equal(row.combined, data.targets[t.id].combined[k] / m.scale.score);
  }
});

test('every target: score, dimension scores and rank match the exported columns for sampled windows', () => {
  const t0 = m.targets[0].id, R = Object.fromEntries(m.targets.map(t => [t.id, ranks(t.id)]));
  for (const k of [0, 1, 17, 500, 4321, data.targets[t0].n - 1]) {
    const id = wid(t0, k), rows = reverseRank(id, data);
    assert.equal(rows.length, m.targets.length);
    for (let n = 1; n < rows.length; n++) assert.ok(rows[n - 1].combined >= rows[n].combined, 'sorted by score');
    for (const r of rows) {
      const d = data.targets[r.id], det = data.details[r.id];
      const q = [...Array(d.n).keys()].find(x => wid(r.id, x) === id);
      assert.equal(r.combined, d.combined[q] / m.scale.score);
      for (const dim of Object.keys(m.dims)) assert.equal(r.dims[dim], d[`score_${dim}`][q] / m.scale.score);
      assert.equal(r.rank, R[r.id][q], `${r.id} ${id}`);
      assert.ok(Math.abs(r.drivers.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
      assert.equal(r.drivers.length, Object.values(m.dims).flat().length);
      assert.ok(det);
    }
  }
});

test('summary sentence names the best target', () => {
  const t = m.targets[0].id, k = ranks(t).indexOf(1), rows = reverseRank(wid(t, k), data);
  assert.match(reverseSummary(rows, 'X'), new RegExp(rows[0].name));
});
