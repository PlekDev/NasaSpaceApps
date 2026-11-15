import { esc, nf } from '../format';
import { getJSON } from '../data';
import type { Manifest } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Okabe–Ito-derived categorical colours: distinguishable under common colour-vision deficiencies, readable on both themes
const PALETTE = ['#3987e5', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442'];

export async function renderTime(el: HTMLElement, m: Manifest) {
  const res = await getJSON<{ low_sun_hours_by_month: Record<string, number[]> }>('results');
  const series = Object.entries(res.low_sun_hours_by_month).map(([id, v]) => ({ id, v, r: m.regions.find(r => r.id === id), mean: v.reduce((a, b) => a + b, 0) / v.length }))
    .filter(s => s.r).sort((a, b) => b.mean - a.mean);
  const pinned = new Set(series.slice(0, 4).map(s => s.id)); let hover: string | null = null;
  const max = Math.max(...series.flatMap(s => s.v));
  const narrow = el.clientWidth < 700, W = narrow ? 400 : 760, H = narrow ? 340 : 380, ml = narrow ? 34 : 44, mr = narrow ? 64 : 120, mt = 16, mb = 32, yMax = Math.ceil(max / 2) * 2 || 2;
  const x = (i: number) => ml + (i / 11) * (W - ml - mr), y = (v: number) => mt + (1 - v / yMax) * (H - mt - mb);
  const colorOf = (id: string) => { const k = [...pinned].indexOf(id); return k >= 0 ? PALETTE[k % PALETTE.length] : null; };
  el.innerHTML = `<div class="page-in"><h1>Analog in time</h1>
    <p class="lead">At the lunar south pole the Sun never climbs above ~7°. On Earth that light only lasts minutes at sunrise and sunset — except at high latitudes, where it lasts for hours around the equinoxes. P.E.N. tells field teams <b>when</b> to test rover vision and EVA lighting, not just <b>where</b>.</p>
    <div class="time-grid"><figure class="chart"><figcaption class="d-h"><h3>Hours per day with the Sun 0–7° above the horizon</h3></figcaption><div class="chart-box"><svg id="tc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of monthly low-Sun hours per day for each Earth region"></svg><div class="tip" id="tt" hidden></div></div>
      <p class="d-note">Standard declination and hour-angle formula, no refraction, by the latitude of each Earth region.</p></figure>
      <div class="regs" role="group" aria-label="Earth regions in the chart"><div class="label">Earth regions · click to show</div>${series.map(s => `<button class="reg" data-id="${s.id}" aria-pressed="${pinned.has(s.id)}"><i></i><span class="n">${esc(s.r!.name)}</span><span class="tnum muted">${s.mean.toFixed(1)} h</span></button>`).join('')}</div></div></div>`;
  const svg = el.querySelector<SVGSVGElement>('#tc')!, tt = el.querySelector<HTMLElement>('#tt')!;
  const path = (v: number[]) => v.map((a, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`).join('');
  const draw = () => {
    const grid = Array.from({ length: yMax / 2 + 1 }, (_, i) => i * 2).map(t => `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="gl"/><text x="${ml - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${t}</text>`).join('');
    const xs = MONTHS.map((mn, i) => `<text x="${x(i)}" y="${H - 10}" class="ax" text-anchor="middle">${mn}</text>`).join('');
    const rest = series.filter(s => !pinned.has(s.id) && s.id !== hover).map(s => `<path d="${path(s.v)}" class="ln dim"/>`).join('');
    let lastY = -99;
    const on = series.filter(s => pinned.has(s.id) || s.id === hover).sort((a, b) => a.v[11] - b.v[11]).map(s => { const c = colorOf(s.id) ?? 'var(--text-1)'; const last = s.v[11];
      return `<g><path d="${path(s.v)}" class="ln" stroke="${c}"${s.id === hover ? ' stroke-width="3"' : ''}/><circle cx="${x(11)}" cy="${y(last)}" r="3.5" fill="${c}"/>${(y(last) - lastY) >= 13 || s.id === hover ? (lastY = y(last), `<text x="${x(11) + 8}" y="${y(last) + 4}" class="ax" fill="${c}">${esc(s.r!.name.split(' ')[0])}</text>`) : ''}</g>`; }).join('');
    svg.innerHTML = `${grid}${xs}<text x="${ml}" y="10" class="ax">hours/day</text>${rest}${on}<line id="cx" class="cx" y1="${mt}" y2="${H - mb}" hidden/><rect id="hit" x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>`;
    el.querySelectorAll<HTMLButtonElement>('.reg').forEach(b => { const c = colorOf(b.dataset.id!); (b.querySelector('i') as HTMLElement).style.background = c ?? 'transparent'; (b.querySelector('i') as HTMLElement).style.borderColor = c ?? 'var(--text-3)'; b.setAttribute('aria-pressed', String(pinned.has(b.dataset.id!))); });
    const hit = svg.querySelector('#hit')!, cx = svg.querySelector<SVGLineElement>('#cx')!;
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect(), px = ((e as PointerEvent).clientX - r.left) / r.width * W, i = Math.max(0, Math.min(11, Math.round(((px - ml) / (W - ml - mr)) * 11)));
      cx.removeAttribute('hidden'); cx.setAttribute('x1', String(x(i))); cx.setAttribute('x2', String(x(i)));
      const rows = series.filter(s => pinned.has(s.id) || s.id === hover);
      tt.hidden = false; tt.innerHTML = `<b>${MONTHS[i]}</b>${rows.map(s => `<div><i style="background:${colorOf(s.id) ?? 'var(--text-1)'}"></i><span>${esc(s.r!.name)}</span><b class="tnum">${s.v[i].toFixed(1)} h</b></div>`).join('') || '<div class="muted">Pin a region</div>'}`;
      tt.style.left = `${Math.min(x(i) / W * 100, 70)}%`;
    });
    hit.addEventListener('pointerleave', () => { cx.setAttribute('hidden', ''); tt.hidden = true; });
  };
  el.querySelectorAll<HTMLButtonElement>('.reg').forEach(b => {
    b.addEventListener('click', () => { const id = b.dataset.id!; pinned.has(id) ? pinned.delete(id) : pinned.add(id); draw(); });
    b.addEventListener('pointerenter', () => { hover = b.dataset.id!; draw(); }); b.addEventListener('pointerleave', () => { hover = null; draw(); });
    b.addEventListener('focus', () => { hover = b.dataset.id!; draw(); }); b.addEventListener('blur', () => { hover = null; draw(); });
  });
  draw(); void nf;
}
