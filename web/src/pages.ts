/** Secondary views (filled in M3). */
import type { Manifest } from './types';
export function renderPage(el: HTMLElement, route: string, _m: Manifest) {
  el.innerHTML = `<div class="page-in"><h1>${route}</h1><p class="muted">Coming next.</p></div>`;
}
