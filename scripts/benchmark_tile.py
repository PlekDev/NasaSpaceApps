"""How long P.E.N. takes per 1° Earth tile: the numbers behind "it scales to all land".

Each Earth region in config/sites.yaml is one Copernicus GLO-30 1°×1° tile, reprojected to a 30 m grid (about
3,700 × 3,500 cells near the equator, fewer columns towards the poles). This script times every stage of
scripts/run_pipeline.py on those grids, one tile at a time on one core:
  reproject   to_metric (only when data/raw/ has the DEM; otherwise reported as null)
  shadows     shadow_fraction_maps, 2 elevations × 8 azimuths (the bulk of the work)
  terrain     slope and roughness
  windows     window_features for the 3, 6 and 12 km windows
  scoring     similarity of every 6 km window to the 9 targets
Output: data/processed/benchmark_tile.json (machine, per-tile seconds, median per stage) and a whole-Earth estimate:
seconds per million 30 m cells (median over tiles, without reprojection) × the land area covered by GLO-30.
Needs data/cache/ (a full pipeline run).  Usage: python scripts/benchmark_tile.py [site ...]
                                                  python scripts/benchmark_tile.py --summarize   (redo the summary only)
AI-assisted (Claude); reviewed by the author."""
import json, os, platform, statistics, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from pen.config import load_config, RAW, PROCESSED, CACHE, references, candidates
from pen.grid import to_metric
from pen.shadows import shadow_fraction_maps
from pen.features import slope_deg, roughness_sq, window_features, DIMENSIONS
from pen.scoring import iqr_scale, reference_vector, similarity

cfg = load_config()
RES, WIN, MAIN = cfg["resolution_m"], cfg["window_km"], cfg["main_window_km"]
ELEVS, AZS = tuple(cfg["sun_elevations_deg"]), tuple(cfg["sun_azimuths_deg"])
KEYS = [k for ks in DIMENSIONS.values() for k in ks]
OUT = PROCESSED / "benchmark_tile.json"
# Copernicus DEM GLO-30 land surface coverage (Copernicus Data Space Ecosystem, COP-DEM collection description)
LAND_KM2 = 149e6
LAND_SOURCE = "https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM"


def summarize(out):
    tiles = out["tiles"]
    stages = ["reproject", "shadows", "terrain", "windows", "scoring", "total_without_reproject"]
    out["median_seconds"] = {k: (round(statistics.median(v), 2) if (v := [t["seconds"][k] for t in tiles if t["seconds"][k] is not None]) else None)
                             for k in stages}
    per_mcell = statistics.median(t["seconds"]["total_without_reproject"] / (t["valid_cells"] / 1e6) for t in tiles)
    cells = LAND_KM2 * 1e6 / RES ** 2
    core_h = per_mcell * cells / 1e6 / 3600
    out["all_land_estimate"] = dict(
        land_km2=LAND_KM2, land_source=LAND_SOURCE, cells_30m=round(cells), seconds_per_million_cells=round(per_mcell, 2),
        core_hours=round(core_h), hours_on_64_cores=round(core_h / 64, 1),
        note="Pipeline stages without reprojection or download; tiles are independent, so this divides across cores")
    return out


def features_of(z):
    sh = shadow_fraction_maps(z, ELEVS, AZS, RES)
    sl, rg = slope_deg(z, RES), roughness_sq(z)
    return {km: window_features(z, sl, rg, sh, int(km * 1000 / RES), max(int(km * 1000 / RES) // 2, 1)) for km in WIN}


def main(sites):
    refs = [r for r in references(cfg) if (CACHE / f"{r}_z.npy").exists()]
    ref_vec = {}
    pool_feats = {}
    for r in refs:                       # target vectors and the IQR scale, as in the pipeline (not timed per tile)
        ref_vec[r] = reference_vector(features_of(np.load(CACHE / f"{r}_z.npy"))[MAIN], KEYS)
    tiles = []
    for s in sites:
        p = CACHE / f"{s}_z.npy"
        if not p.exists():
            print("skip", s, "(no data/cache grid)"); continue
        t = {}
        raw = RAW / cfg["sites"][s]["file"]
        if raw.exists():
            a = time.perf_counter(); to_metric(raw, "earth", RES); t["reproject"] = time.perf_counter() - a
        else:
            t["reproject"] = None
        z = np.load(p)
        a = time.perf_counter(); sh = shadow_fraction_maps(z, ELEVS, AZS, RES); t["shadows"] = time.perf_counter() - a
        a = time.perf_counter(); sl, rg = slope_deg(z, RES), roughness_sq(z); t["terrain"] = time.perf_counter() - a
        a = time.perf_counter()
        feats = {km: window_features(z, sl, rg, sh, int(km * 1000 / RES), max(int(km * 1000 / RES) // 2, 1)) for km in WIN}
        t["windows"] = time.perf_counter() - a
        pool_feats[s] = feats[MAIN]
        tiles.append(dict(site=s, shape=list(z.shape), valid_share=round(float(np.isfinite(z).mean()), 3),
                          valid_cells=int(np.isfinite(z).sum()),
                          windows_6km=len(feats[MAIN]), seconds=t))
        print(f"{s:34s} {z.shape}  " + "  ".join(f"{k} {v:.1f}s" for k, v in t.items() if v is not None), flush=True)
    pool = [dict(r, site=s) for s in pool_feats for r in pool_feats[s]]
    scale = iqr_scale(pool, KEYS)
    for tile in tiles:
        rows = pool_feats[tile["site"]]
        a = time.perf_counter()
        for rv in ref_vec.values():
            for r in rows:
                for ks in list(DIMENSIONS.values()) + [KEYS]:
                    similarity(r, rv, ks, scale)
        tile["seconds"]["scoring"] = time.perf_counter() - a
    for tile in tiles:
        tile["seconds"] = {k: (round(v, 2) if v is not None else None) for k, v in tile["seconds"].items()}
        tile["seconds"]["total_without_reproject"] = round(sum(v for k, v in tile["seconds"].items() if k != "reproject" and v), 2)
    out = dict(
        note="Seconds per 1° Copernicus GLO-30 tile on a 30 m grid, one core; see scripts/benchmark_tile.py",
        machine=dict(cpu=platform.processor() or platform.machine(), cores=os.cpu_count(), python=platform.python_version(),
                     numpy=np.__version__),
        targets=len(ref_vec), elevations=list(ELEVS), azimuths=len(AZS), window_km=WIN,
        tiles=tiles)
    write(summarize(out))


def write(out):
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("median per tile:", out["median_seconds"])
    print("all land:", out["all_land_estimate"])


if __name__ == "__main__":
    if "--summarize" in sys.argv:
        out = json.loads(OUT.read_text(encoding="utf-8"))
        for t in out["tiles"]:     # older files: valid cells from the cached grid
            t.setdefault("valid_cells", int(np.isfinite(np.load(CACHE / f"{t['site']}_z.npy", mmap_mode="r")).sum()))
        write(summarize(out))
    else:
        main(sys.argv[1:] or candidates(cfg))
