"""Ranking stability (proof 3, robustness): random dimension weights and window size.

(a) Weights. For each of N draws, every dimension gets a weight W drawn log-uniform in [0.25, 4] (the range of the app
    sliders) and the combined score is recombined with the README formula S = 100 exp(-sqrt(sum W n D^2 / sum W n)).
    p_top1 / p_top10 = share of draws in which a window is #1 / in the top 10. This replaces the Dirichlet weights of
    docs/plan/chamba.md so the test covers exactly the weightings a user can choose in the app. With two dimensions only
    the ratio W_illumination / W_terrain matters (range 1/16 to 16, triangular in log).
(b) Window size. The pipeline is recomputed at 3, 6 and 12 km (scripts/stats/extract_features.py; same code path, IQR and
    reference median recomputed at each size, as scripts/run_pipeline.py does). Per target:
      - Kendall tau-b between the regional rankings (best window per region, 14 regions) of each pair of sizes;
      - Jaccard overlap of the top-10 windows: windows of different sizes are different objects, so the overlap is
        measured on their footprints, area(top-10 A intersect top-10 B) / area(top-10 A union top-10 B), with areas in a
        local equal-area approximation (longitude scaled by cos(latitude) per region).

Writes data/processed/stats/stability.json.  Run: python scripts/stats/stability.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, math, sys
from itertools import combinations
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from scipy.stats import kendalltau
from shapely import union_all
from shapely.affinity import scale as shp_scale
from shapely.geometry import Polygon
from common import DIM_IDX, KEYS, PROCESSED, SEED, combined_from_dims, dim_distances, earth_features, iqr, load_windows, meta, scaled_diff, write
from pen.config import CACHE, candidates, load_config

N_DRAWS, W_LO, W_HI, CHUNK, TOPK = 10000, 0.25, 4.0, 500, 10


def draw_weights(rng, n, dims):
    return {d: np.exp(rng.uniform(math.log(W_LO), math.log(W_HI), n)) for d in dims}


def top_probabilities(D, weights, ids, k=TOPK):
    """D: dim -> (windows,) distances; weights: dim -> (draws,). Share of draws each window is #1 and in the top k."""
    n = len(next(iter(weights.values())))
    c1, ck = np.zeros(len(ids)), np.zeros(len(ids))
    for s in range(0, n, CHUNK):
        Wd = {d: weights[d][s:s + CHUNK, None] for d in D}
        S = combined_from_dims({d: D[d][None, :] for d in D}, Wd)       # (chunk, windows)
        np.add.at(c1, S.argmax(1), 1)
        np.add.at(ck, np.argpartition(-S, k, axis=1)[:, :k].ravel(), 1)
    p1 = {ids[i]: round(c1[i] / n, 4) for i in np.flatnonzero(c1)}
    pk = {ids[i]: round(ck[i] / n, 4) for i in np.flatnonzero(ck)}
    return dict(sorted(p1.items(), key=lambda x: -x[1])), dict(sorted(pk.items(), key=lambda x: -x[1]))


def footprint(polys):
    """Union of window polygons with longitude scaled by cos(lat) of each polygon (local equal-area approximation)."""
    return union_all([shp_scale(p, xfact=math.cos(math.radians(p.centroid.y)), yfact=1.0, origin=(0, 0)) for p in polys])


def jaccard_area(pa, pb):
    a, b = footprint(pa), footprint(pb)
    u = a.union(b).area
    return float(a.intersection(b).area / u) if u else 0.0


def multiscale(cfg, targets):
    """Per window size: scores of every Earth window for every target, from the recomputed features."""
    regions = list(candidates(cfg))
    earth = pd.concat([pd.read_csv(CACHE / "stats" / f"features_{r}.csv").assign(site=r) for r in regions], ignore_index=True)
    out = {}
    for km in cfg["window_km"]:
        E = earth[earth.window_km == km].reset_index(drop=True)
        X = E[KEYS].to_numpy(dtype=np.float64)
        scale = iqr(X)
        per = {}
        for t in targets:
            f = pd.read_csv(CACHE / "stats" / f"features_{t}.csv")
            ref = np.median(f[f.window_km == km][KEYS].to_numpy(dtype=np.float64), 0)
            per[t] = combined_from_dims(dim_distances(scaled_diff(X, ref, scale)))
        out[km] = (E, per)
    return out, regions


def main():
    rng = np.random.default_rng(SEED)
    cfg = load_config()
    w = load_windows()
    g0, X = earth_features(w)
    scale = iqr(X)
    ids = g0["window_id"].tolist()
    targets = list(dict.fromkeys(w["reference"]))
    rv = json.load(open(PROCESSED / "results.json"))["reference_features"]
    weights = draw_weights(rng, N_DRAWS, list(DIM_IDX))

    ms, regions = multiscale(cfg, targets)
    kms = cfg["window_km"]
    out = {"_stub": False}
    for t in targets:
        D = dim_distances(scaled_diff(X, np.array([rv[t][k] for k in KEYS]), scale))
        p1, p10 = top_probabilities(D, weights, ids)
        rec = {"p_top1": p1, "p_top10": p10}
        best = {}
        for km in kms:
            E, per = ms[km]
            s = pd.Series(per[t]).groupby(E["site"]).max()
            best[km] = s.reindex(regions).to_numpy()
        for a, b in combinations(kms, 2):
            tau, p = kendalltau(best[a], best[b])
            rec[f"kendall_tau_{a}_{b}"] = round(float(tau), 3)
            rec[f"kendall_p_{a}_{b}"] = round(float(p), 4)
            tops = []
            for km in (a, b):
                E, per = ms[km]
                top = np.argsort(-per[t], kind="stable")[:TOPK]
                tops.append([Polygon(json.loads(E["polygon"].iloc[i])) for i in top])
            rec[f"jaccard_top10_{a}_{b}"] = round(jaccard_area(*tops), 3)
        rec["n_regions"] = len(regions)
        rec["top1_equal_weights"] = ids[int(np.argmax(combined_from_dims(D)))]
        out[t] = rec
        top1 = next(iter(p1.items()))
        print(f"{t:24s} #1 most often {top1[0]} ({top1[1]:.0%}); equal-weight #1 keeps p={p1.get(rec['top1_equal_weights'], 0):.2f}  "
              + "  ".join(f"tau{a}-{b} {rec[f'kendall_tau_{a}_{b}']:+.2f} J {rec[f'jaccard_top10_{a}_{b}']:.2f}"
                          for a, b in combinations(kms, 2)))
    out["_meta"] = meta(SEED, {"n_draws": N_DRAWS, "weights": f"log-uniform [{W_LO}, {W_HI}] per dimension (app sliders)",
                               "top_k": TOPK, "window_km": kms, "kendall": "tau-b of best-window-per-region scores",
                               "jaccard": "area of footprint intersection / union of the top-10 windows"},
                        [PROCESSED / "windows.csv", PROCESSED / "results.json"]
                        + [CACHE / "stats" / f"features_{s}.csv" for s in targets + regions])
    print("→", write("stability", out))


if __name__ == "__main__":
    main()
