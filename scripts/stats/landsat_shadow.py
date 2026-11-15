"""Earth check of the cast-shadow code against a real Landsat scene (D7).

What this validates: that pen.shadows.cast_shadow, run on the Copernicus DEM with the real Sun geometry of a Landsat
scene, reproduces the shadows seen in that scene. It does NOT validate the grazing lunar-polar Sun: Landsat 8/9 pass in
mid-morning, so over Mauna Kea the Sun is never below ~40° in clear scenes. We therefore use a high-Arctic region of our
own pool (Axel Heiberg Island) where a spring scene has the Sun at ~14°, and keep Mauna Kea as a negative control
(model only: at its scene geometry the model predicts almost no shadow, so there is nothing to compare).

Data (no credentials): Landsat Collection 2 Level-2 surface reflectance from Microsoft Planetary Computer (anonymous
SAS token), read by window (only the region tile), and the Copernicus GLO-30 tile already in data/raw/.
Steps
  1. Sun at the tile centre and scene time (NOAA solar-position algorithm), checked against the MTL value at the scene
     centre; the model uses the tile-centre value (the scene spans ~15° of longitude at 80° N).
  2. DEM -> pen.grid.to_metric (30 m, north-up local grid); Landsat bands warped onto the same grid.
  3. Model mask: pen.shadows.cast_shadow(z, elevation, azimuth) (includes self-shadow). pen/ is only imported.
  4. Observed shadow: snow-covered pixels (NDSI > 0.4; NDSI is a ratio, so it stays high in shadow) whose NIR surface
     reflectance is below a threshold. Rock, ice-free ground, water, clouds and fill are excluded (QA_PIXEL, DEM).
  5. The threshold is tuned on the WEST half of the tile only (max Cohen's kappa) and the metrics are reported on the
     EAST half. Null: the same procedure with the Sun azimuth rotated by 90°, 180° and 270°.
Writes data/processed/stats/landsat_shadow.json.  Run: python scripts/stats/landsat_shadow.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import datetime as dt, math, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import requests
import rasterio
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.windows import from_bounds
from scipy.stats import spearmanr
from common import SEED, meta, write
from pen.config import RAW, load_config  # noqa: E402
from pen.grid import to_metric  # noqa: E402
from pen.shadows import cast_shadow  # noqa: E402

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2"
SCENE = "LC08_L2SP_059002_20220402_02_T1"          # Axel Heiberg, 2 Apr 2022, Sun 14.0° (MTL), cloud 0.08 %
REGION = "earth_axel_heiberg"
CONTROL = dict(scene="LC09_L2SP_062046_20221227_02_T1", region="earth_hawaii_mauna_kea")  # Sun 40.5° (MTL)
SR_SCALE, SR_OFFSET = 2.75e-05, -0.2                # Collection 2 Level-2 surface reflectance
NDSI_SNOW = 0.4
WIN_PX, STEP_PX = 200, 100                         # 6 km windows with a 3 km step, as the pipeline
QA_BAD = (0, 1, 2, 3, 7)                            # fill, dilated cloud, cirrus, cloud, water


# ---------------------------------------------------------------- Sun position (NOAA solar calculator equations)
def solar_position(lat, lon, when):
    """Geometric Sun elevation and azimuth (degrees; azimuth clockwise from true north) at lat/lon and UTC time."""
    jd = when.timestamp() / 86400.0 + 2440587.5
    t = (jd - 2451545.0) / 36525.0
    L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
    M = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    Mr = math.radians(M)
    C = (math.sin(Mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) + math.sin(2 * Mr) * (0.019993 - 0.000101 * t)
         + math.sin(3 * Mr) * 0.000289)
    om = 125.04 - 1934.136 * t
    lam = L0 + C - 0.00569 - 0.00478 * math.sin(math.radians(om))
    eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    eps = math.radians(eps0 + 0.00256 * math.cos(math.radians(om)))
    dec = math.asin(math.sin(eps) * math.sin(math.radians(lam)))
    y = math.tan(eps / 2) ** 2
    L0r = math.radians(L0)
    eot = 4 * math.degrees(y * math.sin(2 * L0r) - 2 * e * math.sin(Mr) + 4 * e * y * math.sin(Mr) * math.cos(2 * L0r)
                           - 0.5 * y * y * math.sin(4 * L0r) - 1.25 * e * e * math.sin(2 * Mr))
    minutes = when.hour * 60 + when.minute + when.second / 60 + when.microsecond / 6e7
    ha = math.radians((minutes + eot + 4 * lon) / 4 - 180)
    la = math.radians(lat)
    cz = math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha)
    zen = math.acos(max(-1.0, min(1.0, cz)))
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(dec) * math.cos(la))) + 180
    return 90 - math.degrees(zen), az % 360


# ---------------------------------------------------------------- data access
def scene(item_id):
    token = requests.get(SAS, timeout=60).json()["token"]
    item = requests.get(STAC + item_id, timeout=60).json()
    href = {k: f"{a['href']}?{token}" for k, a in item["assets"].items()}
    mtl = requests.get(href["mtl.txt"], timeout=60).text
    val = lambda k: re.search(rf"^\s*{k} = \"?([^\"\n]+)\"?", mtl, re.M).group(1)
    corners = [(float(val(f"CORNER_{c}_LAT_PRODUCT")), float(val(f"CORNER_{c}_LON_PRODUCT"))) for c in ("UL", "UR", "LR", "LL")]
    when = dt.datetime.fromisoformat(f"{val('DATE_ACQUIRED')}T{val('SCENE_CENTER_TIME').rstrip('Z')[:15]}+00:00")
    return dict(id=item_id, href=href, when=when, corners=corners, sun_elev_mtl=float(val("SUN_ELEVATION")),
                sun_az_mtl=float(val("SUN_AZIMUTH")) % 360, cloud=float(val("CLOUD_COVER")))


def read_onto(href, grid, resampling, dtype=np.float32):
    """Read only the part of a COG that covers the grid, and warp it onto the grid."""
    h, w = grid.z.shape
    left, top = grid.transform * (0, 0)
    right, bottom = grid.transform * (w, h)
    with rasterio.open(href) as src:
        b = transform_bounds(grid.crs, src.crs, left, bottom, right, top, densify_pts=21)
        pad = 10 * src.res[0]
        win = from_bounds(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad, src.transform).round_offsets().round_lengths()
        a = src.read(1, window=win, boundless=True, fill_value=0)
        out = np.zeros((h, w), dtype)
        reproject(a, out, src_transform=src.window_transform(win), src_crs=src.crs, dst_transform=grid.transform,
                  dst_crs=grid.crs, resampling=resampling, src_nodata=0, dst_nodata=0)
    return out


# ---------------------------------------------------------------- metrics
def confusion(model, obs):
    tp = float((model & obs).sum()); fp = float((model & ~obs).sum()); fn = float((~model & obs).sum()); tn = float((~model & ~obs).sum())
    n = tp + fp + fn + tn
    po = (tp + tn) / n if n else float("nan")
    pe = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / n ** 2 if n else float("nan")
    return dict(n=int(n), agreement=po, iou=tp / (tp + fp + fn) if tp + fp + fn else float("nan"),
                kappa=(po - pe) / (1 - pe) if n and pe < 1 else float("nan"),
                precision=tp / (tp + fp) if tp + fp else float("nan"), recall=tp / (tp + fn) if tp + fn else float("nan"),
                model_shadow_frac=(tp + fp) / n if n else float("nan"), observed_shadow_frac=(tp + fn) / n if n else float("nan"))


def tune_threshold(nir, model, mask):
    """Threshold on NIR reflectance that maximises Cohen's kappa between model and observed shadow, on `mask` only."""
    cand = np.unique(np.percentile(nir[mask], np.arange(1, 100)))
    best = max(cand, key=lambda t: np.nan_to_num(confusion(model[mask], nir[mask] < t)["kappa"], nan=-1))
    return float(best)


def window_fractions(model, obs, mask, cols):
    """Shadow fraction per 6 km window (model vs observed), windows fully inside `cols` with >= 50 % evaluable pixels."""
    H, W = mask.shape
    fm, fo = [], []
    for i in range(0, H - WIN_PX + 1, STEP_PX):
        for j in range(cols.start, cols.stop - WIN_PX + 1, STEP_PX):
            m = mask[i:i + WIN_PX, j:j + WIN_PX]
            if m.mean() < 0.5:
                continue
            fm.append(model[i:i + WIN_PX, j:j + WIN_PX][m].mean()); fo.append(obs[i:i + WIN_PX, j:j + WIN_PX][m].mean())
    return np.array(fm), np.array(fo)


def evaluate(z, nir, mask, elev, az):
    """Tune on the west half, evaluate on the east half. Returns metrics and the threshold."""
    model = cast_shadow(z, elev, az, 30.0)
    W = z.shape[1]
    west = np.zeros_like(mask); west[:, : W // 2] = True
    east = np.zeros_like(mask); east[:, W // 2:] = True
    thr = tune_threshold(nir, model, mask & west)
    obs = nir < thr
    out = confusion(model[mask & east], obs[mask & east])
    fm, fo = window_fractions(model, obs, mask, slice(W // 2, W))
    rho = spearmanr(fm, fo).statistic if len(fm) > 2 else float("nan")
    return dict(out, nir_threshold=thr, windows=int(len(fm)), window_spearman=float(rho)), model, obs


def main():
    cfg = load_config()
    s = scene(SCENE)
    lats = [c[0] for c in s["corners"]]; lons = [c[1] for c in s["corners"]]
    e_c, a_c = solar_position(float(np.mean(lats)), float(np.mean(lons)), s["when"])
    dem = RAW / cfg["sites"][REGION]["file"]
    g = to_metric(dem, "earth", 30.0)
    e_t, a_t = solar_position(g.lat0, g.lon0, s["when"])
    print(f"Sun MTL {s['sun_elev_mtl']:.2f}/{s['sun_az_mtl']:.2f}; NOAA at scene centre {e_c:.2f}/{a_c:.2f}; at tile centre {e_t:.2f}/{a_t:.2f}")

    green = read_onto(s["href"]["green"], g, Resampling.average) * SR_SCALE + SR_OFFSET
    swir = read_onto(s["href"]["swir16"], g, Resampling.average) * SR_SCALE + SR_OFFSET
    nir = read_onto(s["href"]["nir08"], g, Resampling.average) * SR_SCALE + SR_OFFSET
    qa = read_onto(s["href"]["qa_pixel"], g, Resampling.nearest, np.uint16)
    filled = (qa > 0) & np.isfinite(g.z)
    bad = np.zeros_like(filled)
    for b in QA_BAD:
        bad |= (qa >> b) & 1 == 1
    ndsi = (green - swir) / np.where(np.abs(green + swir) < 1e-6, np.nan, green + swir)
    mask = filled & ~bad & (ndsi > NDSI_SNOW)
    print(f"grid {g.z.shape}; valid {filled.mean():.3f}; snow-covered & clear {mask.mean():.3f}; QA cloud-shadow flags {(((qa >> 4) & 1) == 1)[filled].mean():.4f}")

    main_res, model, obs = evaluate(g.z, nir, mask, e_t, a_t)
    nulls = {f"azimuth_plus_{d}": evaluate(g.z, nir, mask, e_t, (a_t + d) % 360)[0] for d in (90, 180, 270)}
    sens = {"mtl_scene_centre_angles": evaluate(g.z, nir, mask, s["sun_elev_mtl"], s["sun_az_mtl"])[0],
            "elevation_minus_2": evaluate(g.z, nir, mask, e_t - 2, a_t)[0],
            "elevation_plus_2": evaluate(g.z, nir, mask, e_t + 2, a_t)[0]}
    for k, v in [("model", main_res)] + list(nulls.items()):
        print(f"  {k:20s} IoU {v['iou']:.3f}  kappa {v['kappa']:.3f}  agreement {v['agreement']:.3f}  window ρ {v['window_spearman']:.2f} ({v['windows']} windows)")

    # negative control: Mauna Kea at its own scene geometry (model only)
    c = scene(CONTROL["scene"])
    gm = to_metric(RAW / cfg["sites"][CONTROL["region"]]["file"], "earth", 30.0)
    em, am = solar_position(gm.lat0, gm.lon0, c["when"])
    mk_frac = float(cast_shadow(gm.z, em, am, 30.0)[np.isfinite(gm.z)].mean())
    print(f"Mauna Kea control: Sun {em:.2f}/{am:.2f} (MTL {c['sun_elev_mtl']:.2f}/{c['sun_az_mtl']:.2f}); model shadow fraction {mk_frac:.5f}")

    r = lambda d: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}
    out = {"_stub": False,
           "_meta": meta(SEED, {"scene": SCENE, "region": REGION, "product": "Landsat Collection 2 Level-2 surface reflectance (Planetary Computer)",
                                "snow_ndsi_min": NDSI_SNOW, "qa_excluded_bits": list(QA_BAD), "window_px": WIN_PX, "step_px": STEP_PX,
                                "split": "threshold tuned on the west half (max kappa), metrics on the east half",
                                "scope": "validates the cast-shadow code with a real scene's Sun geometry; not the lunar grazing-Sun regime"},
                         [dem]),
           "scene": {"id": SCENE, "datetime_utc": s["when"].isoformat(), "cloud_cover": s["cloud"],
                     "sun_mtl_scene_centre": {"elevation": s["sun_elev_mtl"], "azimuth": round(s["sun_az_mtl"], 4)},
                     "sun_noaa_scene_centre": {"elevation": round(e_c, 4), "azimuth": round(a_c, 4)},
                     "sun_used_tile_centre": {"elevation": round(e_t, 4), "azimuth": round(a_t, 4)}},
           "coverage": {"grid_shape": list(g.z.shape), "valid_frac": round(float(filled.mean()), 4), "evaluated_frac": round(float(mask.mean()), 4)},
           "model": r(main_res), "null": {k: r(v) for k, v in nulls.items()},
           "sensitivity": {k: r(v) for k, v in sens.items()},
           "control_mauna_kea": {"scene": CONTROL["scene"], "sun_used": {"elevation": round(em, 4), "azimuth": round(am, 4)},
                                 "sun_mtl": {"elevation": c["sun_elev_mtl"], "azimuth": round(c["sun_az_mtl"], 4)},
                                 "model_shadow_frac": round(mk_frac, 6)}}
    print("→", write("landsat_shadow", out))


if __name__ == "__main__":
    main()
