# Submission kit (owner: Paul)

Official guide: https://www.spaceappschallenge.org/resources/project-submission-guide/
Closes **Sun Nov 15, 23:59 local time**. Internal target: **21:00**.

## Checklist

- [ ] Team name on the Space Apps team page: **Los Pikadientes de Caborca**
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

**Project name:** Penumbra — Earth analogs for the Moon Base and Mars, by terrain and light

**High-level summary (≈100 words):**
NASA plans its Moon Base near the lunar south pole, where the Sun never rises above about 7°. Long shadows rule
landing, roving and power there. Penumbra is an open tool that searches Earth for places that match a target
Moon or Mars site **dimension by dimension**: terrain shape, low-Sun illumination, and (in progress) temperature.
It explains what is similar and where the analogy breaks. Our cast-shadow model reproduces NASA's official LOLA
illumination map at Shackleton Connecting Ridge (ρ = 0.86). Penumbra also finds *when* Earth sites reproduce
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
3. *Results:*
   - Connecting Ridge ↔ San Francisco Volcanic Field (73) and El Pinacate, Mexico (72; best illumination match, 81).
   - Malapert ↔ Cuatro Ciénegas (70).
   - Haughton crater offers 4–6 h/day of lunar-pole-like light in spring and autumn.
4. *Benefits:* choose and schedule analog field tests for rover vision, EVA lighting and landing-hazard rehearsal.
   Find under-studied analogs, including in Mexico.
5. *Tools:* Python (rasterio, NumPy, SciPy, pandas, Matplotlib), Streamlit + pydeck, GitHub.
6. *Limitations and next steps:* local horizons only, 30 m resolution, flat Mars plains, and Earth's limits
   (gravity, vacuum, radiation). Next: Diviner/MODIS thermal, EMIT minerals, global search.

**NASA data:**
- LRO LOLA 5 m south-pole DEMs (NASA GSFC PGDA product 78)
- LRO LOLA polar illumination maps (PGDA product 69, Mazarico et al. 2011)
- MRO CTX stereo DTMs (USGS Astrogeology analysis-ready data)
- *(add: LRO Diviner polar products, MODIS/ECOSTRESS, EMIT, if used)*

**Space Agency Partner data and other references:**
- ESA Copernicus DEM GLO-30 (via AWS Open Data)
- Open-source libraries: rasterio, GDAL, NumPy, SciPy, pandas, Matplotlib, Streamlit, pydeck
- Literature: Mazarico et al. 2011; Barker et al. (PGDA); Preston & Dartnell 2014; NASA Moon Base overview

**Use of Super Intelligence (SI):** see README "Use of AI". AI was used for literature/dataset discovery and to draft
and refactor code and documentation. The team chose the approach and sites, ran and checked all results, and every
AI-assisted file is marked in its header. No AI-generated images.

## 7-slide deck outline

1. **Penumbra** — by **Los Pikadientes de Caborca**: 6 members, challenge title. Hook: we come from the Sonoran Desert, next to El Pinacate, where Apollo astronauts trained
2. **The problem** — the Moon Base goes where the Sun never climbs above 7°; existing analog searches ignore light
3. **Our idea** — score Earth places by terrain *and* low-Sun light; explain where the analogy breaks
4. **How it works** — common grid → shadow model → scores; validation map (fig4, ρ = 0.86)
5. **Results** — fig1 side by side + top matches (Pinacate, SFVF, Cuatro Ciénegas)
6. **An analog in time** — fig3: when Earth reproduces lunar-pole light; app screenshot
7. **Impact & next steps** — field-test planning, Mexican analogs, thermal/mineral layers, global search
