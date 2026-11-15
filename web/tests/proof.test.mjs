// AI-assisted (Claude, Anthropic); reviewed by the team.
// Proof view (src/views/proof.ts): the sentences are generated from web/public/data/stats/ (run the exporters first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aucLine, card1, fmtP, isReal, stabilityTitle, targetKeys, puuSummary } from '../src/views/proof.ts';

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

test('p formatting', () => { assert.equal(fmtP(0.0041), '0.004'); assert.equal(fmtP(0.0004), '< 0.001'); assert.equal(fmtP(0.36746), '0.367'); });

test('sentences come from the exported numbers', () => {
  const n = read('stats/null.json'), roc = read('stats/roc.json'), st = read('stats/stability.json');
  if (!isReal(n) || !isReal(roc) || !isReal(st)) return;
  const v = n.pu_uhiwahine[n.headline_target];
  assert.match(card1(n, name), new RegExp(`p = ${fmtP(v.p_value_region_matched)} within Mauna Kea`));
  assert.ok(!/rank|#/.test(card1(n, name)), 'card 1 keeps to one universe (share of Mauna Kea)');
  const ill = moon.map(t => roc[t].auc_by_score.illum.toFixed(2));
  assert.ok(aucLine(roc, moon, mars).includes(ill.sort()[0]));
  const p1 = moon.concat(mars).map(t => st[t].p_top1[st[t].top1_equal_weights] ?? 0);
  assert.ok(stabilityTitle(st, moon.concat(mars)).includes(Math.min(...p1).toFixed(2)));
  assert.ok(puuSummary(n, name).startsWith('Share of the valid area of the Mauna Kea region'));
});
