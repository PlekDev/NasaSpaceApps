# Pollones en Fuga — roles and plan (project: P.E.N.)

**Deadline:** our Local Event ends **Sun Nov 15 at 20:00 local time**. The global form closes at 23:59, but we finish with the event.
**Our internal deadline:** **submit at 18:00 Sunday**, so 18:00–20:00 is buffer, not work time.

## Roles

| Person | Role | Owns | Branch prefix |
|---|---|---|---|
| **Victor** | Tech lead & integrator | repo, `pen/` core, merges, sensitivity analysis, final pipeline run, release `v1.0` | `victor/` |
| **Diego Lizárraga** | Moon & Mars data lead | lunar/Martian references, LRO **Diviner** thermal + ice layer, far-horizon test | `dlizarraga/` |
| **Diego Doña** | Earth data lead | more Earth regions, known-analog validation test, MODIS/ECOSTRESS temperature, EMIT minerals | `ddona/` |
| **Angel** | Presentation & submission lead | story, 7-slide deck / 30-s video (English), project page, fact-check, final submission | `angel/` |
| **Aaron** | App engineering & deployment | `app/` logic and data loading, public deploy (Streamlit Community Cloud), performance | `aaron/` |
| **Paul** | UI/UX & visual design | app layout and look, map legend and colours, analog-card design, visual identity, screenshots and visuals for the deck | `paul/` |

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

## Individual plans

Each line is one GitHub issue (see `docs/issues/issues.json`, created by `scripts/create_issues.sh`).

### Victor — tech lead & integrator
- **B0** Push the repo, invite the team, protect `main` (PR + 1 review), run `scripts/create_issues.sh`, and lead the kickoff.
- **B1** Generic **raster-layer hook** in `pen/features.py`: any GeoTIFF on the site grid → window stats (mean, P10, P90). This is how thermal, ice and mineral layers plug in. Add tests.
- **B2** Merge B1 PRs, re-run `make pipeline validate figures`, commit `data/processed` as **v0.2**. **Sensitivity:** how the top 10 changes with dimension weights and window size (3/6/12 km). Produce one table and one figure for Angel's deck.
- **B3** Integrate the Diviner thermal/ice dimensions into scoring. Final run before the 12:00 freeze. Tag `v1.0`.
- **B4–B5** Bug fixes only. Make sure the repo is public, the README numbers match the final run, and the license and credits are in place.

### Diego Lizárraga — Moon & Mars data lead
- **B1** **Diviner Polar Resource Product** (named in the challenge resources): `dlre_prp_south.tab` from PDS Geosciences.
  - It is a 605 MB table of 2.88 M triangles with `temp_avg`, `temp_max` and `ice_depth` (ice-stability depth).
  - Read it in pandas chunks, keep only the triangles inside each lunar reference site, and rasterise them onto the site grid.
  - `ice_depth` gives us a new ice dimension, to compare with Earth permafrost.
- **B2** Add 2–3 lunar references from PGDA product 78 (e.g. Site06 Nobile Rim 1, Site11 de Gerlache Rim) and one Mars reference with buried ice (a Deuteronilus Mensae CTX DTM from the USGS STAC). Re-run.
- **B3** **Far-horizon test:** compute shadows on a ≥60 km DEM crop around one site, then crop back to the site. Report the new ρ against LOLA, so we can say how much of the Malapert gap (ρ = 0.55) is distant horizons.
- **B4** Write the Moon/Mars data paragraph for Angel's project page (NASA data used, exact products).

### Diego Doña — Earth data lead
- **B1** Add **6–10 Copernicus tiles**:
  - Mexico: Sierra Chichinautzin, Valle de Santiago, Serdán-Oriental (Alchichica), Ceboruco.
  - **High-latitude light analogs:** Svalbard, Axel Heiberg, Antarctic Dry Valleys, Icelandic highlands.
  - Candidate regions other teams flag but cannot zoom into: Chersky Range, Prince Charles Mountains, Baffin Island.
  - Verify each tile URL returns 200 before committing.
- **B2** **Known-analog test:** list the coordinates of classic analog sites inside our tiles (Haughton crater centre, SFVF Cinder Lake crater field, Dry Valleys). Report their window rank percentile. A good method puts them in the top 20 %. This is our answer to other teams' ROC-AUC numbers.
- **B3** **Earth temperature layer:** MODIS LST 8-day (MOD11A2) or ECOSTRESS per region via Earthdata (needs an Earthdata Login). Compute the annual range and minimum per window, pairing with Diviner. Stretch: **EMIT** minerals for the Mexican regions.
- **B4** Write the Earth-data and partner-data paragraphs for Angel.

### Angel — presentation & submission lead
- **B1** Story and demo format: **7 slides** (recommended) and, if time allows, a ≤30-s video with English subtitles. Draft the project page in English from `docs/SUBMISSION.md`.
- **B2** Build the 7-slide deck in English: title + team, problem, idea (terrain + light, validated against NASA), how it works, results, analog in time + Mexico, impact and next steps. Use Paul's visuals.
- **B3** **Analog cards** for the top 5 sites (similar / differs / Earth cannot reproduce / what a mission would test there). Fact-check every number in the README, deck and page against `data/processed/`.
- **B4** Final deck with the frozen numbers; record the video if we are doing one. Collect the paragraphs from both Diegos.
- **B5** Fill every field on the Space Apps project page, test every link in an incognito window, answer the AI-use question, and **press "Submit for Judging" at 18:00**.

### Aaron — app engineering & deployment
- **B1** Deploy `app/streamlit_app.py` to **Streamlit Community Cloud** from `main` (public, no login) and share the URL in the chat.
- **B1** **Low-Sun preview** in the Analog card: thumbnails precomputed in the pipeline with `lowsun_hillshade` (coordinate with Victor).
- **B2** Functionality: colour the map by any dimension, reference-site markers, a CSV download button, and caching for speed.
- **B3** New dimensions (thermal, ice) appear automatically from `DIMENSIONS` in the sliders, card and map.
- **B4** Final deploy and the FortiGuard web-filter classification request (see the submission guide). Record 20–30 s of clean screen capture for Angel's demo.

### Paul — UI/UX & visual design
- **B1** **UI redesign plan:** sketch the layout (hero/header, map, ranking, card), pick the colour and type system, and agree with Aaron on what changes in `app/streamlit_app.py` and `.streamlit/config.toml`.
- **B2** Implement the look:
  - A clear map legend (score colour ramp).
  - A readable analog card ("Similar in / Differs in / Earth cannot reproduce").
  - The headline metrics and a data-credits footer.
  - A phone check.
- **B3** **Visual identity:** the P.E.N. wordmark and a simple logo. No NASA logos. If anything is AI-generated, it needs a visible watermark (Space Apps rule). Export the app screenshots and the visual assets for Angel's deck.
- **B4** UI polish only, after the freeze. Check that figures and screenshots are legible on a projector, and help Angel lay out the slides.

## Working rules

1. **`main` always runs.** Work on `name/short-topic` branches, open a PR, get 1 review, then squash-merge.
2. **Small PRs**, merged at least once per block. If you are stuck for 30 minutes, say so at the next checkpoint or in the chat.
3. **Never commit `data/raw/` or `data/cache/`.** Only `data/processed/` and `figures/` are committed, and Victor regenerates them.
4. **Everything public is in English** (repo, app, deck, project page). Team chat can be in Spanish.
5. **Set your own git identity** before your first commit: `git config user.name` / `git config user.email` with **your own** GitHub email.
6. **AI disclosure:** if you use an AI tool for code or text, say so in the file header or PR description. AI-generated images need a visible watermark. No NASA logos in generated content.
7. **No photos or video of anyone under 18** in the demo.
