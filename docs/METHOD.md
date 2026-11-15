## Method

**Question.** For a given Moon or Mars site, which Earth places are most similar, in which dimension, and where
does the analogy break?

**1. Common grid.** Each DEM is reprojected to a local azimuthal-equidistant projection centred on the DEM. The
projection uses the body's radius (Moon 1,737.4 km, Mars 3,396.19 km, WGS84 for Earth), and the DEM is averaged
to 30 m. 30 m is the native Copernicus resolution, so the 5 m lunar and 20 m Martian DEMs are degraded to match.
On Earth, sea (≤ 0.5 m) and lakes (which Copernicus flattens to a constant height) are masked first, because
both would otherwise look like perfect "Mars plains".

**2. Windows.** Square windows of 3, 6 and 12 km slide over each grid with a step of half a window. A window is
kept only if at least 95 % of its pixels are valid and its relief exceeds 1 m, which removes water and flat artefacts.

**3. Features**

| Dimension | Feature | Definition |
|---|---|---|
| Terrain | relief | log10(P98 − P2 of elevation) |
| Terrain | slope_med, slope_p90 | median and 90th percentile of Sobel slope (°) |
| Terrain | rough | log10(RMS of elevation minus 5×5 mean): 150 m roughness |
| Terrain | hypso | (mean − P2) / (P98 − P2) |
| Illumination | shadow_e2, shadow_e5 | mean fraction of pixels in cast shadow with the Sun at 2° and 5°, over 8 azimuths |

**Cast shadows.** With the Sun coming from the left of a row, pixel *i* is shadowed if any upstream pixel *j*
rises above the solar ray: `z_j − (i−j)·dx·tanθ > z_i`. Writing `g_i = z_i + i·dx·tanθ`, this is
`max_{j<i} g_j > g_i`, i.e. a running maximum. That is exact, O(N) per row, and has no horizon cut-off. Other
azimuths rotate the DEM (bilinear), compute the mask, and rotate it back. Tested in `tests/test_core.py`
(direction, length, flat terrain, no-data handling).

**4. Scores.** For each reference site, the reference vector is the median of its windows. Each candidate
difference is divided by the inter-quartile range of all Earth windows at that scale, giving a scaled difference
*d*. Then `D = sqrt(mean(d²))` within a dimension, and `S = 100·exp(−D)`. 100 means identical. A score of about
37 means one IQR apart on average. The app lets users re-weight dimensions.

**5. Validation of illumination.** For each lunar site we compute the lit fraction with the Sun at 0.5°, 1.5° and
2.5° over 17 azimuths (every 22°). We compare it with the official LOLA 18.6-year average-illumination map
(Mazarico et al. 2011) resampled to the same grid, excluding a 1.5 km border and sampling every 120 m. With the
local DEM only, Spearman ρ = 0.86 at Connecting Ridge, 0.61 at Nobile Rim 1, 0.54 at de Gerlache Rim, 0.55 at
Malapert, 0.44 at Haworth and 0.64 at Leibnitz Beta; the far-horizon test below raises this to 0.92–0.99.

**6. Analog in time.** Hours per day with solar elevation between 0° and 7° at each Earth site's latitude, by
month. This uses a standard declination and hour-angle formula without refraction.

**Diviner context (Moon only).** For each lunar reference footprint, `scripts/diviner_context.py` summarises
the LRO Diviner polar resource product (Paige et al.): annual mean temperature (2 cm below the surface), maximum
surface temperature, and the share of
the site where water ice is thermally stable at the surface or within 1 m. These numbers feed the "Earth can't
reproduce" panel of every analog card. They are not scored, because no Earth layer has a comparable meaning.
`scripts/thermal_gap.py` compares them with NASA POWER skin temperatures (MERRA-2 climatology) at the centre of each
Earth region: the coldest region (University Valley, 239 K mean) is still 95–132 K warmer than the Moon Base sites.
For the Mars references, `scripts/mars_context.py` takes modelled surface temperature and pressure from the Mars
Climate Database v6.2 (mean 200–224 K, 680–830 Pa): 15–38 K colder than University Valley, at under 1 % of Earth's
sea-level pressure.

**Far-horizon test (Moon only).** `scripts/validate_far_horizons.py` recomputes illumination for the lunar
references with the LOLA 85°S 40 m DEM, horizons traced up to 150 km in exact 3D on the lunar sphere, and 1,728 real
Sun positions (subsolar latitude ±1.54°, Sun as a 0.53° disk). Against the LOLA average-illumination map, ρ rises
from 0.46–0.88 (local DEM) to 0.92–0.99 (150 km), and the mean error falls to 2.0–3.2 percentage points of lit time.
Malapert, Nobile Rim 1 and Leibnitz Beta lie near the DEM edge, so their rays toward lower latitudes stop after
21–39 km, 41–66 km and 31–49 km (`ray_reach` in `far_horizons.json`). The points that never see the Sun in this model agree
with NASA's permanently-shadowed-region map on 98.0–99.7 % of the points (intersection over union 0.53–0.82).

**Known-analog test.** `scripts/validate_known_analogs.py` takes 8 classic analog sites that fall inside our
regions (Meteor Crater, SP Crater, Cinder Lake Crater Field, Pinacate Peaks, Haughton crater, Pu'u Hiwahine on
Mauna Kea, Yungay and University Valley) and reports the percentile of the windows containing them among all Earth windows. Askja (its point lies on a lake that the water mask removes, so no window is valid) and the
HMP Research Station (same crater as Haughton) were removed. Each coordinate comes from an official gazetteer or a
publication, listed in the `note` field of the script; Pinacate comes from a secondary source (Wikipedia) and is not verified against an official database.

### Earth temperature layer

`scripts/earth_lst.py` adds land-surface temperature (LST) for every Earth window, from MODIS Terra **MOD11A2 v061**
(8-day composites, 1 km, DOI 10.5067/MODIS/MOD11A2.061), year 2025 (46 composites), one 1°×1° region of
`config/sites.yaml` at a time. **The committed `data/processed/earth_lst_windows.csv` was produced from the `earthaccess`
route** (`scripts/earth_lst_earthaccess.py`: NASA Earthdata granules, converted with GDAL's HDF4 driver from conda-forge to
per-date GeoTIFFs in EPSG:4326), because the NASA AppEEARS queue (`submit` / `status` / `download` in `scripts/earth_lst.py`)
stayed pending for hours. Both routes feed the same `compute` step. Credentials come from `EARTHDATA_USERNAME` /
`EARTHDATA_PASSWORD` or `~/.netrc` and are never committed. `make lst` runs `download` + `compute` (AppEEARS route);
the CSV is keyed by `(site, i, j)` as in `windows.csv`, and per-region GeoTIFFs stay in `data/cache/lst/` (not committed).

- **Download size.** About 3.4 GB of MODIS granules for the 14 regions (shared tiles counted once; the script keeps one copy
  per region, ~5.4 GB on disk, deletable after conversion).
- **Quality control.** A composite is used when the mandatory QA flag (bits 0-1) is `00` (good), or `01` (other quality)
  *and* the LST error flag (bits 6-7) is `00` or `01` (error ≤ 2 K). Cloud and not-produced pixels are rejected. Scale factor
  0.02, fill value 0, valid range 150-400 K.
- **Per pixel (K).** `lst_min_K` = 5th percentile of the valid night composites (not the raw minimum, which undetected
  clouds make falsely cold); `lst_max_K` = 95th percentile of the valid day composites; `lst_mean_K` = mean of all valid
  day and night composites; `lst_range_K` = `lst_max_K` − `lst_min_K`. A pixel needs ≥ 12 valid composites per variable.
- **Per window.** Mean over the window's pixels that are valid for all three statistics. A window with < 50 % valid pixels
  gets NaN (no filling or interpolation). `n_pixels_valid` / `n_pixels` count window pixels; `n_valid_day` and `n_valid_night` are the
  mean number of valid daytime and night-time composites per pixel (maximum 46 each, one per 8-day composite of 2025).
- **Gaps.** Cloudy composites are lost, so the layer is a clear-sky statistic and its minimum is biased warm. LST is thermal
  infrared, so it does not need sunlight: the polar night does **not** empty the day layer (about 43-45 of 46 day and night
  composites are valid even at Svalbard and University Valley). The risk there is the opposite: over snow and ice some clouds
  go undetected and give falsely **cold** values, so in Haughton, Svalbard, Axel Heiberg and University Valley the layer
  may be biased cold and should be read with caution. The percentile statistics reduce, but do not remove, this effect.
- **Caveats.** An 8-day composite averages the extremes down, a 1 km pixel is coarse against 30 m terrain, and a 6 km window
  holds only ~36 pixels.

**Relation to `thermal_gap.py`.** This layer is per window (1 km pixels, year 2025); `scripts/thermal_gap.py` gives NASA POWER
skin temperatures per region. They complement each other and neither replaces the other.

**Pairing with LRO Diviner (for the scorer).** Diviner `temp_avg` ↔ `lst_mean_K` and Diviner `temp_max` ↔ `lst_max_K`
(`data/processed/diviner.json`: `temp_avg_mean_K`, `temp_max_mean_K`). They are not the same quantity: Diviner `temp_avg` is
the average temperature at 2 cm below the surface, while LST is the skin temperature of the surface under clear sky.

**Scaling note.** Lunar polar `temp_avg` is ~122-144 K at the Moon Base sites, far from the coldest Earth region
(University Valley, median `lst_mean_K` 241.5 K). With IQR scaling over Earth
windows the thermal distance of every window is huge and the thermal score tends to 0. How to scale it is left to the
scoring owner; this layer does not change `pen/`.

### Limitations

- **Local horizons in scoring.** Scoring uses the site DEM only, on both bodies. The far-horizon test shows that
  distant mountains explain the lower local ρ (Malapert 0.55 → 0.975 with terrain up to 150 km away).
- **Surface model on Earth.** Copernicus includes vegetation and buildings.
- **Resolution.** 30 m hides boulders and small craters that matter for landing hazards.
- **Flat-plains degeneracy.** Mars plains match much of Earth's flat terrain. Finer texture, ice or thermal
  features are needed to discriminate.
- **Scale dependence.** Top-10 membership changes between 3, 6 and 12 km windows. We report it rather than hide it.
- **Earth's limits.** Earth cannot reproduce reduced gravity, vacuum, the thin CO₂ atmosphere or the radiation
  environment. Every analog card lists these.

### References

- Barker, M. K. et al. — High-resolution LOLA topography for lunar south pole sites (NASA GSFC PGDA product 78).
- Mazarico, E. et al. (2011) — Illumination conditions of the lunar polar regions using LOLA topography. *Icarus*.
- Preston, L. J. & Dartnell, L. R. (2014) — Planetary habitability: lessons learned from terrestrial analogues. *Int. J. Astrobiology*.
- Paige, D. A. et al. — LRO Diviner polar resource product (NASA PDS Geosciences).
- Klingelhoefer, G. et al. (2014) — The ISRU field tests 2010 and 2012 at Mauna Kea, Hawaii (NTRS 20140008708).
- McKay, C. P. et al. (2003) — Temperature and moisture conditions for life in the extreme arid region of the Atacama desert. *Astrobiology*.
- Marinova, M. M. et al. (2022) — Climate and energy balance of the ground in University Valley, Antarctica. *Antarctic Science*.
- NASA (2024) — NASA Provides Update on Artemis III Moon Landing Regions (nine candidate regions), Oct 28.
- USGS (2026) — Cinder Lake Crater Field UAS-derived DEMs 2023 and 2024, doi:10.5066/P13W5FTZ.
- NASA Moon Base overview: https://www.nasa.gov/reference/moonbase-about/
