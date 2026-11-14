import { esc } from './format';
import type { Target } from './types';
import type { View } from './map';
import { $ } from './ui';

const FALLBACK_IMG = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/500m/0/0/0.jpeg';

/** Full-viewport intro over the live map: a slowly turning globe, the wordmark, one line and one button. */
export function mountIntro(root: HTMLElement, t: Target, view: View, onDone: () => void) {
  const dead = 'dead' in view;
  const el = document.createElement('section');
  el.className = 'intro'; el.setAttribute('aria-label', 'Introduction');
  el.innerHTML = `<div class="intro-brand">P.E.N.</div>
    <div class="intro-copy"><h1>Where on Earth looks, and is lit, like <em>${esc(t.name)}</em>?</h1>
      <p>P.E.N. ranks 6 km Earth windows by terrain and low-Sun light against NASA lunar and Mars data.</p>
      <button class="btn primary" id="go">Explore</button></div>
    ${dead ? `<div class="intro-static" role="img" aria-label="Earth seen from space"><img src="${FALLBACK_IMG}" alt="" width="512" height="512"></div>` : ''}`;
  root.appendChild(el); document.documentElement.dataset.intro = '';
  const go = $<HTMLButtonElement>('#go', el); go.focus({ preventScroll: true });

  // slow spin: ~5° per second, paused while the tab is hidden, off for reduced motion
  let raf = 0, last = 0, done = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!dead) {
    const wide = innerWidth > 820;
    view.map.jumpTo({ center: [-100, 18], zoom: wide ? 2.3 : 1.55, padding: wide ? { left: Math.round(innerWidth * .34), top: 0, right: 0, bottom: 0 } : { bottom: Math.round(innerHeight * .46), top: 52, left: 0, right: 0 } });
    if (!reduced) {
      const spin = (t: number) => {
        if (done) return;
        if (last && !document.hidden) { const c = view.map.getCenter(); view.map.jumpTo({ center: [c.lng + (t - last) * 0.005, c.lat] }); }
        last = t; raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    }
  }
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    if (!dead) view.map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 }, duration: 0 });
    el.classList.add('leaving'); delete document.documentElement.dataset.intro; setTimeout(() => el.remove(), 260);
    try { sessionStorage.setItem('pen-intro', '1'); } catch { /* storage blocked */ }
    onDone();
  };
  go.addEventListener('click', finish);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') finish(); });
  return { finish };
}
