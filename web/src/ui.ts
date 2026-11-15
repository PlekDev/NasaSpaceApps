/** Small DOM helpers shared by views. */
import { esc } from './format';
export const $ = <T extends HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
export const $$ = <T extends HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
export const html = (s: string) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild as HTMLElement; };
export const isPhone = () => matchMedia('(max-width: 820px)').matches;
export function setTheme(t: string) { document.documentElement.dataset.theme = t; try { localStorage.setItem('pen-theme', t); } catch { /* storage blocked */ } }
export { esc };

/** Popover (desktop, anchored) / bottom sheet (phone) with Esc, outside-click and focus return. */
export function popover(el: HTMLElement, anchor: HTMLElement, onClose?: () => void) {
  let open = false; const back = html('<div class="scrim" hidden></div>'); document.body.appendChild(back);
  const place = () => {
    if (isPhone()) { el.style.left = el.style.top = el.style.width = ''; return; }
    const r = anchor.closest('.col-l')?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
    el.style.left = `${r.left}px`; el.style.width = `${Math.max(r.width, 320)}px`;
    el.style.top = `${anchor.getBoundingClientRect().bottom + 8}px`;
    el.style.maxHeight = `${innerHeight - anchor.getBoundingClientRect().bottom - 52}px`;
  };
  const close = () => { if (!open) return; open = false; el.hidden = true; back.hidden = true; anchor.setAttribute('aria-expanded', 'false'); document.removeEventListener('keydown', key, true); onClose?.(); anchor.focus({ preventScroll: true }); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  back.addEventListener('click', close);
  document.addEventListener('pointerdown', e => { if (open && !el.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(); });
  return {
    get isOpen() { return open; },
    toggle() { open ? close() : this.open(); },
    open() { open = true; place(); el.hidden = false; back.hidden = !isPhone(); anchor.setAttribute('aria-expanded', 'true'); document.addEventListener('keydown', key, true); },
    close, place,
  };
}
