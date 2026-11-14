import { esc, cap, nf, coord } from './format';
import { icon } from './icons';
import { ramp } from './score';
import { score, type Scored } from './model';
import { createView, zoomForGlobe, type View } from './map';
import { createStore, type Store } from './store';
import { loadTarget } from './data';
import { $, $$, html, isPhone, popover } from './ui';
import { footerHTML, creditsHTML } from './footer';
import { mountDetail } from './detail';
import type { Manifest, Target, TargetData } from './types';

const where = (r: { place: string; cc: string }) => [r.place, r.cc].filter(Boolean).join(', ');
const WIN_CHUNK = 12;

export interface Explore { store: Store; view: View; ready: Promise<void>; show(on: boolean): void; overview(animate?: boolean): void }

export function mountExplore(root: HTMLElement, m: Manifest, theme: () => string, startTarget: string): Explore {
  const dims = Object.keys(m.dims);
  const store = createStore({ target: startTarget, weights: Object.fromEntries(dims.map(d => [d, 1])), minScore: 60,
    regions: new Set(m.regions.map(r => r.id)), hover: null, selected: null, expanded: null });
  const S = store.state;
  const tgt = () => m.targets.find(t => t.id === S.target)!;
  let data: TargetData, scored: Scored; const shownCount = new Map<number, number>();

  root.insertAdjacentHTML('beforeend', `
  <div id="map" role="application" aria-label="Map of Earth windows scored against the selected Moon or Mars site"></div>
  <div class="tip" id="tip" hidden></div>
  <main class="explore" id="explore">
   <div class="dock" id="dock">
    <button class="grab" id="grab" aria-label="Resize panel" aria-expanded="false"><span></span></button>
    <section class="panel best" id="best" aria-label="Best match"></section>
    <section class="panel col-l" aria-label="Controls">
      <div class="section"><div class="label" id="lbl-target">Target</div>
        <button class="target" id="target-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="lbl-target target-name"></button></div>
      <div class="section"><div class="heading"><span class="label">Weights</span><span class="info" tabindex="0" role="img" aria-label="Weights recombine the terrain and illumination scores live. 0 ignores a dimension; 2 counts it double." title="Weights recombine the terrain and illumination scores live. 0 ignores a dimension; 2 counts it double.">${icon.info}</span></div>
        ${dims.map(n => slider(`w-${n}`, cap(n), 1, 0, 2, .1)).join('')}${slider('min', 'Minimum score', 60, 0, 100, 1)}</div>
      <div class="section"><button class="rowbtn" id="regions-btn" aria-haspopup="dialog" aria-expanded="false"><span class="l">${icon.layers}Earth regions</span><span class="muted tnum" id="regions-count"></span></button></div>
    </section>
    <section class="panel col-r" aria-label="Top matches"><header><h2>Top matches</h2><p class="tnum" id="matches-sub"></p></header>
      <div class="listwrap"><div class="list" id="list" tabindex="-1"></div></div></section>
    ${footerHTML(m)}
   </div>
  </main>
  <div class="pop picker" id="picker" role="dialog" aria-label="Choose a target" hidden></div>
  <div class="pop regions" id="regions" role="dialog" aria-label="Earth regions" hidden></div>
  ${creditsHTML(m)}`);

  function slider(id: string, name: string, val: number, min: number, max: number, step: number) {
    return `<div class="field"><div class="row"><label class="muted" for="${id}">${name}</label><output class="tnum" for="${id}" id="${id}-o">${val.toFixed(step < 1 ? 1 : 0)}</output></div>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="--p:${((val - min) / (max - min)) * 100}%"></div>`;
  }
  const mapEl = $('#map', root);
  const phone0 = isPhone();
  const view = createView(mapEl, [0, 20], phone0 ? 1.2 : 2.6, theme);
  const tip = $('#tip', root);

  const bestEl = $('#best', root), listEl = $('#list', root);
  // ---------- phone sheet snap points
  const dock = $('#dock', root), grab = $('#grab', root);
  const snaps = () => [isPhone() ? 24 + bestEl.offsetHeight + 4 : 168, Math.round(innerHeight * .55), innerHeight - 64];
  let snap = 0;
  const applySnap = (h: number, i = snap) => {
    if (i > 0 && snap === 0) dock.scrollTop = 0;
    snap = i; dock.style.setProperty('--sheet-h', `${h}px`); dock.dataset.snap = ['peek', 'half', 'full'][i]; grab.setAttribute('aria-expanded', String(i > 0));
    if (isPhone()) view.setPadding({ top: 52, bottom: Math.min(h, innerHeight * .6), left: 0, right: 0 }); else view.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  };
  const setSnap = (i: number) => applySnap(snaps()[i], i);
  grab.addEventListener('click', () => setSnap((snap + 1) % 3));
  let drag: { y: number; h: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => { if (!isPhone()) return; drag = { y: e.clientY, h: dock.getBoundingClientRect().height, t: e.timeStamp }; dock.classList.add('dragging'); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: PointerEvent) => { if (!drag) return; const h = Math.max(120, Math.min(innerHeight - 64, drag.h + drag.y - e.clientY)); dock.style.setProperty('--sheet-h', `${h}px`); };
  const onUp = (e: PointerEvent) => {
    if (!drag) return; dock.classList.remove('dragging');
    const h = dock.getBoundingClientRect().height, v = (drag.y - e.clientY) / Math.max(e.timeStamp - drag.t, 1), s = snaps();
    const moved = Math.abs(drag.y - e.clientY) > 6; drag = null; if (!moved) return;
    const proj = h + v * 160; let best = 0; s.forEach((x, i) => { if (Math.abs(x - proj) < Math.abs(s[best] - proj)) best = i; }); setSnap(best);
  };
  grab.addEventListener('pointerdown', onDown); grab.addEventListener('pointermove', onMove); grab.addEventListener('pointerup', onUp); grab.addEventListener('pointercancel', onUp);
  addEventListener('resize', () => setSnap(isPhone() ? snap : 0));

  // ---------- rendering
  function renderTarget() {
    const t = tgt();
    $('#target-btn', root).innerHTML = `${t.thumb ? `<img src="./thumbs/${t.thumb}" alt="" width="48" height="48">` : '<span class="thumb"></span>'}
      <span class="t"><span class="name" id="target-name">${esc(t.name)}</span><span class="sub"><span>${esc(t.detail)}</span>${t.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span></span>${icon.chevron}`;
  }
  function renderBest() {
    const t = tgt(), k = scored.shown[0];
    if (k == null) {
      bestEl.innerHTML = `<div class="label">Best match</div><div class="empty"><b>${scored.zeroWeights ? 'All weights are 0' : `No window scores ${S.minScore} or more`}</b>
        <span class="muted">${scored.zeroWeights ? 'Raise a weight to rank windows.' : S.regions.size === 0 ? 'No Earth region is selected.' : 'Lower the minimum score or select more regions.'}</span></div>`;
      return;
    }
    const r = m.regions[scored.site[k]];
    bestEl.innerHTML = `
      <div class="tchip">${t.thumb ? `<img src="./thumbs/${t.thumb}" alt="" width="32" height="32">` : ''}<span><b>${esc(t.name)}</b><em>${esc(t.detail)}</em></span></div>
      <div class="label">Best match</div>
      <button class="score" id="best-go" aria-label="Fly to the best match: ${esc(r.name)}, score ${scored.s[k].toFixed(0)} of 100"><b class="tnum">${scored.s[k].toFixed(0)}</b><span>/ 100</span></button>
      <div class="where">${esc(r.name)}</div>
      <div class="coords tnum">${esc(where(r))}${where(r) ? ' · ' : ''}${coord(scored.lat[k], scored.lon[k])}</div>
      <div class="dimrow tnum">${dims.map((n, x) => `<span>${cap(n)}<b>${scored.dim[x][k].toFixed(0)}</b></span>`).join('')}</div>
      <div class="legend"><span class="tnum">${S.minScore}</span><span class="ramp" role="img" aria-label="Score colour ramp from ${S.minScore} to 100"></span><span class="tnum">100</span></div>`;
    $('#best-go', root).addEventListener('click', () => flyWindow(k, false));
  }
  const winRow = (k: number, n: number) => `<li><button class="win" data-k="${k}"><span class="rk tnum">${n}</span>
      <span><span class="nm tnum">${coord(scored.lat[k], scored.lon[k])}</span><span class="dm tnum">${dims.map((d, x) => `${cap(d)} ${scored.dim[x][k].toFixed(0)}`).join(' · ')}</span></span>
      <span class="sc tnum"><span class="v"><i style="background:${ramp(scored.s[k], S.minScore)}"></i>${scored.s[k].toFixed(0)}</span></span></button></li>`;
  function renderList() {
    $('#matches-sub', root).textContent = scored.zeroWeights ? 'All weights are 0'
      : `Best window per region · ${nf(scored.shown.length)} of ${nf(scored.n)} score ${S.minScore}+`;
    if (!scored.regionOrder.length) { listEl.innerHTML = `<p class="empty-list">${scored.zeroWeights ? 'Raise a weight to rank windows.' : 'No windows match. Lower the minimum score or select more regions.'}</p>`; edge(); return; }
    listEl.innerHTML = scored.regionOrder.map((ri, n) => {
      const ks = scored.byRegion.get(ri)!, r = m.regions[ri], open = S.expanded === r.id, best = ks[0];
      return `<div class="rg" data-ri="${ri}"><button class="match${n === 0 ? ' top' : ''}" aria-expanded="${open}" data-ri="${ri}">
        <span class="rk tnum">${n + 1}</span>
        <span><span class="nm">${esc(r.name)}</span><span class="dm">${esc(where(r))}</span></span>
        <span class="sc tnum"><span class="v"><i style="background:${ramp(scored.s[best], S.minScore)}"></i>${scored.s[best].toFixed(0)}</span><span class="n">${nf(ks.length)} window${ks.length === 1 ? '' : 's'}</span></span>
        <span class="chev">${icon.chevron}</span></button>
        ${open ? `<ol class="wins">${ks.slice(0, WIN_CHUNK).map((k, i) => winRow(k, i + 1)).join('')}${ks.length > WIN_CHUNK ? `<li><button class="more" data-ri="${ri}" data-shown="${WIN_CHUNK}">Show more (${nf(ks.length - WIN_CHUNK)})</button></li>` : ''}</ol>` : ''}</div>`;
    }).join('');
    requestAnimationFrame(edge);
  }
  function edge() {
    const w = listEl.parentElement!; w.classList.toggle('can-up', listEl.scrollTop > 4);
    w.classList.toggle('can-down', listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 4);
  }
  listEl.addEventListener('scroll', edge, { passive: true });
  listEl.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest('button'); if (!t) return;
    if (t.classList.contains('win')) { flyWindow(Number(t.dataset.k), true); return; }
    if (t.classList.contains('more')) {
      const ri = Number(t.dataset.ri), ks = scored.byRegion.get(ri)!, shown = Number(t.dataset.shown), next = Math.min(ks.length, shown + 50);
      const li = t.parentElement!; li.insertAdjacentHTML('beforebegin', ks.slice(shown, next).map((k, i) => winRow(k, shown + i + 1)).join(''));
      if (next >= ks.length) li.remove(); else { t.dataset.shown = String(next); t.textContent = `Show more (${nf(ks.length - next)})`; } return;
    }
    if (t.classList.contains('match')) {
      const ri = Number(t.dataset.ri), r = m.regions[ri], was = S.expanded === r.id;
      store.set({ expanded: was ? null : r.id });
      if (!was) { flyWindow(scored.byRegion.get(ri)![0], false, 6.4, true); if (!isPhone()) requestAnimationFrame(() => { const row = $(`.match[data-ri="${ri}"]`, listEl); if (row) listEl.scrollTo({ top: row.offsetTop - 8, behavior: 'smooth' }); }); }
    }
  });
  listEl.addEventListener('pointerover', e => { const w = (e.target as HTMLElement).closest('.win') as HTMLElement | null; store.set({ hover: w ? Number(w.dataset.k) : null }); });
  listEl.addEventListener('pointerleave', () => store.set({ hover: null }));
  listEl.addEventListener('focusin', e => { const w = (e.target as HTMLElement).closest('.win') as HTMLElement | null; store.set({ hover: w ? Number(w.dataset.k) : null }); });

  /** Map padding so the focus point sits in the free part of the screen (beside the detail sheet, above the phone sheet). */
  const pad = (detail: boolean) => isPhone() ? { top: 52, bottom: detail ? Math.round(innerHeight * .68) : Math.min(dock.getBoundingClientRect().height, innerHeight * .6), left: 0, right: 0 }
    : { top: 0, bottom: 0, left: 0, right: detail ? 436 : 0 };
  function flyWindow(k: number, select: boolean, zoom = 9.4, keepSheet = false) {
    view.fly(scored.lon[k], scored.lat[k], zoom, pad(select || S.selected != null));
    if (select) store.set({ selected: k });
    if (isPhone() && !keepSheet) { setSnap(0); dock.scrollTop = 0; }
  }

  // ---------- pin for the best match
  const pinEl = html(`<div class="pin" aria-hidden="true">${icon.crosshair}<span class="tnum"></span></div>`);
  let pin: import('maplibre-gl').Marker | null = null;
  async function updatePin() {
    if ('dead' in view) return;
    const k = scored.shown[0]; const { default: ml } = await import('maplibre-gl');
    if (k == null) { pin?.remove(); pin = null; return; }
    $('span', pinEl).textContent = scored.s[k].toFixed(0);
    if (!pin) pin = new ml.Marker({ element: pinEl }).setLngLat([scored.lon[k], scored.lat[k]]).addTo(view.map); else pin.setLngLat([scored.lon[k], scored.lat[k]]);
  }

  // ---------- overview camera
  function overview(animate = true) {
    const ks = scored.shown.slice(0, 400);
    const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const c: [number, number] = ks.length ? [med(ks.map(k => scored.lon[k])), med(ks.map(k => scored.lat[k]))] : [0, 20];
    const availH = innerHeight - 52 - (isPhone() ? Math.min(snaps()[snap], innerHeight * .6) : 0);
    const D = isPhone() ? Math.min(innerWidth * .94, availH * .94) : availH * 1.12;
    if (animate) view.fly(c[0], c[1], zoomForGlobe(D)); else view.map.jumpTo({ center: c, zoom: zoomForGlobe(D) });
  }

  // ---------- recompute + push to map
  let pending = 0, first = true;
  function recompute(fit = false) {
    scored = score(m, data, S.weights, S.minScore, S.regions);
    $('#regions-count', root).textContent = `${S.regions.size} of ${m.regions.length}`;
    renderBest(); renderList(); updatePin();
    view.setScored(scored, S.minScore, m.window_km);
    if (fit || first) { overview(!first); first = false; }
  }
  const sched = (fit = false) => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => recompute(fit)); };

  // ---------- controls
  for (const d of dims) bindSlider(`w-${d}`, v => store.set({ weights: { ...S.weights, [d]: v } }), v => v.toFixed(1));
  bindSlider('min', v => store.set({ minScore: v }), v => String(v));
  function bindSlider(id: string, set: (v: number) => void, fmt: (v: number) => string) {
    const el = $<HTMLInputElement>(`#${id}`, root), out = $(`#${id}-o`, root);
    el.addEventListener('input', () => { const v = Number(el.value); out.textContent = fmt(v); el.style.setProperty('--p', `${((v - +el.min) / (+el.max - +el.min)) * 100}%`); set(v); });
  }
  store.subscribe(ch => {
    if (ch.includes('weights') || ch.includes('minScore') || ch.includes('regions')) sched();
    if (ch.includes('expanded')) renderList();
    if (ch.includes('hover')) view.mark('hl', S.hover);
    if (ch.includes('selected')) { view.mark('sel', S.selected); if (S.selected == null) view.setPadding(pad(false)); }
    if (ch.includes('target')) switchTarget();
  });
  view.onHover = (k, x, y) => {
    view.mark('hl', k);
    if (k == null || isPhone()) { tip.hidden = true; return; }
    const r = m.regions[scored.site[k]];
    tip.innerHTML = `<b class="tnum">${scored.s[k].toFixed(0)}</b> <span>${esc(r.name)}</span>`; tip.hidden = false;
    tip.style.transform = `translate(${Math.min(x + 14, innerWidth - 260)}px, ${y + 14}px)`;
  };
  view.onPick = k => { store.set({ selected: k }); view.fly(scored.lon[k], scored.lat[k], Math.max(view.map.getZoom(), 9.4), pad(true)); };

  async function switchTarget() {
    store.set({ selected: null, expanded: null, hover: null });
    renderTarget(); data = await loadTarget(S.target); recompute(true);
  }

  // ---------- target picker
  const pickerEl = $('#picker', root), targetBtn = $('#target-btn', root);
  const pick = popover(pickerEl, targetBtn);
  function renderPicker() {
    const groups: [string, string, Target[]][] = [['moon', 'Moon', []], ['mars', 'Mars', []]];
    for (const t of m.targets) (groups.find(g => g[0] === t.body) ?? groups[groups.push([t.body, cap(t.body), []]) - 1])[2].push(t);
    pickerEl.innerHTML = `<div class="pop-h"><h2>Target</h2><button class="icon-btn small" data-close aria-label="Close">${icon.close}</button></div>
      <div role="listbox" aria-label="Moon and Mars targets" class="opts">${groups.filter(g => g[2].length).map(([b, label, ts]) => `
      <div role="group" aria-label="${label}"><div class="grp">${b === 'mars' ? icon.mars : icon.moon}<span>${label}</span><span class="muted tnum">${ts.length}</span></div>
      ${ts.map(t => `<button role="option" class="opt" data-id="${t.id}" aria-selected="${t.id === S.target}" tabindex="${t.id === S.target ? 0 : -1}">
        ${t.thumb ? `<img src="./thumbs/${t.thumb}" alt="" width="40" height="40">` : '<span class="thumb"></span>'}
        <span class="t"><span class="name">${esc(t.name)}</span><span class="sub"><span>${esc(t.detail)}</span>${t.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</span></span></button>`).join('')}</div>`).join('')}</div>`;
  }
  targetBtn.addEventListener('click', () => { renderPicker(); pick.toggle(); (pickerEl.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus(); });
  pickerEl.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    if (b.dataset.close != null) { pick.close(); return; }
    if (b.dataset.id) { pick.close(); store.set({ target: b.dataset.id }); }
  });
  pickerEl.addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const o = $$('.opt', pickerEl), i = o.indexOf(document.activeElement as HTMLElement); e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? o.length - 1 : Math.max(0, Math.min(o.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    o.forEach(x => x.tabIndex = -1); o[n].tabIndex = 0; o[n].focus();
  });

  // ---------- region filter
  const regEl = $('#regions', root), regBtn = $('#regions-btn', root), regPop = popover(regEl, regBtn);
  function renderRegions(q = '') {
    const rows = m.regions.filter(r => (r.name + ' ' + r.place + ' ' + r.cc).toLowerCase().includes(q.toLowerCase()));
    $('.rlist', regEl).innerHTML = rows.map(r => `<label class="chk"><input type="checkbox" data-id="${r.id}" ${S.regions.has(r.id) ? 'checked' : ''}>
      <span class="box" aria-hidden="true"></span><span class="t"><span class="name">${esc(r.name)}</span><span class="sub">${esc(where(r)) || '&nbsp;'}</span></span></label>`).join('') || '<p class="empty-list">No region matches.</p>';
  }
  regEl.innerHTML = `<div class="pop-h"><h2>Earth regions</h2><button class="icon-btn small" data-close aria-label="Close">${icon.close}</button></div>
    <label class="search">${icon.search}<input type="search" placeholder="Search regions" aria-label="Search Earth regions" autocomplete="off"></label>
    <div class="bulk"><button class="link" data-all>Select all</button><button class="link" data-none>Select none</button><span class="muted tnum" id="reg-n"></span></div>
    <div class="rlist" role="group" aria-label="Earth regions"></div>`;
  const regN = () => { $('#reg-n', regEl).textContent = `${S.regions.size} of ${m.regions.length} selected`; };
  regBtn.addEventListener('click', () => { renderRegions(); regN(); regPop.toggle(); ($('input[type=search]', regEl) as HTMLInputElement).focus(); });
  regEl.addEventListener('input', e => { const i = e.target as HTMLInputElement; if (i.type === 'search') renderRegions(i.value); });
  regEl.addEventListener('change', e => {
    const i = e.target as HTMLInputElement; if (i.type !== 'checkbox') return;
    const s = new Set(S.regions); i.checked ? s.add(i.dataset.id!) : s.delete(i.dataset.id!); store.set({ regions: s }); regN();
  });
  regEl.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    if (b.dataset.close != null) regPop.close();
    if (b.dataset.all != null || b.dataset.none != null) { store.set({ regions: b.dataset.all != null ? new Set(m.regions.map(r => r.id)) : new Set() }); renderRegions(($('input[type=search]', regEl) as HTMLInputElement).value); regN(); }
  });

  // ---------- credits
  const credEl = $('#credits', root), credBtn = $('#credits-btn', root);
  const credPop = popover(credEl, credBtn);
  credBtn.addEventListener('click', () => { credEl.style.cssText = ''; credPop.toggle(); credEl.style.left = credEl.style.top = ''; });
  $('#credits-close', root).addEventListener('click', () => credPop.close());

  mountDetail(root.querySelector('#explore')!, m, store, () => ({ scored, d: data as unknown as Record<string, number[] | number>, km: m.window_km }));
  renderTarget();
  const ready = loadTarget(S.target).then(d => { data = d; recompute(); requestAnimationFrame(() => { edge(); setSnap(snap); }); });
  return { store, view, ready,
    show(on: boolean) { $('#explore', root).classList.toggle('off', !on); (root.querySelector('#explore') as HTMLElement).inert = !on; },
    overview };
}
