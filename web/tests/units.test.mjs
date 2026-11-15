import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { score } from '../src/model.ts';
import { pyFixed, coord } from '../src/format.ts';
import { md } from '../src/markdown.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n, dir), 'utf8'));
const m = read('manifest.json'), all = new Set(m.regions.map(r => r.id));

test('score(): all weights 1 reproduces precomputed combined for every target, through the same code the UI runs', () => {
  for (const t of m.targets) {
    const d = read(`${t.id}.json`), s = score(m, d, Object.fromEntries(Object.keys(m.dims).map(k => [k, 1])), 0, all);
    let worst = 0; for (let k = 0; k < d.n; k++) worst = Math.max(worst, Math.abs(s.s[k] - d.combined[k] / m.scale.score));
    assert.ok(worst <= 0.2, `${t.id}: ${worst}`);
    assert.equal(s.shown.length, d.n);
  }
});
test('score(): min score and region filter', () => {
  const t = m.targets[0], d = read(`${t.id}.json`), w = Object.fromEntries(Object.keys(m.dims).map(k => [k, 1]));
  const hi = score(m, d, w, 80, all); assert.ok(hi.shown.length < d.n && hi.shown.every(k => hi.s[k] >= 80));
  for (let i = 1; i < hi.shown.length; i++) assert.ok(hi.s[hi.shown[i - 1]] >= hi.s[hi.shown[i]], 'sorted best first');
  const one = score(m, d, w, 0, new Set([m.regions[0].id])); assert.ok(one.shown.every(k => one.site[k] === 0));
  assert.equal(score(m, d, w, 0, new Set()).shown.length, 0);
});
test('score(): all weights zero ranks nothing', () => {
  const d = read(`${m.targets[0].id}.json`), w = Object.fromEntries(Object.keys(m.dims).map(k => [k, 0]));
  const s = score(m, d, w, 0, all); assert.equal(s.zeroWeights, true); assert.equal(s.shown.length, 0);
});
test('pyFixed rounds exact ties to even like Python', () => {
  assert.equal(pyFixed(122.5), '122'); assert.equal(pyFixed(123.5), '124'); assert.equal(pyFixed(0.35 * 100, 0), '35'); assert.equal(pyFixed(99.8, 1), '99.8');
});
test('coord formatting', () => { assert.equal(coord(19.811, -155.544), '19.811° N, 155.544° W'); assert.equal(coord(-89.463, 137.49), '89.463° S, 137.490° E'); });
test('markdown: headings, tables, bold, links are rendered and HTML is escaped', () => {
  const h = md('## Title\n\n**bold** and `code` <script>x</script> [a](https://x.org)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- one\n- two');
  assert.match(h, /<h3>Title<\/h3>/); assert.match(h, /<b>bold<\/b>/); assert.match(h, /<code>code<\/code>/); assert.ok(!h.includes('<script>')); assert.match(h, /<td>2<\/td>/); assert.match(h, /<li>two<\/li>/); assert.match(h, /href="https:\/\/x.org"/);
});
test('reproduce.json matches the app text for the first lunar target', () => {
  const rep = read('reproduce.json'), t = m.targets.find(x => x.body === 'moon');
  assert.match(rep[t.id][0], /^\*\*\d+\.\d%\*\* of the site has an annual mean temperature below Earth's record low \(184 K\)/);
});

import { fieldKitHTML } from '../src/kit.ts';
const regions = [{ id: 'earth_hawaii_mauna_kea', name: 'Mauna Kea / Mauna Loa saddle' }];
const base = { targetName: 'Target', regionName: 'Region', rover: undefined, regions };
test('Field kit renders nothing at all when no extras or briefs exist (no empty heading or toggle)', () => {
  assert.equal(fieldKitHTML({ ...base, ex: undefined, brief: undefined }), '');
  assert.equal(fieldKitHTML({ ...base, ex: {}, brief: undefined }), '');
  assert.equal(fieldKitHTML({ ...base, ex: {}, brief: {} }), '');
});
test('Field kit: a brief alone is enough; twin, astronaut and rover appear only when present', () => {
  const onlyBrief = fieldKitHTML({ ...base, ex: {}, brief: { brief: 'r.md', calendar: 'r.ics' } });
  assert.match(onlyBrief, /Field kit/); assert.match(onlyBrief, /Calendar \.ics/); assert.ok(!onlyBrief.includes('Twin-light') && !onlyBrief.includes('astronaut'));
  const full = fieldKitHTML({ ...base, ex: { twin: 't.jpg', video: 't.mp4', astro: 'a.jpg', rover: 'r.jpg' }, brief: undefined });
  assert.match(full, /Twin-light timelapse/); assert.match(full, /What the astronaut sees/); assert.match(full, /Twin rover traverse/); assert.match(full, /extras\/t\.mp4/);
  assert.ok(full.includes('<details class="kit">'));
});
