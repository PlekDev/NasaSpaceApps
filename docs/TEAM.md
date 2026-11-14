# Los Pikadientes de Caborca — roles and 36-hour plan (project: Penumbra)

**Deadline:** Space Apps closes submissions **Sun Nov 15, 23:59 local time** (check whether your Local Event closes earlier).
**Our internal deadline:** **submit at 21:00 Sunday**, so the 21:00–23:59 window is buffer, not work time.

## Roles

| Person | Role | Owns | Branch prefix |
|---|---|---|---|
| **Victor** | Tech lead & integrator | repo, `penumbra/` core, merges, final pipeline run, release `v1.0` | `victor/` |
| **Diego Lizárraga** | Moon & Mars data lead | lunar/Martian references, LRO **Diviner** thermal layer, far-horizon test | `dlizarraga/` |
| **Diego Doña** | Earth data lead | more Earth regions (MX + high Arctic/Antarctic), MODIS/ECOSTRESS temperature, EMIT minerals | `ddona/` |
| **Angel** | Science & validation lead | validation vs. known analogs, sensitivity & multi-scale tests, analog cards, METHOD.md | `angel/` |
| **Aaron** | App & deployment lead | `app/`, public deploy (Streamlit Community Cloud), UX, screen captures | `aaron/` |
| **Paul** | Story, demo & submission lead | 7-slide deck / 30-s video (English), project page text, final submission | `paul/` |

Everyone reviews one other person's PR per block: Victor ↔ Aaron, D. Lizárraga ↔ D. Doña, Angel ↔ Paul.

## Timeline

Checkpoint = 10-minute stand-up: what's done, what's blocked, and what's next.

| Block | When (local) | Goal | Checkpoint |
|---|---|---|---|
| B0 | Sat 13:00–14:00 | Everyone clones, installs and runs the app; issues assigned | 14:00 |
| B1 | Sat 14:00–19:00 | First new data and features on branches; app deployed publicly | 19:00 |
| B2 | Sat 19:00–23:00 | First PRs merged; pipeline v0.2 re-run; deck draft | 23:00 |
| — | Sat 23:00–Sun 08:00 | Sleep in shifts (at least 6 h each) | — |
| B3 | Sun 08:00–14:00 | Thermal/mineral dimension in; **feature freeze 14:00** | 09:00, 14:00 |
| B4 | Sun 14:00–18:00 | Final pipeline run, figures, deploy; demo recorded | 18:00 |
| B5 | Sun 18:00–21:00 | Project page filled, every link tested in incognito, **SUBMIT 21:00** | 21:00 |

## Individual plans

Each line is one GitHub issue (see `docs/issues/issues.json`, created by `scripts/create_issues.sh`).

### Victor — tech lead & integrator
- **B0** Push the repo, invite the team, protect `main` (PR + 1 review), run `scripts/create_issues.sh`, and lead the kickoff.
- **B1** Generic **raster-layer hook** in `penumbra/features.py`: any GeoTIFF on the site grid → window stats (mean, P10, P90). This is how thermal and mineral layers plug in. Add tests.
- **B2** Merge B1 PRs, re-run `make pipeline validate figures`, commit `data/processed` as **v0.2**.
- **B3** Integrate the thermal (and mineral, if ready) dimensions into scoring. Final run before the 14:00 freeze. Tag `v1.0`.
- **B4–B5** Bug fixes only. Make sure the repo is public, the README numbers match the final run, and the license and credits are in place.

### Diego Lizárraga — Moon & Mars data lead
- **B1** **Diviner polar temperatures** (named in the challenge resources): download the south-polar products for Connecting Ridge and Malapert, add them to `config/sites.yaml → auxiliary`, and resample them onto the site grids with `penumbra.grid.resample_onto`.
- **B2** Add 2–3 lunar references from PGDA product 78 (e.g. Site06 Nobile Rim 1, Site11 de Gerlache Rim) and one Mars reference with buried ice (a Deuteronilus Mensae CTX DTM from the USGS STAC). Re-run.
- **B3** **Far-horizon test:** compute shadows on a ≥60 km DEM crop around one site, then crop back to the site. Report the new ρ against LOLA, so we can say how much of the Malapert gap is distant horizons.
- **B4** Write the Moon/Mars data paragraph for the project page (NASA data used, exact products).

### Diego Doña — Earth data lead
- **B1** Add **6–10 Copernicus tiles** to `config/sites.yaml`:
  - Mexican volcanic fields and maars: Sierra Chichinautzin, Valle de Santiago, Serdán-Oriental (Alchichica), Ceboruco.
  - **High-latitude light analogs:** Svalbard, Axel Heiberg, Antarctic Dry Valleys, Icelandic highlands.
  - Verify each tile name exists before committing.
- **B2** **Earth temperature layer:** MODIS LST 8-day (MOD11A2) or ECOSTRESS for each Earth region via Earthdata (needs an Earthdata Login). Compute the annual range and minimum per window, pairing with Diviner.
- **B3** Stretch goal: **EMIT** mineral maps for the Mexican regions, e.g. gypsum at Cuatro Ciénegas against Gale-like sulfates. If short on time, document it as next steps.
- **B4** Write the Earth-data paragraph and the partner-data list (ESA Copernicus DEM, plus anything new).

### Angel — science & validation lead
- **B1** **Known-analog test:** list the coordinates of classic analog sites inside our tiles (Haughton crater centre, SFVF Cinder Lake crater field, Meteor Crater if a tile is added). Report their window rank percentile. A good method should put them in the top 20 %.
- **B2** **Sensitivity:** how the top 10 changes with dimension weights and window size (3/6/12 km). Produce one table and one figure for the deck.
- **B3** **Analog cards** for the top 5 sites, in plain English: what is similar, what differs, what Earth cannot reproduce, and what a mission team would test there (rover vision, EVA lighting, drilling).
- **B4** Fact-check every number in the README, deck and project page against `data/processed/`. Finalise `docs/METHOD.md`.
- **Stretch** Partner data: CSA RADARSAT-1 or ESA Sentinel-1 radar roughness at Haughton.

### Aaron — app & deployment lead
- **B1** Deploy `app/streamlit_app.py` to **Streamlit Community Cloud** from `main` (public, no login) and share the URL in the chat.
- **B1** Add a **low-Sun preview** to the Analog card: render `lowsun_hillshade` for the selected window, using thumbnails precomputed in the pipeline (coordinate with Victor).
- **B2** UX: legend, a selector to colour the map by any dimension, reference-site markers, a CSV download button, a data-credits footer, and a phone check.
- **B3** New dimensions should appear automatically from `DIMENSIONS` (sliders, card, map). Speed up loading if needed.
- **B4** Final deploy and the FortiGuard web-filter classification request (see the submission guide). Record 20–30 s of clean screen capture for the demo.

### Paul — story, demo & submission lead
- **B0** Confirm **all 6 are confirmed participants at the same Local Event**, set the team name, and complete the team page.
- **B1** Draft the project page in English from `docs/SUBMISSION.md`. Decide the demo format: **7 slides** (recommended) and, if time allows, a ≤30-s video with English subtitles.
- **B2** Build the 7-slide deck: title + team, problem, idea (terrain + light), how it works, results (fig1/fig2), analog in time + Mexico, impact and next steps.
- **B3** Rehearse the story with the team and collect final screenshots from Aaron.
- **B4–B5** Fill every field on the Space Apps project page, test every link in an incognito window, answer the AI-use question, and **press "Submit for Judging" at 21:00**.

## Working rules

1. **`main` always runs.** Work on `name/short-topic` branches, open a PR, get 1 review, then squash-merge.
2. **Small PRs**, merged at least once per block. If you are stuck for 30 minutes, say so at the next checkpoint or in the chat.
3. **Never commit `data/raw/` or `data/cache/`.** Only `data/processed/` and `figures/` are committed, and Victor regenerates them.
4. **Everything public is in English** (repo, app, deck, project page). Team chat can be in Spanish.
5. **AI disclosure:** if you use an AI tool for code or text, say so in the file header or PR description. AI-generated images need a visible watermark. No NASA logos in generated content.
6. **No photos or video of anyone under 18** in the demo.
