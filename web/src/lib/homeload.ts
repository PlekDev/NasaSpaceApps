// AI-assisted (Claude Code); reviewed by the author.
import { getJSON } from '../data';
import { homeFacts, shortcuts, type HomeFacts, type Shortcut } from './home';
import type { Manifest } from '../types';

export interface HomeData { facts: HomeFacts | null; shortcuts: Shortcut[] }
/** Load what Home needs (each file is optional: a missing or stubbed one only leaves its number pending). Cached. */
let cache: Promise<HomeData> | null = null;
export function loadHome(m: Manifest): Promise<HomeData> {
  if (!cache) {
    const opt = <T,>(name: string) => getJSON<T>(name).catch(() => null);
    cache = Promise.all([opt<Record<string, unknown>>('known_ranks'), opt<Record<string, unknown>>('far_horizons'), opt<Record<string, unknown>>('stats/null'),
      opt<Record<string, unknown>>('known_analogs'), opt<Record<string, unknown>>('matrix')]).then(([kr, far, nul, known, mx]) => {
      if (nul && (nul as { _stub?: boolean })._stub !== false && import.meta.env?.DEV) console.warn('[home] stats/null.json is a stub: the p-value stays pending');
      const facts = homeFacts(m, kr ?? {}, far, nul, known);
      return { facts, shortcuts: shortcuts(m, mx, kr, facts?.target.id ?? null) };
    }).catch((e): HomeData => { console.error('[home] facts unavailable', e); return { facts: null, shortcuts: [] }; });   // a reshaped file must never blank the app
  }
  return cache;
}
