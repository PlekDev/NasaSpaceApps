# P.E.N. web

Static web app (Vite + TypeScript + MapLibre GL JS) for P.E.N. It reads the pipeline's committed results at build time; no Python at runtime.
UI AI-assisted (Claude Code); reviewed by the author. Design system: [DESIGN.md](DESIGN.md). Decisions: [DECISIONS.md](DECISIONS.md). Resume notes: [PROGRESS.md](PROGRESS.md).

```bash
make web-dev          # export data/processed -> web/public/data, then Vite dev server on :5173
make web              # export + production build in web/dist (host the folder anywhere static)
make web-test         # Python label tests + Node tests (score recombination for every target)
```

Without `make`: `python -I web/tools/export_data.py && cd web && npm install && npm run dev`.
`web/public/data`, `thumbs`, `figures` and `extras` are generated and git-ignored, so the site can never show numbers that differ from
`data/processed`. The footer shows `data <hash>` (hash of data/processed) and the manifest records the git commit.
`web/pages.yml` is a GitHub Pages workflow, prepared but not enabled (copy it to `.github/workflows/` to turn it on).

Browser checks (need Playwright and a Chromium): `BASE=http://localhost:5173 python web/tests/e2e.py`; accessibility audit with axe-core: `web/tools/axe_run.py`;
LCP on the production build with 4G throttling: `web/tools/perf.py`.
