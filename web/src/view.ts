/** Loads MapLibre in a separate chunk so the UI shell and intro text paint first; calls made before it is ready are replayed. */
import type { MapView, NullView } from './map';
import type maplibregl from 'maplibre-gl';
export const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export interface View {
  dead: boolean; ready: Promise<void>;
  onPick: (k: number) => void; onHover: (k: number | null, x: number, y: number) => void;
  setScored(s: import('./model').Scored, min: number, km: number): void; mark(kind: 'hl' | 'sel', k: number | null): void;
  fly(lon: number, lat: number, zoom: number, padding?: maplibregl.PaddingOptions): void; setPadding(p: maplibregl.PaddingOptions): void;
  jumpTo(o: maplibregl.JumpToOptions): void; easeTo(o: maplibregl.EaseToOptions): void; getCenter(): [number, number]; getZoom(): number; resize(): void;
  setPin(el: HTMLElement | null, lon?: number, lat?: number): void;
  setMarkers(list: MapMarker[]): void;
}
/** A DOM label placed on the map (known analog sites). */
export interface MapMarker { el: HTMLElement; lon: number; lat: number }

export function createDeferredView(container: HTMLElement, center: [number, number], zoom: number, theme: () => string): View {
  let inner: MapView | NullView | null = null; const q: (() => void)[] = []; const last = new Map<string, () => void>();
  const when = (key: string | null, f: () => void) => { if (inner) f(); else if (key) last.set(key, f); else q.push(f); };
  const v: View = {
    dead: !hasWebGL(), ready: Promise.resolve(),
    onPick: () => {}, onHover: () => {},
    setScored: (s, min, km) => when('scored', () => { void inner!.setScored(s, min, km); }),
    mark: (kind, k) => when(`mark-${kind}`, () => inner!.mark(kind, k)),
    fly: (lon, lat, zoom, p) => when('fly', () => inner!.fly(lon, lat, zoom, p)),
    setPadding: p => when('pad', () => inner!.setPadding(p)),
    jumpTo: o => when(null, () => inner!.jumpTo(o)), easeTo: o => when(null, () => inner!.easeTo(o)),
    getCenter: () => (inner ? inner.getCenter() : center), getZoom: () => (inner ? inner.getZoom() : zoom), resize: () => inner?.resize(),
    setPin: (el, lon, lat) => when('pin', () => inner!.setPin(el, lon, lat)),
    setMarkers: l => when('markers', () => inner!.setMarkers(l)),
  };
  v.ready = import('./map').then(({ createView }) => {
    inner = createView(container, center, zoom, theme); v.dead = 'dead' in inner;
    inner.onPick = k => v.onPick(k); inner.onHover = (k, x, y) => v.onHover(k, x, y);
    q.splice(0).forEach(f => f()); [...last.values()].forEach(f => f()); last.clear();
  });
  return v;
}
