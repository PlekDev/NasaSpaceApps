# web/ — progress (resume file)

Merged into `main` (PR #12); follow-up fixes in `web/judge-fixes`. UI AI-assisted (Claude Code); reviewed by the author.
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

## Round 2 (done)
1. Blind rediscovery ranks computed in `export_data.py` (stdlib, no pandas) from windows.csv: position of the best window containing the site in the descending score_combined order (stable, ties keep file order = pandas rank "first"), with the percentile recomputed by the script's formula and asserted equal to known_analogs.json. Reproduces the README exactly: Malapert #1, Nobile Rim 1 #9, de Gerlache #19, Connecting Ridge #23, Leibnitz Beta #115, Haworth #483, of 10,424 (Mars: Jezero #4,798, Deuteronilus #5,215, Arcadia #7,706). `web/tests/test_export.py` parses README.md and fails on any mismatch. Shown on Validation (callout + sortable table with a Rank column).
2. GitHub Pages: `BASE_PATH` env (default "/"; "/NasaSpaceApps/" for Pages) drives Vite `base`; every asset/data/font/thumb URL goes through `src/base.ts` / `%BASE_URL%`. Production build served under /NasaSpaceApps/ (`tools/serve_dist.py`, gzip) passes the browser tests with no failed same-origin request. `pages.yml` runs export, tests and the build with `BASE_PATH=/<repo>/`; still not enabled.
3. Browser tests: Chromium and Firefox pass all 19 checks (and axe clean, 8 views x 3 sizes x 2 themes). WebKit cannot run on this Fedora host: Playwright's WebKit build needs system libraries (`sudo python -m playwright install-deps webkit`); `BROWSER=webkit` is supported by the scripts. `make web-e2e` runs the Pages-path build, e2e on the three engines (webkit reported as failed if libs are missing), axe and LCP.
4. Field extras are inside a collapsed "Field kit" section after Field safety; the core (score, compare, differences, Earth can't reproduce, field safety) is unchanged and uncrowded.
5. `npm run dev:lan` (vite --host).
Also: new `psr` block of far_horizons.json (permanent-shadow check, PR from main) is shown on Validation; main's `earth_lst_windows.csv` (thermal data) is not used yet (not a scored dimension).

## PR review fixes (done)
- Export is encoding-proof: every text read/write names `encoding="utf-8"`, JSON is written with `ensure_ascii=False` (UTF-8 file), generated files are written atomically (temp file in the same folder, `os.replace`), `newline="\n"` so bytes are identical on Windows. `web/tests/test_encoding.py` (AST guard over web/tools and web/tests), `test_export.py` runs the export in a scratch copy under a single-byte locale (`LC_ALL=<latin-1>`, `PYTHONCOERCECLOCALE=0`, `python -X utf8=0 -I`) and compares bytes with the UTF-8 run.
- Developer scripts are cross-platform (`tools/_common.py`: pathlib, tempfile, Playwright's own Chromium unless `CHROME` is set). npm scripts have no shell syntax; `npm run build:pages -- NasaSpaceApps` replaces `BASE_PATH=... cmd`.
- `pillow>=10` added to requirements.txt. README has a Windows section and says `make web-e2e` is Linux/macOS only.
- Field kit renders nothing when there are no extras/briefs (`src/kit.ts`, Node test, e2e with a manifest stripped of extras, and a scratch export without figures/extras).

## Performance (production build, throttled "Fast 4G": 1.6 Mbit/s, 150 ms RTT, cache off)
LCP 1.75 s on the intro (gzip, served under /NasaSpaceApps/) (budget 2.5 s). First load 515 KB transferred (budget 1.5 MB): JS 303 KB gz (main chunk 22 KB + MapLibre chunk 288 KB, loaded after first paint),
CSS 18 KB, fonts 68 KB, first target core data 105 KB gz (window ids and scaled differences load only when a window is opened), thumbs 19 KB.

## Known issues / not done
- Imagery is GIBS Blue Marble (about 500 m/px at its maximum level), so squares at zoom 9+ sit on blurry imagery. Landsat WELD is only served as WMS and returns opaque black over ocean, so it was not added.
- Real-GPU frame rate was not measured (no GPU here); the 20 min deck.gl comparison could only compare bundle size.
- Windows are drawn as axis-aligned squares around the centre; the real windows are projected squares, so edges can differ slightly at high latitude.
- Safari and Firefox were not tested (Chromium only).
- `web/tests/e2e.py` and the axe/perf scripts need Playwright and are not part of `make web-test`.

Screenshots: /tmp/pen-web/ (m0..m4, both themes, 390/768/1024/1440/1920).
