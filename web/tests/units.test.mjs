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

test('blindProof(): the intro and Validation headline match the exported ranks and the README claim', async () => {
  const { blindProof, proofLine } = await import('../src/proof.ts');
  const p = blindProof(read('known_ranks.json'), m);
  assert.ok(p, 'Pu\'u Hiwahine ranks exist for the lunar targets');
  assert.equal(p.lunar, m.targets.filter(t => t.body === 'moon').length);
  assert.equal(p.best.rank, Math.min(...p.ranks.map(r => r.rank)));
  assert.ok(p.ranks.every(r => r.n === m.windows_per_target));
  // README: "#1 of 10,424 for Malapert ... top 0.2 % for four of six lunar sites ... top 5 % for all six" (re-checked against data, not hard-coded)
  const share = r => Math.round((r.rank / r.n) * 1000) / 10;
  assert.equal(p.top02, p.ranks.filter(r => share(r) <= 0.2).length);
  assert.match(proofLine(p), /^<b>#[\d,]+ of [\d,]+<\/b> Earth windows for .+, top 0\.2 % for .+ lunar sites and top 5 % for .+$/);
});

test('pyFixed(): scores round half to even like the Python tables (98.5 -> 98)', () => {
  assert.equal(pyFixed(98.5), '98'); assert.equal(pyFixed(97.5), '98'); assert.equal(pyFixed(90.9), '91');
});

test('monotonePath() builds smooth SVG spline paths without overshooting flat segments', async () => {
  const { monotonePath } = await import('../src/views/time.ts');
  assert.equal(monotonePath([]), '');
  assert.equal(monotonePath([[10, 20]]), 'M10.0,20.0');
  const flat = monotonePath([[0, 100], [50, 100], [100, 50], [150, 100]]);
  assert.match(flat, /^M0\.0,100\.0C16\.7,100\.0 33\.3,100\.0 50\.0,100\.0/);
  assert.ok(!flat.includes('NaN'));
});

test('manifest briefs include campaign window metadata when field briefs exist', () => {
  const mk = m.briefs.earth_hawaii_mauna_kea;
  if (mk) {
    assert.ok(mk.block && mk.block.includes('2026'), 'Mauna Kea campaign block dates exported');
    assert.ok(typeof mk.min_day === 'number' && mk.min_day > 0, 'Mauna Kea min/day exported');
    assert.ok(Array.isArray(mk.serves) && mk.serves.length >= 6, 'Mauna Kea served lunar targets exported');
  }
});

// pyFixed must equal Python's f"{x:.{d}f}" exactly: fixtures are generated by `python -c` (tests/pyfixed.fixtures.json: 3,588 cases incl. halves)
test('pyFixed matches Python rounding on 3,588 Python-generated cases', () => {
  const cases = JSON.parse(readFileSync(new URL('./pyfixed.fixtures.json', import.meta.url), 'utf8'));
  assert.ok(cases.length >= 200);
  const bad = cases.filter(([x, d, want]) => pyFixed(x, d) !== want).slice(0, 5).map(([x, d, want]) => `${x} .${d}f -> ${pyFixed(x, d)} (Python ${want})`);
  assert.deepEqual(bad, []);
});
test('pyFixed: the classic traps (0.975, 2.675, halves, negatives, zero, huge)', () => {
  assert.equal(pyFixed(0.975, 2), '0.97'); assert.equal(pyFixed(2.675, 2), '2.67'); assert.equal(pyFixed(1.005, 2), '1.00'); assert.equal(pyFixed(0.125, 2), '0.12');
  assert.equal(pyFixed(2.5), '2'); assert.equal(pyFixed(3.5), '4'); assert.equal(pyFixed(-2.5), '-2'); assert.equal(pyFixed(-0.001, 2), '-0.00'); assert.equal(pyFixed(-0, 1), '-0.0');
  assert.equal(pyFixed(1e21, 1), '1000000000000000000000.0'); assert.equal(pyFixed(99.9951, 2), '100.00');
});
