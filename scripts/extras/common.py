"""Shared helpers for the extras (twin timelapse, campaign calendar, astronaut view, rover twin).

The extras only READ the pipeline's outputs (data/processed/windows.csv, thumbs/ref_windows.json) and its grids.
Grids come from data/cache/<site>_z.npy when run_pipeline.py has been run; otherwise they are rebuilt here with
pen.grid.to_metric (same 30 m grid) and cached, so nothing in pen/ or the pipeline changes.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import numpy as np
import pandas as pd
from pen.config import load_config, RAW, PROCESSED, CACHE, FIGURES, RADIUS_M, references
from pen.grid import to_metric
from pen.shadows import shadow_fraction_maps

cfg = load_config()
RES = cfg["resolution_m"]
W = int(cfg["main_window_km"] * 1000 / RES)            # 6 km window = 200 px
OUT_FIG = FIGURES / "extras"
OUT_BRIEF = PROCESSED / "briefs"
OUT_FIG.mkdir(parents=True, exist_ok=True)
OUT_BRIEF.mkdir(parents=True, exist_ok=True)

_win = None


def windows():
    global _win
    if _win is None:
        _win = pd.read_csv(PROCESSED / "windows.csv")
    return _win


def ref_windows():
    return json.load(open(PROCESSED / "thumbs" / "ref_windows.json"))


def label(site):
    return cfg["sites"][site]["label"]


def short(site):
    return label(site).split("·", 1)[-1].split("(")[0].split(",")[0].strip()


def body(site):
    return cfg["sites"][site]["body"]


def lunar_refs():
    return [r for r in references(cfg) if body(r) == "moon"]


def grid(site):
    """30 m elevation grid of a site: from the pipeline cache, or rebuilt (and cached) if missing."""
    p = CACHE / f"{site}_z.npy"
    if p.exists():
        return np.load(p)
    s = cfg["sites"][site]
    f = RAW / s["file"]
    if not f.exists():
        raise FileNotFoundError(f"{f.name} missing: run  python scripts/download_data.py {site}")
    z = to_metric(f, s["body"], RES).z
    CACHE.mkdir(parents=True, exist_ok=True)
    np.save(p, z)
    return z


def shadow2(site, z=None):
    """Per-pixel shadow fraction with the Sun at 2° over 8 azimuths (pipeline cache or recomputed)."""
    p = CACHE / f"{site}_shadow_e2.npy"
    if p.exists():
        return np.load(p)
    z = grid(site) if z is None else z
    m = shadow_fraction_maps(z, (2,), tuple(range(0, 360, 45)), RES)[2]
    np.save(p, m)
    return m


def best_pairs():
    """Best Earth window (combined score) for every reference that has data."""
    w = windows()
    out = {}
    for ref, g in w.groupby("reference"):
        t = g.sort_values("score_combined", ascending=False).iloc[0]
        out[ref] = dict(site=t.site, i=int(t.i), j=int(t.j), lat=float(t.lat), lon=float(t.lon),
                        score=float(t.score_combined), terrain=float(t.score_terrain),
                        illumination=float(t.score_illumination))
    return out


def crop(z, i, j, pad=0):
    """Window of W×W pixels at (i, j), with `pad` extra pixels each side (clipped to the grid)."""
    i0, j0 = max(i - pad, 0), max(j - pad, 0)
    sub = z[i0:i + W + pad, j0:j + W + pad]
    return sub, (i - i0, j - j0)


def ref_grid_and_window(ref):
    rw = ref_windows()
    if ref not in rw:
        raise KeyError(f"{ref} not in thumbs/ref_windows.json: run scripts/make_thumbnails.py")
    i, j = rw[ref]
    return grid(ref), int(i), int(j)


# ---------------------------------------------------------------- Sun position on Earth (NOAA algorithm)
def solar_position(lat, lon, t_utc):
    """Solar elevation and azimuth (deg, azimuth clockwise from north) for numpy datetime64 UTC times.
    NOAA General Solar Position calculations (accuracy ~0.01°/≈1 min), no refraction."""
    t = np.asarray(t_utc, dtype="datetime64[s]")
    jd = t.astype("int64") / 86400.0 + 2440587.5
    jc = (jd - 2451545.0) / 36525.0
    L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    Mr = np.radians(M)
    C = np.sin(Mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + np.sin(2 * Mr) * (0.019993 - 0.000101 * jc) \
        + np.sin(3 * Mr) * 0.000289
    true_long = L0 + C
    omega = 125.04 - 1934.136 * jc
    app_long = true_long - 0.00569 - 0.00478 * np.sin(np.radians(omega))
    eps0 = 23 + (26 + ((21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813)))) / 60) / 60
    eps = eps0 + 0.00256 * np.cos(np.radians(omega))
    decl = np.degrees(np.arcsin(np.sin(np.radians(eps)) * np.sin(np.radians(app_long))))
    y = np.tan(np.radians(eps / 2)) ** 2
    L0r = np.radians(L0)
    eqt = 4 * np.degrees(y * np.sin(2 * L0r) - 2 * e * np.sin(Mr) + 4 * e * y * np.sin(Mr) * np.cos(2 * L0r)
                         - 0.5 * y * y * np.sin(4 * L0r) - 1.25 * e * e * np.sin(2 * Mr))
    minutes = (t.astype("int64") % 86400) / 60.0
    tst = (minutes + eqt + 4 * lon) % 1440
    ha = np.where(tst / 4 < 0, tst / 4 + 180, tst / 4 - 180)
    latr, dr, har = np.radians(lat), np.radians(decl), np.radians(ha)
    cosz = np.clip(np.sin(latr) * np.sin(dr) + np.cos(latr) * np.cos(dr) * np.cos(har), -1, 1)
    zen = np.degrees(np.arccos(cosz))
    elev = 90 - zen
    with np.errstate(invalid="ignore", divide="ignore"):
        az = np.degrees(np.arctan2(np.sin(har), np.cos(har) * np.sin(latr) - np.tan(dr) * np.cos(latr))) + 180
    return elev, az % 360


def low_sun_azimuth_reachable(lat, az, elev=2.0):
    """Can the Sun stand at (az, elev≈2°) at this Earth latitude on some day of the year?"""
    dec = np.radians(np.linspace(-23.44, 23.44, 181))
    H = np.radians(np.linspace(-180, 180, 1441))
    latr = math.radians(lat)
    D, HH = np.meshgrid(dec, H)
    el = np.degrees(np.arcsin(np.sin(latr) * np.sin(D) + np.cos(latr) * np.cos(D) * np.cos(HH)))
    a = (np.degrees(np.arctan2(np.sin(HH), np.cos(HH) * math.sin(latr) - np.tan(D) * math.cos(latr))) + 180) % 360
    near = np.abs(el - elev) < 0.5
    d = np.abs(((a[near] - az) + 180) % 360 - 180)
    return bool(near.any() and d.min() <= 3.0)
