# web/ — decisions log

Format: decision · options · why. Autonomous mode: decisions are made against DESIGN.md and the brief.

1. **Top matches = best window per region, expandable.** Options: raw top-N windows (ten Mauna Kea rows), per-region. Per-region with window count; a click expands the region's ranked windows. (Owner decision.)
2. **`web/public/data` is generated, git-ignored.** `make web` = export + build; manifest carries a hash of data/processed and the git commit, shown in the footer. (Owner decision.)
3. **Light theme keeps the Blue Marble globe on a pale page.** (Owner decision.)
4. **Engine: MapLibre GL JS globe, not deck.gl GlobeView.** Prototype (10 min, capped at 20): a bare deck.gl 9 GlobeView + TileLayer + ScatterplotLayer bundles to 274 KB gzipped; the whole P.E.N. app on MapLibre is 298 KB gzipped, so size is a wash. fps could not be compared: this machine has no GPU (software rendering). Chosen because MapLibre gives one WebGL context for intro and explore (seamless fly-in), native globe projection with sky/atmosphere, raster tiles with overzoom, GeoJSON sources, `queryRenderedFeatures` picking and DOM markers out of the box; with deck.gl I would write tile loading, picking and the 6 km square LOD myself.
5. **Vanilla TypeScript, no framework.** The UI is a handful of panels with shared state; a framework would add bundle and a build step without removing code. A 40-line store + render functions is enough.
6. **Hash routing** (`#/`, `#/time`, `#/validation`, `#/method`): static hosting on GitHub Pages without rewrites.
7. **Attribution in the footer strip, not MapLibre's control**: one place for NASA/ESA credits, imagery attribution and the "Built with AI assistance" line; MapLibre's required attribution is rendered there too.
