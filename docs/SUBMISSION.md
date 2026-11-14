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
NASA plans its Moon Base near the lunar south pole, where the Sun never rises above about 7°. Long shadows rule
landing, roving and power there. P.E.N. is an open tool that searches Earth for places that match a target
Moon or Mars site **dimension by dimension**: terrain shape, low-Sun illumination, and (in progress) temperature.
It explains what is similar and where the analogy breaks. Our cast-shadow model reproduces NASA's official LOLA
illumination map at Shackleton Connecting Ridge (ρ = 0.86). P.E.N. also finds *when* Earth sites reproduce
lunar-pole light: an "analog in time" that tells field teams the best weeks to test.

**Link to project demo:** <deck or video URL>

**Link to final project:** <GitHub URL> · <Streamlit app URL>

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
   - Known analog sites rank at the 80th percentile in illumination (median of 57 tests with 10 sites; 50 = random).
   - LRO Diviner: in 88–100 % of each lunar site the annual mean temperature (2 cm below the surface) is colder than
     Earth's record low air temperature (184 K); ice is stable within 1 m in 22–64 %.
   - Diviner vs Earth's cold analogs (NASA POWER): University Valley, Antarctica, the coldest region we search, has a
     mean skin temperature of 239 K, still 95–132 K warmer than the Moon Base sites (107–144 K). Lunar surface peaks
     (306–342 K) are within reach of Earth's deserts (up to 328 K). See fig8.
   - Mars is a closer thermal match: the Mars Climate Database (model) gives our three Mars sites a mean surface
     temperature of 200–224 K, 15–38 K colder than University Valley, at 680–830 Pa (under 1 % of sea level).
   - Polar sites give 4–7 h/day of lunar-pole-like light around the equinoxes.
4. *Benefits:* regional screeners say which region to look at; P.E.N. picks the exact 6 km site and the best weeks.
   Choose and schedule analog field tests for rover vision, EVA lighting and landing-hazard rehearsal.
   Find under-studied analogs, including in Mexico.
5. *Tools:* Python (rasterio, NumPy, SciPy, pandas, Matplotlib), Streamlit + pydeck, GitHub; NASA APIs Trek WMTS,
   GIBS and EONET.
6. *Limitations and next steps:* local horizons only, 30 m resolution, flat Mars plains, and Earth's limits
   (gravity, vacuum, radiation). Next: thermal as a scored dimension (Diviner vs MODIS/ECOSTRESS), EMIT minerals,
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
- *(add MODIS/ECOSTRESS or EMIT only if they make it into the final run)*

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
  the Mars sites
- Open-source libraries: rasterio, GDAL, NumPy, SciPy, pandas, Matplotlib, Streamlit, pydeck
- Literature: Mazarico et al. 2011; Barker et al. (PGDA); Paige et al. (Diviner); Klingelhoefer et al. 2014 (Mauna Kea
  ISRU tests, NTRS 20140008708); McKay et al. 2003 (Atacama); Plaut et al. 2009 and Petersen et al. 2018 (Deuteronilus Mensae ice, SHARAD); Marinova et al. 2022 (University Valley);
  Preston & Dartnell 2014; NASA Moon Base overview

**Use of Super Intelligence (SI):** see README "Use of AI". AI was used for literature/dataset discovery and to draft
and refactor code and documentation. The team chose the approach and sites, ran and checked all results, and every
AI-assisted file is marked in its header. No AI-generated images.

## 7-slide deck outline

1. **P.E.N.** (Planetary Environmental Navigator) — by **Pollones en Fuga**: 6 members, challenge title. Hook: without being told, P.E.N. picked the exact spot on Mauna Kea where NASA rehearsed a lunar-polar mission, #1 of 10,424 places
2. **The problem** — the Moon Base goes where the Sun never climbs above 7°; existing analog searches ignore light
3. **Our idea** — score Earth places by terrain *and* low-Sun light; explain where the analogy breaks
4. **How it works** — common grid → shadow model → scores; validated against NASA: ρ = 0.92–0.99 (fig7)
5. **Results** — fig1 side by side + blind rediscovery + top matches (Mauna Kea, Atacama, Chichinautzin; El Pinacate top 3 %)
6. **Where Earth stops being an analog** — fig6 (Diviner) + analog in time (fig3); app screenshot
7. **Impact & next steps** — field-test planning, Mexican analogs, thermal/mineral layers, global search
