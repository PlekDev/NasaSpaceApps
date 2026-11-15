// AI-assisted (Claude, Anthropic); reviewed by the team.
// Proof view (src/views/proof.ts): the sentences are generated from web/public/data/stats/ (run the exporters first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aucLine, card1, fmtP, fmtPc, isReal, leadLine, stabilityTitle, targetKeys, puuSummary } from '../src/views/proof.ts';

const dir = new URL('../public/data/', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n, dir), 'utf8'));
const m = read('manifest.json'), name = id => m.targets.find(t => t.id === id)?.name ?? id;
const moon = m.targets.filter(t => t.body === 'moon').map(t => t.id), mars = m.targets.filter(t => t.body === 'mars').map(t => t.id);

test('stub files are never shown as results', () => {
  assert.equal(isReal({ _stub: true }), false);
  assert.equal(isReal(null), false);
  assert.equal(isReal({ _stub: false }), true);
  assert.deepEqual(targetKeys({ _meta: 1, _stub: false, n_ref: 1, moon_x: 1 }, ['n_ref']), ['moon_x']);
});

test('p formatting', () => { assert.equal(fmtP(0.0041), '0.004'); assert.equal(fmtP(0.0004), '< 0.001'); assert.equal(fmtP(0.36746), '0.367');
  assert.equal(fmtPc(0.0246), '0.025'); assert.equal(fmtPc(0.1476), '0.15'); assert.equal(fmtPc(1), '1'); });

test('sentences come from the exported numbers', () => {
  const n = read('stats/null.json'), roc = read('stats/roc.json'), st = read('stats/stability.json');
  if (!isReal(n) || !isReal(roc) || !isReal(st)) return;
  const v = n.pu_uhiwahine[n.headline_target];
  const ka = read('known_analogs.json'), nT = ka.rows.filter(r => moon.includes(r.reference)).length;
  const c1 = card1(n, name, nT), lead = leadLine(n, name, nT);
  assert.ok(c1.includes(`p = ${fmtP(v.p_value_region_matched)}`) && !/rank|#/.test(c1), 'card 1: one universe (share of Mauna Kea)');
  for (const s of [c1, lead]) {
    assert.ok(s.includes(`${fmtPc(v.p_bonferroni)} corrected for ${Object.keys(n.pu_uhiwahine).length} lunar targets`), s);
    assert.ok(s.includes(`${fmtPc(Math.min(1, v.p_value_region_matched * nT))} corrected for all ${nT} site–target tests`), s);
  }
  const ill = moon.map(t => roc[t].auc_by_score.illum.toFixed(2));
  assert.ok(aucLine(roc, moon, mars).includes(ill.sort()[0]));
  const p10 = moon.concat(mars).map(t => st[t].p_top10[st[t].top1_equal_weights] ?? 0);
  const title = stabilityTitle(st, moon.concat(mars));
  assert.ok(title.includes(`${Math.floor(Math.min(...p10) * 100)} %`) && !/\bstable\b/.test(title), title);
  assert.ok(puuSummary(n, name).startsWith('Share of the valid area of the Mauna Kea region'));
});

test('group test, controls and limits sentences use the exact exported values', async () => {
  const { nullLine, controlsLines, notSupported } = await import('../src/views/proof.ts');
  const n = read('stats/null.json');
  if (isReal(n)) {
    const s = nullLine(n, 8, m.regions.length);
    for (const p of [n.p_value.global.combined, n.p_value.region_matched.combined, n.p_value.global.illum]) assert.ok(s.includes(fmtP(p)), fmtP(p));
  }
  const c = read('stats/controls.json');
  if (isReal(c)) {
    const lines = controlsLines(c, c.regions, moon, name, mars.find(t => /arcadia/.test(t)));
    const alps = c.regions.find(r => /alps/.test(r.id)), best = Math.min(...moon.map(t => c[t].controls[alps.id].best_rank_if_inserted));
    assert.ok(lines.some(l => l.includes(`#${best.toLocaleString('en-US')}`)));
  }
  const stub = { null: { _stub: true }, roc: { _stub: true }, bootstrap: { _stub: true }, stability: { _stub: true }, tornado: { _stub: true }, decomp: { _stub: true }, controls: { _stub: true } };
  assert.deepEqual(notSupported(stub, moon, mars, name, 8), [], 'stub files contribute no sentence');
});
