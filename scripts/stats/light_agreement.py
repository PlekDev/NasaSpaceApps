"""Proof 2, "is the light model right?": point-by-point agreement between our far-horizon light model and NASA's
LOLA average-illumination map, for every lunar reference site.

`scripts/validate_far_horizons.py` reports one Spearman rho and one mean error per site. This script keeps the points
and turns them into what the web "Proof" view plots:
  * density      2D histogram of modelled vs NASA lit fraction (the scatter, binned)
  * bland_altman difference (model - NASA) against the mean of the two: bias and 95 % limits of agreement
  * residual_map where the model is wrong, on the site grid, next to NASA's map
  * ray_reach    how far the horizon rays get before leaving the 85 S DEM
  * psr          permanent shadow in our model vs NASA's LPSR mask

The light model itself is imported from validate_far_horizons.py and is not changed. The full variant (terrain up to
150 km, curved Moon) and the local-flat variant are recomputed, so the numbers match data/processed/far_horizons.json.

Needs the raw LOLA files (`make data`). The per-point arrays are cached in data/cache/light/<site>.npz, so
    python scripts/stats/light_agreement.py            # ~6 min the first time, seconds afterwards
    python scripts/stats/light_agreement.py --refresh  # recompute the light model
Outputs: data/processed/stats/light_<site>.json and data/processed/stats/light_summary.json
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

SEED = 20261115          # fixed, so the subsampled points are the same on every run
N_BINS = 40              # density histogram: 40 x 40 cells over [0, 1] x [0, 1]
MAX_POINTS = 1200        # Bland-Altman points sent to the browser per site
MAX_MAP_SIDE = 64        # residual map is thinned to at most this many cells per side


# ----------------------------------------------------------------------------- pure functions (unit-tested)
def bland_altman(model: np.ndarray, nasa: np.ndarray) -> dict:
    """Bias and 95 % limits of agreement of (model - NASA), in the same units as the inputs (fraction of time lit)."""
    d = np.asarray(model, float) - np.asarray(nasa, float)
    bias, sd = float(d.mean()), float(d.std(ddof=1)) if d.size > 1 else 0.0
    lo, hi = bias - 1.96 * sd, bias + 1.96 * sd
    return dict(bias=round(bias, 4), sd=round(sd, 4), loa_low=round(lo, 4), loa_high=round(hi, 4),
                share_within_loa=round(float(((d >= lo) & (d <= hi)).mean()), 4), n=int(d.size))


def density(model: np.ndarray, nasa: np.ndarray, bins: int = N_BINS) -> dict:
    """2D histogram over [0, 1]^2 as a sparse list [model_bin, nasa_bin, count] (only non-empty cells)."""
    h, _, _ = np.histogram2d(np.clip(model, 0, 1), np.clip(nasa, 0, 1), bins=bins, range=[[0, 1], [0, 1]])
    i, j = np.nonzero(h)
    return dict(bins=bins, cells=[[int(a), int(b), int(h[a, b])] for a, b in zip(i, j)], max_count=int(h.max()))


def subsample(n: int, k: int, seed: int = SEED) -> np.ndarray:
    """Sorted indices of at most k of n points, without replacement, reproducible."""
    if n <= k:
        return np.arange(n)
    return np.sort(np.random.default_rng(seed).choice(n, size=k, replace=False))


def thin_grid(a: np.ndarray, max_side: int = MAX_MAP_SIDE):
    """Thin a 2D array by an integer step so that no side exceeds max_side. Returns (thinned array, step)."""
    step = int(np.ceil(max(a.shape) / max_side))
    return a[::step, ::step], step


def to_list(a: np.ndarray, decimals: int = 3) -> list:
    """Row-major nested list with None for NaN (JSON has no NaN)."""
    return [[None if not np.isfinite(v) else round(float(v), decimals) for v in row] for row in a]


# ----------------------------------------------------------------------------- light model (needs the raw data)
def compute_site(fh, sid, s, RAW):
    """Recompute the local-flat and the far-curved light model on the same target points as validate_far_horizons.py."""
    import rasterio
    with rasterio.open(RAW / s["file"]) as src:
        b = src.bounds
    xs = np.arange(b.left + fh.BORDER, b.right - fh.BORDER + 1, fh.SPACING)
    ys = np.arange(b.bottom + fh.BORDER, b.top - fh.BORDER + 1, fh.SPACING)
    X, Y = np.meshgrid(xs, ys[::-1])
    x0, y0 = X.ravel(), Y.ravel()
    z0, ref = fh.height(x0, y0), fh.avgvisib_at(x0, y0)
    ok = np.isfinite(z0) & np.isfinite(ref)
    xo, yo, zo = x0[ok], y0[ok], z0[ok]
    bbox = (b.left, b.bottom, b.right, b.top)
    lit_local = fh.sun_visibility(xo, yo, fh.horizons(xo, yo, zo, bbox=bbox, curved=False))
    lit_far = fh.sun_visibility(xo, yo, fh.horizons(xo, yo, zo, bbox=None, curved=True))
    return dict(shape=np.array(X.shape), ok=ok, x=xo, y=yo, nasa=ref[ok], lit_local=lit_local, lit_far=lit_far,
                psr=fh.psr_at(xo, yo), bounds=np.array(bbox), spacing=np.array(fh.SPACING))


def main():
    from scipy.stats import spearmanr
    from pen.config import load_config, RAW, PROCESSED, CACHE
    cfg = load_config()
    out_dir, cache_dir = PROCESSED / "stats", CACHE / "light"
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    refresh, fh, t0, summary = "--refresh" in sys.argv, None, time.time(), {}
    far = json.loads((PROCESSED / "far_horizons.json").read_text(encoding="utf-8"))
    committed = far["sites"]

    for sid, s in cfg["sites"].items():
        if s["body"] != "moon" or s["role"] != "reference":
            continue
        npz = cache_dir / f"{sid}.npz"
        if npz.exists() and not refresh:
            d = dict(np.load(npz))
        else:
            if fh is None:
                import validate_far_horizons as fh     # loads the 230 MB polar DEM once
            d = compute_site(fh, sid, s, RAW)
            np.savez_compressed(npz, **d)
        model, local, nasa, psr = d["lit_far"], d["lit_local"], d["nasa"], d["psr"].astype(bool)
        rho_far, rho_local = float(spearmanr(model, nasa)[0]), float(spearmanr(local, nasa)[0])
        ba = bland_altman(model, nasa)
        k = subsample(len(model), MAX_POINTS)

        # maps on the site grid (north up), thinned for the browser
        shape = tuple(int(v) for v in d["shape"])
        grid_res, grid_nasa, grid_model = (np.full(d["ok"].size, np.nan) for _ in range(3))
        grid_res[d["ok"]] = model - nasa; grid_nasa[d["ok"]] = nasa; grid_model[d["ok"]] = model
        res_t, step = thin_grid(grid_res.reshape(shape))
        nasa_t, _ = thin_grid(grid_nasa.reshape(shape))
        model_t, _ = thin_grid(grid_model.reshape(shape))

        ours_psr = model <= 0.0
        both, either = int((ours_psr & psr).sum()), int((ours_psr | psr).sum())
        site = dict(
            target=sid, label=s["label"], n_points=int(len(model)),
            spearman_rho=dict(local_flat=round(rho_local, 3), far_curved=round(rho_far, 3)),
            mean_abs_error=dict(local_flat=round(float(np.abs(local - nasa).mean()), 3),
                                far_curved=round(float(np.abs(model - nasa).mean()), 3)),
            bland_altman=dict(ba, points=[[round(float((model[i] + nasa[i]) / 2), 3), round(float(model[i] - nasa[i]), 3)] for i in k]),
            density=density(model, nasa),
            density_local=density(local, nasa),
            residual_map=dict(ny=res_t.shape[0], nx=res_t.shape[1], cell_m=float(d["spacing"]) * step,
                              bounds_m=[float(v) for v in d["bounds"]], model_minus_nasa=to_list(res_t),
                              nasa=to_list(nasa_t), model=to_list(model_t),
                              abs_max=round(float(np.nanmax(np.abs(res_t))), 3)),
            ray_reach=committed.get(sid, {}).get("ray_reach"),
            psr=dict(nasa_psr_share=round(float(psr.mean()), 3), model_psr_share=round(float(ours_psr.mean()), 3),
                     agreement=round(float((ours_psr == psr).mean()), 3),
                     precision=round(both / max(int(ours_psr.sum()), 1), 3),
                     recall=round(both / max(int(psr.sum()), 1), 3), iou=round(both / max(either, 1), 3)),
        )
        # the recomputed headline numbers must be the committed ones: this script adds detail, it does not move them
        c = committed.get(sid, {}).get("V3_far_curved", {})
        site["matches_far_horizons_json"] = bool(c and abs(c["spearman_rho"] - site["spearman_rho"]["far_curved"]) <= 0.001
                                                 and abs(c["mean_abs_error"] - site["mean_abs_error"]["far_curved"]) <= 0.001)
        (out_dir / f"light_{sid}.json").write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":")),
                                                   encoding="utf-8", newline="\n")
        summary[sid] = dict(label=s["label"], n_points=site["n_points"], rho_local=site["spearman_rho"]["local_flat"],
                            rho_far=site["spearman_rho"]["far_curved"], mae_far=site["mean_abs_error"]["far_curved"],
                            bias=ba["bias"], loa_low=ba["loa_low"], loa_high=ba["loa_high"], psr_iou=site["psr"]["iou"],
                            matches_far_horizons_json=site["matches_far_horizons_json"])
        print(f"{sid:24s} rho {rho_far:.3f}  bias {ba['bias']:+.4f}  LoA [{ba['loa_low']:+.3f}, {ba['loa_high']:+.3f}]"
              f"  matches committed: {site['matches_far_horizons_json']}   ({time.time() - t0:.0f}s)", flush=True)

    rho = [v["rho_far"] for v in summary.values()]; bias = [v["bias"] for v in summary.values()]
    overall = dict(n_sites=len(summary), rho_far=[min(rho), max(rho)], bias=[min(bias), max(bias)],
                   loa_widest=[min(v["loa_low"] for v in summary.values()), max(v["loa_high"] for v in summary.values())],
                   mae_far=[min(v["mae_far"] for v in summary.values()), max(v["mae_far"] for v in summary.values())],
                   all_match_far_horizons_json=all(v["matches_far_horizons_json"] for v in summary.values()))
    (out_dir / "light_summary.json").write_text(json.dumps(dict(
        sites=summary, overall=overall, model_settings=far.get("settings", {}),
        settings=dict(seed=SEED, density_bins=N_BINS, bland_altman_points=MAX_POINTS, map_max_side=MAX_MAP_SIDE,
                      units="fraction of time lit (0-1); bias and limits of agreement are model minus NASA"),
        source="our far-horizon light model (scripts/validate_far_horizons.py) vs NASA LOLA average illumination "
               "AVGVISIB_85S_060M_201608 and permanent-shadow mask LPSR_85S_060M_201608 (Mazarico et al.)"),
        indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("overall", overall)


if __name__ == "__main__":
    main()
