<!-- AI-assisted (Claude, Anthropic); reviewed by the team. -->
# Earth data and Space Agency Partner data (draft for the project page)

Author: Diego Dona. Written for the project page and deck; every number is traced to its file below.

## 1. Earth data

Our Earth side is ESA's Copernicus DEM GLO-30, a 30 m surface model, covering 14 one-degree regions from Sonora and Hawaiʻi
to Svalbard and Antarctica's Dry Valleys. We mask the sea (≤ 0.5 m) and the lakes that Copernicus flattens, then slide 6 km
windows over the rest: 10,424 windows to compare against each Moon and Mars site. To check the method against ground
truth we ran a known-analog test on 8 classic NASA training and analog sites, 48 site × target tests, with coordinates
taken from gazetteers and papers. They rank at the 84th percentile for illumination and the 61st for terrain
(50 = random). Pu'u Hiwahine on Mauna Kea, a NASA lunar test site, lands in the top 0.2 % for four of the six Moon sites,
found without labels; El Pinacate is in the top 3 % for four.

*Optional sentence if the temperature layer is merged:* "Each window also carries a MODIS land-surface-temperature
summary (MOD11A2, 2025), so Earth's heat and cold can be set against LRO Diviner." (Do not use until `earth_lst_windows.csv` is in `main`.)

## 2. Space Agency Partner data: ESA Copernicus

The terrain backbone of P.E.N. is the ESA Copernicus DEM GLO-30 (30 m global digital surface model, accessed through AWS
Open Data). All 14 Earth candidate regions are 14 one-degree tiles of this product, and its 30 m resolution sets the common
scale to which the 5 m lunar and 20 m Martian elevation models are degraded, so every body is compared on equal terms.
Because Copernicus is a surface model, vegetation and buildings are included; sea and flattened lakes are masked before
any window is scored. Credit: © DLR e.V. / Airbus, provided under the Copernicus programme by ESA.

## Where each number comes from

| Number in the text | File |
|---|---|
| 14 regions | `data/processed/windows.csv` (column `site`, 14 distinct values) |
| 10,424 windows (6 km) | `data/processed/windows.csv` (`window_km` = 6, rows per `reference`) |
| 8 sites, 48 tests | `data/processed/known_analogs.json` (`rows`; `summary.n_tests`) |
| 84th percentile illumination, 61st terrain | `data/processed/known_analogs.json` (`summary.median_percentile_illumination_best` = 84.35, `median_percentile_terrain_best` = 61.15) |
| Pu'u Hiwahine top 0.2 % for four of six Moon sites | `data/processed/known_analogs.csv` (`score_combined_pct_best` ≥ 99.8 for Connecting Ridge, de Gerlache, Malapert, Nobile Rim 1) |
| Pinacate top 3 % for four Moon sites | `data/processed/known_analogs.csv` (97.1-97.8 for the same four sites) |
| 30 m, 5 m, 20 m resolutions; sea ≤ 0.5 m | `config/sites.yaml` (`resolution_m`) and `docs/METHOD.md` (not in `data/processed/`) |
| Credit line | `README.md` (License and credits) |
