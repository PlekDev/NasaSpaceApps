// AI-assisted (Claude Code); reviewed by the author.
/** Cleanup scopes. The router opens one scope per mounted page view and disposes it on leave.
 *  Anything that owns resources (charts, three.js scenes, timers, observers, listeners) registers with onCleanup().
 *  lib/chart.ts does this automatically for every chart.  If a view creates things after an `await`,
 *  capture `const scope = currentScope()` first and check `scope.alive` before creating them. */
export interface Scope { alive: boolean; add(fn: () => void): void; dispose(): void }
export function createScope(): Scope {
  const fns: (() => void)[] = []; const s: Scope = {
    alive: true,
    add(fn) { if (!s.alive) { try { fn(); } catch (e) { console.error(e); } } else fns.push(fn); },
    dispose() { if (!s.alive) return; s.alive = false; while (fns.length) { try { fns.pop()!(); } catch (e) { console.error(e); } } },
  };
  return s;
}
let current: Scope = createScope();
export const currentScope = () => current;
export function beginScope(): Scope { current = createScope(); return current; }
/** Register cleanup for the current page view (runs when the router leaves the route). */
export function onCleanup(fn: () => void) { current.add(fn); }
