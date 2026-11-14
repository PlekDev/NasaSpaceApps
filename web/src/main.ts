import './tokens.css';
import './style.css';
import { loadManifest, loadTarget } from './data';
import { combine, ramp } from './score';
import { esc, cap, nf, coord } from './format';
import { icon } from './icons';
import maplibregl from 'maplibre-gl';
import { createMap, addWindows, applySky } from './map';
import type { Manifest, Target, TargetData } from './types';

const MIN = 60;
const where = (r: { place: string; cc: string }) => [r.place, r.cc].filter(Boolean).join(', ');
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

function setTheme(t: string) { document.documentElement.dataset.theme = t; try { localStorage.setItem('pen-theme', t); } catch { /* private mode */ } }

function rank(m: Manifest, d: TargetData, weights: number[], lo: number) {
  const dims = Object.keys(m.dims), counts = dims.map(k => m.dims[k].length), sc = m.scale.score;
  const rows: { k: number; s: number; dim: number[] }[] = [];
  for (let k = 0; k < d.n; k++) {
    const dim = dims.map(n => (d[`score_${n}`] as number[])[k] / sc);
    const s = combine(dim, weights, counts);
    if (s >= lo) rows.push({ k, s, dim });
  }
  return rows.sort((a, b) => b.s - a.s);
}

function shell(m: Manifest, t: Target, d: TargetData) {
  const dims = Object.keys(m.dims), weights = dims.map(() => 1);
  const rows = rank(m, d, weights, MIN), best = rows[0], ll = m.scale.lonlat;
  const region = (k: number) => m.regions[d.site[k]];
  const at = (k: number) => coord(d.lat[k] / ll, d.lon[k] / ll);
  const dimTxt = (r: typeof best) => dims.map((n, x) => `<span>${cap(n)}<b class="tnum">${r.dim[x].toFixed(0)}</b></span>`).join('');
  const tags = t.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('');
  const perRegion = new Map<number, { best: typeof best; n: number }>();
  for (const r of rows) { const g = perRegion.get(d.site[r.k]); if (!g) perRegion.set(d.site[r.k], { best: r, n: 1 }); else g.n++; }
  const ranked = [...perRegion.entries()].sort((a, b) => b[1].best.s - a[1].best.s);
  const top = ranked.map(([ri, g], n) => `
    <li><button class="match${n === 0 ? ' top' : ''}" ${n === 0 ? 'aria-selected="true"' : ''}>
      <span class="rk tnum">${n + 1}</span>
      <span><div class="nm">${esc(m.regions[ri].name)}</div><div class="dm">${esc(where(m.regions[ri]))}</div></span>
      <span class="sc tnum"><span class="v"><i style="background:${ramp(g.best.s, MIN)}"></i>${g.best.s.toFixed(0)}</span><span class="n">${nf(g.n)} window${g.n === 1 ? '' : 's'}</span></span></button></li>`).join('');
  const slider = (id: string, name: string, val: number, min: number, max: number, step: number, fmt: (v: number) => string) => `
    <div class="field"><div class="row"><label class="muted" for="${id}">${name}</label><output class="tnum" for="${id}">${fmt(val)}</output></div>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="--p:${((val - min) / (max - min)) * 100}%"></div>`;

  $('#app').innerHTML = `
  <div id="map" role="application" aria-label="Map of Earth windows scored against ${esc(t.name)}"></div>
  <header class="bar">
    <a class="brand" href="#"><b>P.E.N.</b><span>Planetary Environmental Navigator</span></a>
    <nav class="nav" aria-label="Views"><a href="#" aria-current="page">Explore</a><a href="#">Analog in time</a><a href="#">Validation</a><a href="#">Method</a></nav>
    <div class="grow"></div>
    <button class="icon-btn" id="theme" aria-label="Toggle light and dark theme"><span class="only-dark">${icon.sun}</span><span class="only-light">${icon.moon}</span></button>
  </header>

  <section class="panel col-l" aria-label="Controls">
    <div class="section">
      <div class="label" style="margin-bottom:var(--s-2)">Target</div>
      <button class="target" aria-haspopup="listbox">
        ${t.thumb ? `<img src="./thumbs/${t.thumb}" alt="" width="48" height="48">` : '<span class="thumb"></span>'}
        <span class="t"><div class="name">${esc(t.name)}</div><div class="sub"><span>${esc(t.detail)}</span>${tags}</div></span>${icon.chevron}
      </button>
    </div>
    <div class="section">
      <div class="heading"><span class="label">Weights</span>${icon.info}</div>
      ${dims.map(n => slider(`w-${n}`, cap(n), 1, 0, 2, .1, v => v.toFixed(1))).join('')}
      ${slider('min', 'Minimum score', MIN, 0, 100, 1, v => String(v))}
    </div>
    <div class="section">
      <button class="rowbtn"><span class="l">${icon.layers}Earth regions</span><span class="muted tnum">${m.regions.length} of ${m.regions.length}</span></button>
    </div>
  </section>

  <section class="panel best" aria-label="Best match">
    <div class="tchip">${t.thumb ? `<img src="./thumbs/${t.thumb}" alt="" width="32" height="32">` : ''}<span><b>${esc(t.name)}</b><em>${esc(t.detail)}</em></span></div>
    <div class="label">Best match</div>
    <div class="score"><b class="tnum">${best.s.toFixed(0)}</b><span>/ 100</span></div>
    <div class="where">${esc(region(best.k).name)}</div>
    <div class="coords tnum">${esc(where(region(best.k)))} · ${at(best.k)}</div>
    <div class="dimrow">${dimTxt(best)}</div>
    <div class="legend"><span class="tnum">${MIN}</span><span class="ramp" role="img" aria-label="Score colour ramp from ${MIN} to 100"></span><span class="tnum">100</span></div>
  </section>

  <section class="panel col-r" aria-label="Top matches">
    <header><h2>Top matches</h2><p class="tnum">Best window per region · ${nf(rows.length)} of ${nf(d.n)} score ${MIN}+</p></header>
    <ol class="list" style="margin:0">${top}</ol>
  </section>`;
  $('#theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  return { rows, ll };
}

async function boot() {
  const m = await loadManifest();
  const want = new URLSearchParams(location.search).get('target');
  const t = m.targets.find(x => x.id === want) ?? m.targets[0];
  const d = await loadTarget(t.id);
  const { rows, ll } = shell(m, t, d);
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const top = rows.slice(0, 400);
  const center: [number, number] = top.length ? [med(top.map(r => d.lon[r.k] / ll)), med(top.map(r => d.lat[r.k] / ll))] : [0, 20];
  const phone = innerWidth < 820;
  const map = createMap($('#map'), center, phone ? 1.2 : 2.85, phone ? { top: 52, bottom: 215, left: 0, right: 0 } : undefined);
  const sky = () => applySky(map, document.documentElement.dataset.theme ?? 'dark');
  map.on('style.load', sky);
  new MutationObserver(sky).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: rows.map(r => ({
    type: 'Feature', properties: { s: r.s, k: r.k }, geometry: { type: 'Point', coordinates: [d.lon[r.k] / ll, d.lat[r.k] / ll] } })) };
  map.on('load', () => {
    addWindows(map, fc, MIN);
    const b = rows[0]; if (!b) return;
    const el = document.createElement('div'); el.className = 'pin'; el.innerHTML = `${icon.crosshair}<span class="tnum">${b.s.toFixed(0)}</span>`;
    new maplibregl.Marker({ element: el }).setLngLat([d.lon[b.k] / ll, d.lat[b.k] / ll]).addTo(map);
  });
  (window as unknown as { __map: unknown }).__map = map;
}
boot();
