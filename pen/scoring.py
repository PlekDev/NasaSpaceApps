"""Similarity scores. Each feature difference is scaled by the IQR of the Earth window pool,
combined with an RMS distance D, and mapped to 0–100 with S = 100·exp(−D)."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import math
import numpy as np


def iqr_scale(pool, keys):
    return {k: max(float(np.subtract(*np.percentile([r[k] for r in pool], [75, 25]))), 1e-6) for k in keys}


def reference_vector(rows, keys):
    return {k: float(np.median([r[k] for r in rows])) for k in keys}


def similarity(cand, ref, keys, scale, weights=None):
    w = np.array([1.0 if weights is None else weights.get(k, 1.0) for k in keys])
    d = np.array([(cand[k] - ref[k]) / scale[k] for k in keys])
    D = math.sqrt(float(np.sum(w * d ** 2) / np.sum(w)))
    return 100.0 * math.exp(-D), dict(zip(keys, [round(float(x), 2) for x in d]))


def explain(d: dict, labels: dict, thr_similar=0.5, thr_diff=1.5):
    """Human-readable 'similar in / differs in' card from scaled differences."""
    similar = [labels.get(k, k) for k, v in d.items() if abs(v) <= thr_similar]
    differs = [f"{labels.get(k, k)} ({'higher' if v > 0 else 'lower'} on Earth)" for k, v in d.items() if abs(v) >= thr_diff]
    return similar, differs


FEATURE_LABELS = {
    "relief": "local relief",
    "slope_med": "median slope",
    "slope_p90": "steep-slope fraction (P90)",
    "rough": "150 m roughness",
    "hypso": "hypsometry",
    "shadow_e2": "shadow at 2° sun",
    "shadow_e5": "shadow at 5° sun",
}


def compact_windows(df):
    """Round the per-window table for the repo/app (≈ half the size, no visible change in scores)."""
    import json as _json
    df = df.copy()
    for c in df.columns:
        if c in ("lon", "lat"):
            df[c] = df[c].round(5)
        elif c.startswith("score_"):
            df[c] = df[c].round(1)
        elif c.startswith("d_"):
            df[c] = df[c].round(3)
        elif df[c].dtype.kind == "f" and c not in ("i", "j", "window_km"):
            df[c] = df[c].round(4)
    if "polygon" in df:
        df["polygon"] = df["polygon"].apply(
            lambda s: _json.dumps([[round(a, 5), round(b, 5)] for a, b in _json.loads(s)]) if isinstance(s, str) and s != "null" else s)
    return df
