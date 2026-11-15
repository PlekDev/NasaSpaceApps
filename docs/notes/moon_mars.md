# Moon & Mars notes for METHOD.md (owner: Diego Lizárraga)

Section drafts for Victor to integrate into `docs/METHOD.md`. Every number below is read from `data/processed/` on
15 Nov 2026; if a file is regenerated, take the number from the file, not from this note.

## Proof 2 · Light model against NASA, point by point

`scripts/stats/light_agreement.py` re-runs the far-horizon light model of `scripts/validate_far_horizons.py` (imported,
not modified) on the same target points and keeps the points, so the agreement can be shown and not only summarised.
For each of the six lunar sites it writes `data/processed/stats/light_<site>.json`, plus `light_summary.json`:

- **Density.** A 40 × 40 histogram of modelled against NASA lit fraction (the scatter plot, binned).
- **Bland-Altman.** The difference model − NASA against the mean of the two. Bias = mean difference; limits of
  agreement = bias ± 1.96 × standard deviation of the differences (sample standard deviation). 1,200 points per site
  are sent to the browser, drawn with a fixed seed (20261115); the statistics use all points.
- **Residual map.** Model − NASA on the site grid (240 m points), thinned to at most 64 cells per side, next to both maps.
- **Ray reach** and **permanent shadow** are copied or recomputed with the same definitions as in `far_horizons.json`.

The script asserts nothing new about the headline: for every site its recomputed ρ and mean error equal the committed
`far_horizons.json` to three decimals (`matches_far_horizons_json`, all six true).

Results (`light_summary.json`): ρ 0.92–0.987, mean error 2.0–3.2 points of lit time, bias −0.7 to −2.5 points (the
model is slightly darker than NASA at every site), widest limits of agreement −10.8 to +9.4 points (Shackleton
Connecting Ridge; the other five sites lie within −7.4 to +2.8).

Why Bland-Altman as well as Spearman: ρ only compares rankings, so a model that was uniformly too dark would still
score ρ = 1. The Bland-Altman numbers give the size and the sign of the error.

Limits: the cached per-point arrays live in `data/cache/light/` (not committed) and need the raw LOLA files to be
rebuilt (~7 min). Points are 240 m apart, so neighbouring residuals are correlated; the limits of agreement describe
the spread of the differences, not a confidence interval of the bias.

## Limits · where the analogy breaks

`web/tools/exports/limits.py` builds one file per target from existing results only (`diviner.json`,
`mars_context.json`, `thermal_gap.json`, `earth_lst_windows.csv`, `earth_emit_windows.csv`, `windows.csv`); it
computes no new science.

- **One temperature scale.** Moon: Diviner annual mean 2 cm below the surface (site mean and coldest facet) and
  surface maximum, measured. Mars: Mars Climate Database v6.2 surface temperature, modelled. Earth: median over each
  region's windows of the MODIS MOD11A2 minimum, mean and maximum (NASA POWER where MODIS is missing).
- **Fidelity matrix.** For the five best Earth regions of each target (best window per region), one verdict per column
  with fixed rules, exported with the data in `limits/scale.json`:
  terrain and light: score ≥ 80 yes, 60–80 partly, below 60 no; temperature: within 20 K of the target mean partly,
  otherwise no, never yes because the quantities differ; minerals: not measurable for the Moon (lunar silicates are
  not in the EMIT-10), partly for Jezero when EMIT finds at least 1 % clays plus carbonates in the window; gravity
  and air: always no.
- The 80 / 60 and 20 K thresholds are presentation choices, not results. Changing them changes the labels, not any
  score.
- Reference values, not results: surface gravity 9.81, 1.62 and 3.71 m/s²; sea-level pressure 101,325 Pa.

## Mars at the same level

The three Mars targets get the same cards as the Moon: temperature and pressure from the Mars Climate Database,
gravity, and the mineral column for Jezero. Deuteronilus Mensae is our buried-ice reference by region (SHARAD: Plaut
et al. 2009; Petersen et al. 2018); we did not check that the DTM footprint itself contains a debris apron.
Home shortcut for Paul: Jezero ↔ Sierra Chichinautzin, combined score 88.6 (terrain 86.7, light 96.9), from
`summary.csv`.

## Method view

`web/src/views/method.ts` shows the pipeline as seven steps, the shadow and score formulas in MathML (no extra
dependency, read by screen readers), the data table with exact product names, and this document under "Read more".
