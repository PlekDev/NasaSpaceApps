import { esc } from './format';
import type { Manifest, Target } from './types';
import { getJSON } from './data';
import { blindProof, proofLine, type Ranks } from './proof';
import { hasWebGL, type View } from './view';
import { $ } from './ui';

const FALLBACK_IMG = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/1/0/0.jpeg';

/** Full-viewport intro over the live map: a slowly turning globe, the wordmark, one line and one button. */
export function mountIntro(root: HTMLElement, t: Target, view: View, onDone: () => void, m?: Manifest) {
  const dead = !hasWebGL();
  const el = document.createElement('section');
  el.className = 'intro'; el.setAttribute('aria-label', 'Introduction');
  el.innerHTML = `<div class="intro-brand">P.E.N.</div>
    <div class="intro-copy"><h1>Where on Earth looks, and is lit, like <em>${esc(t.name)}</em>?</h1>
      <p>P.E.N. ranks 6 km Earth windows by terrain and low-Sun light against NASA lunar and Mars data.</p>
      <p class="intro-proof" hidden></p>
      <button class="btn primary" id="go">Explore</button></div>
    ${dead ? `<div class="intro-static" role="img" aria-label="NASA Blue Marble imagery of the Americas and the Pacific"><img src="${FALLBACK_IMG}" alt="" width="256" height="256"></div>` : ''}`;
  root.appendChild(el); document.documentElement.dataset.intro = '';
  const go = $<HTMLButtonElement>('#go', el); go.focus({ preventScroll: true });
  // blind-test headline: filled from the data when it arrives, never blocks the intro
  if (m) getJSON<Ranks>('known_ranks').then(kr => {
    const p = blindProof(kr, m), line = el.querySelector<HTMLElement>('.intro-proof');
    if (p && line) { line.innerHTML = `<span class="tag">Blind test</span> NASA's 2012 lunar-polar field-test site on Mauna Kea, never shown to P.E.N., comes out ${proofLine(p)}.`; line.hidden = false; }
  }).catch(() => { /* headline is optional */ });

  // slow spin: ~5° per second, paused while the tab is hidden, off for reduced motion
  let raf = 0, last = 0, done = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!dead) {
    const wide = innerWidth > 820;
    view.jumpTo({ center: [-100, 18], zoom: wide ? 2.3 : 1.55, padding: wide ? { left: Math.round(innerWidth * .34), top: 0, right: 0, bottom: 0 } : { bottom: Math.round(innerHeight * .46), top: 52, left: 0, right: 0 } });
    if (!reduced) {
      const spin = (t: number) => {
        if (done) return;
        if (last && !document.hidden) { const c = view.getCenter(); view.jumpTo({ center: [c[0] + (t - last) * 0.005, c[1]] }); }
        last = t; raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    }
  }
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    if (!dead) view.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 0 });
    el.classList.add('leaving'); delete document.documentElement.dataset.intro; setTimeout(() => el.remove(), 260);
    try { sessionStorage.setItem('pen-intro', '1'); } catch { /* storage blocked */ }
    onDone();
  };
  go.addEventListener('click', finish);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') finish(); });
  return { finish };
}
