"""Per-window features at every window size, for the robustness statistics (bootstrap, Kendall tau) and the controls.

The main run keeps only the Earth windows at 6 km (windows.csv). The bootstrap needs the features of the REFERENCE
windows (Moon/Mars) and the window-size test needs 3 and 12 km. This script recomputes them with the pipeline's own
functions, imported from pen/ (nothing in pen/ or config/ is modified), exactly as scripts/run_pipeline.py does:
to_metric -> shadow_fraction_maps -> slope_deg / roughness_sq -> window_features (step = window / 2).

Output (git-ignored): data/cache/stats/features_<site>.csv with columns window_km, i, j, the 7 features and, for Earth
windows, lon and lat of the centre and the polygon. Check: the Earth features at 6 km must match windows.csv.

Run: python scripts/stats/extract_features.py [site ...]     (needs data/raw/, see scripts/download_data.py)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, sys, time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import numpy as np
import pandas as pd
from pen.config import CACHE, RAW, load_config, references, candidates
from pen.features import DIMENSIONS, roughness_sq, slope_deg, window_features
from pen.grid import to_metric
from pen.shadows import shadow_fraction_maps

OUT = CACHE / "stats"
KEYS = [k for ks in DIMENSIONS.values() for k in ks]


def site_features(sid, s, cfg, path=None):
    """All windows of one site at every configured window size (same code path as run_pipeline.py)."""
    res, elevs, azs = cfg["resolution_m"], tuple(cfg["sun_elevations_deg"]), tuple(cfg["sun_azimuths_deg"])
    g = to_metric(path or RAW / s["file"], s["body"], res)
    sh = shadow_fraction_maps(g.z, elevs, azs, res)
    sl, rg = slope_deg(g.z, res), roughness_sq(g.z)
    rows = []
    for km in cfg["window_km"]:
        w = int(km * 1000 / res)
        for r in window_features(g.z, sl, rg, sh, w, max(w // 2, 1)):
            r["window_km"] = km
            if s["role"] != "reference":
                rr = [r["i"], r["i"], r["i"] + w, r["i"] + w, r["i"] + w / 2]
                cc = [r["j"], r["j"] + w, r["j"] + w, r["j"], r["j"] + w / 2]
                lon, lat = g.pixel_to_lonlat(rr, cc)
                r["lon"], r["lat"] = float(lon[4]), float(lat[4])
                r["polygon"] = json.dumps([[round(float(a), 5), round(float(b), 5)] for a, b in zip(lon[:4], lat[:4])])
            rows.append(r)
    return pd.DataFrame(rows)


def _job(args):
    sid, s, cfg = args
    t = time.time()
    df = site_features(sid, s, cfg)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT / f"features_{sid}.csv", index=False)
    return sid, {km: int((df.window_km == km).sum()) for km in cfg["window_km"]}, time.time() - t


def check_against_windows(cfg):
    """Earth features at the main window size must equal windows.csv (rounded to 4 decimals there)."""
    from pen.config import PROCESSED
    w = pd.read_csv(PROCESSED / "windows.csv")
    w = w[w.reference == w.reference.iloc[0]]
    worst = 0.0
    for sid in candidates(cfg):
        f = OUT / f"features_{sid}.csv"
        if not f.exists():
            continue
        a = pd.read_csv(f)
        a = a[a.window_km == cfg["main_window_km"]]
        m = w[w.site == sid].merge(a, on=["i", "j"], suffixes=("", "_new"))
        n_main = int((w.site == sid).sum())
        assert len(m) == n_main == len(a), f"{sid}: {len(m)} matched, windows.csv {n_main}, recomputed {len(a)}"
        err = max(float(np.abs(m[k] - m[f"{k}_new"]).max()) for k in KEYS)
        worst = max(worst, err)
        print(f"  check {sid:36s} {n_main:5d} windows  max |diff| {err:.2e}")
    assert worst < 1e-3, f"recomputed features differ from windows.csv by {worst}"
    return worst


def main(only):
    cfg = load_config()
    sites = [s for s in list(references(cfg)) + list(candidates(cfg)) if not only or s in only]
    missing = [s for s in sites if not (RAW / cfg["sites"][s]["file"]).exists()]
    if missing:
        sys.exit(f"missing rasters for {missing}: run scripts/download_data.py first")
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=6) as ex:
        for sid, n, dt in ex.map(_job, [(s, cfg["sites"][s], cfg) for s in sites]):
            print(f"  {sid:36s} windows {n}  {dt:5.0f}s", flush=True)
    print(f"max |diff| vs windows.csv: {check_against_windows(cfg):.2e}   total {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
