# Scale: what a global P.E.N. run would cost

Owner: Angel. Feeds slide 7 of the deck and the project page. **Draft: the timings below are the README's
(`~50 s per 1° × 1° Earth tile` on 2 CPU cores, full run ~9 min). Victor's measured per-stage timings (V6) replace
them before the 19:00 freeze.**

## What we run today

| | Value | Source |
|---|---|---|
| Earth regions | 14 one-degree tiles of Copernicus DEM GLO-30 | `config/sites.yaml` |
| Windows scored (6 km, half-window step) | 10,424 | `data/processed/windows.csv` |
| Windows per tile | 94 to 1,182, mean 745 | `data/processed/windows.csv` |
| Compute | about 50 s per tile, about 9 min in total, on 2 CPU cores | README, "The algorithm" |

Coastal and polar tiles give fewer windows: the sea and lake mask removes water, and one degree of longitude is
narrower at high latitude (Svalbard 94 windows, Serdán-Oriental 1,182).

## The whole land surface

The public Copernicus GLO-30 bucket lists **26,450** one-degree tiles (`tileList.txt` in
`s3://copernicus-dem-30m`, counted on 15 Nov 2026). Every tile that contains land is in that list.

| Quantity | Estimate | How |
|---|---|---|
| Tiles | 26,450 | tile list of the public bucket |
| Compute | about 370 hours on one 2-core machine (15 days) | 26,450 × 50 s |
| Same job in parallel | about 12 hours on 32 two-core workers | tiles are independent |
| Windows | about 20 million | 26,450 × 745 (the mean of our 14 tiles) |

The 20 million is an order of magnitude, not a count: our 14 tiles are not a random sample of the land surface.

## Why it scales

- **Tiles are independent.** Features for one tile need only that tile,
  so the run splits across machines with no shared state.
- **The shadow model is O(N).** One running maximum per row and per Sun position; cost grows linearly with pixels.
- **Scoring is a table operation.** Once the seven features exist for every window, scoring against a target is one
  vectorised pass. Adding a tenth target does not recompute any Earth feature.
- **The data are already public.** Copernicus GLO-30 is served as cloud-optimised GeoTIFFs from AWS Open Data; no
  download step has to be staged by hand.

## What changes at global scale (and what we would report)

- **The IQR changes.** Scores divide each difference by the inter-quartile range over all Earth windows. A global
  run widens that population, so absolute scores move; ranks inside a region are much less sensitive. The blind test
  would be re-run and reported.
- **Vegetation and buildings.** GLO-30 is a surface model. Forest and cities add roughness that is not terrain; a
  land-cover mask (for example ESA WorldCover) would be applied before ranking.
- **Flat plains.** Flat Mars references already match much of Earth; a global run needs a finer texture, ice or
  thermal dimension to discriminate.
- **Context layers.** MODIS LST and EMIT are fetched per region today; EMIT only covers 52° S to 52° N.

## One sentence for the deck

> P.E.N. searches 14 regions in 9 minutes on a laptop; the same code covers all 26,450 land tiles of the Copernicus
> DEM in about 12 hours on 32 small cloud workers.
