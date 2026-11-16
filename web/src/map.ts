import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RAMP_HEX } from './score';
import { squareRing, distKm, type Scored } from './model';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
/** Sentinel-2 cloudless (10 m): sharp land imagery once the camera is close; GIBS Blue Marble (500 m) stays underneath and alone at globe scale. */
const SHARP = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
const CARTO = (v: string) => ['a', 'b', 'c', 'd'].map(s => `https://${s}.basemaps.cartocdn.com/${v}/{z}/{x}/{y}@2x.png`);
export const SQUARE_ZOOM = 7.5;
const SKY = {
  dark: { 'sky-color': '#17345f', 'horizon-color': '#3d6fb0', 'fog-color': '#05070b' },
  light: { 'sky-color': '#a9c6ee', 'horizon-color': '#d3e1f4', 'fog-color': '#dde2ea' },
};
const ease = (t: number) => 1 - Math.pow(1 - t, 4);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Zoom at which the globe is `px` pixels across (calibrated: 685 px at z 2.35 in MapLibre's globe). */
export const zoomForGlobe = (px: number) => 2.35 + Math.log2(px / 685);

export function colorExpr(lo: number): maplibregl.ExpressionSpecification {
  const st: (number | string)[] = [];
  RAMP_HEX.forEach((c, k) => st.push(lo + ((100 - lo) * k) / 3, c));
  return ['interpolate', ['linear'], ['get', 's'], ...st] as unknown as maplibregl.ExpressionSpecification;
}
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export class MapView {
  map: maplibregl.Map;
  private scored: Scored | null = null; private min = 60; private km = 6; private fallback = false; private errs = 0;
  private ready: Promise<void>; private raf = 0;
  /** resolves when the style (and so the globe projection) is in place, without waiting for imagery tiles */
  readonly styled: Promise<void>;
  onPick: (k: number) => void = () => {}; onHover: (k: number | null, x: number, y: number) => void = () => {};

  constructor(container: HTMLElement, center: [number, number], zoom: number, private theme: () => string) {
    this.map = new maplibregl.Map({
      container, center, zoom, minZoom: 0.8, maxZoom: 12.5, attributionControl: false, renderWorldCopies: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
      style: { version: 8, projection: { type: 'globe' },
        sources: { gibs: { type: 'raster', tiles: [GIBS], tileSize: 256, maxzoom: 8 }, sharp: { type: 'raster', tiles: [SHARP], tileSize: 256, maxzoom: 14 } },
        layers: [{ id: 'imagery', type: 'raster', source: 'gibs', paint: { 'raster-fade-duration': 0 } },
          { id: 'sharp', type: 'raster', source: 'sharp', minzoom: 5.5, paint: { 'raster-fade-duration': 0, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 7.5, 1] } }] },
    });
    this.map.touchZoomRotate.disableRotation();
    this.ready = new Promise(res => this.map.on('load', () => { this.init(); res(); }));
    this.map.on('style.load', () => this.sky());
    this.styled = new Promise(res => this.map.once('style.load', () => res()));
    this.map.on('error', e => {
      if ((e as unknown as { sourceId?: string }).sourceId === 'gibs' && ++this.errs >= 4 && !this.fallback) this.addFallback();
    });
    new MutationObserver(() => { this.sky(); if (this.fallback) this.swapFallback(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  private sky() {
    const c = this.theme() === 'light' ? SKY.light : SKY.dark;
    this.map.setSky({ ...c, 'sky-horizon-blend': 0.35, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] } as maplibregl.SkySpecification);
  }
  /** GIBS unreachable: flat CARTO basemap per theme (attribution is shown in the footer). */
  private addFallback() {
    this.fallback = true;
    this.map.addSource('carto', { type: 'raster', tiles: CARTO(this.theme() === 'light' ? 'light_nolabels' : 'dark_nolabels'), tileSize: 256 });
    this.map.addLayer({ id: 'carto', type: 'raster', source: 'carto' }, 'imagery');
    document.documentElement.dataset.basemap = 'carto';
  }
  private swapFallback() { if (this.map.getLayer('carto')) { this.map.removeLayer('carto'); this.map.removeSource('carto'); this.fallback = false; this.addFallback(); } }

  private init() {
    const m = this.map;
    for (const id of ['windows', 'squares', 'hl', 'sel']) m.addSource(id, { type: 'geojson', data: empty });
    m.addLayer({ id: 'squares-fill', type: 'fill', source: 'squares', minzoom: SQUARE_ZOOM - 1, paint: {
      'fill-color': colorExpr(this.min), 'fill-opacity': ['interpolate', ['linear'], ['zoom'], SQUARE_ZOOM, 0, SQUARE_ZOOM + 1.5, .6] } });
    m.addLayer({ id: 'squares-line', type: 'line', source: 'squares', minzoom: SQUARE_ZOOM, paint: {
      'line-color': 'rgba(255,255,255,.9)', 'line-width': .75, 'line-opacity': ['interpolate', ['linear'], ['zoom'], SQUARE_ZOOM, 0, SQUARE_ZOOM + 1.5, .4] } });
    m.addLayer({ id: 'points', type: 'circle', source: 'windows', paint: {
      'circle-color': colorExpr(this.min),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.4, 3, 5, 6, 8, 9, 12],
      'circle-stroke-color': 'rgba(255,255,255,.85)', 'circle-stroke-width': .8,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], SQUARE_ZOOM, .95, SQUARE_ZOOM + 1.5, 0],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], SQUARE_ZOOM, 1, SQUARE_ZOOM + 1.5, 0] } });
    for (const [id, col, w] of [['hl', '#ffffff', 2], ['sel', '#ffffff', 3]] as const) {
      m.addLayer({ id: `${id}-ring`, type: 'circle', source: id, filter: ['==', '$type', 'Point'], maxzoom: SQUARE_ZOOM + 1, paint: {
        'circle-radius': id === 'sel' ? 13 : 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': col, 'circle-stroke-width': w } });
      m.addLayer({ id: `${id}-sq`, type: 'line', source: id, filter: ['==', '$type', 'Polygon'], minzoom: SQUARE_ZOOM, paint: { 'line-color': col, 'line-width': w + 0.5 } });
    }
    const pick = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const p = e.point, f = m.queryRenderedFeatures([[p.x - 7, p.y - 7], [p.x + 7, p.y + 7]], { layers: ['squares-fill', 'points'] });
      return f.length ? Number(f[0].properties!.k) : null;
    };
    m.on('mousemove', e => { const k = pick(e); m.getCanvas().style.cursor = k == null ? '' : 'pointer'; this.onHover(k, e.point.x, e.point.y); });
    m.on('mouseout', () => this.onHover(null, 0, 0));
    m.on('click', e => { const k = pick(e); if (k != null) this.onPick(k); });
    m.on('moveend', () => this.schedSquares());
  }

  async setScored(s: Scored, min: number, km: number) {
    this.scored = s; this.min = min; this.km = km; await this.ready;
    const m = this.map, ll = s.lon, la = s.lat;
    const feats = s.shown.map(k => ({ type: 'Feature' as const, properties: { s: Math.round(s.s[k] * 10) / 10, k },
      geometry: { type: 'Point' as const, coordinates: [ll[k], la[k]] } }));
    (m.getSource('windows') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
    m.setPaintProperty('points', 'circle-color', colorExpr(min)); m.setPaintProperty('squares-fill', 'fill-color', colorExpr(min));
    this.schedSquares();
  }
  private schedSquares() { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.buildSquares()); }
  private buildSquares() {
    const s = this.scored, m = this.map; if (!s || !m.getSource('squares')) return;
    const src = m.getSource('squares') as maplibregl.GeoJSONSource;
    if (m.getZoom() < SQUARE_ZOOM - 1) { src.setData(empty); return; }
    const b = m.getBounds(), padLon = (b.getEast() - b.getWest()) * .25, padLat = (b.getNorth() - b.getSouth()) * .25;
    const feats: GeoJSON.Feature[] = [];
    for (const k of s.shown) {
      const x = s.lon[k], y = s.lat[k];
      if (y < b.getSouth() - padLat || y > b.getNorth() + padLat || x < b.getWest() - padLon || x > b.getEast() + padLon) continue;
      feats.push({ type: 'Feature', properties: { s: Math.round(s.s[k] * 10) / 10, k }, geometry: { type: 'Polygon', coordinates: [squareRing(x, y, this.km)] } });
    }
    src.setData({ type: 'FeatureCollection', features: feats });
  }
  /** Mark a window as hovered ('hl') or selected ('sel'); null clears. */
  mark(kind: 'hl' | 'sel', k: number | null) {
    const src = this.map.getSource(kind) as maplibregl.GeoJSONSource | undefined; if (!src) return;
    const s = this.scored;
    if (k == null || !s) { src.setData(empty); return; }
    src.setData({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lon[k], s.lat[k]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [squareRing(s.lon[k], s.lat[k], this.km)] } }] });
  }
  /** Eased flight, 600–1200 ms depending on distance. */
  fly(lon: number, lat: number, zoom: number, padding?: maplibregl.PaddingOptions) {
    const c = this.map.getCenter(), d = distKm([c.lng, c.lat], [lon, lat]);
    const duration = reduced() ? 0 : Math.round(Math.min(1200, Math.max(600, 600 + d / 12 + Math.abs(zoom - this.map.getZoom()) * 40)));
    this.map.flyTo({ center: [lon, lat], zoom, duration, easing: ease, essential: false, curve: 1.2, ...(padding ? { padding } : {}) });
  }
  jumpTo(o: maplibregl.JumpToOptions) { this.map.jumpTo(o); }
  easeTo(o: maplibregl.EaseToOptions) { this.map.easeTo(o); }
  getCenter(): [number, number] { const c = this.map.getCenter(); return [c.lng, c.lat]; }
  getZoom() { return this.map.getZoom(); }
  resize() { this.map.resize(); }
  stop() { this.map.stop(); }
  private pin: maplibregl.Marker | null = null;
  setPin(el: HTMLElement | null, lon = 0, lat = 0) {
    if (!el) { this.pin?.remove(); this.pin = null; return; }
    if (!this.pin) this.pin = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(this.map); else this.pin.setLngLat([lon, lat]);
  }
  setPadding(p: maplibregl.PaddingOptions) { this.map.easeTo({ padding: p, duration: reduced() ? 0 : 300 }); }
  private marks: maplibregl.Marker[] = [];
  /** Replace the DOM labels on the map (known analog sites). */
  setMarkers(list: { el: HTMLElement; lon: number; lat: number }[]) {
    this.marks.forEach(m => m.remove());
    this.marks = list.map(o => new maplibregl.Marker({ element: o.el, anchor: 'left', offset: [-6, 0] }).setLngLat([o.lon, o.lat]).addTo(this.map));
  }
}

/** No-WebGL stand-in: same surface as MapView, does nothing. Lets rankings, lists and filters keep working. */
const noop: any = new Proxy(function () {}, { get: () => noop, apply: () => noop }); // eslint-disable-line @typescript-eslint/no-explicit-any
export class NullView {
  dead = true; map: maplibregl.Map = noop; styled: Promise<void> = Promise.resolve();
  onPick: MapView['onPick'] = () => {}; onHover: MapView['onHover'] = () => {};
  async setScored(..._a: unknown[]) {} mark(..._a: unknown[]) {} fly(..._a: unknown[]) {} setPadding(..._a: unknown[]) {} jumpTo(..._a: unknown[]) {} easeTo(..._a: unknown[]) {}
  getCenter(): [number, number] { return [0, 0]; } getZoom() { return 1; } resize() {} stop() {} setPin(..._a: unknown[]) {} setMarkers(..._a: unknown[]) {}
}
export const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
export type View = MapView | NullView;
export function createView(container: HTMLElement, center: [number, number], zoom: number, theme: () => string): View {
  if (!hasWebGL()) { document.documentElement.dataset.nowebgl = ''; return new NullView(); }
  try { return new MapView(container, center, zoom, theme); } catch { document.documentElement.dataset.nowebgl = ''; return new NullView(); }
}
