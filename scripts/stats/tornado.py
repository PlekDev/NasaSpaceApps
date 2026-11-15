"""Feature sensitivity (tornado) and score decomposition per window (proof 3 and the analog card).

Tornado, per target, for its #1 window (and the mean over the top 10): the change of the combined score when one
feature of the window is moved by -1 IQR (low) or +1 IQR (high), i.e. d_k -> d_k - 1 or d_k + 1, and when the feature is
removed from the score (its weight set to 0). Everything else (reference, IQR, other features) is fixed.

Decomposition, per target and top-20 window: the share of each feature in the squared distance of the combined score,
w_k d_k^2 / sum_j w_j d_j^2 with w = 1 (what the score is made of: a large share means "this is where it differs").

Writes data/processed/stats/tornado.json and decomp.json.  Run: python scripts/stats/tornado.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from common import KEYS, PROCESSED, SEED, earth_features, iqr, load_windows, meta, scaled_diff, write

TOP_TORNADO, TOP_DECOMP = 10, 20


def score_from_d(d, w=None):
    """Combined score from scaled differences d (..., features) with optional feature weights w (features,)."""
    w = np.ones(d.shape[-1]) if w is None else w
    return 100.0 * np.exp(-np.sqrt((w * d ** 2).sum(-1) / w.sum()))


def tornado_rows(d):
    """d: (windows, features). -> per feature: mean change for -1 IQR, +1 IQR and removal."""
    base = score_from_d(d)
    rows = []
    for k, name in enumerate(KEYS):
        lo, hi = d.copy(), d.copy()
        lo[:, k] -= 1; hi[:, k] += 1
        wk = np.ones(len(KEYS)); wk[k] = 0
        rows.append({"feature": name, "low": round(float((score_from_d(lo) - base).mean()), 2),
                     "high": round(float((score_from_d(hi) - base).mean()), 2),
                     "removed": round(float((score_from_d(d, wk) - base).mean()), 2)})
    return rows


def decomposition(d):
    sq = d ** 2
    tot = sq.sum(-1, keepdims=True)
    return np.where(tot > 0, sq / np.where(tot > 0, tot, 1), 1 / d.shape[-1])


def main():
    w = load_windows()
    g0, X = earth_features(w)
    scale = iqr(X)
    rv = json.load(open(PROCESSED / "results.json"))["reference_features"]
    ids = np.array(g0["window_id"])
    tornado, decomp = {"_stub": False}, {"_stub": False}
    for t in dict.fromkeys(w["reference"]):
        d = scaled_diff(X, np.array([rv[t][k] for k in KEYS]), scale)
        order = np.argsort(-score_from_d(d), kind="stable")
        rows1 = tornado_rows(d[order[:1]])
        rows10 = tornado_rows(d[order[:TOP_TORNADO]])
        tornado[t] = [dict(r1, low_top10_mean=r10["low"], high_top10_mean=r10["high"], removed_top10_mean=r10["removed"])
                      for r1, r10 in zip(rows1, rows10)]
        tornado[t].sort(key=lambda r: -max(abs(r["low"]), abs(r["high"])))
        sh = decomposition(d[order[:TOP_DECOMP]])
        decomp[t] = {ids[i]: {k: round(float(v), 4) for k, v in zip(KEYS, sh[n])} for n, i in enumerate(order[:TOP_DECOMP])}
        print(f"{t:24s} #1 {ids[order[0]]}: most sensitive {tornado[t][0]['feature']} "
              f"({tornado[t][0]['low']:+.1f} / {tornado[t][0]['high']:+.1f})")
    m = meta(SEED, {"step": "±1 IQR on one feature (d_k ± 1)", "top_window": 1, "top_mean": TOP_TORNADO,
                    "window_km": 6, "note": "deterministic, no random draws"}, [PROCESSED / "windows.csv", PROCESSED / "results.json"])
    tornado["_meta"] = m
    decomp["_meta"] = dict(m, params={"share": "d_k^2 / sum_j d_j^2 (combined score, equal weights)", "top": TOP_DECOMP})
    print("→", write("tornado", tornado), write("decomp", decomp))


if __name__ == "__main__":
    main()
