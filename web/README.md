# P.E.N. web

Static web app (Vite + TypeScript + MapLibre GL JS) for P.E.N. It reads the pipeline's committed results at build time; no Python at runtime.
UI AI-assisted (Claude Code); reviewed by the author. Design system: [DESIGN.md](DESIGN.md). Decisions: [DECISIONS.md](DECISIONS.md). Resume notes: [PROGRESS.md](PROGRESS.md).

```bash
npm run dev:lan       # in web/: dev server on your LAN (vite --host) to test on a phone: open http://<your-ip>:5173
make web-dev          # export data/processed -> web/public/data, then Vite dev server on :5173
make web              # export + production build in web/dist (host the folder anywhere static)
make web-test         # Python label + README-rank tests, Node tests (score recombination for every target)
make web-e2e          # production build under /NasaSpaceApps/, browser tests on Chromium, Firefox and WebKit, axe, LCP (Linux or macOS only: uses /tmp, kill and &)
```

Without `make`: `python -I web/tools/export_data.py && cd web && npm install && npm run dev`.

### Windows (cmd or PowerShell, no `make`)
```
python -I web/tools/export_data.py
cd web
npm ci
npm run dev          # dev server, http://localhost:5173
npm test             # Node tests (score recombination, kit, markdown)
npm run build        # production build in web/dist, base "/"
npm run build:pages -- NasaSpaceApps     # production build for https://<user>.github.io/NasaSpaceApps/
python -m pytest -q web/tests            # from the repository root: labels, README ranks, UTF-8 guard, export checks
```
The export writes every file as UTF-8 and atomically; it does not depend on the console code page. Pass the Pages base without slashes (`NasaSpaceApps`), because Git Bash rewrites arguments that start with `/`.
Requirements: Python 3.11+, `pip install -r requirements.txt` (includes Pillow and PyYAML), Node 22+.
`web/public/data`, `thumbs`, `figures` and `extras` are generated and git-ignored, so the site can never show numbers that differ from
`data/processed`. The footer shows `data <hash>` (hash of data/processed) and the manifest records the git commit.
`web/pages.yml` is a GitHub Pages workflow, prepared but not enabled (copy it to `.github/workflows/` to turn it on).

Deploy base path: `BASE_PATH=/NasaSpaceApps/ make web` (default `/`). Every asset, data, font and thumbnail URL goes through it (`src/base.ts`); `web/tools/serve_dist.py` serves `dist/` under a prefix like Pages does.
Browser checks need Playwright (`python -m playwright install firefox webkit`; WebKit also needs system libraries: `sudo python -m playwright install-deps webkit`) and one-time `mkdir -p /tmp/axe && cd /tmp/axe && npm i axe-core`:
`BROWSER=firefox BASE=http://localhost:5173 python web/tests/e2e.py`, `web/tools/axe_run.py`, `web/tools/perf.py <url>`.
