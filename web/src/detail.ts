import { BASE } from './base';
import { esc, cap, nf, coord, pyFixed } from './format';
import { icon } from './icons';
import { ramp } from './score';
import { getJSON, loadDetail } from './data';
import { fieldEvents } from './eonet';
import { fieldKitHTML, type Rover } from './kit';
import { ciFor, decompFor, decompSummary } from './lib/stats';
import { onCleanup } from './lib/lifecycle';
import { $, $$, html, isPhone } from './ui';
import type { Manifest } from './types';
import type { Scored } from './model';
import type { Store } from './store';

const bold = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const THR_SIMILAR = 0.5, THR_DIFF = 1.5; // same thresholds as pen.scoring.explain()

export function mountDetail(root: HTMLElement, m: Manifest, store: Store, get: () => { scored: Scored }) {
  const S = store.state, dims = Object.keys(m.dims);
  const el = html(`<aside class="panel detail" id="detail" role="complementary" aria-label="Analog card" hidden tabindex="-1"></aside>`);
  root.appendChild(el);
  let opener: HTMLElement | null = null, blink = 0;
  let chartH: { dispose(): void } | null = null;
  const regionOf = (k: number) => m.regions[get().scored.site[k]];
  const where = (r: { place: string; cc: string }) => [r.place, r.cc].filter(Boolean).join(', ');
  const preview = (set: string[], id: string) => set.includes(id);

  async function open(k: number) {
    const { scored } = get(), d = await loadDetail(S.target), t = m.targets.find(x => x.id === S.target)!, r = regionOf(k);
    const sc = m.scale, i = (d.i as number[])[k], j = (d.j as number[])[k], wid = `${r.id}_${i}_${j}`;
    const lat = scored.lat[k], lon = scored.lon[k], score = scored.s[k];
    const rank = scored.shown.indexOf(k) + 1;
    const feats = dims.flatMap(n => m.dims[n]);
    const dv = feats.map(f => ({ f, v: d[`d_${f}`][k] / sc.d }));
    const R = Math.min(4, Math.max(2, Math.ceil(Math.max(...dv.map(x => Math.abs(x.v))))));
    const similar = dv.filter(x => Math.abs(x.v) <= THR_SIMILAR).map(x => m.feature_labels[x.f]);
    const differs = dv.filter(x => Math.abs(x.v) >= THR_DIFF).map(x => `${m.feature_labels[x.f]} (${x.v > 0 ? 'higher' : 'lower'} on Earth)`);
    const [repro, credits, rover, thermal] = await Promise.all([getJSON<Record<string, string[]>>('reproduce'), getJSON<Record<string, string>>('credits'),
      getJSON<Record<string, Rover>>('rover_twin').catch(() => ({} as Record<string, Rover>)), thermalRef(t.id, t.body)]);
    const [boot, decomp] = await Promise.all([getJSON<Record<string, unknown>>('stats/bootstrap').catch(() => null), getJSON<Record<string, unknown>>('stats/decomp').catch(() => null)]);
    if (import.meta.env?.DEV && ((boot as { _stub?: boolean } | null)?._stub || (decomp as { _stub?: boolean } | null)?._stub)) console.warn('[detail] stats are stubs: CI and decomposition stay hidden');
    const ci = ciFor(boot, t.id, wid), drivers = decompFor(decomp, t.id, wid, m.feature_labels);
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
    <section class="d-sec"><div class="d-score"><b class="tnum">${pyFixed(score)}</b><span>/ 100 combined</span></div>
      ${ci ? ciHTML(ci, m.windows_per_target) : ''}
      <div class="dimbars">${dims.map((n, x) => `<div class="dimbar"><span>${cap(n)}</span><span class="track"><i style="width:${scored.dim[x][k]}%;background:${ramp(scored.dim[x][k], S.minScore)}"></i></span><b class="tnum">${pyFixed(scored.dim[x][k])}</b></div>`).join('')}</div></section>

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
      <p class="d-note">Scaled differences: (Earth − target) / IQR of all Earth windows. |d| ≤ 0.5 = similar, |d| ≥ 1.5 = different.</p>
      ${drivers ? `<div class="d-decomp"><h4>What drives the distance</h4><div class="d-decomp-chart" id="d-decomp" style="height:${60 + drivers.length * 24}px"></div><p class="d-note">Share of each feature in the squared distance to ${esc(t.name)}.</p></div>` : ''}</section>

    <section class="d-sec"><div class="d-h"><h3>Earth can't reproduce</h3></div>
      <ul class="stats">${(repro[t.id] ?? []).map(s => `<li>${bold(s)}</li>`).join('')}</ul></section>

    ${temperatureHTML(d as unknown as Record<string, (number | null)[]>, k, thermal)}
    ${mineralsHTML(d as unknown as Record<string, (number | null)[]>, k, t.body)}

    <section class="d-sec"><div class="d-h"><h3>Field safety</h3><span class="muted tiny">NASA EONET</span></div><div id="eonet" class="eonet" aria-live="polite"><span class="muted">Checking NASA EONET…</span></div></section>

    <section class="d-sec d-rev-sec"><details class="d-rev" id="d-rev"><summary><span class="k-t"><h3>Other targets this window serves</h3><span class="muted tiny">Reverse search across all ${m.targets.length} targets</span></span></summary><div class="d-rev-body" id="d-rev-body"></div></details></section>

    ${fieldKitHTML({ ex, brief, targetName: t.name, regionName: r.name, rover: roverT, regions: m.regions })}

    <section class="d-sec links"><a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps/@${lat},${lon},12z">Google Maps</a>
      <a class="link" target="_blank" rel="noopener" href="https://worldview.earthdata.nasa.gov/?v=${lon - 0.2},${lat - 0.2},${lon + 0.2},${lat + 0.2}">NASA Worldview</a></section></div>`;
    el.hidden = false; root.classList.add('has-detail'); opener = document.activeElement as HTMLElement;
    $('#d-title', el).focus({ preventScroll: true });
    $('#d-close', el).addEventListener('click', () => store.set({ selected: null }));

    // ----- decomposition chart (lib/chart.ts is loaded only now, so ECharts never enters the first-load bundle)
    chartH?.dispose(); chartH = null;
    if (drivers) {
      const host = $('#d-decomp', el), summary = decompSummary(drivers, t.name), rows = drivers.slice().reverse();
      void import('./lib/chart').then(({ mountChart }) => {
        if (S.selected !== k || !host.isConnected) return;
        chartH = mountChart(host, {
          grid: { left: 124, right: 44, top: 4, bottom: 4 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${pyFixed(v * 100)} %` },
          xAxis: { type: 'value', max: 1, show: false }, yAxis: { type: 'category', data: rows.map(x => x.label), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { width: 112, overflow: 'break' } },
          series: [{ type: 'bar', data: rows.map(x => x.share), barWidth: 12, itemStyle: { borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', formatter: (q: { value: number }) => `${pyFixed(q.value * 100)} %`, color: 'inherit' } }],
        }, { summary, label: 'Share of each feature in the distance to the target', managed: false });
      });
    }
    // ----- reverse search: loaded on first open (it needs every target's scores)
    const rev = $<HTMLDetailsElement>('#d-rev', el);
    rev.addEventListener('toggle', async () => {
      const body = $('#d-rev-body', el); if (!rev.open || body.dataset.done) return; body.dataset.done = '1';
      body.innerHTML = '<p class="muted">Loading all targets…</p>';
      try {
        const [{ loadReverseData, renderReverse }, { loadTarget }] = await Promise.all([import('./components/reverse'), import('./data')]);
        const data = await loadReverseData(m, loadTarget, loadDetail);
        if (S.selected === k) renderReverse(body, wid, data);
      } catch (e) { console.error(e); body.dataset.done = ''; body.innerHTML = '<p class="muted">Could not load the reverse search.</p>'; }
    });

    // ----- compare
    const cmp = $('#cmp', el), a = $<HTMLImageElement>('#cmp-a', el), b = $<HTMLImageElement>('#cmp-b', el), h = $('#cmp-h', el), miss = $('#cmp-miss', el), cap2 = $('#cmp-cap', el);
    let src: 'low' | 'real' = 'low', mode: 'swipe' | 'blink' = 'swipe', showB = true;
    const setX = (x: number) => { x = Math.max(0, Math.min(100, x)); cmp.style.setProperty('--x', `${x}%`); h.setAttribute('aria-valuenow', String(Math.round(x))); };
    const paint = () => {
      const refSrc = src === 'low' ? `${BASE}thumbs/ref/${t.id}.jpg` : `${BASE}thumbs/ref_real/${t.id}.jpg`;
      const winOk = src === 'low' ? hasLow : hasReal, winSrc = src === 'low' ? `${BASE}thumbs/win/${wid}.jpg` : `${BASE}thumbs/real/${wid}.jpg`;
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
  function close() { chartH?.dispose(); chartH = null; stopB(); el.hidden = true; root.classList.remove('has-detail'); opener?.isConnected && opener.focus({ preventScroll: true }); }
  const stopB = () => { clearInterval(blink); blink = 0; };
  store.subscribe(ch => { if (ch.includes('selected')) { stopB(); S.selected == null ? close() : open(S.selected); } });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); store.set({ selected: null }); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden && !(e.target as HTMLElement)?.closest?.('.pop')) store.set({ selected: null }); });
  void $$;
}

// ---- surface temperature: this Earth window (MODIS) against the target (Diviner or Mars Climate Database); context, not scored
type Thermal = { mean: number; lo: number; hi: number; what: string } | null;
async function thermalRef(id: string, body: string): Promise<Thermal> {
  try {
    if (body === 'moon') {
      const v = (await getJSON<{ sites: Record<string, Record<string, number>> }>('diviner')).sites[id];
      return v ? { mean: v.temp_avg_mean_K, lo: v.temp_avg_min_K, hi: v.temp_max_max_K, what: 'LRO Diviner, measured: annual mean 2 cm below the surface, coldest mean to hottest surface maximum' } : null;
    }
    if (body === 'mars') {
      const v = (await getJSON<{ sites: Record<string, Record<string, number>> }>('mars_context')).sites[id];
      return v ? { mean: v.tsurf_mean_K, lo: v.tsurf_min_K, hi: v.tsurf_max_K, what: 'Mars Climate Database v6.2, modelled surface temperature' } : null;
    }
  } catch { /* optional context */ }
  return null;
}
function temperatureHTML(d: Record<string, (number | null)[]>, k: number, ref: Thermal): string {
  const mean = d.lst_mean?.[k], lo = d.lst_min?.[k], hi = d.lst_max?.[k];
  if (mean == null || lo == null || hi == null) return '';
  const e = { mean: mean / 10, lo: lo / 10, hi: hi / 10 };
  const K0 = 0, K1 = 360, x = (v: number) => `${Math.max(0, Math.min(100, ((v - K0) / (K1 - K0)) * 100)).toFixed(1)}%`;
  const bar = (cls: string, lab: string, t: { mean: number; lo: number; hi: number }) =>
    `<div class="trow"><span class="tl">${lab}</span><span class="tplot"><span class="tbar ${cls}" style="left:${x(t.lo)};width:calc(${x(t.hi)} - ${x(t.lo)})"></span><span class="tdot ${cls}" style="left:${x(t.mean)}"></span></span><b class="tv tnum">${Math.round(t.mean)} K</b></div>`;
  const gap = ref ? Math.round(e.mean - ref.mean) : 0;
  return `<section class="d-sec"><div class="d-h"><h3>Surface temperature</h3><span class="muted tiny">NASA MODIS</span></div>
    <div class="temp" role="img" aria-label="Annual temperature: this Earth window mean ${Math.round(e.mean)} K, range ${Math.round(e.lo)} to ${Math.round(e.hi)} K${ref ? `; target mean ${Math.round(ref.mean)} K, range ${Math.round(ref.lo)} to ${Math.round(ref.hi)} K` : ''}">
      ${bar('t-earth', 'This window', e)}${ref ? bar('t-ref', 'Target', ref) : ''}
      <div class="tticks tnum">${[0, 100, 200, 300].map(v => `<span style="left:${x(v)}">${v} K</span>`).join('')}</div></div>
    <p class="d-note">Earth: MODIS MOD11A2 clear-sky land-surface temperature, 2025: mean of day and night, from the 5th percentile of nights to the 95th of days (${Math.round(e.mean - 273.15)} °C on average).${ref ? ` Target: ${esc(ref.what)}. On average this window is <b>${Math.abs(gap)} K ${gap >= 0 ? 'warmer' : 'colder'}</b>.` : ''} Context only, not scored: the two quantities are not measured the same way.</p></section>`;
}

// ---- surface minerals: NASA EMIT EMIT-10 weighted shares for this Earth window, where EMIT saw at least half of it; context, not scored
function mineralsHTML(d: Record<string, (number | null)[]>, k: number, body: string): string {
  const v = (key: string) => d[key]?.[k];
  const cov = v('emit_cov');
  if (cov == null) return '';
  const rows: [string, string, number][] = [['Clays', 'emit_clays', 0], ['Carbonates', 'emit_carbonates', 0], ['Iron oxides', 'emit_iron_oxides', 0], ['Sulfates', 'emit_sulfates', 0]]
    .map(([lab, key]) => [lab as string, key as string, (v(key as string) ?? 0) / 1000]);
  const none = (v('emit_none') ?? 0) / 1000, pct = (x: number) => `${Math.round(x * 100)}%`;
  const why = body === 'moon'
    ? 'The lunar surface has almost no clays, carbonates or sulfates, so where EMIT finds them the mineral analogy breaks. EMIT cannot see the basalt minerals (olivine, pyroxene, plagioclase) that make an Earth site look lunar.'
    : 'Clays, carbonates and sulfates have been mapped from orbit in places on Mars, so here they can be a point of resemblance; they are not part of the score.';
  const alien = Math.max(rows[0][2], rows[1][2], rows[3][2]);  // clays, carbonates, sulfates: what the Moon lacks
  const here = body === 'moon' ? (alien < 0.05 ? ' Here EMIT finds almost none of them.' : ` Here they reach ${pct(alien)}: a mineral difference from the Moon.`) : '';
  return `<section class="d-sec"><div class="d-h"><h3>Surface minerals</h3><span class="muted tiny">NASA EMIT</span></div>
    <div class="dimbars">${rows.map(([lab, , x]) => `<div class="dimbar"><span>${lab}</span><span class="track"><i style="width:${Math.min(100, x * 100)}%;background:var(--text-3)"></i></span><b class="tnum">${pct(x)}</b></div>`).join('')}</div>
    <p class="d-note">EMIT-10 weighted shares of the ${pct(cov / 1000)} of this window EMIT observed (2023–2025, cloud ≤ 20 %); not abundances. No detection: ${pct(none)}. Iron oxides are a lower bound. ${why}${here}</p></section>`;
}

/** 95 % interval of the score: a quiet strip plus plain text. Equal weights (the run the interval was computed for). */
function ciHTML(ci: { score: number; lo: number; hi: number; rankLo: number; rankHi: number; resamples: number | null }, n: number) {
  const f = (x: number) => pyFixed(x, 1);
  return `<div class="d-ci" role="group" aria-label="95 % confidence interval of the score">
    <div class="d-ci-strip" aria-hidden="true"><i style="left:${ci.lo}%;width:${Math.max(ci.hi - ci.lo, 0.8)}%"></i><b style="left:${ci.score}%"></b></div>
    <p class="d-ci-t tnum"><b>95 % CI ${f(ci.lo)}–${f(ci.hi)}</b> · could rank #${nf(ci.rankLo)} to #${nf(ci.rankHi)} of ${nf(n)}</p>
    <p class="d-note">Bootstrap of the target's reference windows${ci.resamples ? ` (${nf(ci.resamples)} resamples)` : ''}, equal weights.</p></div>`;
}
