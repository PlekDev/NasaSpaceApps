import { icon } from '../icons';
import { esc } from '../format';
import { html } from '../ui';

/** Click-to-zoom lightbox: opens fitted to the screen, click the image to toggle 100 % with scrolling; Esc or the close button leaves. */
export function openLightbox(src: string, alt: string, opener?: HTMLElement) {
  const el = html(`<div class="lightbox" role="dialog" aria-modal="true" aria-label="${esc(alt)}"><button class="icon-btn close" aria-label="Close image">${icon.close}</button>
    <div class="lb-scroll"><img src="${esc(src)}" alt="${esc(alt)}"></div><div class="lb-cap">${esc(alt)} · click the image to zoom</div></div>`);
  document.body.appendChild(el);
  const img = el.querySelector('img')!, closeBtn = el.querySelector('button')!;
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); (opener ?? null)?.focus?.(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); } };
  document.addEventListener('keydown', key, true);
  closeBtn.addEventListener('click', close); closeBtn.focus();
  img.addEventListener('click', () => el.classList.toggle('zoomed'));
  el.addEventListener('click', e => { if (e.target === el || (e.target as HTMLElement).classList.contains('lb-scroll')) close(); });
}
export function figureCard(file: string, title: string, caption: string, opts: { wide?: boolean } = {}) {
  const src = `./figures/${file}`;
  return `<figure class="fig${opts.wide ? ' wide' : ''}"><div class="fig-h"><h3>${esc(title)}</h3><a class="link" href="${src}" target="_blank" rel="noopener">${esc(file.replace(/\.png$/, '').replace(/^fig(\d)_.*/, 'Figure $1 (static)'))}</a></div>
    <button class="fig-frame" data-zoom="${src}" data-alt="${esc(title)}" aria-label="Zoom: ${esc(title)}"><img src="${src}" alt="${esc(title)}" loading="lazy"></button><figcaption>${esc(caption)}</figcaption></figure>`;
}
export function wireFigures(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach(b => b.addEventListener('click', () => openLightbox(b.dataset.zoom!, b.dataset.alt!, b)));
}
