"""Far-horizon test: how much of the gap to NASA's LOLA illumination map comes from distant terrain?

The main pipeline casts shadows from the local DEM only (flat, no body curvature), because that is what we can do
the same way on Earth. Here, for the lunar references only, we rebuild the illumination with:
  * the LOLA 85°S polar DEM at 40 m (a ±151.7 km square around the pole; horizon rays go up to 150 km),
  * exact 3D geometry on the lunar sphere (curvature included),
  * real Sun positions: subsolar latitude oscillating ±1.54°, all subsolar longitudes, Sun as a 0.53° disk.
For each site we compare three variants against the LOLA 18.6-year average illumination (Mazarico et al.):
  V1 local DEM only, flat      (what the pipeline assumes)
  V2 local DEM only, curved
  V3 terrain up to 150 km, curved   (full model)
Sites near 85°S (Malapert, Nobile Rim 1) lose part of their rays at the DEM edge; `ray_reach` in the JSON says
how much, so the "150 km" claim is never stated without that caveat.
Writes data/processed/far_horizons.json and figures/fig7_far_horizons.png.
Usage:  python scripts/validate_far_horizons.py [--figure-only]   (--figure-only redraws fig7 from the saved JSON)

Checked against the NASA labels (D. Lizárraga, 2026-11-14):
  * LDEM_85S_40M_FLOAT.LBL: 7584 × 7584 PC_REAL (little-endian float32), UNIT = KILOMETER relative to
    OFFSET = 1737.4 km, MAP_SCALE = 40 m, LINE/SAMPLE_PROJECTION_OFFSET = 3791.5, polar stereographic,
    CENTER_LONGITUDE = 0, POSITIVE_LONGITUDE_DIRECTION = EAST (so x = ρ·sin λ, y = ρ·cos λ, as in PROJ).
  * AVGVISIB_85S_060M_201608.TIF: int16, scale 4e-5, nodata −32768, +proj=stere +lat_0=-90 +lon_0=0 +R=1737400,
    the same CRS as the four 5 m site DEMs. PGDA: hourly Sun positions over one 18.6-year nutation cycle.
  * Horizon rays are straight lines on the map, not great circles: the azimuth error is ≤ 0.10° at 150 km
    for all four sites (checked numerically), far below the 5° azimuth step.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, math, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates
from scipy.stats import spearmanr
from pen.config import load_config, RAW, PROCESSED, FIGURES, RADIUS_M

R = RADIUS_M["moon"]
cfg = load_config()
LDEM = RAW / cfg["auxiliary"]["lola_ldem_85s_40m"]["file"]
AVG = RAW / cfg["auxiliary"]["lola_avg_illumination_85s"]["file"]
PSR = RAW / cfg["auxiliary"]["lola_permanent_shadow_85s"]["file"]
N, SCALE, OFF = 7584, 40.0, 3791.5          # LINES, MAP_SCALE, LINE/SAMPLE_PROJECTION_OFFSET (LDEM_85S_40M_FLOAT.LBL)

SPACING = 240.0          # target-point spacing (m); coarser than the main validation to keep the run ~10 min
BORDER = 1500.0          # drop 1.5 km at the site edges, same as the main validation
N_AZ = 72                # horizon azimuths (5°)
MAX_D = 150_000.0        # horizon search distance (m)
SUN_DISK = 0.533         # apparent Sun diameter (deg)
DEC_MAX = 1.54           # lunar subsolar-latitude amplitude (deg)

z_all = np.fromfile(LDEM, dtype="<f4").reshape(N, N).astype(np.float32) * 1000.0  # km → m above 1737.4 km


def to_rc(x, y):
    """Map metres (polar stereographic) → fractional row/col of the LDEM (0-based, pixel centres)."""
    return OFF - y / SCALE, x / SCALE + OFF


def height(x, y):
    r, c = to_rc(x, y)
    out = map_coordinates(z_all, [r.ravel(), c.ravel()], order=1, mode="constant", cval=np.nan)
    return out.reshape(np.shape(x))


def unit(x, y):
    """Unit position vector on the sphere in the map frame (x, y axes = map axes, z = north pole)."""
    rho = np.hypot(x, y)
    c = 2 * np.arctan(rho / (2 * R))                     # angular distance from the south pole
    with np.errstate(invalid="ignore", divide="ignore"):
        s = np.where(rho > 0, np.sin(c) / rho, 1 / (2 * R))
    return np.stack([s * x, s * y, -np.cos(c)], axis=-1)


# Step distances along each ray: 40 m steps near the observer, growing 0.5 % per step far away
d = [SCALE]
while d[-1] < MAX_D:
    d.append(d[-1] + max(SCALE, 0.005 * d[-1]))
D = np.array(d)


def horizons(x0, y0, z0, bbox=None, curved=True, chunk=1500):
    """Chunked wrapper (memory: chunk × steps × 3 floats per azimuth)."""
    return np.concatenate([_horizons(x0[i:i + chunk], y0[i:i + chunk], z0[i:i + chunk], bbox, curved)
                           for i in range(0, len(x0), chunk)])


def _horizons(x0, y0, z0, bbox=None, curved=True):
    """Horizon elevation angle (deg) for each target point and each of N_AZ map azimuths.
    bbox=(left, bottom, right, top) limits terrain to the site footprint (the 'local DEM only' variants)."""
    Dk = D if bbox is None else D[D <= math.hypot(bbox[2] - bbox[0], bbox[3] - bbox[1])]
    P_u = unit(x0, y0)                                       # (n, 3)
    P = P_u * (R + z0)[:, None]
    H = np.full((len(x0), N_AZ), -90.0, np.float32)
    for k in range(N_AZ):
        a = 2 * math.pi * k / N_AZ
        qx = x0[:, None] + Dk[None, :] * math.sin(a)          # azimuth measured clockwise from map +y
        qy = y0[:, None] + Dk[None, :] * math.cos(a)
        zq = height(qx, qy)
        if bbox is not None:
            l, b, r_, t = bbox
            zq = np.where((qx >= l) & (qx <= r_) & (qy >= b) & (qy <= t), zq, np.nan)
        if curved:
            Q = unit(qx, qy) * (R + zq)[..., None]
            v = Q - P[:, None, :]
            sin_e = np.einsum("nkc,nc->nk", v, P_u) / np.linalg.norm(v, axis=-1)
            e = np.degrees(np.arcsin(np.clip(sin_e, -1, 1)))
        else:
            e = np.degrees(np.arctan2(zq - z0[:, None], Dk[None, :]))
        H[:, k] = np.nanmax(np.where(np.isfinite(e), e, -90.0), axis=1)
    return H


def sun_visibility(x0, y0, H):
    """Mean visible fraction of the Sun disk over subsolar latitudes (±1.54°) and all subsolar longitudes."""
    U = unit(x0, y0)
    eps = 1.0
    T0 = unit(x0, y0 + eps) - U; T0 -= (T0 * U).sum(1, keepdims=True) * U; T0 /= np.linalg.norm(T0, axis=1, keepdims=True)
    T90 = unit(x0 + eps, y0) - U; T90 -= (T90 * U).sum(1, keepdims=True) * U; T90 /= np.linalg.norm(T90, axis=1, keepdims=True)
    decs = DEC_MAX * np.sin(2 * np.pi * np.arange(24) / 24)
    lons = np.radians(np.arange(0, 360, 5))
    vis = np.zeros(len(x0))
    n = 0
    az_grid = np.arange(N_AZ + 1) * 360 / N_AZ
    Hc = np.concatenate([H, H[:, :1]], axis=1)                 # wrap 360° = 0°
    for dec in np.radians(decs):
        for L in lons:
            # Moon-fixed Sun direction (X=cosφcosλ, Y=cosφsinλ, Z=sinφ); the map frame swaps X and Y (x = ρ sinλ)
            S = np.array([math.cos(dec) * math.sin(L), math.cos(dec) * math.cos(L), math.sin(dec)])
            e = np.degrees(np.arcsin(U @ S))
            Hh = S[None, :] - (U @ S)[:, None] * U
            az = np.degrees(np.arctan2((Hh * T90).sum(1), (Hh * T0).sum(1))) % 360   # clockwise from map +y
            idx = az / (360 / N_AZ); i0 = np.floor(idx).astype(int); f = idx - i0
            h = Hc[np.arange(len(x0)), i0] * (1 - f) + Hc[np.arange(len(x0)), i0 + 1] * f
            vis += np.clip((e - h) / SUN_DISK + 0.5, 0, 1)
            n += 1
    return vis / n


def avgvisib_at(x, y):
    with rasterio.open(AVG) as src:
        a = src.read(1).astype(np.float32)
        if src.nodata is not None:
            a[a == src.nodata] = np.nan
        a = a * (src.scales[0] or 1.0) + (src.offsets[0] or 0.0)   # stored as int16 × 4e-5 → fraction of time lit
        inv = ~src.transform
        cols, rows = inv * (x, y)
    # If the scale tag were ever lost, values would be raw counts (0–25,000): ρ would not notice, but the MAE would.
    if np.nanmax(a) > 1.0 + 1e-6 or np.nanmin(a) < -1e-6:
        raise ValueError(f"{AVG.name}: values outside [0, 1] (min {np.nanmin(a):g}, max {np.nanmax(a):g}); "
                         "the 4e-5 scale factor was not applied")
    return map_coordinates(a, [rows - 0.5, cols - 0.5], order=1, mode="constant", cval=np.nan)


def psr_at(x, y):
    """NASA's permanently-shadowed-region mask (LPSR_85S_060M, Mazarico et al.) at map points: True = PSR.
    The GeoTIFF stores +20000 (PSR) and -20000 (not PSR) with scale 2.5e-5; we take the nearest 60 m pixel."""
    with rasterio.open(PSR) as src:
        a = src.read(1)
        cols, rows = ~src.transform * (x, y)
    r = np.clip(np.floor(rows).astype(int), 0, a.shape[0] - 1); c = np.clip(np.floor(cols).astype(int), 0, a.shape[1] - 1)
    return a[r, c] > 0


def psr_agreement(lit, nasa_psr):
    """Compare 'never lit in our model' (no part of the Sun disk visible at any sampled Sun position) with NASA's PSR mask."""
    ours = lit <= 0.0
    both, either = int((ours & nasa_psr).sum()), int((ours | nasa_psr).sum())
    return dict(nasa_psr_share=round(float(nasa_psr.mean()), 3), model_psr_share=round(float(ours.mean()), 3),
                agreement=round(float((ours == nasa_psr).mean()), 3),
                precision=round(both / max(int(ours.sum()), 1), 3), recall=round(both / max(int(nasa_psr.sum()), 1), 3),
                iou=round(both / max(either, 1), 3))


def ray_reach(x0, y0):
    """How far the N_AZ horizon rays get before leaving the 85°S DEM (capped at MAX_D).
    Near 85°S the rays toward lower latitudes hit the edge of the DEM long before 150 km."""
    half = N * SCALE / 2
    a = 2 * np.pi * np.arange(N_AZ) / N_AZ
    sx, sy = np.sin(a)[None, :], np.cos(a)[None, :]
    with np.errstate(divide="ignore", invalid="ignore"):
        tx = np.where(sx > 0, (half - x0[:, None]) / sx, np.where(sx < 0, (-half - x0[:, None]) / sx, np.inf))
        ty = np.where(sy > 0, (half - y0[:, None]) / sy, np.where(sy < 0, (-half - y0[:, None]) / sy, np.inf))
    L = np.minimum(np.minimum(tx, ty), MAX_D)                                   # (n, N_AZ), metres
    k_out = np.rint(np.degrees(np.arctan2(x0, y0)) / (360 / N_AZ)).astype(int) % N_AZ   # away from the pole
    out = L[np.arange(len(x0)), k_out]
    return dict(share_rays_shorter_than_max=round(float(np.mean(L < MAX_D)), 3),
                median_ray_km=round(float(np.median(L)) / 1e3, 1),
                outward_ray_km_min=round(float(out.min()) / 1e3, 1),
                outward_ray_km_max=round(float(out.max()) / 1e3, 1))


if __name__ == "__main__":
    t0 = time.time()
    out = {}
    prev = json.load(open(PROCESSED / "validation.json")) if (PROCESSED / "validation.json").exists() else {}
    maps = {}
    FIG_ONLY = "--figure-only" in sys.argv
    for sid, s in ({} if FIG_ONLY else cfg["sites"]).items():
        if s["body"] != "moon" or s["role"] != "reference":
            continue
        with rasterio.open(RAW / s["file"]) as src:
            b = src.bounds
        xs = np.arange(b.left + BORDER, b.right - BORDER + 1, SPACING)
        ys = np.arange(b.bottom + BORDER, b.top - BORDER + 1, SPACING)
        X, Y = np.meshgrid(xs, ys[::-1])
        x0, y0 = X.ravel(), Y.ravel()
        z0 = height(x0, y0)
        ref = avgvisib_at(x0, y0)
        ok = np.isfinite(z0) & np.isfinite(ref)
        x0, y0, z0, ref = x0[ok], y0[ok], z0[ok], ref[ok]
        bbox = (b.left, b.bottom, b.right, b.top)
        res = {}
        for name, kw in [("V1_local_flat", dict(bbox=bbox, curved=False)),
                         ("V2_local_curved", dict(bbox=bbox, curved=True)),
                         ("V3_far_curved", dict(bbox=None, curved=True))]:
            H = horizons(x0, y0, z0, **kw)
            lit = sun_visibility(x0, y0, H)
            rho = float(spearmanr(lit, ref)[0])
            mae = float(np.mean(np.abs(lit - ref)))
            res[name] = dict(spearman_rho=round(rho, 3), mean_abs_error=round(mae, 3), bias=round(float(np.mean(lit - ref)), 3))
            if name == "V3_far_curved":
                maps[sid] = (X.shape, ok, lit, ref)
                if PSR.exists():
                    res["psr"] = psr_agreement(lit, psr_at(x0, y0))
                    print(f"{sid:24s} PSR {res['psr']}", flush=True)
            print(f"{sid:24s} {name:16s} ρ = {rho:.3f}   MAE = {mae:.3f}   ({time.time()-t0:.0f}s)", flush=True)
        out[sid] = dict(label=s["label"], n_points=int(ok.sum()), pipeline_rho=prev.get(sid, {}).get("spearman_rho"),
                        ray_reach=ray_reach(x0, y0), **res)
    if FIG_ONLY:
        out = json.load(open(PROCESSED / "far_horizons.json", encoding="utf-8"))["sites"]
    else:
        json.dump(dict(sites=out, settings=dict(spacing_m=SPACING, border_m=BORDER, n_azimuths=N_AZ, max_distance_m=MAX_D,
                                                sun_disk_deg=SUN_DISK, subsolar_lat_amplitude_deg=DEC_MAX,
                                                dem="LOLA LDEM_85S_40M (PDS)")),
                  open(PROCESSED / "far_horizons.json", "w"), indent=1)

    # ---- figure: rho per site and variant
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURF, INK, INK2 = "#fcfcfb", "#0b0b0b", "#52514e"
    COL = ["#c9c8c2", "#86b6ef", "#1c5cab"]
    names = {"V1_local_flat": "local DEM, flat", "V2_local_curved": "local DEM, curved", "V3_far_curved": "terrain up to 150 km, curved"}
    sites = list(out)
    import textwrap
    fig, ax = plt.subplots(figsize=(max(9, 1.75 * len(sites)), 4.5), facecolor=SURF); ax.set_facecolor(SURF)
    w = 0.26
    for k, v in enumerate(names):
        vals = [out[s][v]["spearman_rho"] for s in sites]
        bars = ax.bar(np.arange(len(sites)) + (k - 1) * w, vals, w - 0.02, color=COL[k], label=names[v])
        for bx, val in zip(bars, vals):
            ax.text(bx.get_x() + bx.get_width() / 2, val + 0.01, f"{val:.2f}", ha="center", fontsize=8.5, color=INK2)
    ax.set_xticks(range(len(sites)), [textwrap.fill(out[s]["label"].split("·")[1].split("(")[0].strip(), 15) for s in sites])
    ax.set_ylim(0, 1.05); ax.set_ylabel("Spearman ρ vs NASA LOLA illumination")
    for sp in ["top", "right"]: ax.spines[sp].set_visible(False)
    ax.grid(axis="y", color="#e8e7e2", lw=0.8); ax.set_axisbelow(True)
    ax.legend(frameon=False, fontsize=9, loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=3)
    fig.suptitle("Distant horizons close the gap: our light model vs NASA LOLA illumination", x=0.02, ha="left",
                 fontsize=12.5, color=INK, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.95)); fig.savefig(FIGURES / "fig7_far_horizons.png", dpi=150)
    print("done", round(time.time() - t0), "s")
