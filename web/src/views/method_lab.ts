// AI-assisted (Claude); reviewed by the author.
/** Method, hands-on: the two formulas run live in the page.
 *  1. Shadow lab: the real 6 km terrain of the headline Moon site and of its best Earth window (sim grids, the same ones Mission uses),
 *     with the exact cast-shadow algorithm (sim/shadows.ts) recomputed as the Sun moves. The Sun sweeps on its own until the reader
 *     takes the sliders; the 2° and 5° marks are the two heights P.E.N. scores.
 *  2. Score playground: two feature differences (in IQR units) -> D -> S = 100·e^(−D), drawn on the curve.
 *  Nothing here is typed data: grids and metadata come from data/sim, the numbers on screen are computed from them. */
import { loadSimTarget, loadSimGrid, castShadow, type Grid } from '../sim/index.ts';
import { esc } from '../format.ts';

const RAD = Math.PI / 180;

/** Hillshade (light from the upper left, 45° high), 0..1 per cell; computed once per grid. */
function hillshade(g: Grid): Float32Array {
  const n = g.n, out = new Float32Array(n * n), dx = g.dx;
  const lx = -Math.SQRT1_2 * Math.cos(45 * RAD), ly = -Math.SQRT1_2 * Math.cos(45 * RAD), lz = Math.sin(45 * RAD);
  const at = (r: number, c: number) => { const v = g.z[Math.min(n - 1, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, c))]; return Number.isFinite(v) ? v : 0; };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const gx = (at(r, c + 1) - at(r, c - 1)) / (2 * dx), gy = (at(r + 1, c) - at(r - 1, c)) / (2 * dx);
    const len = Math.hypot(gx, gy, 1);
    out[r * n + c] = Math.max(0, (-gx * lx - gy * ly + lz) / len);
  }
  return out;
}

interface Pane { g: Grid; shade: Float32Array; ctx: CanvasRenderingContext2D; img: ImageData; out: HTMLElement }

function paint(p: Pane, mask: Uint8Array) {
  const d = p.img.data, n = p.g.n;
  for (let k = 0; k < n * n; k++) {
    const s = p.shade[k], lit = 70 + 170 * s;
    if (mask[k]) { d[4 * k] = 18 + 30 * s; d[4 * k + 1] = 30 + 36 * s; d[4 * k + 2] = 62 + 60 * s; }      // shadow: deep steel blue
    else { d[4 * k] = lit * 1.02; d[4 * k + 1] = lit * .98; d[4 * k + 2] = lit * .9; }                      // lit: warm grey, like low sunlight
    d[4 * k + 3] = 255;
  }
  p.ctx.putImageData(p.img, 0, 0);
  let sh = 0; for (let k = 0; k < mask.length; k++) sh += mask[k];
  p.out.textContent = `${((100 * sh) / mask.length).toFixed(0)} %`;
}

export async function mountShadowLab(host: HTMLElement, targetId: string, targetName: string) {
  host.innerHTML = `<div class="lab-loading muted">Loading the real terrain…</div>`;
  let meta;
  try { meta = await loadSimTarget(targetId); } catch { host.innerHTML = '<p class="muted">The terrain grids could not be loaded.</p>'; return; }
  const w = meta.windows[0];
  const [gm, ge] = await Promise.all([loadSimGrid(meta.grid), loadSimGrid(w)]);
  const km = (meta.n * meta.dx) / 1000;
  host.innerHTML = `
    <div class="lab-panes">
      <figure class="lab-pane"><canvas width="${gm.n}" height="${gm.n}" aria-label="Shaded terrain of ${esc(targetName)} with its cast shadows"></canvas>
        <figcaption><span class="ex-cap">Moon · ${esc(targetName)}</span><b class="lab-pct" data-pane="0">–</b><small>in shadow</small></figcaption></figure>
      <figure class="lab-pane"><canvas width="${ge.n}" height="${ge.n}" aria-label="Shaded terrain of ${esc(w.region)} with its cast shadows"></canvas>
        <figcaption><span class="ex-cap">Earth · #${w.rank} ${esc(w.region)}</span><b class="lab-pct" data-pane="1">–</b><small>in shadow</small></figcaption></figure>
      <div class="lab-sun" aria-hidden="true"><svg viewBox="-60 -60 120 120"><circle r="46" class="lab-ring"/><path d="M0 -52 V-40 M0 40 V52 M-52 0 H-40 M40 0 H52" class="lab-tick"/><text y="-30" class="lab-n">N</text><g class="lab-sunpos"><line y2="-46" class="lab-ray"/><circle cy="-46" r="6" class="lab-dot"/></g></svg></div>
    </div>
    <div class="lab-ctl">
      <label class="lab-sl"><span>Sun height <output id="lab-e">2.0°</output></span><input id="lab-elev" type="range" min="0.5" max="10" step="0.5" value="2" list="lab-marks"><datalist id="lab-marks"><option value="2"></option><option value="5"></option></datalist><span class="lab-ends"><span>0.5°</span><span>scored: 2° and 5°</span><span>10°</span></span></label>
      <label class="lab-sl"><span>Sun direction <output id="lab-a">E</output></span><input id="lab-az" type="range" min="0" max="355" step="5" value="90"></label>
      <button type="button" class="btn small" id="lab-play" aria-pressed="true">Pause</button>
    </div>
    <p class="lab-note">Both windows are ${km} km wide at ${meta.dx} m per pixel, ${esc(targetName)} from NASA LRO LOLA and ${esc(w.region)} from Copernicus. Every frame runs the running-maximum shadow on the real heights; the same masks feed the light score.</p>`;
  const canv = host.querySelectorAll('canvas');
  const mk = (g: Grid, i: number): Pane => { const ctx = canv[i].getContext('2d')!; return { g, shade: hillshade(g), ctx, img: ctx.createImageData(g.n, g.n), out: host.querySelector<HTMLElement>(`.lab-pct[data-pane="${i}"]`)! }; };
  const panes = [mk(gm, 0), mk(ge, 1)];
  const elevEl = host.querySelector<HTMLInputElement>('#lab-elev')!, azEl = host.querySelector<HTMLInputElement>('#lab-az')!;
  const eOut = host.querySelector<HTMLElement>('#lab-e')!, aOut = host.querySelector<HTMLElement>('#lab-a')!, play = host.querySelector<HTMLButtonElement>('#lab-play')!;
  const sunPos = host.querySelector<SVGGElement>('.lab-sunpos')!;
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  // azimuths are relative to each grid's "up" edge; up_az keeps the two on true north
  const draw = () => {
    const e = Number(elevEl.value), a = Number(azEl.value);
    eOut.textContent = `${e.toFixed(1)}°`; aOut.textContent = DIRS[Math.round(a / 45) % 8];
    sunPos.setAttribute('transform', `rotate(${a})`);
    paint(panes[0], castShadow(gm, e, (a - meta.grid.up_az + 360) % 360));
    paint(panes[1], castShadow(ge, e, (a - w.up_az + 360) % 360));
  };
  draw();
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, last = 0, raf = 0, visible = true;
  const setPlay = (on: boolean) => { playing = on; play.setAttribute('aria-pressed', String(on)); play.textContent = on ? 'Pause' : 'Play the Sun'; if (on) raf = requestAnimationFrame(tick); };
  const tick = (t: number) => {
    if (!playing || !host.isConnected) return;
    if (visible && !document.hidden && t - last > 70) { last = t; azEl.value = String((Number(azEl.value) + 5) % 360); draw(); }
    raf = requestAnimationFrame(tick);
  };
  setPlay(playing);
  elevEl.addEventListener('input', () => { draw(); });
  azEl.addEventListener('input', () => { setPlay(false); draw(); });
  play.addEventListener('click', () => setPlay(!playing));
  new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); }).observe(host);
  void raf;
}

/** Score playground inside the score formula figure. */
export function mountScorePlay(host: HTMLElement) {
  const W = 560, H = 200, ml = 34, mb = 26, mt = 10, mr = 10, Dmax = 3;
  const x = (D: number) => ml + (Math.min(D, Dmax) / Dmax) * (W - ml - mr), y = (S: number) => mt + (1 - S / 100) * (H - mt - mb);
  let path = ''; for (let i = 0; i <= 60; i++) { const D = (i / 60) * Dmax; path += `${i ? 'L' : 'M'}${x(D).toFixed(1)} ${y(100 * Math.exp(-D)).toFixed(1)}`; }
  host.innerHTML = `<div class="play">
    <div class="play-ctl">
      <label class="lab-sl"><span>Terrain difference <output id="pl-t">0.5</output></span><input id="pl-tr" type="range" min="0" max="3" step="0.1" value="0.5"></label>
      <label class="lab-sl"><span>Light difference <output id="pl-l">0.3</output></span><input id="pl-li" type="range" min="0" max="3" step="0.1" value="0.3"></label>
      <p class="play-read"><span class="ex-cap">Score</span><b id="pl-s">–</b><small id="pl-d"></small></p>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="play-svg" role="img" aria-label="Score S against distance D, with the current point">
      <path d="M${ml} ${y(0)}H${W - mr}M${ml} ${mt}V${y(0)}" class="play-ax"/><path d="${path}" class="play-curve"/>
      <text x="${ml - 6}" y="${y(100) + 4}" class="play-t" text-anchor="end">100</text><text x="${ml - 6}" y="${y(0)}" class="play-t" text-anchor="end">0</text>
      <text x="${W - mr}" y="${H - 6}" class="play-t" text-anchor="end">D (IQR units)</text>
      <line id="pl-g" class="play-guide"/><circle id="pl-p" r="6" class="play-dot"/></svg></div>`;
  const tr = host.querySelector<HTMLInputElement>('#pl-tr')!, li = host.querySelector<HTMLInputElement>('#pl-li')!;
  const upd = () => {
    const a = Number(tr.value), b = Number(li.value), D = Math.sqrt((a * a + b * b) / 2), S = 100 * Math.exp(-D);
    host.querySelector('#pl-t')!.textContent = a.toFixed(1); host.querySelector('#pl-l')!.textContent = b.toFixed(1);
    host.querySelector('#pl-s')!.textContent = S.toFixed(0); host.querySelector('#pl-d')!.textContent = `D = ${D.toFixed(2)}, equal weights`;
    const p = host.querySelector('#pl-p')!, g = host.querySelector('#pl-g')!;
    p.setAttribute('cx', x(D).toFixed(1)); p.setAttribute('cy', y(S).toFixed(1));
    g.setAttribute('x1', x(D).toFixed(1)); g.setAttribute('x2', x(D).toFixed(1)); g.setAttribute('y1', y(0).toFixed(1)); g.setAttribute('y2', y(S).toFixed(1));
  };
  tr.addEventListener('input', upd); li.addEventListener('input', upd); upd();
}
