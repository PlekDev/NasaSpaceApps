"""Earth land-surface-temperature (LST) layer per candidate window, from MODIS MOD11A2.061 via NASA AppEEARS.

Workflow (the AppEEARS step is asynchronous, so it is split in four commands):
    python scripts/earth_lst.py submit     # one AppEEARS area task per Earth region (1x1 degree tile of config/sites.yaml)
    python scripts/earth_lst.py status     # poll the tasks
    python scripts/earth_lst.py download   # fetch the GeoTIFFs into data/cache/lst/<site>/ (never committed)
    python scripts/earth_lst.py compute    # per-pixel statistics -> data/cache/lst/<site>_lst.tif and
                                           # per-window table -> data/processed/earth_lst_windows.csv
Credentials: environment variables EARTHDATA_USERNAME / EARTHDATA_PASSWORD, or ~/.netrc (machine urs.earthdata.nasa.gov).
They are never written to the repository. See docs/METHOD.md, "Earth temperature layer", for the exact rules.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import argparse
import json
import netrc
import os
import re
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd

from pen.config import CACHE, PROCESSED, candidates, load_config

API = "https://appeears.earthdatacloud.nasa.gov/api"
PRODUCT = "MOD11A2.061"
LAYERS = ["LST_Day_1km", "LST_Night_1km", "QC_Day", "QC_Night"]
YEAR = 2025
SCALE = 0.02                 # MOD11A2 scale factor (K per digital number)
MIN_COMPOSITES = 12          # of 46 eight-day composites per pixel and variable
MIN_VALID_FRACTION = 0.5     # share of a window's pixels that must be valid
LST_VALID_K = (150.0, 400.0)  # product valid range is 150 K upward; nothing on Earth's surface exceeds ~350 K
TILE_PAD_DEG = 0.02          # margin added around the 1x1 degree tile so edge windows keep their pixels
LST_DIR = CACHE / "lst"
OUT_CSV = PROCESSED / "earth_lst_windows.csv"
FILE_RE = re.compile(r"(?P<layer>LST_Day_1km|LST_Night_1km|QC_Day|QC_Night)_doy(?P<date>\d{7})")


# ----------------------------------------------------------------------------- pure logic (unit-tested)
def qc_ok(qc: np.ndarray) -> np.ndarray:
    """MOD11A2 QC rule: mandatory flag (bits 0-1) 00 = good, or 01 = other quality with LST error (bits 6-7) <= 2 K
    (00 = <=1 K, 01 = <=2 K). Cloud (10) and not-produced (11) are rejected."""
    qc = qc.astype(np.uint8)
    mandatory = qc & 0b11
    lst_error = (qc >> 6) & 0b11
    return (mandatory == 0) | ((mandatory == 1) & (lst_error <= 1))


def decode_lst(raw: np.ndarray) -> np.ndarray:
    """Kelvin with NaN for fill (0) and out-of-range values. AppEEARS may deliver scaled floats or raw digital numbers."""
    a = raw.astype(np.float32)
    a[a == 0] = np.nan
    finite = a[np.isfinite(a)]
    if finite.size and np.median(finite) > 1000:   # raw digital numbers (~7000-15000), not Kelvin
        a = a * SCALE
    a[(a < LST_VALID_K[0]) | (a > LST_VALID_K[1])] = np.nan
    return a


def pixel_stats(day, night, qc_day, qc_night, min_composites: int = MIN_COMPOSITES) -> dict:
    """Per-pixel annual statistics from stacks of shape (T, H, W): Kelvin LST (NaN = missing) and raw QC bytes.
    lst_min = P05 of valid night composites, lst_max = P95 of valid day composites, lst_mean = mean of all valid
    day and night composites, lst_range = max - min. A variable needs >= min_composites valid composites per pixel."""
    day = np.where(qc_ok(qc_day), day, np.nan).astype(np.float32)
    night = np.where(qc_ok(qc_night), night, np.nan).astype(np.float32)
    n_day = np.isfinite(day).sum(0)
    n_night = np.isfinite(night).sum(0)
    both = np.concatenate([day, night], axis=0)
    n_all = n_day + n_night
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)   # all-NaN pixels are expected and become NaN
        lst_min = np.nanpercentile(night, 5, axis=0)
        lst_max = np.nanpercentile(day, 95, axis=0)
        lst_mean = np.nanmean(both, axis=0)
    lst_min = np.where(n_night >= min_composites, lst_min, np.nan)
    lst_max = np.where(n_day >= min_composites, lst_max, np.nan)
    lst_mean = np.where(n_all >= min_composites, lst_mean, np.nan)
    return dict(lst_min_K=lst_min.astype(np.float32), lst_max_K=lst_max.astype(np.float32),
                lst_mean_K=lst_mean.astype(np.float32), lst_range_K=(lst_max - lst_min).astype(np.float32),
                n_valid=n_all.astype(np.float32))


def aggregate_windows(stats: dict, transform, windows, min_valid_fraction: float = MIN_VALID_FRACTION) -> pd.DataFrame:
    """Window means of the per-pixel statistics. `windows` is an iterable of (key, shapely polygon in the raster's CRS).
    Only 'complete' pixels (min, max and mean all valid) contribute, so range = max - min holds in every window.
    A window with fewer than min_valid_fraction of its pixels complete gets NaN metrics (never filled)."""
    from rasterio.features import geometry_mask
    complete = (np.isfinite(stats["lst_min_K"]) & np.isfinite(stats["lst_max_K"]) & np.isfinite(stats["lst_mean_K"]))
    rows = []
    for key, poly in windows:
        inside = geometry_mask([poly], out_shape=complete.shape, transform=transform, invert=True, all_touched=False)
        n_px = int(inside.sum())
        ok = inside & complete
        n_ok = int(ok.sum())
        rec = dict(key, n_pixels=n_px, n_pixels_valid=n_ok)
        good = n_px > 0 and n_ok / n_px >= min_valid_fraction
        for name in ["lst_min_K", "lst_max_K", "lst_range_K", "lst_mean_K", "n_valid"]:
            rec[name] = round(float(stats[name][ok].mean()), 2) if good else np.nan
        rows.append(rec)
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------- regions
def tile_bounds(file: str):
    """(west, south, east, north) of a Copernicus tile from its file name, e.g. ..._N65_00_W017_00_DEM.tif."""
    m = re.search(r"_([NS])(\d+)_00_([EW])(\d+)_00_DEM", file)
    if not m:
        raise ValueError(f"cannot parse tile name: {file}")
    lat = int(m.group(2)) * (1 if m.group(1) == "N" else -1)
    lon = int(m.group(4)) * (1 if m.group(3) == "E" else -1)
    return lon, lat, lon + 1, lat + 1


def task_payload(site: str, cfg_site: dict, year: int = YEAR) -> dict:
    w, s, e, n = tile_bounds(cfg_site["file"])
    w, s, e, n = w - TILE_PAD_DEG, s - TILE_PAD_DEG, e + TILE_PAD_DEG, n + TILE_PAD_DEG
    ring = [[w, s], [e, s], [e, n], [w, n], [w, s]]
    return {
        "task_type": "area",
        "task_name": f"pen_lst_{site}_{year}",
        "params": {
            "dates": [{"startDate": f"01-01-{year}", "endDate": f"12-31-{year}"}],
            "layers": [{"product": PRODUCT, "layer": l} for l in LAYERS],
            "geo": {"type": "FeatureCollection", "features": [
                {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}]},
            "output": {"format": {"type": "geotiff"}, "projection": "geographic"},   # EPSG:4326, matches windows.csv
        },
    }


# ----------------------------------------------------------------------------- AppEEARS API
def credentials():
    user, pwd = os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD")
    if user and pwd:
        return user, pwd
    try:
        auth = netrc.netrc().authenticators("urs.earthdata.nasa.gov")
    except (FileNotFoundError, netrc.NetrcParseError):
        auth = None
    if auth:
        return auth[0], auth[2]
    sys.exit("No Earthdata credentials: set EARTHDATA_USERNAME/EARTHDATA_PASSWORD or add urs.earthdata.nasa.gov to ~/.netrc")


def session():
    import requests
    r = requests.post(f"{API}/login", auth=credentials(), timeout=60)
    r.raise_for_status()
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


def load_tasks() -> dict:
    p = LST_DIR / "tasks.json"
    return json.loads(p.read_text()) if p.exists() else {}


def save_tasks(tasks: dict):
    LST_DIR.mkdir(parents=True, exist_ok=True)
    (LST_DIR / "tasks.json").write_text(json.dumps(tasks, indent=1))


def cmd_submit(args):
    cfg = load_config()
    sites = [s for s in candidates(cfg) if not args.sites or s in args.sites]
    if args.dry_run:
        for sid in sites:
            print(json.dumps(task_payload(sid, cfg["sites"][sid], args.year)))
        return
    tasks, s = load_tasks(), session()
    for sid in sites:
        if sid in tasks and not args.force:
            print(f"{sid}: already submitted ({tasks[sid]['task_id']}); use --force to resubmit")
            continue
        r = s.post(f"{API}/task", json=task_payload(sid, cfg["sites"][sid], args.year), timeout=120)
        r.raise_for_status()
        tasks[sid] = dict(task_id=r.json()["task_id"], year=args.year)
        save_tasks(tasks)
        print(f"{sid}: submitted {tasks[sid]['task_id']}")


def cmd_status(args):
    tasks, s = load_tasks(), session()
    for sid, t in tasks.items():
        r = s.get(f"{API}/task/{t['task_id']}", timeout=60)
        r.raise_for_status()
        t["status"] = r.json().get("status")
        print(f"{sid:36s} {t['status']}")
    save_tasks(tasks)


def cmd_download(args):
    tasks, s = load_tasks(), session()
    for sid, t in tasks.items():
        info = s.get(f"{API}/task/{t['task_id']}", timeout=60).json()
        if info.get("status") != "done":
            print(f"{sid}: not done ({info.get('status')}), skipped")
            continue
        files = [f for f in s.get(f"{API}/bundle/{t['task_id']}", timeout=60).json()["files"]
                 if f["file_name"].lower().endswith(".tif") and FILE_RE.search(f["file_name"])]
        out = LST_DIR / sid
        out.mkdir(parents=True, exist_ok=True)
        got = 0
        for f in files:
            dst = out / Path(f["file_name"]).name
            if dst.exists() and dst.stat().st_size == f.get("file_size"):
                continue
            with s.get(f"{API}/bundle/{t['task_id']}/{f['file_id']}", stream=True, timeout=300) as r:   # redirects to S3
                r.raise_for_status()
                with open(dst, "wb") as fh:
                    for chunk in r.iter_content(1 << 20):
                        fh.write(chunk)
            got += 1
        print(f"{sid}: {len(files)} GeoTIFFs ({got} new)")


# ----------------------------------------------------------------------------- compute
def load_stacks(folder: Path):
    """Read the four layers for every composite date that has all of them. Returns dict of (T,H,W) arrays + georeferencing."""
    import rasterio
    by_date = {}
    for f in sorted(folder.glob("*.tif")):
        m = FILE_RE.search(f.name)
        if m:
            by_date.setdefault(m["date"], {})[m["layer"]] = f
    dates = sorted(d for d, v in by_date.items() if len(v) == len(LAYERS))
    if not dates:
        return None
    stacks, ref = {l: [] for l in LAYERS}, None
    for d in dates:
        for l in LAYERS:
            with rasterio.open(by_date[d][l]) as src:
                ref = ref or dict(transform=src.transform, crs=src.crs)
                stacks[l].append(src.read(1))        # raw read: QC value 0 is a legitimate "good", not nodata
    return {l: np.stack(v) for l, v in stacks.items()}, ref, dates


def cmd_compute(args):
    import rasterio
    from shapely.geometry import Polygon
    cfg = load_config()
    win = pd.read_csv(PROCESSED / "windows.csv", usecols=["window_km", "site", "i", "j", "lon", "lat", "polygon"])
    win = win[win["window_km"] == cfg["main_window_km"]].drop_duplicates(["site", "i", "j"])
    out_rows = []
    for sid in candidates(cfg):
        folder = LST_DIR / sid
        loaded = load_stacks(folder) if folder.exists() else None
        if loaded is None:
            print(f"WARNING: no LST data for {sid}; its windows get no LST layer")
            continue
        st, ref, dates = loaded
        stats = pixel_stats(decode_lst(st["LST_Day_1km"]), decode_lst(st["LST_Night_1km"]), st["QC_Day"], st["QC_Night"])
        names = ["lst_min_K", "lst_max_K", "lst_mean_K", "lst_range_K", "n_valid"]
        h, w = stats["lst_min_K"].shape
        with rasterio.open(LST_DIR / f"{sid}_lst.tif", "w", driver="GTiff", height=h, width=w, count=len(names),
                           dtype="float32", crs=ref["crs"], transform=ref["transform"], nodata=np.nan) as dst:
            for b, n in enumerate(names, 1):
                dst.write(stats[n], b)
                dst.set_band_description(b, n)
        g = win[win["site"] == sid]
        polys = [(dict(site=r.site, i=int(r.i), j=int(r.j), lon=r.lon, lat=r.lat), Polygon(json.loads(r.polygon)))
                 for r in g.itertuples()]
        res = aggregate_windows(stats, ref["transform"], polys)
        out_rows.append(res)
        print(f"{sid:36s} composites {len(dates):2d}  windows {len(res):4d}  with LST {int(res['lst_range_K'].notna().sum()):4d}")
    if not out_rows:
        sys.exit("nothing to compute: run submit / download first")
    df = pd.concat(out_rows, ignore_index=True)
    cols = ["site", "i", "j", "lon", "lat", "lst_min_K", "lst_max_K", "lst_range_K", "lst_mean_K", "n_valid",
            "n_pixels_valid", "n_pixels"]
    df[cols].to_csv(OUT_CSV, index=False)
    summary = df.groupby("site").agg(windows=("i", "size"), with_lst=("lst_range_K", lambda x: int(x.notna().sum())),
                                     min_of_lst_min_K=("lst_min_K", "min"), median_lst_min_K=("lst_min_K", "median"),
                                     median_lst_max_K=("lst_max_K", "median"), max_of_lst_max_K=("lst_max_K", "max"),
                                     median_range_K=("lst_range_K", "median"), median_n_valid=("n_valid", "median")).round(1)
    pd.set_option("display.width", 220)
    print(summary.to_string())
    print(f"wrote {OUT_CSV}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("submit")
    p.add_argument("--sites", nargs="*")
    p.add_argument("--year", type=int, default=YEAR)
    p.add_argument("--dry-run", action="store_true", help="print the AppEEARS payloads, no network")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_submit)
    for name, fn in (("status", cmd_status), ("download", cmd_download), ("compute", cmd_compute)):
        sub.add_parser(name).set_defaults(fn=fn)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
