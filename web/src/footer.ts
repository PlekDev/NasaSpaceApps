import type { Manifest } from './types';
import { esc } from './format';
const CREDITS = 'NASA LRO LOLA (GSFC PGDA), NASA LRO Diviner (PDS Geosciences), NASA Moon/Mars Trek WMTS, NASA GIBS, NASA EONET, NASA MRO CTX DTMs (USGS Astrogeology), ESA Copernicus DEM GLO-30, Natural Earth.';
export function footerHTML(m: Manifest) {
  return `<footer class="foot"><span>Imagery NASA GIBS · data NASA, ESA · Built with AI assistance (see README → Use of AI)</span>
  <span class="tnum" title="git ${esc(m.git_commit)}">data ${esc(m.data_hash)}</span>
  <button class="link" id="credits-btn" aria-haspopup="dialog">Credits</button></footer>`;
}
export function creditsHTML(m: Manifest) {
  return `<div class="pop dialog" id="credits" role="dialog" aria-label="Credits" hidden>
    <h2>Credits</h2>
    <p>${CREDITS}</p>
    <p>Basemap imagery: NASA GIBS, Blue Marble Shaded Relief with Bathymetry. Map engine: MapLibre GL JS. Fallback basemap: © CARTO, © OpenStreetMap contributors.</p>
    <p>No NASA logos are used; nothing here is endorsed by NASA or ESA. Code MIT. Built with AI assistance (see README → Use of AI).</p>
    <p class="muted tnum">Data ${esc(m.data_hash)} · git ${esc(m.git_commit)} · ${m.targets.length} targets · ${m.regions.length} Earth regions · ${m.windows_per_target.toLocaleString('en-US')} windows per target</p>
    <button class="btn" id="credits-close">Close</button></div>`;
}
