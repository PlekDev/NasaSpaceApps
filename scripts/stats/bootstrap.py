"""Bootstrap 95 % CI of the score of the top-20 windows per target (proof 3, robustness).

The reference vector of a target is the median, per feature, of its own 6 km windows (pen.scoring.reference_vector).
Each replicate resamples those reference windows with replacement, recomputes the median and rescores every Earth window
with the SAME IQR as the main run (the IQR comes from the Earth pool, which the bootstrap does not touch).
B = 1,000. Reports the official score (windows.csv), the percentile 95 % CI of the score and of the rank (1 = best).
Targets with few reference windows get wide CIs; n_ref is in the JSON.

Inputs: data/processed/windows.csv and data/cache/stats/features_<target>.csv (scripts/stats/extract_features.py).
Writes data/processed/stats/bootstrap.json.  Run: python scripts/stats/bootstrap.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from common import KEYS, PROCESSED, SEED, combined_from_dims, dim_distances, earth_features, iqr, load_windows, meta, scaled_diff, write
from pen.config import CACHE

B, TOP, MAIN_KM, CHUNK = 1000, 20, 6, 50


def ref_windows(target, km=MAIN_KM):
    f = pd.read_csv(CACHE / "stats" / f"features_{target}.csv")
    return f[f.window_km == km][KEYS].to_numpy(dtype=np.float64)


def bootstrap_scores(X, R, scale, rng, b=B, cols=None):
    """Scores of the Earth windows `cols` (all if None) for b bootstrap reference vectors. -> (b, windows)."""
    cols = np.arange(len(X)) if cols is None else cols
    out = []
    for start in range(0, b, CHUNK):
        n = min(CHUNK, b - start)
        idx = rng.integers(0, len(R), size=(n, len(R)))
        refs = np.median(R[idx], axis=1)                          # (n, features)
        out.append(combined_from_dims(dim_distances(scaled_diff(X[cols], refs, scale))))
    return np.concatenate(out)


def main():
    rng = np.random.default_rng(SEED)
    w = load_windows()
    g0, X = earth_features(w)
    scale = iqr(X)
    out = {"_stub": False, "n_ref": {}}
    inputs = [PROCESSED / "windows.csv"]
    for ref, g in w.groupby("reference", sort=False):
        R = ref_windows(ref)
        inputs.append(CACHE / "stats" / f"features_{ref}.csv")
        g = g.set_index("window_id").loc[g0["window_id"]]       # same window order as X
        point = combined_from_dims(dim_distances(scaled_diff(X, np.median(R, 0), scale)))
        assert np.abs(point - g["score_combined"].to_numpy()).max() < 0.1, f"{ref}: recomputed score differs from windows.csv"
        top = np.argsort(-g["score_combined"].to_numpy(), kind="stable")[:TOP]
        S = bootstrap_scores(X, R, scale, rng)                    # (B, all windows)
        ranks = 1 + (S[:, None, :] > S[:, top, None]).sum(-1)    # (B, TOP)
        lo, hi = np.percentile(S[:, top], [2.5, 97.5], axis=0)
        rlo, rhi = np.percentile(ranks, [2.5, 97.5], axis=0)
        out["n_ref"][ref] = int(len(R))
        out[ref] = [{"window_id": wid, "site": g["site"].iloc[t], "score": float(g["score_combined"].iloc[t]),
                     "ci95": [round(float(lo[n]), 1), round(float(hi[n]), 1)],
                     "rank_ci95": [int(rlo[n]), int(rhi[n])]}
                    for n, (t, wid) in enumerate(zip(top, g.index[top]))]
        print(f"{ref:24s} n_ref {len(R):3d}  #1 {out[ref][0]['score']:.1f} {out[ref][0]['ci95']} rank {out[ref][0]['rank_ci95']}"
              f"   #20 {out[ref][-1]['score']:.1f} {out[ref][-1]['ci95']}")
    out["_meta"] = meta(SEED, {"bootstrap": B, "top": TOP, "window_km": MAIN_KM, "ci": "percentile 2.5-97.5",
                               "resampled": "reference windows of the target (IQR fixed to the main run)"}, inputs)
    print("→", write("bootstrap", out))


if __name__ == "__main__":
    main()
