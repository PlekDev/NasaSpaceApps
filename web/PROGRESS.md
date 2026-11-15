# web/ — progress (resume file)

Branch `paul/web-ui` (not pushed). UI AI-assisted (Claude Code); reviewed by the author.
Run: `python -I web/tools/export_data.py && cd web && npm install && npm run dev` (or `make web-dev`; `make web` builds to web/dist).

## Main merge check (PR #8 "extras/field-tools", rebased onto origin/main b612108)
Changed: `scripts/extras/*`, `docs/EXTRAS.md`, `figures/extras/*` (twin-light mp4 + poster per Moon target, astronaut-view PNG for 3 targets,
rover-twin PNG for 9 targets), `data/processed/briefs/*` (md + ics + low-sun CSV for 6 Earth regions, rover_twin.json).
No change to `app/`, `config/sites.yaml`, `pen/`, `windows.csv`, scoring. Targets/regions/counts unchanged (9 / 14 / 10,424).
Meaning for the web app: new optional "field extras" for the detail sheet (M2): per target twin-light poster + mp4, astronaut view, rover
twin figure and its numbers (rover_twin.json); per Earth region the field brief (md), calendar (.ics) and low-sun CSV. Plan: export posters
and PNGs downscaled, link the mp4/ics/csv from the repo files copied to public/extras (size-checked).

## Milestones (all done)
- M0 design system + static screen. M1 export, intro, Explore map, picker, region filter, top matches, best match, phone sheet.
- M2 detail sheet (compare, diverging bars, Diviner/Mars rows from the app's own cant_reproduce(), EONET, extras).
- M3 Analog in time, Validation (native score matrix, sortable known-analog table, figure lightbox), Method.
- M4 perf (MapLibre in a lazy chunk, data split core/detail), axe-core clean on 8 views x 3 sizes x 2 themes, tests, short-screen layout, no-WebGL fallback.
- Tests: `make test` (17), `python -m pytest -q web/tests` (4), `npm test` in web/ (19), `python web/tests/e2e.py` (18 browser checks).

## Main merges tracked
- PR #8 (field extras): rendered in the detail sheet.
- PR #7 + #9 (known-analog coordinates verified, 8 sites, n_tests 48; Earth LST pipeline, data pending; far-horizon wording "up to 150 km away"):
  known-analog numbers and the METHOD text flow through the export automatically; the far-horizon sentence was updated to the app's new wording.
  When a thermal dimension lands in `pen/features.py` DIMENSIONS and `windows.csv`, the export, sliders, bars and heatmap pick it up as a third dimension
  (not exercised with real data yet: check the left panel height and the heatmap "All" panel).

## Performance (production build, throttled "Fast 4G": 1.6 Mbit/s, 150 ms RTT, cache off)
LCP 1.78 s on the intro (budget 2.5 s). First load 515 KB transferred (budget 1.5 MB): JS 303 KB gz (main chunk 22 KB + MapLibre chunk 288 KB, loaded after first paint),
CSS 18 KB, fonts 68 KB, first target core data 105 KB gz (window ids and scaled differences load only when a window is opened), thumbs 19 KB.

## Known issues / not done
- Imagery is GIBS Blue Marble (about 500 m/px at its maximum level), so squares at zoom 9+ sit on blurry imagery. Landsat WELD is only served as WMS and returns opaque black over ocean, so it was not added.
- Real-GPU frame rate was not measured (no GPU here); the 20 min deck.gl comparison could only compare bundle size.
- Windows are drawn as axis-aligned squares around the centre; the real windows are projected squares, so edges can differ slightly at high latitude.
- Safari and Firefox were not tested (Chromium only).
- `web/tests/e2e.py` and the axe/perf scripts need Playwright and are not part of `make web-test`.

Screenshots: /tmp/pen-web/ (m0..m4, both themes, 390/768/1024/1440/1920).
