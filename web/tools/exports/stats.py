"""Export the validation statistics (the 3 proofs: blind test + robustness) to web/public/data/stats/.

Reads data/processed/stats/<name>.json (written by scripts/stats/*.py) and data/processed/controls/controls.json.
If a result file does not exist yet, it writes a placeholder with the FINAL shape and dummy values, marked
"_stub": true, so the web views can be built in parallel. Real results replace the stub without changing the shape.

Shape notes for the views:
  - every file has "_stub" (bool) and "_meta" (date, seed, parameters); every other top-level key is a target id
    (or "regions" / "observed" / ... as documented below), so iterate targets with keys that do not start with "_";
  - window ids are "<region id>_<i>_<j>", the same id web/src/detail.ts builds.

Run:  python -I web/tools/exports/stats.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import csv, hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web" / "tools"))
from export_data import write_json, read_json  # noqa: E402  (atomic UTF-8 writer shared by all exporters)

PROC = ROOT / "data" / "processed"
SRC = {  # output name -> source file in data/processed
    "null": PROC / "stats" / "null.json",
    "roc": PROC / "stats" / "roc.json",
    "bootstrap": PROC / "stats" / "bootstrap.json",
    "stability": PROC / "stats" / "stability.json",
    "tornado": PROC / "stats" / "tornado.json",
    "decomp": PROC / "stats" / "decomp.json",
    "controls": PROC / "controls" / "controls.json",
}
OUT = ROOT / "web" / "public" / "data" / "stats"
FEATURES = ["relief", "slope_med", "slope_p90", "rough", "hypso", "shadow_e2", "shadow_e5"]
STUB_META = {"generated": None, "seed": None, "params": {}, "note": "placeholder with the final shape; values are not results"}


def _targets_and_top():
    """Target ids and their 20 best windows (ids only) from windows.csv, so the stub uses real ids."""
    top = {}
    with open(PROC / "windows.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            top.setdefault(r["reference"], []).append((float(r["score_combined"]), r["site"], f'{r["site"]}_{r["i"]}_{r["j"]}'))
    return {t: sorted(v, reverse=True)[:20] for t, v in top.items()}


def stubs():
    top = _targets_and_top()
    T = list(top)
    moon = [t for t in T if t.startswith("moon_")]
    base = lambda: {"_stub": True, "_meta": dict(STUB_META)}
    out = {}

    out["null"] = {**base(), "n_perm": 10000, "seed": 0,
                   "questions": {"global": "Do the NASA analog sites rank higher than a random point anywhere in our 14 regions?",
                                 "region_matched": "Is the exact NASA site special within its own region?"},
                   "observed": {"median_pct_illum": 50.0, "median_pct_terrain": 50.0, "median_pct_combined": 50.0},
                   "p_value": {"global": {"illum": 0.5, "terrain": 0.5, "combined": 0.5},
                               "region_matched": {"illum": 0.5, "terrain": 0.5, "combined": 0.5}},
                   "pu_uhiwahine": {t: {"rank": 1, "of": 10424, "p_value_region_matched": 0.5,
                                        "pct_all_windows": 99.9, "frac_region_above": 0.0} for t in moon},
                   "null_hist": {"global": {"bins": [0, 25, 50, 75, 100], "counts": [0, 1, 1, 0]},
                                 "region_matched": {"bins": [0, 25, 50, 75, 100], "counts": [0, 1, 1, 0]}}}

    out["roc"] = {**base(), **{t: {"fpr": [0.0, 0.5, 1.0], "tpr": [0.0, 0.5, 1.0], "auc": 0.5, "auc_ci95": [0.4, 0.6],
                                   "n_pos": 0, "n_neg": 0, "n_sites": 0} for t in T}}

    out["bootstrap"] = {**base(), "n_ref": {t: 0 for t in T},
                        **{t: [{"window_id": w, "site": s, "score": 50.0, "ci95": [45.0, 55.0]} for _, s, w in top[t]] for t in T}}

    out["stability"] = {**base(), **{t: {"p_top1": {top[t][0][2]: 0.5}, "p_top10": {w: 0.5 for _, _, w in top[t][:10]},
                                         "kendall_tau_3_6": 0.0, "kendall_tau_6_12": 0.0, "kendall_tau_3_12": 0.0,
                                         "jaccard_top10_3_6": 0.0, "jaccard_top10_6_12": 0.0, "jaccard_top10_3_12": 0.0}
                                     for t in T}}

    out["tornado"] = {**base(), **{t: [{"feature": k, "low": -1.0, "high": 1.0, "removed": 0.0} for k in FEATURES] for t in T}}

    out["decomp"] = {**base(), **{t: {w: {k: round(1 / len(FEATURES), 4) for k in FEATURES} for _, _, w in top[t]} for t in T}}

    out["controls"] = {**base(), "regions": [{"id": "control_example", "label": "Example control tile", "why": "placeholder"}],
                       **{t: {"control": {"p50": 0.0, "p90": 0.0, "max": 0.0},
                              "candidates": {"p50": 0.0, "p90": 0.0, "max": 0.0}} for t in T}}
    return out


def main():
    stub = None
    files, h = [], hashlib.sha256()
    for name, src in SRC.items():
        if src.exists():
            obj = read_json(src)
            obj.setdefault("_stub", False)
            h.update(src.read_bytes())
        else:
            stub = stub or stubs()
            obj = stub[name]
            h.update(f"stub:{name}".encode())
        write_json(OUT / f"{name}.json", obj)
        files.append(f"{name}.json")
        print(f"  stats/{name}.json  {'stub' if obj['_stub'] else 'real'}")
    # "generated": SHA-256 of the input files (fallback until the shared hash format is published)
    write_json(OUT / "index.json", {"files": files, "generated": h.hexdigest()})


if __name__ == "__main__":
    main()
