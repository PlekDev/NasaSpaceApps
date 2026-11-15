// AI-assisted (Claude Code); reviewed by the author.
import { esc } from './format';
import type { Manifest } from './types';
import { hasWebGL, type View } from './view';
import { loadHome } from './lib/homeload';
import './views/home.css';

const FALLBACK_IMG = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/1/0/0.jpeg';

/** Home: the judge's path. The live globe turns, flies to NASA's Pu'u Hiwahine test site on Mauna Kea (the best-match marker lands on it),
 *  and the hook appears: "NASA rehearsed a lunar-pole mission here in 2012 · P.E.N. found it #<rank> of <N>, blind."
 *  Three numbers (rank, rho, p) and three shortcuts follow, all from exported data. Skippable (Skip, Esc); with prefers-reduced-motion
 *  there is no flight, the end state shows at once. */
export function mountHome(root: HTMLElement, o: { m: Manifest; view: View; targetName: string }) {
  const { m, view } = o;
  const dead = !hasWebGL(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, wide = innerWidth > 820;
  const el = document.createElement('section');
  el.className = 'intro home'; el.setAttribute('aria-label', 'Home');
  el.innerHTML = `<div class="home-scroll"><div class="home-copy">
      <h1>Where on Earth looks, and is lit, like <em>${esc(o.targetName)}</em>?</h1>
      <p class="home-hook" id="home-hook" aria-live="polite" hidden></p>
      <div class="home-actions"><a class="btn primary" id="home-proof" href="#/proof">See the proof</a><button class="home-btn" id="go" type="button">Explore the map</button>
        <button class="home-skip" id="home-skip" type="button">Skip</button></div>
      <dl class="home-stats" id="home-stats" hidden></dl>
      <nav class="home-try" id="home-try" aria-label="Examples" hidden></nav></div></div>
    <div class="home-site" id="home-site" hidden aria-hidden="true"></div>
    ${dead ? `<div class="intro-static" role="img" aria-label="NASA Blue Marble imagery of the Americas and the Pacific"><img src="${FALLBACK_IMG}" alt="" width="256" height="256"></div>` : ''}`;
  root.appendChild(el); document.documentElement.dataset.intro = '';
  const $q = <T extends HTMLElement>(s: string) => el.querySelector(s) as T;
  const padding = wide ? { left: Math.round(innerWidth * .34), top: 0, right: 0, bottom: 0 } : { bottom: Math.round(innerHeight * .5), top: 52, left: 0, right: 0 };
  let raf = 0, last = 0, done = false, landed = false, flying = false, flyTimer = 0, landTimer = 0, siteName = "Pu'u Hiwahine";

  if (!dead) {
    view.jumpTo({ center: [-100, 18], zoom: wide ? 2.3 : 1.55, padding });
    if (!reduced) {                                    // slow spin, ~5° per second, paused while the tab is hidden
      const spin = (t: number) => { if (done || landed || flying) return; if (last && !document.hidden) { const c = view.getCenter(); view.jumpTo({ center: [c[0] + (t - last) * 0.005, c[1]] }); } last = t; raf = requestAnimationFrame(spin); };
      raf = requestAnimationFrame(spin);
    }
  }

  const land = () => {
    if (landed || done) return; landed = true; cancelAnimationFrame(raf); clearTimeout(flyTimer); clearTimeout(landTimer);
    el.classList.add('landed'); document.documentElement.dataset.homeLanded = ''; $q('#home-skip').hidden = true;
    for (const id of ['#home-hook', '#home-stats', '#home-try', '#home-site']) { const n = $q<HTMLElement>(id); if (n.innerHTML) n.hidden = false; }
  };
  const skip = () => {
    if (landed) return; clearTimeout(flyTimer); clearTimeout(landTimer);
    const s = facts?.site; if (!dead && s) view.jumpTo({ center: [s.lon, s.lat], zoom: 7.4, padding });
    land();
  };
  $q('#home-skip').addEventListener('click', skip);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
  document.addEventListener('keydown', onKey);
  $q('#go').addEventListener('click', () => { location.hash = '#/explore'; });

  let facts: Awaited<ReturnType<typeof loadHome>>['facts'] = null;
  loadHome(m).then(d => {
    if (done) return; facts = d.facts;
    const f = d.facts;
    if (f) {
      $q('#home-hook').innerHTML = `NASA rehearsed a lunar-pole mission here in 2012 · P.E.N. found it <b>${esc(f.rankText)} of ${esc(f.n.toLocaleString('en-US'))}</b>, blind.`;
      const stat = (cls: string, label: string, num: string, cap: string, pending = false) =>
        `<div class="home-stat ${cls}${pending ? ' pending' : ''}"><dt>${esc(label)}</dt><dd class="home-num">${num}</dd><dd class="home-cap">${esc(cap)}</dd></div>`;
      $q('#home-stats').innerHTML =
        stat('lead', 'Blind test', `${esc(f.rankText)}<small> of ${esc(f.n.toLocaleString('en-US'))}</small>`, `Where NASA's own test site ranks among all Earth windows for ${f.target.name}, found without being told.`) +
        stat('', 'Light model', f.rhoText ? esc(f.rhoText) : '—', `Spearman ρ against NASA LOLA${f.horizonKm ? `, horizons up to ${f.horizonKm} km` : ''} (${f.target.name}).`, !f.rhoText) +
        stat('', 'Permutation test · p-value', f.pText ? esc(f.pText) : '—', f.pCaption, f.pending);
      siteName = "Pu'u Hiwahine";
      $q('#home-site').innerHTML = `<b>${esc(siteName)}</b><span>NASA's 2012 lunar-pole field-test site</span>`;
    }
    $q('#home-try').innerHTML = d.shortcuts.length ? `<h2 class="home-try-h">Try</h2><ul>${d.shortcuts.map(s => `<li><a href="${esc(s.hash)}"><b>${esc(s.label)}</b><span>${esc(s.pair)}</span></a></li>`).join('')}</ul>` : '';
    if (landed) { for (const id of ['#home-hook', '#home-stats', '#home-try', '#home-site']) { const n = $q<HTMLElement>(id); if (n.innerHTML) n.hidden = false; } }
    else if (dead || reduced) skip();
    else {
      const s = f?.site;
      flyTimer = window.setTimeout(() => { flying = true; cancelAnimationFrame(raf); if (s) view.fly(s.lon, s.lat, 7.4, padding); landTimer = window.setTimeout(land, s ? 1600 : 0); }, 1000);
    }
  }).catch(() => land());

  return { finish() { if (done) return; done = true; document.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); clearTimeout(flyTimer); clearTimeout(landTimer); if (!dead) view.jumpTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 } });   /* give Explore its camera back without Home's left padding */ el.classList.add('leaving'); delete document.documentElement.dataset.intro; delete document.documentElement.dataset.homeLanded; setTimeout(() => el.remove(), 260); } };
}
