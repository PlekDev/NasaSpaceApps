# Pollones en Fuga — roles and plan (project: P.E.N.)

**Deadline:** our Local Event ends **Sun Nov 15 at 20:00 local time**. The global form closes at 23:59, but we finish with the event.
**Our internal deadline:** **submit at 18:00 Sunday**, so 18:00–20:00 is buffer, not work time.

## Roles

| Person | Role | Owns | Branch prefix |
|---|---|---|---|
| **Victor** | Tech lead & integrator | repo, `pen/` core, merges, sensitivity analysis, final pipeline run, release `v1.0` | `victor/` |
| **Diego Lizárraga** | Moon & Mars data lead | lunar/Martian references, LRO **Diviner** thermal + ice layer, far-horizon test | `dlizarraga/` |
| **Diego Doña** | Earth data & validation lead | Earth regions, known-analog validation test, MODIS/ECOSTRESS temperature, EMIT minerals | `ddona/` |
| **Angel** | Presentation & submission lead | story, 7-slide deck / 30-s video (English), project page, fact-check, final submission | `angel/` |
| **Aaron** | App engineering & deployment | `app/` logic and data loading, public deploy (Streamlit Community Cloud), performance, tests/CI | `aaron/` |
| **Paul** | UI/UX & visual design | app look (dark theme, globe and map), legend and colours, analog-card design, visual identity, visuals for the deck | `paul/` |

Review pairs: Victor ↔ Aaron · D. Lizárraga ↔ D. Doña · Angel ↔ Paul. Paul and Aaron both work on `app/streamlit_app.py`:
Paul owns how it looks, Aaron owns how it works. Small PRs and frequent pulls avoid conflicts.

## Timeline

Checkpoint = 10-minute stand-up: what's done, what's blocked, and what's next.

| Block | When (local) | Goal | Checkpoint |
|---|---|---|---|
| B0 | Sat 13:00–14:00 | Everyone clones, installs and runs the app; issues assigned | 14:00 |
| B1 | Sat 14:00–19:00 | New data and features on branches; app deployed publicly; UI redesign started | 19:00 |
| B2 | Sat 19:00–23:00 | First PRs merged; pipeline v0.2; deck draft | 23:00 |
| — | Sat 23:00–Sun 07:30 | Sleep in shifts (at least 6 h each) | — |
| B3 | Sun 07:30–12:00 | Diviner thermal/ice in; validation numbers final; **feature freeze 12:00** | 08:00, 12:00 |
| B4 | Sun 12:00–16:00 | Final pipeline run, figures, final deploy, demo recorded | 16:00 |
| B5 | Sun 16:00–18:00 | Project page filled, every link tested in incognito, **SUBMIT 18:00** | 18:00 |

## Individual plans (updated Sat 14:00)

✅ = done (in `main` with v0.2). Each open line is one GitHub issue (`docs/issues/issues.json`, created by
`scripts/create_issues.sh`, which skips the done ones).

### Victor — tech lead & integrator
- ✅ v0.2 pipeline run (14 regions), sensitivity analysis (fig5), known-analog test, Diviner context, README with the exact algorithm.
- **B1** Generic **raster-layer hook** in `pen/features.py`: any GeoTIFF on the site grid → window stats (mean, P10, P90). This is how thermal and mineral layers plug in. Add tests.
- **B2** Review and merge PRs; re-run `make pipeline validate figures extras` after any data change and commit `data/processed`.
- **B3** Thermal as a **scored** dimension (Diviner on the Moon vs Diego Doña's MODIS/ECOSTRESS on Earth) if it is ready by 10:00; otherwise keep it as context. Final run before the 12:00 freeze, tag `v1.0`.
- **B4–B5** Bug fixes only. Repo public, README numbers = final run, license and credits in place.

### Diego Lizárraga — Moon & Mars data
- ✅ Diviner polar resource product: filtered to lat ≤ −84° (811,652 facets) and summarised per lunar site (fig6).
- **B1** Sanity-check the Diviner numbers in the README and app (units, `ice_depth` = −999 meaning) against the PDS label.
- **B2** **Far-horizon test:** compute shadows on a ≥ 60 km DEM crop around Malapert, crop back to the site and report the new ρ against LOLA. This tells us how much of the ρ = 0.55 gap is distant horizons.
- **B3 (stretch)** Add 2–3 lunar references from PGDA product 78 (Site06 Nobile Rim 1, Site11 de Gerlache Rim) and one Mars reference with buried ice (Deuteronilus Mensae CTX DTM).
- **B4** Write the Moon/Mars data paragraph for Angel's project page (NASA products used, exact names).

### Diego Doña — Earth data & validation
- ✅ 10 new Copernicus tiles (4 Mexico, Svalbard, Axel Heiberg, University Valley, Askja, Atacama, Mauna Kea) and the known-analog test with 8 sites.
- **B1** **Verify every known-site coordinate** in `scripts/validate_known_analogs.py` against a primary source and add 2–4 more inside our tiles (e.g. Cinder Lake crater field in the SFVF, the Haughton-Mars Project base camp).
- **B2–B3** **Earth temperature layer:** MODIS LST 8-day (MOD11A2) or ECOSTRESS per region via Earthdata (needs an Earthdata Login). Annual minimum and range per window, saved as GeoTIFFs Victor's hook can read. Stretch: **EMIT** minerals for the Mexican regions.
- **B4** Write the Earth-data and partner-data paragraphs for Angel.

### Angel — presentation & submission
- **B1** Story: lead with the **blind rediscovery** (Mauna Kea's NASA lunar test site is #1 of 10,424 windows for Malapert, found without labels), then light validated against NASA (ρ = 0.86), then "where Earth stops being an analog" (Diviner), then Mexico. Draft the project page in English from `docs/SUBMISSION.md`.
- **B2** Build the 7-slide deck in English with Paul's visuals and figures 1, 2, 5 and 6.
- **B3** Analog cards for the top 5 sites; fact-check every number in the README, deck and page against `data/processed/`.
- **B4** Final deck with the frozen numbers; video only if time allows. Collect the paragraphs from both Diegos.
- **B5** Fill every field of the project page, test every link in incognito, answer the AI-use question, **submit at 18:00**.

### Aaron — app engineering & deploy
- ✅ Low-Sun previews in the analog card, CSV download, caching, AppTest smoke test in CI.
- **B1 (top priority)** Deploy `app/streamlit_app.py` to **Streamlit Community Cloud** from `main` (public, no login) and share the URL. Check load time: `windows.csv` is 11 MB.
- **B2** Colour the map by any dimension; mark the reference sites; make new dimensions in `DIMENSIONS` appear automatically in sliders, card and map.
- **B4** Final deploy, FortiGuard classification request (see the submission guide), 20–30 s of clean screen capture for Angel.

### Paul — UI/UX & visual design
- ✅ Base UI: dark theme, 3D globe / flat map toggle, hero header, metric cards, analog card layout.
- **B1** Polish on top of the base: globe labels (check they render on a real GPU), legend, analog-card spacing, phone check.
- **B2–B3** **Visual identity:** P.E.N. wordmark and a simple logo. No NASA logos; anything AI-generated needs a visible watermark. Export app screenshots and visuals for Angel's deck.
- **B4** UI polish only after the freeze; check legibility on a projector; help Angel lay out the slides.

## Working rules

1. **`main` always runs.** Work on `name/short-topic` branches, open a PR, get 1 review, then squash-merge.
2. **Small PRs**, merged at least once per block. If you are stuck for 30 minutes, say so at the next checkpoint or in the chat.
3. **Never commit `data/raw/` or `data/cache/`.** Only `data/processed/` and `figures/` are committed, and Victor regenerates them.
4. **Everything public is in English** (repo, app, deck, project page). Team chat can be in Spanish.
5. **Set your own git identity** before your first commit: `git config user.name` / `git config user.email` with **your own** GitHub email.
6. **AI disclosure:** if you use an AI tool for code or text, say so in the file header or PR description. AI-generated images need a visible watermark. No NASA logos in generated content.
7. **No photos or video of anyone under 18** in the demo.
