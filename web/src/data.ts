import type { Manifest, TargetData } from './types.ts';
import { BASE as base } from './base.ts';
const cache = new Map<string, Promise<unknown>>();
export function getJSON<T>(name: string): Promise<T> {
  if (!cache.has(name)) cache.set(name, fetch(`${base}data/${name}.json`).then(r => { if (!r.ok) throw new Error(name); return r.json(); }));
  return cache.get(name) as Promise<T>;
}
export const loadManifest = () => getJSON<Manifest>('manifest');
export const loadTarget = (id: string) => getJSON<TargetData>(id);

export const getText = (name: string) => fetch(`${base}data/${name}`).then(r => { if (!r.ok) throw new Error(name); return r.text(); });

/** Window ids (i, j) and scaled differences d_*: only needed once a window is opened. */
export const loadDetail = (id: string) => getJSON<Record<string, number[]>>(`${id}.detail`);
