// AI-assisted (Claude Code); reviewed by the author.
/** Hash router.
 *
 *  startRouter({ m, page, views, onChange, afterPage })
 *    - parses location.hash (see lib/routes.ts), applies redirects with history.replaceState (query kept)
 *    - stage routes (Home, Explore): onChange(parsed) and nothing else; main.ts shows the map stage
 *    - page routes: disposes the previous page scope (charts, three.js scenes, timers), clears `page`, then calls
 *      views[id].render(page, m, parsed.params); a returned function and view.cleanup() run when the route is left
 *    - returns { navigate(id, params?), current() }
 *
 *  Params:  every view receives the parsed query of the hash, e.g. #/dossier?target=a&window=b&route=c -> { target, window, route }. */
import type { Manifest } from '../types';
import { parseHash, buildHash, type Parsed, type RouteId, type Params } from './routes';
import { beginScope, currentScope } from './lifecycle.ts';
import type { ViewModule } from './lazy';

export interface RouterOpts {
  m: Manifest; page: HTMLElement; views: Partial<Record<RouteId, ViewModule>>;
  onChange(p: Parsed): void;          // called first, for every route (toggle stage/page, nav state, title)
  afterPage?(p: Parsed): void;        // called after a page view finished rendering (footer)
}

export function startRouter(o: RouterOpts) {
  let cur: Parsed = parseHash(location.hash), token = 0;
  async function apply() {
    const p = parseHash(location.hash);
    if (p.replace || (!location.hash && false)) history.replaceState(null, '', `${location.pathname}${location.search}${p.canonical}`);
    cur = p; const my = ++token;
    currentScope().dispose();                       // leave the previous view
    o.onChange(p);
    if (p.def.stage) return;
    const scope = beginScope();
    o.page.scrollTop = 0; o.page.innerHTML = '';
    const v = o.views[p.id];
    if (!v) { o.page.innerHTML = `<div class="page-in"><h1>${p.def.title}</h1></div>`; return; }
    try {
      const ret = await v.render(o.page, o.m, p.params);
      if (typeof ret === 'function') scope.add(ret);
    } catch (e) {
      console.error(e);
      o.page.innerHTML = `<div class="view-state" role="alert"><h2>Something went wrong</h2><p class="muted">This view could not be drawn (${String(e)}).</p><button class="btn" data-retry>Retry</button></div>`;
      o.page.querySelector('[data-retry]')?.addEventListener('click', () => void apply());
    }
    if (my === token && scope.alive) o.afterPage?.(p);
  }
  addEventListener('hashchange', () => void apply());
  void apply();
  return {
    navigate(id: RouteId, params?: Params) { const h = buildHash(id, params); if (location.hash === h) void apply(); else location.hash = h; },
    current: () => cur,
  };
}
