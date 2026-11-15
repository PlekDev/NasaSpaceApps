# Scale: what a global P.E.N. run would cost

Owner: Angel. Feeds slide 7 of the deck and the project page. Timings are measured, not estimated: Victor's per-tile
benchmark (`scripts/benchmark_tile.py` → `data/processed/benchmark_tile.json`, V6) and Diego Lizárraga's full re-run
of the pipeline at v0.5. The deck numbers are checked by `tests/test_factcheck_numbers.py` (keys `scale.*`).

## What we run today

| | Value | Source |
|---|---|---|
| Earth regions | 14 one-degree tiles of Copernicus DEM GLO-30 | `config/sites.yaml` |
| Windows scored (6 km, half-window step) | 10,424 | `data/processed/windows.csv` |
| Windows per tile | 94 to 1,182, mean 745 | `data/processed/windows.csv` |
| Full pipeline, 14 tiles and 9 targets | 671 s, about 11 minutes, on a laptop (586 s for the Earth tiles) | full re-run at v0.5 (D. Lizárraga) |
| One tile, one core, without reprojection | 52 s (median), 90 % of it in the shadow model | `benchmark_tile.json` |

Coastal and polar tiles give fewer windows: the sea and lake mask removes water, and one degree of longitude is
narrower at high latitude (Svalbard 94 windows, Serdán-Oriental 1,182).

## The whole land surface

| Quantity | Estimate | How |
|---|---|---|
| Land covered by GLO-30 | 149 million km², about 166 billion cells of 30 m | `benchmark_tile.json`, `all_land_estimate` |
| Compute | about 230 core-hours | 5.0 s per million cells (median over our tiles) × the land cells |
| Wall time | about 3.6 hours on 64 cores | tiles are independent |
| Tiles to read | 26,450 one-degree tiles | `tileList.txt` of the public bucket `s3://copernicus-dem-30m`, counted on 15 Nov 2026 |
| Windows | about 20 million | 26,450 × 745 (the mean of our 14 tiles) |

We use the per-cell estimate (230 core-hours, the one in `benchmark_tile.json`). Multiplying 26,450 tiles × 52 s gives
about 380 core-hours instead: that overstates the work, because tiles at high latitude are narrower and many tiles are
partly ocean, so they hold fewer land cells. Both leave out download and reprojection. The 20 million windows is an order of magnitude, not a count: our 14 tiles are not a random sample
of the land surface.

## Why it scales

- **Tiles are independent.** Features for one tile need only that tile, so the run splits across machines with no
  shared state.
- **The shadow model is O(N).** One running maximum per row and per Sun position; cost grows linearly with pixels.
- **Scoring is a table operation.** Once the seven features exist for every window, scoring against a target is one
  vectorised pass. Adding a tenth target does not recompute any Earth feature.
- **The data are already public.** Copernicus GLO-30 is served as cloud-optimised GeoTIFFs from AWS Open Data; no
  download step has to be staged by hand.

## What changes at global scale (and what we would report)

A global run is mostly a matter of compute. The method changes are these:

- **A land-cover mask.** GLO-30 is a surface model. Forest canopy and buildings add roughness that is not terrain; a
  land-cover mask (for example ESA WorldCover) has to be applied before ranking. This is the main change.
- **The IQR changes.** Scores divide each difference by the inter-quartile range over all Earth windows. A global
  run widens that population, so absolute scores move; ranks inside a region are much less sensitive. The blind test
  would be re-run and reported.
- **Flat plains.** Flat Mars references already match much of Earth: in the control tiles, a farm plain in Iowa scores
  above the median of our regions for Arcadia Planitia (`docs/notes/validation.md`, section 6). A global run needs a
  finer texture, ice or thermal dimension to discriminate.
- **Context layers.** MODIS LST and EMIT are fetched per region today; EMIT only covers 52° S to 52° N.

## One sentence for the deck

> P.E.N. searches 14 regions in about 11 minutes on a laptop; the same code covers all the land in the Copernicus DEM
> in about 230 core-hours, under 4 hours on 64 cores.
