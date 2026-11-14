import { esc, cap, nf, coord } from './format';
import { icon } from './icons';
import { ramp } from './score';
import { getJSON } from './data';
import { fieldEvents } from './eonet';
import { $, $$, html, isPhone } from './ui';
import type { Manifest } from './types';
import type { Scored } from './model';
import type { Store } from './store';

interface Rover { earth_site: string; target: Record<string, number>; earth: Record<string, number> }
const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const THR_SIMILAR = 0.5, THR_DIFF = 1.5; // same thresholds as pen.scoring.explain()

export function mountDetail(root: HTMLElement, m: Manifest, store: Store, get: () => { scored: Scored; d: Record<string, number[] | number>; km: number }) {
  const S = store.state, dims = Object.keys(m.dims);
  const el = html(`<aside class="panel detail" id="detail" role="complementary" aria-label="Analog card" hidden tabindex="-1"></aside>`);
  root.appendChild(el);
  let opener: HTMLElement | null = null, blink = 0;
  const regionOf = (k: number) => m.regions[get().scored.site[k]];
  const where = (r: { place: string; cc: string }) => [r.place, r.cc].filter(Boolean).join(', ');
  const preview = (set: string[], id: string) => set.includes(id);

  async function open(k: number) {
    const { scored, d } = get(), t = m.targets.find(x => x.id === S.target)!, r = regionOf(k);
    const sc = m.scale, i = (d.i as number[])[k], j = (d.j as number[])[k], wid = `${r.id}_${i}_${j}`;
    const lat = scored.lat[k], lon = scored.lon[k], score = scored.s[k];
    const rank = scored.shown.indexOf(k) + 1;
    const feats = dims.flatMap(n => m.dims[n]);
    const dv = feats.map(f => ({ f, v: (d[`d_${f}`] as number[])[k] / sc.d }));
    const R = Math.min(4, Math.max(2, Math.ceil(Math.max(...dv.map(x => Math.abs(x.v))))));
    const similar = dv.filter(x => Math.abs(x.v) <= THR_SIMILAR).map(x => m.feature_labels[x.f]);
    const differs = dv.filter(x => Math.abs(x.v) >= THR_DIFF).map(x => `${m.feature_labels[x.f]} (${x.v > 0 ? 'higher' : 'lower'} on Earth)`);
    const [repro, credits, rover] = await Promise.all([getJSON<Record<string, string[]>>('reproduce'), getJSON<Record<string, string>>('credits'),
      getJSON<Record<string, Rover>>('rover_twin').catch(() => ({} as Record<string, Rover>))]);
    if (S.selected !== k) return; // closed or changed while loading
    const hasLow = preview(m.previews.low, wid), hasReal = preview(m.previews.real, wid);
    const refCredit = credits[`ref__${t.id}`] ?? 'NASA imagery', winCredit = credits[wid] ?? 'NASA imagery';
    const ex = m.extras[t.id] ?? {}, brief = m.briefs[r.id];
    const roverT = (rover as Record<string, Rover>)[t.id];

    el.innerHTML = `
    <header class="d-head"><div><div class="label tnum">Earth window · #${nf(rank)} of ${nf(scored.shown.length)}</div><h2 id="d-title" tabindex="-1">${esc(r.name)}</h2>
      <div class="sub tnum">${esc(where(r))}${where(r) ? ' · ' : ''}${coord(lat, lon)}</div></div>
      <button class="icon-btn small" id="d-close" aria-label="Close analog card">${icon.close}</button></header>
    <div class="d-body">
    <section class="d-sec"><div class="d-score"><b class="tnum">${score.toFixed(0)}</b><span>/ 100 combined</span></div>
      <div class="dimbars">${dims.map((n, x) => `<div class="dimbar"><span>${cap(n)}</span><span class="track"><i style="width:${scored.dim[x][k]}%;background:${ramp(scored.dim[x][k], S.minScore)}"></i></span><b class="tnum">${scored.dim[x][k].toFixed(0)}</b></div>`).join('')}</div></section>

    <section class="d-sec"><div class="d-h"><h3>Compare</h3>
      <div class="seg" role="group" aria-label="Image source"><button data-src="low" aria-pressed="true">Low Sun</button><button data-src="real" aria-pressed="false">NASA imagery</button></div></div>
      <div class="cmp" id="cmp" data-mode="swipe" style="--x:50%">
        <img id="cmp-a" alt="${esc(t.name)}, reference window" src="">
        <img id="cmp-b" alt="${esc(r.name)}, Earth window" src="">
        <span class="cap l">${esc(cap(t.body))}</span><span class="cap r">Earth</span>
        <div class="handle" id="cmp-h" role="slider" tabindex="0" aria-label="Comparison position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span></span></div>
        <div class="miss" id="cmp-miss" hidden></div></div>
      <div class="d-h tight"><div class="seg" role="group" aria-label="Comparison mode"><button data-mode="swipe" aria-pressed="true">Swipe</button><button data-mode="blink" aria-pressed="false">Blink</button></div></div>
      <p class="d-cap tnum" id="cmp-cap"></p></section>

    <section class="d-sec"><div class="d-h"><h3>Similar and different</h3></div>
      <div class="diverge" role="img" aria-label="Scaled differences in IQR units: ${dv.map(x => `${m.feature_labels[x.f]} ${x.v.toFixed(2)}`).join(', ')}">
        <div class="axis" style="--R:${R}"><span class="band"></span>${[-R, 0, R].map(v => `<span class="tick tnum" style="left:${50 + (v / R) * 50}%">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</span>`).join('')}</div>
        ${dv.map(x => { const w = Math.min(Math.abs(x.v), R) / R * 50, cls = Math.abs(x.v) >= THR_DIFF ? 'diff' : Math.abs(x.v) <= THR_SIMILAR ? 'sim' : 'mid';
          return `<div class="drow"><span class="dl">${esc(m.feature_labels[x.f])}</span><span class="dplot" style="--R:${R}"><span class="dbar ${cls}" style="${x.v >= 0 ? `left:50%` : `right:50%`};width:${w}%"></span><b class="dv tnum">${x.v > 0 ? '+' : x.v < 0 ? '−' : ''}${Math.abs(x.v).toFixed(2)}</b></span></div>`; }).join('')}
        <div class="legend2"><span>Earth lower</span><span>Earth higher</span></div></div>
      <dl class="explain"><dt>Similar in</dt><dd>${similar.length ? esc(similar.join(' · ')) : '—'}</dd><dt>Differs in</dt><dd>${differs.length ? esc(differs.join(' · ')) : '— nothing beyond 1.5 IQR'}</dd></dl>
      <p class="d-note">Scaled differences: (Earth − target) / IQR of all Earth windows. |d| ≤ 0.5 = similar, |d| ≥ 1.5 = different.</p></section>

    <section class="d-sec"><div class="d-h"><h3>Earth can't reproduce</h3></div>
      <ul class="stats">${(repro[t.id] ?? []).map(s => `<li>${bold(s)}</li>`).join('')}</ul></section>

    <section class="d-sec"><div class="d-h"><h3>Field safety</h3><span class="muted tiny">NASA EONET</span></div><div id="eonet" class="eonet" aria-live="polite"><span class="muted">Checking NASA EONET…</span></div></section>

    ${(ex.twin || ex.astro || ex.rover || brief) ? `<section class="d-sec"><div class="d-h"><h3>Field extras</h3></div>
      ${ex.twin ? `<details class="xtra"><summary>Twin-light timelapse</summary><div class="xbody"><p class="d-cap">Sun 2° above the horizon, azimuth stepping 5°: shadows on ${esc(t.name)} and its best Earth window.</p>
        ${ex.video ? `<video controls preload="none" poster="./extras/${ex.twin}" src="./extras/${ex.video}" aria-label="Twin-light timelapse for ${esc(t.name)}"></video>` : `<img src="./extras/${ex.twin}" alt="Twin-light poster" loading="lazy">`}</div></details>` : ''}
      ${ex.astro ? `<details class="xtra"><summary>What the astronaut sees</summary><div class="xbody"><img src="./extras/${ex.astro}" alt="Eye-level view, ${esc(t.name)} and its best Earth window" loading="lazy"><p class="d-cap">Eye level (1.7 m), terrain up to 15 km away, each body's curvature.</p></div></details>` : ''}
      ${ex.rover ? `<details class="xtra"><summary>Twin rover traverse</summary><div class="xbody"><img src="./extras/${ex.rover}" alt="Least-cost route on ${esc(t.name)} and its Earth analog" loading="lazy">
        ${roverT ? roverTable(roverT, t.name, m) : ''}</div></details>` : ''}
      ${brief ? `<div class="dl-row"><span class="muted">Field brief · ${esc(r.name)}</span><span>${[['brief', 'Brief'], ['calendar', 'Calendar .ics'], ['csv', 'Low-Sun CSV']].filter(x => brief[x[0] as 'brief']).map(x => `<a class="link" download href="./extras/briefs/${brief[x[0] as 'brief']}">${x[1]}</a>`).join('')}</span></div>` : ''}
    </section>` : ''}

    <section class="d-sec links"><a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps/@${lat},${lon},12z">Google Maps</a>
      <a class="link" target="_blank" rel="noopener" href="https://worldview.earthdata.nasa.gov/?v=${lon - 0.2},${lat - 0.2},${lon + 0.2},${lat + 0.2}">NASA Worldview</a></section></div>`;
    el.hidden = false; root.classList.add('has-detail'); opener = document.activeElement as HTMLElement;
    $('#d-title', el).focus({ preventScroll: true });
    $('#d-close', el).addEventListener('click', () => store.set({ selected: null }));

    // ----- compare
    const cmp = $('#cmp', el), a = $<HTMLImageElement>('#cmp-a', el), b = $<HTMLImageElement>('#cmp-b', el), h = $('#cmp-h', el), miss = $('#cmp-miss', el), cap2 = $('#cmp-cap', el);
    let src: 'low' | 'real' = 'low', mode: 'swipe' | 'blink' = 'swipe', showB = true;
    const setX = (x: number) => { x = Math.max(0, Math.min(100, x)); cmp.style.setProperty('--x', `${x}%`); h.setAttribute('aria-valuenow', String(Math.round(x))); };
    const paint = () => {
      const refSrc = src === 'low' ? `./thumbs/ref/${t.id}.jpg` : `./thumbs/ref_real/${t.id}.jpg`;
      const winOk = src === 'low' ? hasLow : hasReal, winSrc = src === 'low' ? `./thumbs/win/${wid}.jpg` : `./thumbs/real/${wid}.jpg`;
      a.src = refSrc; b.src = winOk ? winSrc : ''; b.hidden = !winOk; cmp.classList.toggle('single', !winOk);
      miss.hidden = winOk; miss.textContent = winOk ? '' : `No ${src === 'low' ? 'low-Sun preview' : 'NASA imagery'} was rendered for this window. The top windows of each region have one.`;
      cap2.innerHTML = src === 'low'
        ? `${esc(t.name)} · ${m.window_km} km · Sun 3° from SW<br>${esc(r.name)} (${lat.toFixed(3)}, ${lon.toFixed(3)}) · same Sun, same scale`
        : `Real view · ${esc(refCredit)}<br>Real view · ${esc(winCredit)}<br><span class="d-note">Same ${m.window_km} km windows, reprojected onto the same grid as the previews, from NASA APIs (Moon/Mars Trek WMTS and GIBS, api.nasa.gov).</span>`;
      cmp.dataset.show = showB ? 'b' : 'a';
    };
    el.querySelectorAll<HTMLButtonElement>('[data-src]').forEach(x => x.addEventListener('click', () => { src = x.dataset.src as 'low' | 'real'; el.querySelectorAll('[data-src]').forEach(y => y.setAttribute('aria-pressed', String(y === x))); paint(); }));
    const stopBlink = () => { clearInterval(blink); blink = 0; };
    el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(x => x.addEventListener('click', () => {
      mode = x.dataset.mode as 'swipe' | 'blink'; cmp.dataset.mode = mode; el.querySelectorAll('[data-mode]').forEach(y => y.setAttribute('aria-pressed', String(y === x)));
      stopBlink(); showB = true; paint();
      if (mode === 'blink' && !matchMedia('(prefers-reduced-motion: reduce)').matches) blink = window.setInterval(() => { showB = !showB; paint(); }, 1100);
    }));
    cmp.addEventListener('click', e => { if (mode === 'blink' && !(e.target as HTMLElement).closest('.handle')) { stopBlink(); showB = !showB; paint(); } });
    const move = (e: PointerEvent) => { const r2 = cmp.getBoundingClientRect(); setX(((e.clientX - r2.left) / r2.width) * 100); };
    h.addEventListener('pointerdown', e => { h.setPointerCapture(e.pointerId); move(e); const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); }; h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); });
    cmp.addEventListener('pointerdown', e => { if (mode === 'swipe' && e.target === cmp) move(e); });
    h.addEventListener('keydown', e => { const v = Number(h.getAttribute('aria-valuenow')); if (e.key === 'ArrowLeft') { setX(v - 5); e.preventDefault(); } if (e.key === 'ArrowRight') { setX(v + 5); e.preventDefault(); } });
    paint();

    // ----- field safety
    fieldEvents(r.id, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000).then(({ events, how }) => {
      if (S.selected !== k) return; const box = $('#eonet', el);
      const head = `<span class="muted tiny">${esc(how)}</span>`;
      if (events === null) box.innerHTML = `<span class="muted">Field-safety data is unavailable right now.</span>`;
      else if (!events.length) box.innerHTML = `<div class="ev ok"><i></i><span><b>No open natural events within 150 km.</b> ${head}</span></div>`;
      else box.innerHTML = `<div class="ev warn"><i></i><span><b>${events.length} open natural event${events.length === 1 ? '' : 's'} within 150 km</b> ${head}</span></div>
        <ul>${events.slice(0, 4).map(e => `<li><b>${esc(e.title)}</b> <span class="muted tnum">(${esc(e.category)}, ${esc(e.date)}, ~${e.distance_km} km away)</span></li>`).join('')}</ul>`;
    });
  }
  function close() { stopB(); el.hidden = true; root.classList.remove('has-detail'); opener?.isConnected && opener.focus({ preventScroll: true }); }
  const stopB = () => { clearInterval(blink); blink = 0; };
  store.subscribe(ch => { if (ch.includes('selected')) { stopB(); S.selected == null ? close() : open(S.selected); } });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); store.set({ selected: null }); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden && !(e.target as HTMLElement)?.closest?.('.pop')) store.set({ selected: null }); });
  void $$;
}

function roverTable(r: Rover, name: string, m: Manifest) {
  const site = m.regions.find(x => x.id === r.earth_site)?.name ?? '';
  const row = (l: string, f: (o: Record<string, number>) => string) => `<tr><th scope="row">${l}</th><td class="tnum">${f(r.target)}</td><td class="tnum">${f(r.earth)}</td></tr>`;
  return `<table class="rt"><thead><tr><th></th><th>${esc(name)}</th><th>${esc(site)}</th></tr></thead><tbody>
    ${row('Length', o => `${o.length_km} km`)}${row('Climb', o => `${o.climb_m} m`)}${row('Max slope', o => `${o.max_slope_deg}°`)}${row('In shadow', o => `${Math.round(o.share_in_shadow * 100)}%`)}</tbody></table>`;
}
