"""Shared helpers for the validation statistics in scripts/stats/.

Nothing here writes to windows.csv, summary.csv or known_analogs.*: those are read-only inputs.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import ast, datetime, hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pen.config import PROCESSED  # noqa: E402
from pen.features import DIMENSIONS  # noqa: E402

STATS = PROCESSED / "stats"
SEED = 20261115
SCORES = {"combined": "score_combined", "terrain": "score_terrain", "illum": "score_illumination"}
KEYS = [k for ks in DIMENSIONS.values() for k in ks]


def known_sites():
    """The KNOWN list of scripts/validate_known_analogs.py, read with ast (the script is not imported or run)."""
    src = (ROOT / "scripts" / "validate_known_analogs.py").read_text(encoding="utf-8")
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "KNOWN" for t in node.targets):
            return [{kw.arg: ast.literal_eval(kw.value) for kw in call.keywords} for call in node.value.elts]
    raise KeyError("KNOWN")


def load_windows():
    """windows.csv plus a window id '<region>_<i>_<j>' (the id web/src/detail.ts builds)."""
    w = pd.read_csv(PROCESSED / "windows.csv")
    w["window_id"] = w["site"] + "_" + w["i"].astype(str) + "_" + w["j"].astype(str)
    return w


def body_of(ref):
    return ref.split("_")[0]


def pct_below(sorted_scores, values):
    """Percentile as in validate_known_analogs.py: 100 * share of the target's windows with a strictly lower score."""
    return 100.0 * np.searchsorted(sorted_scores, values, side="left") / len(sorted_scores)


def stable_rank(scores):
    """1-based position of each window in the descending order, ties kept in file order (as web/tools/export_data.py)."""
    order = np.argsort(-np.asarray(scores), kind="stable")
    rank = np.empty(len(order), dtype=np.int64)
    rank[order] = np.arange(1, len(order) + 1)
    return rank


DIM_IDX = {d: [KEYS.index(k) for k in ks] for d, ks in DIMENSIONS.items()}


def iqr(X):
    """IQR per feature over the Earth window pool, as pen.scoring.iqr_scale (floor 1e-6). X: (windows, features)."""
    q75, q25 = np.percentile(X, [75, 25], axis=0)
    return np.maximum(q75 - q25, 1e-6)


def scaled_diff(X, ref, scale):
    """d_k = (x_k - r_k) / IQR_k. X: (windows, features); ref: (..., features) -> (..., windows, features)."""
    return (X - np.asarray(ref)[..., None, :]) / scale


def dim_distances(d):
    """RMS distance per dimension, D_dim = sqrt(mean_k d_k^2) over the features of the dimension. -> dict dim -> (...)."""
    return {dim: np.sqrt((d[..., ix] ** 2).mean(-1)) for dim, ix in DIM_IDX.items()}


def combined_from_dims(D, weights=None):
    """App slider recombination (README): S = 100 exp(-sqrt(sum W n D^2 / sum W n)). With W = 1 equals score_combined."""
    num = den = 0.0
    for dim, Dd in D.items():
        W = 1.0 if weights is None else weights[dim]
        n = len(DIM_IDX[dim])
        num = num + W * n * Dd ** 2
        den = den + W * n
    return 100.0 * np.exp(-np.sqrt(num / den))


def earth_features(w):
    """(windows of one reference, feature matrix) from windows.csv; features are the same for every reference."""
    g = w[w["reference"] == w["reference"].iloc[0]].reset_index(drop=True)
    return g, g[KEYS].to_numpy(dtype=np.float64)


def file_sha(*paths):
    h = hashlib.sha256()
    for p in paths:
        h.update(Path(p).read_bytes())
    return h.hexdigest()


def meta(seed, params, inputs):
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        commit = None
    return {"generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "seed": seed, "params": params, "git_commit": commit,
            "inputs": {str(Path(p).relative_to(ROOT)): file_sha(p)[:16] for p in inputs}}


def write(name, obj):
    STATS.mkdir(parents=True, exist_ok=True)
    path = STATS / f"{name}.json"
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    return path
