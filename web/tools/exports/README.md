# Web data exporters: the contract

`python -I web/tools/export_data.py` (or `make web-data`) first writes the core files (`manifest.json`, one file per
target, previews), then runs every `web/tools/exports/<name>.py` here in alphabetical order, each in its own process.
Files starting with `_` (like `_template.py`) are skipped. If an exporter fails, the whole export fails, so CI and the
GitHub Pages build fail too: `main` never ships half the data.

## Rules for every exporter

1. **Reads** only `data/processed/` (and `data/cache/` only if it cannot be avoided; say so in the docstring, and keep
   that part behind a `--build` flag, because CI and the Pages build have no `data/cache/`).
2. **Writes** only `web/public/data/<name>/`, where `<name>` is the file name without `.py`.
3. **Uses** the helpers from `export_data.py`: `write_json`, `write_text`, `copy_atomic` (atomic writes, UTF-8) and ends
   with `write_index(name, files)`, which writes `web/public/data/<name>/index.json`:

   ```json
   {"files": ["null.json", "roc.json"], "generated": "6cae1400"}
   ```

   `generated` is the hash of `data/processed/`, the same one shown in the web footer.
4. **Stubs first.** In the base phase, publish the final shape with dummy values and `"_stub": true` at the top level of
   each JSON (and `write_index(name, files, {"_stub": True})`). Views are written against the stub; real data replaces it
   later without changing keys.
5. **No hand-typed numbers.** Every value comes from a file in `data/processed/`.
6. The manifest lists each exporter's index under `manifest.exports.<name>`, so a view can check its data exists before
   fetching it (`getJSON("<name>/<file>")` in the web app).

Start from [`_template.py`](_template.py). Owners (see the team plan): `sim.py` Victor, `stats.py` D. Dona,
`light.py` D. Lizárraga.

## `sim` (Victor): terrain grids for Mission Rehearsal

`web/public/data/sim/`

| File | Content |
| --- | --- |
| `index.json` | `files`, `generated`, `targets` (ids in order) |
| `<target>.json` | Metadata for the target window and its 5 Earth windows (below) |
| `<target>.bin` | Target window heights |
| `<target>__<site>_<i>_<j>.bin` | Earth window heights; `<site>`, `<i>`, `<j>` as in `windows.csv` |

Each `.bin` is **200 × 200 little-endian `int16`**, row-major. Height in metres = `offset + scale × value`;
`-32768` = no data (filled with the nearest valid height before encoding, so it does not appear today; keep the check).
Grid step `dx = 30 m`. Decode and use them through `web/src/sim/` (`loadSimTarget`, `loadSimGrid`). Rows and columns follow the pipeline's 30 m azimuthal equidistant grid: row 0 is the +y edge
(towards the local north of the grid), column 0 the −x edge (west).

`<target>.json`:

```json
{
  "target": "moon_malapert", "label": "…", "body": "moon",
  "dx": 30, "n": 200,
  "center": {"lat": -85.99, "lon": -0.24, "of": "site"},
  "grid": {"file": "moon_malapert.bin", "offset": 1234.5, "scale": 0.05, "i": 300, "j": 100,
           "lat": -86.04, "lon": -2.4, "up_az": 2.16, "nodata_filled": 0, "min": 0.0, "max": 0.0},
  "windows": [
    {"rank": 1, "site": "earth_hawaii_mauna_kea", "region": "Mauna Kea / Mauna Loa saddle", "i": 600, "j": 1500,
     "lat": 19.784, "lon": -155.487, "up_az": 0.0, "score": 91, "terrain": 89, "illumination": 98,
     "file": "moon_malapert__earth_hawaii_mauna_kea_600_1500.bin", "offset": 0.0, "scale": 0.05,
     "nodata_filled": 0, "min": 0.0, "max": 0.0}
  ]
}
```

- The target window is the one used for its thumbnails (`data/processed/thumbs/ref_windows.json`). `center` is the
  site centre (`results.json → site_centers`); `grid.lat/lon` is the window's own centre. Earth windows carry their
  centre from `windows.csv`.
- `up_az`: geographic azimuth (degrees clockwise from north) of the grid's up edge at the window centre. Near the lunar
  pole it differs from north by up to ~6°; turn any Sun azimuth into the grid frame with `az − up_az`
  (`toGridAz` in `web/src/sim/sun.ts`) before casting shadows.
- `windows` = the best window of each of the **5 best Earth regions** for that target (by combined score), so the window
  picker offers five different places; `rank` is the region's rank.
- Scores are the stored ones (`score_combined` etc.), not recomputed.

The `.bin` grids live in `data/processed/sim/` (committed, about 4 MB in total) so CI can export them without
`data/cache/`. They are rebuilt from the pipeline grids with `python -I web/tools/exports/sim.py --build` (needs
`data/cache/`, i.e. a full pipeline run).
