import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RAMP_HEX } from './score';

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';

const SKY = {
  dark: { 'sky-color': '#17345f', 'horizon-color': '#3d6fb0', 'fog-color': '#05070b' },
  light: { 'sky-color': '#a9c6ee', 'horizon-color': '#d3e1f4', 'fog-color': '#dde2ea' },
};
export function applySky(map: maplibregl.Map, theme: string) {
  map.setSky({ ...(theme === 'light' ? SKY.light : SKY.dark), 'sky-horizon-blend': 0.35, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] } as maplibregl.SkySpecification);
}

export function createMap(container: HTMLElement, center: [number, number], zoom: number, padding?: maplibregl.PaddingOptions) {
  const map = new maplibregl.Map({
    container, center, zoom, minZoom: 1, maxZoom: 14, attributionControl: { compact: false },
    renderWorldCopies: false, dragRotate: false, pitchWithRotate: false,
    style: {
      version: 8, projection: { type: 'globe' },
      sources: { gibs: { type: 'raster', tiles: [GIBS], tileSize: 256, maxzoom: 8,
        attribution: '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> · Blue Marble' } },
      layers: [{ id: 'imagery', type: 'raster', source: 'gibs', paint: { 'raster-fade-duration': 0 } }],
    },
  });
  if (padding) map.setPadding(padding);
  return map;
}

export function colorExpr(lo: number): maplibregl.ExpressionSpecification {
  const st: (number | string)[] = [];
  RAMP_HEX.forEach((c, k) => st.push(lo + ((100 - lo) * k) / 3, c));
  return ['interpolate', ['linear'], ['get', 's'], ...st] as unknown as maplibregl.ExpressionSpecification;
}

export function addWindows(map: maplibregl.Map, fc: GeoJSON.FeatureCollection, lo: number) {
  map.addSource('windows', { type: 'geojson', data: fc });
  map.addLayer({ id: 'windows', type: 'circle', source: 'windows', paint: {
    'circle-color': colorExpr(lo),
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.2, 3, 5, 6, 8, 9, 12],
    'circle-stroke-color': 'rgba(255,255,255,.85)', 'circle-stroke-width': 0.8, 'circle-opacity': .95,
  } });
}
