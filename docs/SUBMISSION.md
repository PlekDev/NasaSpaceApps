# Submission kit (owner: Angel)

Official guide: https://www.spaceappschallenge.org/resources/project-submission-guide/
Our Local Event ends **Sun Nov 15, 20:00 local time** (the global form closes at 23:59). Internal target: **submit at 18:00**.

## Checklist

- [ ] Team name on the Space Apps team page: **Pollones en Fuga**
- [ ] All 6 members are confirmed participants at the **same Local Event**
- [ ] Every field is filled, **in English**
- [ ] Demo: **≤ 7 slides** (title + intro included) **or** a **≤ 30 s video** (English subtitles if the speech is in Spanish), hosted publicly
- [ ] Final project link (GitHub repo and/or app URL) opens in an incognito window, with no login
- [ ] At least one NASA dataset is listed (we use LOLA, LOLA illumination and MRO CTX)
- [ ] Space Agency Partner data is listed (ESA Copernicus DEM, plus any added)
- [ ] The AI-use question is answered, matching the README "Use of AI" section
- [ ] No images or video of people under 18; no NASA logos in generated content
- [ ] "Terms and Conditions" and "Confirm All Work is Original" are ticked → **Submit for Judging**
- [ ] The confirmation banner is seen, and every teammate downloads their certificate

## Draft fields (edit freely; check every number against `data/processed/`)

**Project name:** P.E.N. — Planetary Environmental Navigator

**High-level summary (≈100 words):**
NASA plans its Moon Base near the lunar south pole, where the Sun never rises above about 7° and long shadows rule
landing, roving and power. P.E.N. is an open web tool that finds the places on Earth that match a Moon or Mars site in
terrain and in low-Sun light, explains where the analogy breaks, and tells field teams when to go. Never told about it,
P.E.N. ranks NASA's 2012 lunar-polar test site on Mauna Kea **#1 of 10,424** Earth windows for Malapert Massif
(p = 0.004, 0.025 corrected for 6 lunar targets). Its light model matches NASA's LOLA illumination map
(ρ = 0.92–0.99), and its Mission view schedules a rehearsal down to the hour, with a calendar file.

**One-sentence unique angle:** analog sites are usually chosen for geology and looks; P.E.N. is the first open tool we
know of that also matches the *light* of the lunar pole, proves it blind against NASA's own test site, and says when
on Earth that light happens.

**Link to project demo:** <public link to the 7-slide deck>

**Link to final project:** https://plekdev.github.io/NasaSpaceApps/ (web app) · https://github.com/PlekDev/NasaSpaceApps (code and data)

**Detailed description (outline):**
1. *What it does:* scores every 6 km window of Earth regions against Moon and Mars reference sites, gives
   similarity per dimension (0–100), maps it, and writes an analog card (similar / differs / Earth cannot reproduce).
2. *How it works:*
   - Common 30 m grid across bodies.
   - Terrain features.
   - Exact O(N) cast-shadow model at 2° and 5° Sun.
   - IQR-scaled distances, S = 100·exp(−D).
   - Validation against LOLA illumination.
   - Low-Sun hours by latitude and month.
3. *Results (v0.5: 6 Moon Base sites + 3 Mars sites, 14 Earth regions, 10,424 windows):*
   - Blind rediscovery: Pu'u Hiwahine on Mauna Kea, where NASA, CSA and DLR rehearsed a lunar-polar prospecting
     mission in 2012, is window #1 of 10,424 for Malapert and in the top 0.2 % for four of the six Moon Base sites (top 5 % for all six).
     No labels were used.
   - The light model matches NASA's LOLA illumination map with ρ = 0.92–0.99 at all six Moon Base sites once terrain up to 150 km away is included
     (mean error 2.0–3.2 percentage points of lit time).
   - Best matches: the six Moon sites ↔ Mauna Kea and Mauna Loa, Hawaiʻi (79–91), Arcadia Planitia and Deuteronilus
     Mensae ↔ Atacama near Yungay (96 and 93), Jezero ↔ Sierra Chichinautzin, Mexico (89). El Pinacate is in the top
     8 % for all six Moon Base sites (top 3 % for four).
   - Known analog sites rank at the 84th percentile in illumination (median of 48 tests with 8 sites; 50 = random).
   - LRO Diviner: in 88–100 % of each lunar site the annual mean temperature (2 cm below the surface) is colder than
     Earth's record low air temperature (184 K); ice is stable within 1 m in 22–64 %.
   - Diviner vs Earth's cold analogs (NASA POWER): University Valley, Antarctica, the coldest region we search, has a
     mean skin temperature of 239 K, still 95–132 K warmer than the Moon Base sites (107–144 K). Lunar surface peaks
     (306–342 K) are within reach of Earth's deserts (up to 328 K). See fig8.
   - Mars is a closer thermal match: the Mars Climate Database (model) gives our three Mars sites a mean surface
     temperature of 200–224 K, 15–38 K colder than University Valley, at 680–830 Pa (under 1 % of sea level).
   - Not luck: a null test against random Earth windows gives p = 0.004 for Malapert (0.025 corrected for 6 lunar
     targets); only 0.4 % of Mauna Kea scores as high. Malapert score 79, 95 % bootstrap interval 60–90; it stays #1 in
     81 % of random weightings for Malapert, 100 % for Connecting Ridge. As a group, p = 0.37 combined, 0.065 illumination.
   - Honest negative: for Mars the score does not separate the known sites (AUC 0.33–0.50). We report it.
   - Analog in time: about 1 h/day of 0–7° Sun at Mauna Kea; 5.6–6.7 h/day at polar sites around the equinoxes.
   - Mission view: plans a traverse on the target, casts the real shadows on both terrains and scans a year of Sun
     positions on Earth for the same light along the route. Example: fidelity 80 % for the Malapert traverse with the
     lunar Sun from the east (29–30 March 2027, about half an hour after sunrise), exported as a calendar file (.ics).
   - Where the analogy breaks: every analog dossier lists what Earth cannot reproduce (cold, ice, gravity, vacuum, Sun
     height, regolith) and compares the window's MODIS surface temperature with Diviner or the Mars Climate Database.
   - Hands-on method: the Method page runs the exact cast-shadow algorithm live on the real terrain of the headline Moon
     site and its best Earth window as the Sun moves, and lets the reader move two feature differences along
     S = 100·e^(−D). The When page draws the day-long Sun path for the Moon site and two Earth regions, month by month.
   - Scale: 52 s per one-degree tile on one core, about 230 core-hours for all land: under 4 hours on 64 cores (3.6 h).
4. *Benefits:* regional screeners say which region to look at; P.E.N. picks the exact 6 km site and the best weeks.
   Choose and schedule analog field tests for rover vision, EVA lighting and landing-hazard rehearsal.
   Find under-studied analogs, including in Mexico.
   - *Who uses it tomorrow:* teams that plan analog field campaigns (rover vision, EVA lighting, landing-hazard
     rehearsal) pick the exact 6 km site, the week and the hour, and take the `.ics` file and the field brief with them.
     Students and analog researchers get an open, checked baseline to build on.
   - *Local impact, Mexico:* El Pinacate: top 3 % for 4 Moon Base sites, top 8 % for all 6. For Jezero, the best Earth
     match is Sierra Chichinautzin, south of Mexico City (89). Both are reachable by road from Mexican universities,
     so lunar- and Mars-analog field tests do not have to start abroad.
5. *Tools:* Python (rasterio, NumPy, SciPy, pandas, Matplotlib), a static web app (TypeScript, Vite, MapLibre GL JS)
   on GitHub Pages, Streamlit + pydeck, GitHub; NASA APIs Trek WMTS, GIBS and EONET.
6. *Limitations and next steps:* local horizons only, 30 m resolution, flat Mars plains, and Earth's limits
   (gravity, vacuum, radiation). Next: thermal as a scored dimension (Diviner vs MODIS/ECOSTRESS), a mineral dimension beyond EMIT-10,
   global search.

**NASA data:**
- LRO LOLA 5 m south-pole DEMs (NASA GSFC PGDA product 78)
- LRO LOLA polar illumination maps (PGDA product 69, Mazarico et al. 2011)
- LRO LOLA gridded polar DEM LDEM_85S_40M (NASA PDS Geosciences)
- NASA APIs (api.nasa.gov): Moon Trek & Mars Trek WMTS (LRO NAC and CTX mosaics), GIBS (Landsat WELD / HLS / MODIS),
  EONET v3 (open natural events, live field-safety check)
- MRO CTX stereo DTMs (USGS Astrogeology analysis-ready data)
- LRO Diviner polar resource product (NASA PDS Geosciences, Paige et al.)
- NASA POWER climatology API (NASA LaRC, MERRA-2): Earth skin temperature for the Diviner comparison
- MODIS Terra MOD11A2 v061 land-surface temperature (NASA LP DAAC, via NASA Earthdata), 2025: per Earth window, shown on every analog card next to Diviner or the Mars Climate Database
- EMIT L2B mineral identification V002 (NASA JPL, via NASA Earthdata), 2023–2025: EMIT-10 mineral shares per Earth window below 52°N, shown on the analog card

**Moon & Mars data paragraph (Diego Lizárraga, ~200 words; numbers from `data/processed/`):**
Every reference site in P.E.N. comes from NASA missions archived in the Planetary Data System (PDS). For the Moon
Base we use six lunar south-pole sites observed by the Lunar Reconnaissance Orbiter (LRO): Shackleton Connecting
Ridge, Nobile Rim 1, de Gerlache Rim, Malapert Massif, Haworth and Leibnitz Beta Plateau. Their terrain is the 5 m LOLA topography (NASA GSFC PGDA).
LOLA's 18.6-year average-illumination map validates our shadow model, and the 40 m LOLA polar DEM (LDEM_85S_40M, PDS
Geosciences) adds horizons up to 150 km away: ρ = 0.92–0.99 against NASA at all six sites. The LRO Diviner polar
resource product (PDS Geosciences) gives temperature and ice stability. As the challenge suggests, we compare it with
Earth's cold, ice-bearing analogs using NASA POWER skin temperatures: even University Valley in Antarctica averages
239 K, which is 95–132 K warmer than the Moon Base sites (107–144 K), while lunar surface peaks (306–342 K) are
within reach of Earth's deserts (up to 328 K). LROC NAC mosaics (Moon Trek) show every lunar window. For Mars we use
MRO CTX stereo terrain models (USGS Astrogeology) of Arcadia Planitia, Jezero crater and Deuteronilus Mensae (a
mid-latitude region with buried ice), and the CTX global mosaic
(Mars Trek).

**Space Agency Partner data and other references:**
- ESA Copernicus DEM GLO-30 (via AWS Open Data)
- Mars Climate Database v6.2 (LMD/OU/IAA, supported by ESA and CNES): modelled surface temperature and pressure at
  the Mars sites. It is a model supported by ESA, not an ESA product; list it as a reference, not as ESA data
- Open-source libraries: rasterio, GDAL, NumPy, SciPy, pandas, Matplotlib, Streamlit, pydeck
- Literature: Mazarico et al. 2011; Barker et al. (PGDA); Paige et al. (Diviner); Klingelhoefer et al. 2014 (Mauna Kea
  ISRU tests, NTRS 20140008708); McKay et al. 2003 (Atacama); Plaut et al. 2009 (GRL 36, L02203) and Petersen, Holt & Levy 2018 (GRL 45, 11595–11604) (Deuteronilus Mensae ice, SHARAD); Marinova et al. 2022 (University Valley);
  Preston & Dartnell 2014; NASA Moon Base overview

**Use of Super Intelligence (SI):** see README "Use of AI". AI was used for literature/dataset discovery and to draft
and refactor code and documentation. The team chose the approach and sites, ran and checked all results, and every
AI-assisted file is marked in its header. No AI-generated images.

## 7-slide deck (the demo link)

Built as a slide deck with speaker notes (export to PDF and host it publicly; that link is the demo). Every number on a
slide is an entry of `docs/numbers.json`, checked by `tests/test_factcheck_numbers.py` against `data/processed/`.
Figures and screenshots are rendered from the data and the web app: no AI imagery, no NASA logos.

1. **Cover**: P.E.N., Pollones en Fuga (Mexico), the challenge, and the hook: "Blind test: NASA's 2012 lunar test site
   comes out #1 of 10,424", with p = 0.004 (0.025 corrected for 6 lunar targets) and ρ = 0.92–0.99.
2. **Problem and method**: the Sun never climbs above 7°; test sites are chosen for geology and looks, the light is rarely
   checked; data → one 30 m grid (10,424 Earth windows of 6 km) → 5 terrain features plus exact cast shadows at 2° and
   5° → S = 100 · exp(−D).
3. **Blind test**: the twin-light timelapse, "#1 of 10,424 for Malapert Massif", the null test, top 0.2 % for 4 of 6
   Moon Base sites, top 5 % for all 6.
4. **Validation**: fig7 and four numbers: ρ = 0.92–0.99; 2.0–3.2 pp mean error; 98.0–99.7 % agreement with NASA's
   permanent-shadow map (only next to the ρ, see the Q&A); 84th percentile for classic analog sites in illumination.
5. **Where the analogy breaks**: the dossier's limits section; 95–132 K warmer; 88–100 % colder than Earth's record low; Mars
   15–38 K colder than University Valley; the Mars AUC 0.33–0.50, said openly.
6. **Where and when to rehearse**: the Mission view (3D twin and rehearsal panel); fidelity 80 % on 29–30 March 2027;
   `.ics`; about 1 h/day at Mauna Kea, 5.6–6.7 h/day at polar sites; EONET check.
7. **Who uses it tomorrow**: field-test planners; Mexico (El Pinacate, Sierra Chichinautzin); scale (under 4 hours on
   64 cores); the links; the NASA data list; AI disclosure.

## Traceability: where each headline number comes from

| Claim | `docs/numbers.json` id | Data | Checked by |
|---|---|---|---|
| #1 of 10,424 for Malapert; top 0.2 % / top 5 % | `blind_rank`, `blind_top02`, `blind_top5` | `known_analogs.json`, `windows.csv` | `test_factcheck_numbers.py`, `test_claims.py` |
| p = 0.004 (0.025 corrected) | `null_p_malapert`, `null_frac_mauna_kea` | `stats/null.json` | `test_factcheck_numbers.py` |
| ρ = 0.92–0.99, 2.0–3.2 pp | `rho_far`, `mae` | `far_horizons.json` | `test_factcheck_numbers.py`, `test_claims.py` |
| 98.0–99.7 %, IoU 0.53–0.82 | `psr_agreement`, `psr_iou` | `validation.json` | `test_factcheck_numbers.py` |
| 95–132 K warmer | `thermal_gap_moon` | `thermal_gap.json` (Diviner + POWER) | `test_factcheck_numbers.py`, `test_claims.py` |
| fidelity 80 %, 29–30 March 2027 | `rehearsal_fidelity` (pending: computed in the browser) | `sim/` grids | method in `web/tests/sim_*.test.mjs` |
| under 4 hours on 64 cores | `scale_hours_64`, `scale_core_hours` | `benchmark_tile.json` | `test_factcheck_numbers.py` |
| Web app numbers | — (read from the exports, never typed) | `web/public/data/` | `test_factcheck_web.py` |

## Judge Q&A: the light validation

Numbers come from `data/processed/far_horizons.json` (`V3_far_curved`) and `data/processed/validation.json`.

**"How do you know your light model is right?"**
We compared it with NASA's own LOLA illumination map, averaged over 18.6 years: Spearman ρ = 0.92–0.99 at all six
Moon Base sites, with a mean error of 2.0–3.2 percentage points of lit time.

**"Why does the local model do worse?"**
Distant mountains. Near the pole the Sun is hidden by terrain tens of kilometres away. Adding NASA's 85°S DEM up to
150 km closes the gap; lunar curvature alone barely matters.

**"Do you get the permanently shadowed regions right?"**
Mostly. Our never-lit points agree with NASA's LPSR map on 98.0–99.7 % of points at every site, but permanent shadow
is rare there (0.6–4.8 % of each footprint), so the honest number is the overlap of the two shadow masks:
intersection over union 0.53–0.82. The headline validation remains ρ = 0.92–0.99 on the full illumination map.

**"Any caveat?"**
Four sites, Malapert, Nobile Rim 1, Leibnitz Beta and Haworth, sit near the edge of NASA's 85°S DEM, so their rays
toward lower latitudes stop after 21–91 km. All of them still reach ρ ≥ 0.975. Do not say "150 km in every direction".

## Judge Q&A: the method and the blind test

Numbers come from `data/processed/known_analogs.json`, `sensitivity.json`, `results.json` and `windows.csv`.

**"Did you tune P.E.N. until it found Mauna Kea?"**
No. The weights are equal (terrain 1, illumination 1) and the 6 km window was fixed before the known-analog test was
added. The known sites are only used to check the ranking, never to fit it. Pu'u Hiwahine is #1 of 10,424 for Malapert,
top 0.2 % for four of the six Moon Base sites and top 5 % for all six.

**"How stable is the ranking?"**
Re-weighting illumination from 0.5× to 2× keeps 5 to 10 of the top 10 windows (5 for Malapert and Haworth, 10 for
de Gerlache, Nobile Rim 1 and Leibnitz Beta). The window size matters more: at 12 km the best region changes for several
Moon sites. We report that rather than hide it (`stability_top10_by_window_km`).

**"Why these features and this score?"**
Five terrain features (relief, median and 90th-percentile slope, roughness, hypsometry) plus the shadow fraction with the
Sun at 2° and 5°. Each difference is divided by its spread across all Earth windows (IQR), so no feature dominates by its
units; S = 100 · exp(−D) turns the weighted distance into 0–100, and every card says which features match and which do
not.

**"Why should a classic analog site not always rank first?"**
Because sites are chosen for different reasons. Meteor Crater is an impact-geology analog and University Valley a
dry-permafrost (thermal) analog; neither was picked for terrain and low-Sun light, and they rank lower, as they should.

## Judge Q&A: temperature and minerals (context, not scored)

**"Does P.E.N. use temperature?"**
As context on every card, not in the score. Earth: NASA MODIS MOD11A2 land-surface temperature for 2025, per window
(10,417 of 10,424; 7 have too few clear-sky composites). Moon: LRO Diviner, measured. Mars: Mars Climate Database v6.2,
modelled. The coldest Earth region we search (University Valley, 239 K mean) is still 95–132 K warmer than the Moon Base
sites, so a lunar thermal score would be 0 everywhere; for Mars the gap is only 15–38 K.

**"Why not score minerals?"**
NASA EMIT maps the EMIT-10 minerals (clays, carbonates, iron oxides, sulfates…) between 52°N and 52°S, so 9 of our 14
regions. Those minerals are almost absent on the Moon, so on a lunar card they show where the analogy breaks, and EMIT
cannot see the basalt minerals (olivine, pyroxene, plagioclase) that make a site lunar. On the best Mauna Kea windows EMIT
finds almost none of them. The shares are weighted shares, not abundances, and iron oxides are a lower bound.

**"What can Earth not reproduce at all?"**
Reduced gravity, vacuum, the radiation environment and, for the Moon Base, the cold. Every card lists these.

