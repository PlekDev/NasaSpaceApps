// AI-assisted (Claude Code); reviewed by the author.
/** Route table and hash parsing. Pure (no DOM, no imports) so Node tests can load it directly.
 *
 *  Hash routes:  #/  #/explore  #/proof  #/mission  #/when  #/method  #/dossier  #/tour
 *  Aliases (replaceState, query kept):  #/validation -> #/proof,  #/limits -> #/proof (the view was removed),  #/time -> #/when
 *  Query strings live inside the hash:  #/dossier?target=moon_malapert&window=earth_hawaii_mauna_kea_700_1900&route=...
 *  Unknown paths render Home (and the URL is replaced by #/). */
export type RouteId = 'home' | 'explore' | 'proof' | 'mission' | 'when' | 'method' | 'dossier' | 'tour';
export type Params = Record<string, string>;
export interface RouteDef {
  id: RouteId; path: string; title: string;
  nav: 'primary' | 'secondary' | null;   // primary: top bar items; secondary: quiet button; null: contextual only (Dossier)
  stage: boolean;                        // true: shares the full-screen map stage (Home, Explore); false: a page view
}
export const ROUTES: RouteDef[] = [
  { id: 'home', path: '', title: 'Home', nav: null, stage: true },
  { id: 'explore', path: 'explore', title: 'Explore', nav: 'primary', stage: true },
  { id: 'proof', path: 'proof', title: 'Proof', nav: 'primary', stage: false },
  { id: 'mission', path: 'mission', title: 'Mission', nav: 'primary', stage: false },
  { id: 'when', path: 'when', title: 'When', nav: 'primary', stage: false },
  { id: 'method', path: 'method', title: 'Method', nav: 'primary', stage: false },
  { id: 'tour', path: 'tour', title: 'Tour', nav: 'secondary', stage: false },
  { id: 'dossier', path: 'dossier', title: 'Dossier', nav: null, stage: false },
];
export const REDIRECTS: Record<string, string> = { validation: 'proof', limits: 'proof', time: 'when' };

export interface Parsed {
  id: RouteId; def: RouteDef; path: string; params: Params;
  canonical: string;      // the hash the URL should have, e.g. "#/proof?x=1"
  replace: boolean;       // true when the URL differs from canonical (alias or unknown route): the router calls replaceState
  unknown: boolean;
}

const byPath = new Map(ROUTES.map(r => [r.path, r]));

export function buildHash(id: RouteId, params: Params = {}): string {
  const def = ROUTES.find(r => r.id === id)!;
  const q = new URLSearchParams(params).toString();
  return `#/${def.path}${q ? `?${q}` : ''}`;
}

/** Parse "#/proof?x=1", "#proof", "", "#/" ... into a route, its params and the canonical hash. */
export function parseHash(hash: string): Parsed {
  const raw = (hash || '').replace(/^#/, '');
  const qi = raw.indexOf('?');
  const pathPart = (qi < 0 ? raw : raw.slice(0, qi)).replace(/^\/+|\/+$/g, '').toLowerCase();
  const query = qi < 0 ? '' : raw.slice(qi + 1);
  const params: Params = {};
  new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
  const target = REDIRECTS[pathPart] ?? pathPart;
  const def = byPath.get(target);
  const unknown = !def && pathPart !== '';
  const route = def ?? byPath.get('')!;
  const keepQuery = unknown ? {} : params;
  const canonical = buildHash(route.id, keepQuery);
  const typed = hash && hash !== '#' ? hash : '#/';
  return { id: route.id, def: route, path: route.path, params: unknown ? {} : params, canonical, unknown, replace: typed !== canonical && (unknown || target !== pathPart || false) };
}
