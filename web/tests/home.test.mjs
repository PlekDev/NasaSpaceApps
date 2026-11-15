// AI-assisted (Claude Code); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { homeFacts, shortcuts, parseSiteCoords } from '../src/lib/home.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n, dir), 'utf8'));
const m = read('manifest.json'), kr = read('known_ranks.json'), far = read('far_horizons.json'), known = read('known_analogs.json'), mx = read('matrix.json');
const nul = existsSync(new URL('stats/null.json', dir)) ? read('stats/null.json') : null;

test('rank, N and rho come from the data (README ranks), not from typed numbers', () => {
  const f = homeFacts(m, kr, far, nul, known);
  assert.ok(f); const hit = Object.entries(kr[f.target.id]).find(([s]) => /hiwahine/i.test(s))[1];
  assert.equal(f.rank, hit.rank); assert.equal(f.n, hit.n); assert.equal(f.rankText, `#${hit.rank.toLocaleString('en-US')}`);
  assert.equal(f.rhoText, far.sites[f.target.id].V3_far_curved.spearman_rho.toFixed(2));
  assert.match(f.rhoRange, /^\d\.\d\d–\d\.\d\d$/); assert.equal(f.horizonKm, far.settings.max_distance_m / 1000);
});

test('the NASA site coordinates are read from the known-analog data', () => {
  const f = homeFacts(m, kr, far, nul, known);
  assert.ok(f.site && Math.abs(f.site.lat - 19.76) < 0.05 && Math.abs(f.site.lon + 155.47) < 0.05);
  assert.deepEqual(parseSiteCoords('... 19°45\'N (19.76091, -155.47071). GNIS'), { lat: 19.76091, lon: -155.47071 });
  assert.equal(parseSiteCoords('no coordinates here'), null);
});

test('stubbed stats never become a number: p is pending', () => {
  const stub = { _stub: true, headline_target: 'moon_malapert', pu_uhiwahine: { moon_malapert: { p_value_region_matched: 0.5, p_bonferroni: 1 } }, headline: 'dummy' };
  const f = homeFacts(m, kr, far, stub, known);
  assert.equal(f.p, null); assert.equal(f.pText, null); assert.equal(f.pending, true); assert.equal(f.headline, null); assert.match(f.pCaption, /pending/i);
  const missing = homeFacts(m, kr, far, null, known); assert.equal(missing.pending, true); assert.equal(missing.pText, null);
  assert.ok(!/0\.5/.test(JSON.stringify(f)), 'stub values must not leak into the facts');
});

test('real stats give the p-value and its corrected value', { skip: !nul || nul._stub !== false }, () => {
  const f = homeFacts(m, kr, far, nul, known); const pu = nul.pu_uhiwahine[f.target.id];
  assert.equal(f.pending, false); assert.equal(f.p, pu.p_value_region_matched); assert.equal(f.pCorrText, pu.p_bonferroni.toFixed(3)); assert.equal(f.target.id, nul.headline_target);
});

test('shortcuts: Moon, Mars and Mexico pairs come from the score matrix and ranks', () => {
  const s = shortcuts(m, mx, kr, 'moon_malapert');
  assert.deepEqual(s.map(x => x.id), ['moon', 'mars', 'mexico']);
  const bestFor = tid => { const j = mx.targets.indexOf(tid); let bi = 0; mx.v.combined.forEach((row, i) => { if (row[j] > mx.v.combined[bi][j]) bi = i; }); return mx.regions[bi]; };
  assert.ok(s[0].hash.includes('target=moon_malapert') && s[0].hash.includes(`region=${bestFor('moon_malapert')}`));
  const jez = m.targets.find(t => /jezero/i.test(t.name)).id; assert.ok(s[1].hash.includes(`target=${jez}`) && s[1].hash.includes(`region=${bestFor(jez)}`));
  assert.ok(s[2].hash.includes('region=earth_pinacate') && /Pinacate/.test(s[2].pair));
  for (const x of s) assert.match(x.hash, /^#\/explore\?target=[a-z0-9_]+&region=[a-z0-9_]+$/);
});
