// AI-assisted (Claude Code); reviewed by the author.
/** Page-view registry: every view is a lazy chunk (nothing here is in the first-load bundle). Owners edit their own file under views/;
 *  they do not edit this registry. A view module exports  render(el, m, params)  (and optionally cleanup()). */
import { lazyView, type ViewModule } from './lib/lazy';
import type { RouteId } from './lib/routes';

export const VIEWS: Partial<Record<RouteId, ViewModule>> = {
  statistics: lazyView(() => import('./views/statistics'), { title: 'Statistics' }),
  proof: lazyView(() => import('./views/proof'), { title: 'Proof' }),
  mission: lazyView(() => import('./views/mission/index'), { title: 'Mission' }),
  dossier: lazyView(() => import('./views/dossier'), { title: 'Dossier' }),
  tour: lazyView(() => import('./views/tour'), { title: 'Tour' }),
  // existing views keep their own entry points; adapters resolve either render() or the legacy name
  when: lazyView(() => import('./views/time'), { title: 'When', pick: m => (m.render as never) ?? ((el: HTMLElement, mf: never, pr: never) => (m.renderTime as (e: HTMLElement, x: never, y: never) => void)(el, mf, pr)) }),
  method: lazyView(() => import('./views/method'), { title: 'Method', pick: m => (m.render as never) ?? ((el: HTMLElement) => (m.renderMethod as (e: HTMLElement) => void)(el)) }),
};

/** Keyboard access for scrollable tables and score matrices (applied after every page render). */
export function enhance(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('.tbl, .hm-scroll').forEach((t, i) => {
    t.tabIndex = 0; t.setAttribute('role', 'region');
    t.setAttribute('aria-label', t.querySelector('caption')?.textContent || (t.classList.contains('hm-scroll') ? 'Score matrix' : `Table ${i + 1}`));
  });
}
