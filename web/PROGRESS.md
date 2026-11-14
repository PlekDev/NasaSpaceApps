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

## Milestones
- M0 done (design system, static screen).
- M1 done: export (manifest with data hash + commit), intro (spinning globe, skippable, static fallback if no WebGL), Explore map (GIBS globe,
  sized points -> real 6 km squares from z7.5, eased flights), target picker (9 targets, grouped, wraps), live weights/min score, region filter
  (search + checkboxes + all/none), Top matches (best window per region, expandable, scroll fade), best-match overlay + pin, footer with data hash,
  phone bottom sheet with peek/half/full snaps, hash routes (secondary pages are stubs until M3).
- Tests: `python -m pytest -q web/tests` (labels), `npm test` in web/ (W=1 recombination == precomputed for all 9 targets, max error <= 0.2).
- M2 done: detail sheet (right sheet / phone bottom sheet): combined + per-dimension scores, swipe/blink compare (low-Sun and NASA imagery, credits),
  diverging IQR bars with the explain() thresholds, "Earth can't reproduce" (text produced by the app's own cant_reproduce() at export time, so Diviner
  rows for all 6 lunar targets and Mars-climate rows for the 3 Mars targets match the app), EONET live-with-snapshot fallback, Google Maps and
  NASA Worldview links, field extras from the merged PR (twin-light video, astronaut view, rover twin + numbers, region brief/.ics/CSV).
- M3 next: secondary views (time chart, validation incl. native score-matrix heatmap and figure lightbox, method) + light theme everywhere.

## Open decisions / known issues
See DECISIONS.md. Screenshots: /tmp/pen-web/.

## Performance (M1 build)
JS 297.9 KB gz + CSS 15 KB gz + fonts ~70 KB + first target ~230 KB gz + manifest 6 KB => ~620 KB first load (budget 1.5 MB). LCP not yet measured (M4).
