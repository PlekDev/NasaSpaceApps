"""Open analog catalog: every Earth window of P.E.N. with its scores for every target, plus Earth context layers.

Reads only data/processed/ (and config/sites.yaml for labels and sources, read-only):
  windows.csv                       scores and features per (window, target), 6 km windows
  earth_lst_windows.csv             MODIS land-surface temperature per window (context, not scored)
  earth_emit_windows.csv            EMIT surface mineralogy per window (context, not scored)
  stats/bootstrap.json, roc.json    bootstrap CI of the top windows, AUC (for the usage notes)
Writes data/release/:
  pen_analog_catalog.csv            one row per Earth window (10,424), wide: scores and rank per target, features, LST, EMIT
  pen_analog_catalog.geojson        the windows as polygons (WGS84 lon/lat) with id, region, combined__* and rank__* (light;
                                    join the CSV by window_id for the other columns)
  pen_top_windows.csv               the top 20 windows per target with their 95 % bootstrap CI of score and rank
  README.md                         column dictionary with units, sources and licences, usage notes, input hashes
  SHA256SUMS                        checksums of the released files
and, outside the repository (git-ignored), data/release_full/ with the full GeoJSON (every column) and its SHA256SUMS,
for the Zenodo deposit.
Deterministic: no random draws, fixed row and column order, no timestamps, so a rerun on the same inputs gives the same bytes.
Run: python scripts/release_catalog.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
from pen.config import PROCESSED, load_config
from pen.features import DIMENSIONS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "release"
OUT_FULL = ROOT / "data" / "release_full"          # git-ignored; uploaded to Zenodo, not committed
INPUTS = [PROCESSED / "windows.csv", PROCESSED / "earth_lst_windows.csv", PROCESSED / "earth_emit_windows.csv",
          PROCESSED / "stats" / "bootstrap.json", PROCESSED / "stats" / "roc.json", ROOT / "config" / "sites.yaml"]
KEYS = [k for ks in DIMENSIONS.values() for k in ks]
SCORES = {"combined": "score_combined", "terrain": "score_terrain", "illumination": "score_illumination"}

FEATURE_DOC = {  # unit, description (definitions in pen/features.py)
    "relief": ("log10(m)", "local relief: log10 of the P98 − P2 elevation range in the window"),
    "slope_med": ("degrees", "median slope"),
    "slope_p90": ("degrees", "90th-percentile slope"),
    "rough": ("log10(m)", "150 m roughness: log10 of the RMS deviation from a 5×5-pixel (150 m) moving mean"),
    "hypso": ("0–1", "hypsometry: (mean − P2) / (P98 − P2) elevation"),
    "shadow_e2": ("0–1", "mean cast-shadow fraction at 2° Sun elevation over 8 azimuths"),
    "shadow_e5": ("0–1", "mean cast-shadow fraction at 5° Sun elevation over 8 azimuths"),
}
LST_COLS = {"lst_mean_K": ("K", "per pixel, mean of all valid day and night 8-day composites of 2025; window mean over valid pixels"),
            "lst_min_K": ("K", "per pixel, 5th percentile of the night composites; window mean"),
            "lst_max_K": ("K", "per pixel, 95th percentile of the day composites; window mean"),
            "lst_range_K": ("K", "per pixel, max − min; window mean"),
            "n_valid_day": ("count", "valid day composites per pixel (max 46), window mean"),
            "n_valid_night": ("count", "valid night composites per pixel (max 46), window mean")}
EMIT_GROUPS = ["clays", "carbonates", "iron_oxides", "sulfates"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sha_input(path):
    """Input hash with line endings normalised (CRLF -> LF), so a Windows checkout gives the same hash."""
    return hashlib.sha256(Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def stable_rank(x):
    order = np.argsort(-np.asarray(x), kind="stable")
    r = np.empty(len(order), dtype=np.int64)
    r[order] = np.arange(1, len(order) + 1)
    return r


def build(cfg):
    w = pd.read_csv(PROCESSED / "windows.csv")
    targets = [t for t in cfg["sites"] if cfg["sites"][t]["role"] == "reference" and t in set(w["reference"])]
    regions = [r for r in cfg["sites"] if cfg["sites"][r]["role"] == "candidate" and r in set(w["site"])]
    base = w[w["reference"] == targets[0]][["site", "i", "j", "lon", "lat", "polygon"] + KEYS].copy()
    base["region_order"] = base["site"].map({r: n for n, r in enumerate(regions)})
    base = base.sort_values(["region_order", "i", "j"]).drop(columns="region_order").reset_index(drop=True)
    base.insert(0, "window_id", base["site"] + "_" + base["i"].astype(str) + "_" + base["j"].astype(str))
    base = base.rename(columns={"site": "region"})
    base.insert(2, "region_label", base["region"].map(lambda r: cfg["sites"][r]["label"].split("·", 1)[1].strip()))
    for t in targets:
        g = w[w["reference"] == t].reset_index(drop=True)          # file order = official order (stable ranks)
        g["rank"] = stable_rank(g["score_combined"])
        g["window_id"] = g["site"] + "_" + g["i"].astype(str) + "_" + g["j"].astype(str)
        g = g.set_index("window_id").loc[base["window_id"]]
        for s, col in SCORES.items():
            base[f"{s}__{t}"] = g[col].to_numpy()
        base[f"rank__{t}"] = g["rank"].to_numpy()
    key = ["region", "i", "j"]
    lst = pd.read_csv(PROCESSED / "earth_lst_windows.csv").rename(columns={"site": "region"})[key + list(LST_COLS)]
    emit = pd.read_csv(PROCESSED / "earth_emit_windows.csv").rename(columns={"site": "region"})
    emit_cols = ["coverage_frac", "n_granules"] + [f"frac_{g}" for g in EMIT_GROUPS] \
        + [f"frac_present_unweighted_{g}" for g in EMIT_GROUPS] + ["frac_unmapped_g1", "frac_unmapped_g2", "frac_no_detection"]
    emit = emit[key + emit_cols].rename(columns={c: f"emit_{c}" for c in emit_cols})
    n0 = len(base)
    base = base.merge(lst, on=key, how="left").merge(emit, on=key, how="left")
    assert len(base) == n0 and base["window_id"].is_unique, "join changed the number of windows"
    return base, targets, regions, emit_cols


def dictionary(targets, emit_cols, cfg):
    rows = [("window_id", "text", "window id `<region>_<i>_<j>` (same id as the web app)"),
            ("region", "text", "Earth region id (config/sites.yaml)"),
            ("region_label", "text", "Earth region name"),
            ("i, j", "pixel", "row and column of the window's top-left corner on the region's 30 m grid (6 km windows, 3 km step)"),
            ("lon, lat", "degrees (WGS84)", "window centre")]
    rows += [(k, u, d) for k, (u, d) in FEATURE_DOC.items()]
    for t in targets:
        lab = cfg["sites"][t]["label"]
        rows += [(f"combined__{t}", "0–100", f"combined score (all 7 features) against {lab}"),
                 (f"terrain__{t}", "0–100", f"terrain score (5 terrain features) against {lab}"),
                 (f"illumination__{t}", "0–100", f"illumination score (2 shadow features) against {lab}"),
                 (f"rank__{t}", "1…N", f"position of the window among all windows by combined score against {lab} (1 = top; ties in file order)")]
    rows += [(k, u, f"MODIS MOD11A2 land-surface temperature: {d} (context, not scored)") for k, (u, d) in LST_COLS.items()]
    emit_doc = {"coverage_frac": ("0–1", "share of the window's 60 m cells with at least one valid EMIT observation (0 = not observed)"),
                "n_granules": ("count", "EMIT granules contributing at least one valid observation to the window")}
    for g in EMIT_GROUPS:
        emit_doc[f"frac_{g}"] = ("0–1", f"EMIT-10 weighted share of valid observations assigned to {g.replace('_', ' ')}"
                                 + (" (lower bound: mineral IDs without EMIT-10 weights are unmapped)" if g == "iron_oxides" else ""))
        emit_doc[f"frac_present_unweighted_{g}"] = ("0–1", f"share of observations where the EMIT-10 matrix marks {g.replace('_', ' ')} as present with unknown weight (−1)")
    emit_doc.update({"frac_unmapped_g1": ("0–1", "share of group-1 detections with no EMIT-10 weight"),
                     "frac_unmapped_g2": ("0–1", "share of group-2 detections with no EMIT-10 weight"),
                     "frac_no_detection": ("0–1", "share of valid observations with no mineral detection")})
    rows += [(f"emit_{c}", emit_doc[c][0], f"NASA EMIT L2B: {emit_doc[c][1]} (context, not scored{'; a share, not an abundance' if c.startswith('frac_') else ''})") for c in emit_cols]
    return rows


def readme(base, top, targets, regions, rows, cfg, hashes, out_sizes):
    roc = json.loads((PROCESSED / "stats" / "roc.json").read_text(encoding="utf-8"))
    boot = json.loads((PROCESSED / "stats" / "bootstrap.json").read_text(encoding="utf-8"))
    mars = [t for t in targets if t.startswith("mars_")]
    mars_auc = [roc[t]["auc"] for t in mars if t in roc]
    rank_hi = max(boot[t][0]["rank_ci95"][1] for t in targets if t in boot)
    n_lst = int(base["lst_mean_K"].notna().sum()); n_emit = int((base["emit_coverage_frac"] > 0).sum())
    emit_regions = sorted(base.loc[base["emit_coverage_frac"].notna() & (base["emit_coverage_frac"] > 0), "region"].unique())
    ref_src = sorted({cfg["sites"][t]["source"] for t in targets})
    L = ["<!-- Generated by scripts/release_catalog.py; do not edit by hand. -->",
         "# P.E.N. open analog catalog", "",
         f"Every 6 km Earth window searched by P.E.N. ({len(base):,} windows in {len(regions)} regions), with its similarity score "
         f"to each of the {len(targets)} Moon and Mars targets and Earth context layers (temperature, mineralogy). "
         "Method: `docs/METHOD.md`. Code: `scripts/release_catalog.py`.", "",
         "## Files", "", "| File | Size | Content |", "|---|---|---|",
         f"| `pen_analog_catalog.csv` | {out_sizes['pen_analog_catalog.csv']} | one row per window (wide table, columns below) |",
         f"| `pen_analog_catalog.geojson` | {out_sizes['pen_analog_catalog.geojson']} | the windows as WGS84 polygons (RFC 7946 GeoJSON) with `window_id`, `region`, `combined__*` and `rank__*`; join the CSV by `window_id` for every other column |",
         f"| `pen_top_windows.csv` | {out_sizes['pen_top_windows.csv']} | top {len(top) // len(targets)} windows per target with the 95 % bootstrap CI of score and rank |",
         "| `SHA256SUMS` | | checksums of the files above (`shasum -a 256 -c SHA256SUMS`) |", "",
         "A GeoJSON with every column on the polygons (`pen_analog_catalog_full.geojson`) is generated in `data/release_full/` "
         "(not in the repository, because of its size) and is published with the Zenodo deposit of the release.", "",
         "Join the polygons with all columns (Python, geopandas):", "", "```python",
         "gdf = gpd.read_file(\"pen_analog_catalog.geojson\")",
         "gdf = gdf.merge(pd.read_csv(\"pen_analog_catalog.csv\").drop(columns=[c for c in gdf.columns if c != \"window_id\"], errors=\"ignore\"), on=\"window_id\")",
         "```", "",
         "## How to use it (read this first)", "",
         "- Say **\"top window\" with its confidence interval, never \"the best place\"**. Under bootstrap resampling of the "
         f"reference terrain the rank of a target's #1 window can move as far as #{rank_hi} (`pen_top_windows.csv`).",
         f"- **Mars does not separate**: for the Mars targets the score does not rank known Mars analog sites above other windows "
         f"(AUC {min(mars_auc):.2f}–{max(mars_auc):.2f}); flat plains score high for Arcadia Planitia (flat-plains degeneracy). "
         "Use Mars scores as terrain similarity only.",
         "- Scores compare **terrain and low-Sun shadowing only**. They say nothing about temperature, gravity, vacuum, radiation or "
         "chemistry. Temperature (MODIS) and mineralogy (EMIT) columns are context and are **not** part of any score.",
         "- Scores of different targets are not fully comparable; use `rank__<target>` to compare a window across targets.",
         f"- Coverage: LST is available for {n_lst:,} of {len(base):,} windows; EMIT observed {n_emit:,} windows in {len(emit_regions)} regions (elsewhere `emit_coverage_frac` is 0 and the share columns are empty). "
         "EMIT shares are shares of detections, not mineral abundances, and iron oxides are a lower bound.", "",
         "## Columns", "", "`<target>` is one of: " + ", ".join(f"`{t}`" for t in targets) + ".", "",
         "| Column | Unit | Description |", "|---|---|---|"]
    L += [f"| `{c}` | {u} | {d} |" for c, u, d in rows]
    L += ["", "`pen_top_windows.csv`: `target`, `rank` (1–20, equal weights), `window_id`, `region`, `score` (0–100), "
          "`score_ci95_low`, `score_ci95_high`, `rank_ci95_low`, `rank_ci95_high`, `n_ref` (reference windows resampled).", "",
          "Empty cells mean no data (for example no valid LST composites, or no EMIT observation).", "",
          "## Sources and licences", "",
          "| Layer | Source | Licence / terms |", "|---|---|---|",
          "| Earth terrain (all features, all scores) | Copernicus DEM GLO-30, ESA ([registry](https://registry.opendata.aws/copernicus-dem/)) | © DLR e.V. / Airbus, provided under the Copernicus programme by ESA; free use with attribution under the Copernicus DEM licence (see the registry page) |"]
    L += [f"| Reference terrain | {s} | NASA data, public domain |" for s in ref_src]
    L += ["| Earth land-surface temperature | [MODIS Terra MOD11A2 v061](https://doi.org/10.5067/MODIS/MOD11A2.061), NASA LP DAAC | NASA data, public domain |",
          "| Earth surface mineralogy | [EMIT L2B mineralogy V002](https://doi.org/10.5067/EMIT/EMITL2BMIN.002), NASA JPL / LP DAAC | NASA data, public domain |",
          "| Bootstrap CI, AUC | computed by `scripts/stats/` from the files above | as the code |", "",
          "The catalog is derived data: credit each provider above when you use it. Code: MIT (`LICENSE`).", "",
          "## Reproducibility", "", "No random draws; rerunning `python scripts/release_catalog.py` on the same inputs gives the same bytes. "
          "SHA-256 of the inputs (line endings normalised to LF):", "", "| Input | SHA-256 |", "|---|---|"]
    L += [f"| `{k}` | `{v}` |" for k, v in hashes.items()]
    L += ["", f"Combined input hash: `{hashlib.sha256(''.join(hashes.values()).encode()).hexdigest()}`", ""]
    return "\n".join(L)


def human(n):
    return f"{n / 1e6:.1f} MB" if n >= 1e6 else f"{n / 1e3:.0f} kB"


def main():
    cfg = load_config()
    base, targets, regions, emit_cols = build(cfg)
    boot = json.loads((PROCESSED / "stats" / "bootstrap.json").read_text(encoding="utf-8"))
    assert boot.get("_stub") is not True, "bootstrap.json is a stub: run scripts/stats/bootstrap.py first"
    top = pd.DataFrame([dict(target=t, rank=n + 1, window_id=r["window_id"], region=r["site"], score=r["score"],
                             score_ci95_low=r["ci95"][0], score_ci95_high=r["ci95"][1],
                             rank_ci95_low=r["rank_ci95"][0], rank_ci95_high=r["rank_ci95"][1], n_ref=boot["n_ref"][t])
                        for t in targets for n, r in enumerate(boot[t])])
    OUT.mkdir(parents=True, exist_ok=True)
    csv_cols = [c for c in base.columns if c != "polygon"]
    base[csv_cols].to_csv(OUT / "pen_analog_catalog.csv", index=False, lineterminator="\n", float_format="%.6g")
    top.to_csv(OUT / "pen_top_windows.csv", index=False, lineterminator="\n")

    def clean(v):
        if isinstance(v, (float, np.floating)):
            return None if np.isnan(v) else float(f"{v:.6g}")
        return v.item() if isinstance(v, np.generic) else v
    def geojson(path, keep):
        feats = []
        for rec in base.to_dict("records"):
            ring = json.loads(rec.pop("polygon"))
            ring = [[round(x, 5), round(y, 5)] for x, y in ring]
            ring = ring + [ring[0]] if ring[0] != ring[-1] else ring
            feats.append({"type": "Feature", "id": rec["window_id"], "geometry": {"type": "Polygon", "coordinates": [ring]},
                          "properties": {k: clean(v) for k, v in rec.items() if keep(k)}})
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
    geojson(OUT / "pen_analog_catalog.geojson", lambda k: k in ("window_id", "region") or k.startswith(("combined__", "rank__")))
    full = OUT_FULL / "pen_analog_catalog_full.geojson"
    geojson(full, lambda k: True)
    (OUT_FULL / "SHA256SUMS").write_text(f"{sha(full)}  {full.name}\n", encoding="utf-8", newline="\n")
    hashes = {p.relative_to(ROOT).as_posix(): sha_input(p) for p in INPUTS}
    sizes = {f: human((OUT / f).stat().st_size) for f in ("pen_analog_catalog.csv", "pen_analog_catalog.geojson", "pen_top_windows.csv")}
    (OUT / "README.md").write_text(readme(base, top, targets, regions, dictionary(targets, emit_cols, cfg), cfg, hashes, sizes), encoding="utf-8", newline="\n")
    files = ["README.md", "pen_analog_catalog.csv", "pen_analog_catalog.geojson", "pen_top_windows.csv"]
    (OUT / "SHA256SUMS").write_text("".join(f"{sha(OUT / f)}  {f}\n" for f in files), encoding="utf-8", newline="\n")
    for f in files + ["SHA256SUMS"]:
        print(f"  {f:30s} {human((OUT / f).stat().st_size):>9s}")
    print(f"  (not committed) {full.relative_to(ROOT)}  {human(full.stat().st_size)}")
    print(f"{len(base):,} windows × {len(base.columns) - 1} columns, {len(targets)} targets, {len(regions)} regions → {OUT}")


if __name__ == "__main__":
    main()
