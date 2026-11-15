"""Earth surface mineralogy per window from NASA EMIT L2B (EMITL2BMIN V002). CONTEXT ONLY: it is not scored.

    python scripts/earth_emit.py search     # list the usable granules per region and the download size (no download)
    python scripts/earth_emit.py run        # per region: download -> orthorectify (GLT) -> per-window stats -> delete the .nc
    python scripts/earth_emit.py compute    # assemble data/processed/earth_emit_windows.csv (all 14 regions)

Granules: every EMITL2BMIN V002 granule of 2024-2025 with CMR cloud cover <= 20 % that touches the region's 1x1 degree
tile; if the region's mean window coverage stays below 80 %, 2023 granules (same filter) are added.
Needs netCDF4, earthaccess, rasterio and shapely (the conda-forge environment used for scripts/earth_lst_earthaccess.py).
Credentials: ~/.netrc (machine urs.earthdata.nasa.gov) or EARTHDATA_USERNAME / EARTHDATA_PASSWORD; never committed.
Rules (quality filter, EMIT-10 weights, unmapped V002 IDs, -1 weights) are documented in docs/METHOD.md.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import argparse
import json
import shutil
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd

from pen.config import CACHE, PROCESSED, candidates, load_config

SHORT_NAME, VERSION = "EMITL2BMIN", "002"
MAX_CLOUD = 20.0               # CMR CloudCover (%) of a usable granule
MIN_WINDOW_COVERAGE = 0.80     # mean coverage_frac of the region's windows below which 2023 granules are added
SIGMA = 2.0                    # detection kept if band_depth > SIGMA * band_depth_unc (our choice, see METHOD)
EMIT_DIR = CACHE / "emit"
OUT_CSV = PROCESSED / "earth_emit_windows.csv"
# Regions inside EMIT's 52N-52S coverage; the polar ones (Haughton, Axel Heiberg, Svalbard, University Valley, Askja) are not.
IN_COVERAGE = ["earth_pinacate", "earth_cuatrocienegas", "earth_mx_chichinautzin", "earth_mx_valle_santiago",
               "earth_mx_serdan_oriental", "earth_mx_ceboruco", "earth_sfvf", "earth_atacama_yungay",
               "earth_hawaii_mauna_kea"]
# Official grouping matrix, pinned to the commit that was checked against the V002 embedded mineral table.
MATRIX_URL = ("https://raw.githubusercontent.com/emit-sds/emit-sds-l2b/fba601868fe630f4e119b71175558ed39dbe49aa/"
              "data/mineral_grouping_matrix_20230503.csv")
EMIT10 = ["Calcite", "Chlorite", "Dolomite", "Goethite", "Gypsum", "Hematite", "Illite+Muscovite", "Kaolinite",
          "Montmorillonite", "Vermiculite"]
AGGREGATES = {
    "clays": ["Kaolinite", "Montmorillonite", "Illite+Muscovite", "Chlorite", "Vermiculite"],
    "carbonates": ["Calcite", "Dolomite"],
    "iron_oxides": ["Goethite", "Hematite"],
    "sulfates": ["Gypsum"],
}


def col(m: str) -> str:
    return "frac_" + m.lower().replace("+", "_")


FRACTION_COLS = ([col(m) for m in EMIT10] + [f"frac_{a}" for a in AGGREGATES] +
                 [f"frac_present_unweighted_{a}" for a in AGGREGATES] + ["frac_unmapped_g1", "frac_unmapped_g2", "frac_no_detection"])
OUT_COLS = (["site", "i", "j", "lon", "lat", "coverage_frac", "n_pixels_valid", "n_obs_valid", "n_granules", "granule_dates"]
            + FRACTION_COLS)


# ----------------------------------------------------------------------------- pure logic (unit-tested)
def weight_tables(matrix: pd.DataFrame, embedded: pd.DataFrame):
    """Lookup tables indexed by mineral ID (row 0 = no detection).
    W[id, k]       official EMIT-10 weight of mineral k (0 where empty or -1)
    UNKNOWN[id, a] True if any member mineral of aggregate a has weight -1 ("unknown but non-zero")
    MAPPED[id]     True if the ID has a row in the official matrix (V002 IDs 295-312 do not)
    GROUP[id]      spectral group (1 or 2) from the granule's embedded table.
    The embedded table must agree with the matrix on (index, record, group) for every mapped ID, otherwise we stop."""
    n = int(embedded["index"].max()) + 1
    W = np.zeros((n, len(EMIT10)), np.float32)
    UNKNOWN = np.zeros((n, len(AGGREGATES)), bool)
    MAPPED = np.zeros(n, bool)
    GROUP = np.zeros(n, np.int8)
    GROUP[embedded["index"].to_numpy()] = embedded["group"].to_numpy()
    mx = matrix.set_index("Index")
    emb = embedded.set_index("index")
    for idx in emb.index.intersection(mx.index):
        e, m = emb.loc[idx], mx.loc[idx]
        if int(e["record"]) != int(m["Record"]) or int(e["group"]) != int(m["Group"]):
            raise ValueError(f"mineral ID {idx}: embedded table and grouping matrix disagree; refusing to guess")
        MAPPED[idx] = True
        vals = pd.to_numeric(m[EMIT10], errors="coerce").fillna(0.0).to_numpy(np.float32)
        W[idx] = np.where(vals > 0, vals, 0.0)
        for a, (name, members) in enumerate(AGGREGATES.items()):
            UNKNOWN[idx, a] = any(vals[EMIT10.index(mm)] == -1 for mm in members)
    return W, UNKNOWN, MAPPED, GROUP


def classify(ids: np.ndarray, depth: np.ndarray, unc: np.ndarray, sigma: float = SIGMA):
    """Per-pixel detection for one spectral group: ID if the band depth exceeds sigma x its uncertainty, else 0.
    Returns (kept_id, valid) with valid = the pixel has data (ID != -9999)."""
    ids = np.asarray(ids).astype(np.int32)
    valid = ids != -9999
    with np.errstate(invalid="ignore"):
        ok = valid & (ids > 0) & np.isfinite(depth) & np.isfinite(unc) & (unc >= 0) & (depth > sigma * unc)
    return np.where(ok, ids, 0), valid


def pixel_layers(kept1, kept2, valid, tables) -> dict:
    """Per-pixel contributions (only meaningful where valid): EMIT-10 weights (max of the two groups, so the same
    mineral is not counted twice), aggregates (sum of members, capped at 1), -1 presence, unmapped IDs, no detection."""
    W, UNKNOWN, MAPPED, GROUP = tables
    k1 = np.where(MAPPED[kept1], kept1, 0)
    k2 = np.where(MAPPED[kept2], kept2, 0)
    w = np.maximum(W[k1], W[k2])                                     # (..., 10)
    out = {col(m): w[..., i] for i, m in enumerate(EMIT10)}
    for a, (name, members) in enumerate(AGGREGATES.items()):
        idx = [EMIT10.index(m) for m in members]
        out[f"frac_{name}"] = np.minimum(w[..., idx].sum(-1), 1.0)
        out[f"frac_present_unweighted_{name}"] = (UNKNOWN[k1, a] | UNKNOWN[k2, a]).astype(np.float32)
    un = lambda k: (k > 0) & ~MAPPED[k]
    for g in (1, 2):
        out[f"frac_unmapped_g{g}"] = ((un(kept1) & (GROUP[kept1] == g)) | (un(kept2) & (GROUP[kept2] == g))).astype(np.float32)
    out["frac_no_detection"] = ((kept1 == 0) & (kept2 == 0)).astype(np.float32)
    return {k: np.where(valid, v, 0.0).astype(np.float32) for k, v in out.items()}


class RegionGrid:
    """Accumulators on a fixed geographic grid over one region. Each granule adds at most ONE observation per cell: its
    ortho pixels falling in a cell are first averaged, so every granule counts equally."""

    def __init__(self, west: float, north: float, step: float, shape):
        from affine import Affine
        self.west, self.north, self.step, self.shape = west, north, step, shape
        self.transform = Affine(step, 0, west, 0, -step, north)
        self.acc = {k: np.zeros(shape, np.float64) for k in FRACTION_COLS}
        self.n_obs = np.zeros(shape, np.int32)
        self.gbits = np.zeros(shape, np.uint64)
        self.dates = []

    def add(self, px: dict, valid: np.ndarray, lon: np.ndarray, lat: np.ndarray, date: str):
        """px/valid: per-pixel layers of one granule; lon/lat: pixel-centre coordinates (same shape)."""
        bit = len(self.dates)
        if bit >= 64:
            raise ValueError("more than 64 granules in one region")
        self.dates.append(date)
        H, W_ = self.shape
        c = np.floor((lon[valid] - self.west) / self.step).astype(np.int64)
        r = np.floor((self.north - lat[valid]) / self.step).astype(np.int64)
        inb = (c >= 0) & (c < W_) & (r >= 0) & (r < H)
        flat = (r * W_ + c)[inb]
        cnt = np.bincount(flat, minlength=H * W_).reshape(self.shape)
        seen = cnt > 0
        for k in FRACTION_COLS:
            s = np.bincount(flat, weights=px[k][valid][inb], minlength=H * W_).reshape(self.shape)
            self.acc[k][seen] += s[seen] / cnt[seen]
        self.n_obs += seen
        self.gbits[seen] |= np.uint64(1 << bit)


def window_stats(grid: RegionGrid, windows) -> pd.DataFrame:
    """Window values: fractions = sum over the window's cells of per-observation contributions / number of valid
    observations (n_obs_valid); n_pixels_valid = cells with >= 1 valid observation; coverage_frac = their share of the window."""
    from affine import Affine
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds
    H, W_ = grid.shape
    rows = []
    for key, poly in windows:
        win = from_bounds(*poly.bounds, transform=grid.transform)
        r0, c0 = max(int(np.floor(win.row_off)), 0), max(int(np.floor(win.col_off)), 0)
        r1, c1 = min(int(np.ceil(win.row_off + win.height)) + 1, H), min(int(np.ceil(win.col_off + win.width)) + 1, W_)
        rec = dict(key)
        inside = (geometry_mask([poly], out_shape=(r1 - r0, c1 - c0), transform=grid.transform @ Affine.translation(c0, r0),
                                invert=True) if (r1 > r0 and c1 > c0) else np.zeros((0, 0), bool))
        n_cells = int(inside.sum())
        obs = grid.n_obs[r0:r1, c0:c1][inside] if n_cells else np.zeros(0, np.int32)
        n = int(obs.sum())
        rec["coverage_frac"] = round(float((obs > 0).mean()), 4) if n_cells else 0.0
        rec["n_pixels_valid"] = int((obs > 0).sum())
        rec["n_obs_valid"] = n
        bits = int(np.bitwise_or.reduce(grid.gbits[r0:r1, c0:c1][inside])) if n_cells else 0
        used = [d for b, d in enumerate(grid.dates) if bits >> b & 1]
        rec["n_granules"] = len(used)
        rec["granule_dates"] = ";".join(sorted(set(used)))
        for k in FRACTION_COLS:
            rec[k] = round(float(grid.acc[k][r0:r1, c0:c1][inside].sum() / n), 4) if n > 0 else np.nan
        rows.append(rec)
    return pd.DataFrame(rows)


def empty_rows(keys) -> pd.DataFrame:
    df = pd.DataFrame(keys)
    df["coverage_frac"], df["n_pixels_valid"], df["n_obs_valid"], df["n_granules"], df["granule_dates"] = 0.0, 0, 0, 0, ""
    for k in FRACTION_COLS:
        df[k] = np.nan
    return df


# ----------------------------------------------------------------------------- granules
def tile_bounds(file: str):
    import re
    m = re.search(r"_([NS])(\d+)_00_([EW])(\d+)_00_DEM", file)
    lat = int(m.group(2)) * (1 if m.group(1) == "N" else -1)
    lon = int(m.group(4)) * (1 if m.group(3) == "E" else -1)
    return lon, lat, lon + 1, lat + 1


def granule_polygon(g):
    from shapely.geometry import Polygon
    pts = g["umm"]["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"]["GPolygons"][0]["Boundary"]["Points"]
    return Polygon([(p["Longitude"], p["Latitude"]) for p in pts])


def cloud(g) -> float:
    return float(g["umm"].get("CloudCover", 100.0))


def size_mb(g) -> float:
    return float(g.size() if callable(g.size) else g.size)


def usable(granules, tile, max_cloud=MAX_CLOUD):
    """Granules with cloud cover <= max_cloud whose footprint intersects the tile, oldest first."""
    keep = [g for g in granules if cloud(g) <= max_cloud and granule_polygon(g).intersects(tile)]
    return sorted(keep, key=lambda g: g["meta"]["native-id"])


def find(tile, years):
    import earthaccess
    return usable(earthaccess.search_data(short_name=SHORT_NAME, version=VERSION, bounding_box=tile.bounds,
                                          temporal=(f"{years[0]}-01-01", f"{years[1]}-12-31")), tile)


def load_matrix() -> pd.DataFrame:
    p = EMIT_DIR / "mineral_grouping_matrix_20230503.csv"
    if not p.exists():
        EMIT_DIR.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MATRIX_URL, p)
    return pd.read_csv(p)


def read_granule(folder: Path, gid: str):
    """Orthorectify one granule with its own GLT (1-based indices, 0 = no data)."""
    import netCDF4
    fm = netCDF4.Dataset(folder / f"{gid}.nc")
    fu = netCDF4.Dataset(folder / f"{gid.replace('_MIN_', '_MINUNCERT_')}.nc")
    md = fm.groups["mineral_metadata"]
    embedded = pd.DataFrame({k: np.asarray(md.variables[k][:]) for k in ["index", "record", "group"]}).astype(int)
    loc = fm.groups["location"]
    gx, gy = np.asarray(loc.variables["glt_x"][:]), np.asarray(loc.variables["glt_y"][:])
    ok = (gx > 0) & (gy > 0)
    rr, cc = gy[ok] - 1, gx[ok] - 1

    def ortho(ds, name, fill):
        raw = np.ma.filled(ds.variables[name][:], fill)
        out = np.full(gx.shape, fill, raw.dtype)
        out[ok] = raw[rr, cc]
        return out
    lay = {}
    for g in (1, 2):
        lay[f"id{g}"] = ortho(fm, f"group_{g}_mineral_id", -9999)
        lay[f"bd{g}"] = ortho(fm, f"group_{g}_band_depth", np.nan).astype(np.float32)
        lay[f"unc{g}"] = ortho(fu, f"group_{g}_band_depth_unc", np.nan).astype(np.float32)
    gt = [float(v) for v in fm.getncattr("geotransform")]
    fm.close()
    fu.close()
    return lay, gt, embedded


# ----------------------------------------------------------------------------- commands
def cmd_search(args):
    import earthaccess
    from shapely.geometry import box
    earthaccess.login(strategy="netrc")
    cfg, tot = load_config(), 0.0
    for sid in args.sites:
        tile = box(*tile_bounds(cfg["sites"][sid]["file"]))
        g, g3 = find(tile, (2024, 2025)), find(tile, (2023, 2023))
        gb, gb3 = sum(map(size_mb, g)) / 1024, sum(map(size_mb, g3)) / 1024
        tot += gb
        print(f"{sid:28s} 2024-25: {len(g):3d} granules {gb:5.2f} GB | 2023 pool: {len(g3):3d} granules {gb3:5.2f} GB")
    print(f"2024-25 total {tot:.2f} GB (plus 2023 only where window coverage < {MIN_WINDOW_COVERAGE:.0%})")


def process(grid, granules, folder, matrix):
    import earthaccess
    folder.mkdir(parents=True, exist_ok=True)
    earthaccess.download(granules, str(folder))
    for g in granules:
        gid = g["meta"]["native-id"]
        lay, gt, embedded = read_granule(folder, gid)
        tables = weight_tables(matrix, embedded)
        k1, v1 = classify(lay["id1"], lay["bd1"], lay["unc1"])
        k2, v2 = classify(lay["id2"], lay["bd2"], lay["unc2"])
        valid = v1 & v2
        px = pixel_layers(k1, k2, valid, tables)
        ys, xs = np.indices(valid.shape)
        lon, lat = gt[0] + (xs + 0.5) * gt[1], gt[3] + (ys + 0.5) * gt[5]
        grid.add(px, valid, lon, lat, gid.split("_")[-1][:8])
    for f in folder.glob("*.nc"):          # free the disk before the next region
        f.unlink()


def cmd_run(args):
    import earthaccess
    from shapely.geometry import Polygon, box
    earthaccess.login(strategy="netrc")
    cfg, matrix = load_config(), load_matrix()
    win = pd.read_csv(PROCESSED / "windows.csv", usecols=["window_km", "site", "i", "j", "lon", "lat", "polygon"])
    win = win[win["window_km"] == cfg["main_window_km"]].drop_duplicates(["site", "i", "j"])
    log_p = EMIT_DIR / "run_log.json"
    log = json.loads(log_p.read_text()) if log_p.exists() else {}
    for sid in args.sites:
        w, s, e, n = tile_bounds(cfg["sites"][sid]["file"])
        tile = box(w, s, e, n)
        g = win[win["site"] == sid]
        polys = [(dict(site=r.site, i=int(r.i), j=int(r.j), lon=r.lon, lat=r.lat), Polygon(json.loads(r.polygon)))
                 for r in g.itertuples()]
        step = 5.42232520e-04                 # EMIT L2B ortho pixel size in degrees (~60 m)
        size = int(np.ceil(1 / step))
        grid = RegionGrid(w, n, step, (size, size))
        folder = EMIT_DIR / sid
        g24 = find(tile, (2024, 2025))
        process(grid, g24, folder, matrix)
        df = window_stats(grid, polys)
        used, fallback = list(g24), False
        if df["coverage_frac"].mean() < MIN_WINDOW_COVERAGE:
            g23 = find(tile, (2023, 2023))
            if g23:
                process(grid, g23, folder, matrix)
                df = window_stats(grid, polys)
                used += g23
                fallback = True
        shutil.rmtree(folder, ignore_errors=True)
        df[OUT_COLS].to_csv(EMIT_DIR / f"windows_{sid}.csv", index=False)
        log[sid] = dict(n_granules=len(used), gb=round(sum(map(size_mb, used)) / 1024, 3), fallback_2023=fallback,
                        mean_window_coverage=round(float(df["coverage_frac"].mean()), 3),
                        granules=[x["meta"]["native-id"] for x in used])
        log_p.write_text(json.dumps(log, indent=1))
        print(f"{sid:28s} {len(used):3d} granules {log[sid]['gb']:.2f} GB  mean window coverage {log[sid]['mean_window_coverage']:.0%}"
              f"{' (2023 fallback)' if fallback else ''}", flush=True)


def cmd_compute(args):
    cfg = load_config()
    win = pd.read_csv(PROCESSED / "windows.csv", usecols=["window_km", "site", "i", "j", "lon", "lat"])
    win = win[win["window_km"] == cfg["main_window_km"]].drop_duplicates(["site", "i", "j"])
    frames = []
    for sid in candidates(cfg):
        part = EMIT_DIR / f"windows_{sid}.csv"
        if part.exists():
            frames.append(pd.read_csv(part, keep_default_na=True).fillna({"granule_dates": ""}))
        else:
            g = win[win["site"] == sid]
            frames.append(empty_rows([dict(site=r.site, i=int(r.i), j=int(r.j), lon=r.lon, lat=r.lat) for r in g.itertuples()]))
            print(f"{sid:36s} no EMIT data: windows set to NaN, coverage 0")
    out = pd.concat(frames, ignore_index=True)[OUT_COLS]
    out.to_csv(OUT_CSV, index=False)
    print(f"wrote {OUT_CSV} ({len(out)} windows)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("search", cmd_search), ("run", cmd_run)):
        p = sub.add_parser(name)
        p.add_argument("--sites", nargs="*", default=IN_COVERAGE)
        p.set_defaults(fn=fn)
    sub.add_parser("compute").set_defaults(fn=cmd_compute)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
