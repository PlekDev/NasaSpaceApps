// AI-assisted (Claude Code); reviewed by the author.
/** lazyView(loader, { title }): a view whose code loads on first visit.
 *
 *    const proof = lazyView(() => import('./views/proof'), { title: 'Proof' });
 *    proof.render(el, manifest, params)      // shows a calm "Loading Proof…" line only if loading takes > 150 ms,
 *                                            // an error with a Retry button if the chunk fails, then calls the module's render()
 *
 *  The loaded module must export render(el, m, params) (a function returning void, a cleanup function, or a promise of either)
 *  and may export cleanup(). `pick` adapts modules that use another name. No shimmer skeletons: text only. */
import type { Manifest } from '../types';
import type { Params } from './routes';
import { currentScope } from './lifecycle.ts';

export type RenderFn = (el: HTMLElement, m: Manifest, params: Params) => void | (() => void) | Promise<void | (() => void)>;
export interface ViewModule { render: RenderFn; cleanup?: () => void }
type Loaded = Record<string, unknown>;

/** Loader with a cache that forgets failures, so Retry really retries. DOM-free: unit-tested in Node. */
export function createLoader<T>(load: () => Promise<T>) {
  let cached: Promise<T> | null = null;
  return {
    get(): Promise<T> {
      if (!cached) cached = load().catch(e => { cached = null; throw e; });
      return cached;
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function lazyView(load: () => Promise<Loaded>, opts: { title: string; pick?: (mod: Loaded) => RenderFn | undefined }): ViewModule {
  const loader = createLoader(load);
  let moduleCleanup: (() => void) | undefined;
  const view: ViewModule = {
    async render(el, m, params) {
      const scope = currentScope();
      let tries = 0;
      let timer = window.setTimeout(() => { el.innerHTML = `<div class="view-state" role="status"><p>Loading ${esc(opts.title)}…</p></div>`; }, 150);
      const attempt = async (): Promise<void | (() => void)> => {
        try {
          const mod = await loader.get(); window.clearTimeout(timer);
          if (!scope.alive) return;                                   // the user left while the chunk was loading
          const fn = (opts.pick?.(mod) ?? (mod.render as RenderFn | undefined));
          if (typeof fn !== 'function') throw new Error(`${opts.title}: the view module has no render()`);
          el.innerHTML = '';
          const ret = await fn(el, m, params);
          moduleCleanup = typeof mod.cleanup === 'function' ? (mod.cleanup as () => void) : undefined;
          if (typeof ret === 'function') scope.add(ret);
          if (moduleCleanup) scope.add(moduleCleanup);
        } catch (e) {
          window.clearTimeout(timer);
          if (!scope.alive) return;
          console.error(e);
          // Browsers cache a failed dynamic import() of the same URL, so the first Retry may fail again: then offer a page reload (same route).
          const again = tries++ > 0;
          el.innerHTML = `<div class="view-state" role="alert"><h2>Could not load ${esc(opts.title)}</h2><p class="muted">Check your connection and try again.</p><button class="btn" data-retry>${again ? 'Reload page' : 'Retry'}</button></div>`;
          el.querySelector<HTMLButtonElement>('[data-retry]')!.addEventListener('click', () => {
            if (again) { location.reload(); return; }
            el.innerHTML = `<div class="view-state" role="status"><p>Loading ${esc(opts.title)}…</p></div>`; void attempt();
          });
        }
      };
      return attempt();
    },
  };
  return view;
}
