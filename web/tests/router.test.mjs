// AI-assisted (Claude Code); reviewed by the author.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, REDIRECTS, parseHash, buildHash } from '../src/lib/routes.ts';
import { createLoader } from '../src/lib/lazy.ts';
import { createScope } from '../src/lib/lifecycle.ts';

const IDS = ['home', 'explore', 'proof', 'mission', 'when', 'method', 'dossier', 'tour'];

test('all 9 routes are defined and every one resolves from its own hash', () => {
  assert.deepEqual(ROUTES.map(r => r.id).sort(), [...IDS].sort());
  for (const r of ROUTES) {
    const p = parseHash(r.path ? `#/${r.path}` : '#/');
    assert.equal(p.id, r.id); assert.equal(p.replace, false); assert.equal(p.unknown, false);
    assert.equal(p.canonical, r.path ? `#/${r.path}` : '#/');
  }
  for (const h of ['', '#', '#/', '/']) assert.equal(parseHash(h).id, 'home');
  assert.equal(parseHash('#proof').id, 'proof');          // no slash
  assert.equal(parseHash('#/Proof/').id, 'proof');        // case and trailing slash
});

test('navigation: six primary items, Tour secondary, Dossier contextual only', () => {
  assert.deepEqual(ROUTES.filter(r => r.nav === 'primary').map(r => r.title), ['Explore', 'Proof', 'Mission', 'When', 'Method']);
  assert.deepEqual(ROUTES.filter(r => r.nav === 'secondary').map(r => r.id), ['tour']);
  assert.equal(ROUTES.find(r => r.id === 'dossier').nav, null);
  assert.deepEqual(ROUTES.filter(r => r.stage).map(r => r.id), ['home', 'explore']);
});

test('redirects: #/validation -> #/proof and #/time -> #/when, query kept', () => {
  assert.deepEqual(REDIRECTS, { validation: 'proof', limits: 'proof', time: 'when' });
  let p = parseHash('#/validation'); assert.equal(p.id, 'proof'); assert.equal(p.canonical, '#/proof'); assert.equal(p.replace, true);
  p = parseHash('#/time?region=earth_hawaii_mauna_kea'); assert.equal(p.id, 'when'); assert.equal(p.canonical, '#/when?region=earth_hawaii_mauna_kea'); assert.equal(p.replace, true);
  assert.deepEqual(p.params, { region: 'earth_hawaii_mauna_kea' });
});

test('unknown routes fall back to Home and ask for the URL to be replaced', () => {
  const p = parseHash('#/nope?x=1'); assert.equal(p.id, 'home'); assert.equal(p.unknown, true); assert.equal(p.replace, true); assert.equal(p.canonical, '#/'); assert.deepEqual(p.params, {});
});

test('query strings inside the hash parse into params (dossier example, encoded values)', () => {
  const p = parseHash('#/dossier?target=moon_malapert&window=earth_hawaii_mauna_kea_700_1900&route=1%2C2%3B3%2C4');
  assert.equal(p.id, 'dossier'); assert.equal(p.replace, false);
  assert.deepEqual(p.params, { target: 'moon_malapert', window: 'earth_hawaii_mauna_kea_700_1900', route: '1,2;3,4' });
  assert.deepEqual(parseHash('#/mission?').params, {});
  assert.equal(parseHash('#/mission?a=1&a=2').params.a, '2');
  assert.equal(buildHash('dossier', { target: 'a b', window: 'c' }), '#/dossier?target=a+b&window=c');
  assert.deepEqual(parseHash(buildHash('dossier', { target: 'a b' })).params, { target: 'a b' });
});

test('lazy loader: caches success, forgets failure so Retry really retries', async () => {
  let calls = 0, fail = true;
  const l = createLoader(async () => { calls++; if (fail) throw new Error('chunk'); return { ok: true }; });
  await assert.rejects(l.get(), /chunk/); await assert.rejects(l.get(), /chunk/); assert.equal(calls, 2);
  fail = false; assert.deepEqual(await l.get(), { ok: true }); await l.get(); assert.equal(calls, 3);
});

test('scope: cleanups run once, in reverse order, and late registrations run immediately', () => {
  const log = []; const s = createScope(); s.add(() => log.push('a')); s.add(() => log.push('b'));
  s.dispose(); s.dispose(); assert.deepEqual(log, ['b', 'a']); assert.equal(s.alive, false);
  s.add(() => log.push('late')); assert.deepEqual(log, ['b', 'a', 'late']);
  const e = createScope(); e.add(() => { throw new Error('x'); }); e.add(() => log.push('after')); const orig = console.error; console.error = () => {}; e.dispose(); console.error = orig;
  assert.equal(log.at(-1), 'after');
});
