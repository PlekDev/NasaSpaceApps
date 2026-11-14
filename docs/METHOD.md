## Method

**Question.** For a given Moon or Mars site, which Earth places are most similar, in which dimension, and where
does the analogy break?

**1. Common grid.** Each DEM is reprojected to a local azimuthal-equidistant projection centred on the DEM. The
projection uses the body's radius (Moon 1,737.4 km, Mars 3,396.19 km, WGS84 for Earth), and the DEM is averaged
to 30 m. 30 m is the native Copernicus resolution, so the 5 m lunar and 20 m Martian DEMs are degraded to match.

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
2.5° over 16 azimuths. We compare it with the official LOLA 18.6-year average-illumination map (Mazarico et al.
2011) resampled to the same grid, excluding a 1.5 km border and sampling every 120 m. Spearman ρ = 0.86 at
Connecting Ridge and ρ = 0.55 at Malapert.

**6. Analog in time.** Hours per day with solar elevation between 0° and 7° at each Earth site's latitude, by
month. This uses a standard declination and hour-angle formula without refraction.

### Limitations

- **Local horizons only.** There is no body curvature and no terrain outside the DEM. Far mountains shape polar
  lunar light, which explains the lower ρ at Malapert. Fix: compute on a larger DEM and crop afterwards.
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
- NASA Moon Base overview: https://www.nasa.gov/reference/moonbase-about/
