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
- M1 in progress.

## Open decisions / known issues
See DECISIONS.md. Screenshots: /tmp/pen-web/.
