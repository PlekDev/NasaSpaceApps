/** Secondary views: Analog in time, Validation, Method & data. */
import type { Manifest } from './types';
import { renderTime } from './views/time';
import { renderValidation } from './views/validation';
import { renderMethod } from './views/method';

export async function renderPage(el: HTMLElement, route: string, m: Manifest) {
  el.innerHTML = `<div class="page-in"><p class="muted">Loading…</p></div>`;
  try {
    if (route === 'time') await renderTime(el, m);
    else if (route === 'validation') await renderValidation(el, m);
    else if (route === 'method') await renderMethod(el);
  } catch (e) { el.innerHTML = `<div class="page-in"><h1>Something went wrong</h1><p class="muted">The data for this view could not be loaded (${String(e)}). Run <code>python -I web/tools/export_data.py</code> and reload.</p></div>`; }
}
