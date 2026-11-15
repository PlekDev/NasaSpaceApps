"""Permutation null test for the known-analog result (proof 1, "blind test").

Observed statistic, exactly as scripts/validate_known_analogs.py: each known site -> the 6 km windows that contain it ->
best percentile of their score among all windows of the target -> median over the 48 (site, target) tests.

Null: the 8 known sites are replaced by random points and the same statistic is recomputed, N times.
  - global:         each point is uniform over the valid area of all 14 regions
                    ("Do the NASA analog sites rank higher than a random point anywhere in our 14 regions?")
  - region_matched: each point is uniform over the valid area of the site's own region
                    ("Is the exact NASA site special within its own region?")
A point is valid when it falls inside at least one window, i.e. exactly when validate_known_analogs.py can score it.
The valid area is sampled on a lattice (LATTICE_M); lattice points that fall in the same set of windows form one cell, and
cells are drawn with probability proportional to their number of lattice points (their area).

p-value = (1 + #{null >= observed}) / (N + 1)   (the +1 counts the observed set itself; it never reports p = 0).

Pu'u Hiwahine, per lunar target: its rank (best window, stable order as web/tools/export_data.py), the exact share of the
Mauna Kea valid area whose best window ranks at least as well (region-matched p) or strictly better (frac_region_above),
its percentile among all windows and the Bonferroni p (x number of lunar targets, capped at 1). "headline" is the
sentence for the web and deck, generated from these numbers.

Writes data/processed/stats/null.json.  Run: python scripts/stats/null_test.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, math, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from shapely import STRtree, points
from shapely.geometry import Point, Polygon
from common import PROCESSED, SCORES, SEED, body_of, known_sites, load_windows, meta, pct_below, stable_rank, write
from pen.config import load_config  # noqa: E402  (common puts the repo root on sys.path)

N_PERM = 10000
LATTICE_M = 150.0
HIST_BINS = np.arange(0, 101, 2.0)
PUU = "Pu'u Hiwahine"
QUESTIONS = {"global": "Do the NASA analog sites rank higher than a random point anywhere in our 14 regions?",
             "region_matched": "Is the exact NASA site special within its own region?"}


def window_tables(w):
    """Per-window percentile P[win, ref, score] and stable rank R[win, ref] (combined), windows in one fixed order."""
    refs = list(dict.fromkeys(w["reference"]))
    base = w[w["reference"] == refs[0]][["window_id", "site", "polygon"]].reset_index(drop=True)
    pos = pd.Series(np.arange(len(base)), index=base["window_id"])
    P = np.zeros((len(base), len(refs), len(SCORES)), dtype=np.float32)
    R = np.zeros((len(base), len(refs)), dtype=np.int64)
    for r, ref in enumerate(refs):
        g = w[w["reference"] == ref]
        ix = pos[g["window_id"]].to_numpy()
        for s, col in enumerate(SCORES.values()):
            P[ix, r, s] = pct_below(np.sort(g[col].to_numpy()), g[col].to_numpy())
        R[ix, r] = stable_rank(g["score_combined"].to_numpy())
    return refs, base, P, R


def lattice_cells(polys, spacing_m=LATTICE_M):
    """Cells of the valid area of one region: list of window-index tuples and the number of lattice points in each."""
    xs = np.array([c for p in polys for c in p.exterior.xy[0]]); ys = np.array([c for p in polys for c in p.exterior.xy[1]])
    lat0 = float(np.mean(ys))
    dlat = spacing_m / 111320.0
    dlon = spacing_m / (111320.0 * math.cos(math.radians(lat0)))
    gx, gy = np.meshgrid(np.arange(xs.min(), xs.max(), dlon), np.arange(ys.min(), ys.max(), dlat))
    pts = points(gx.ravel(), gy.ravel())
    pi, wi = STRtree(polys).query(pts, predicate="within")
    df = pd.DataFrame({"p": pi, "w": wi}).sort_values(["p", "w"])
    keys = df.groupby("p")["w"].agg(tuple)
    counts = keys.value_counts()
    return list(counts.index), counts.to_numpy(dtype=np.float64)


def main():
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    w = load_windows()
    refs, base, P, R = window_tables(w)
    polys = [Polygon(json.loads(s)) for s in base["polygon"]]
    regions = list(dict.fromkeys(base["site"]))

    # cells per region: best percentile per (ref, score) and best rank per ref
    cells = {}
    for reg in regions:
        idx = np.flatnonzero(base["site"].to_numpy() == reg)
        keys, cnt = lattice_cells([polys[i] for i in idx])
        best = np.stack([P[idx[list(k)]].max(0) for k in keys])           # (cells, refs, scores)
        rank = np.stack([R[idx[list(k)]].min(0) for k in keys])           # (cells, refs)
        cells[reg] = dict(best=best, rank=rank, w=cnt / cnt.sum(), area=cnt.sum())
        print(f"  {reg:36s} windows {len(idx):5d}  cells {len(keys):6d}  lattice pts {int(cnt.sum()):7d}", flush=True)

    # observed: the known sites, scored like validate_known_analogs.py
    known, tests, obs_rows = known_sites(), [], []
    tree = STRtree(polys)
    for k in known:
        hit = tree.query(Point(k["lon"], k["lat"]), predicate="within")
        if not len(hit):
            print(f"WARNING: {k['name']} is not inside any window; it is NOT tested"); continue
        reg = base["site"].iloc[hit[0]]
        trefs = [r for r, ref in enumerate(refs) if body_of(ref) in k["analog_for"]]
        best = P[hit].max(0)
        tests.append(dict(name=k["name"], region=reg, refs=trefs, best=best[trefs], rank=R[hit].min(0)))
        obs_rows += [best[r] for r in trefs]
    obs = np.median(np.stack(obs_rows), axis=0)                         # (scores,)
    n_tests = len(obs_rows)

    # sanity check against the committed known_analogs.json
    ka = json.load(open(PROCESSED / "known_analogs.json"))["summary"]
    for s, key in (("combined", "median_percentile_combined_best"), ("terrain", "median_percentile_terrain_best"),
                   ("illum", "median_percentile_illumination_best")):
        o = float(obs[list(SCORES).index(s)])
        assert abs(o - ka[key]) < 0.06, f"observed {s} median {o:.2f} != known_analogs.json {ka[key]}"
    assert n_tests == ka["n_tests"], (n_tests, ka["n_tests"])

    # null distributions
    allw = np.concatenate([cells[r]["w"] * cells[r]["area"] for r in regions]); allw /= allw.sum()
    allbest = np.concatenate([cells[r]["best"] for r in regions])
    null = {}
    for mode in ("global", "region_matched"):
        vals = []
        for t in tests:
            if mode == "global":
                ix = rng.choice(len(allw), size=N_PERM, p=allw); B = allbest
            else:
                c = cells[t["region"]]; ix = rng.choice(len(c["w"]), size=N_PERM, p=c["w"]); B = c["best"]
            vals.append(B[ix][:, t["refs"], :])                          # (N, tests of site, scores)
        null[mode] = np.median(np.concatenate(vals, axis=1), axis=1)    # (N, scores)

    def pval(mode, s):
        x = null[mode][:, s]
        return (1 + int((x >= obs[s]).sum())) / (N_PERM + 1)

    # Pu'u Hiwahine per lunar target (exact over the Mauna Kea valid area, no sampling)
    puu = next(t for t in tests if t["name"].startswith(PUU))
    mk = cells[puu["region"]]
    pu = {}
    for r, ref in enumerate(refs):
        if body_of(ref) != "moon":
            continue
        rk = int(puu["rank"][r])
        pu[ref] = {"rank": rk, "of": int((w["reference"] == ref).sum()),
                   "p_value_region_matched": round(float(mk["w"][mk["rank"][:, r] <= rk].sum()), 4),
                   "frac_region_above": round(float(mk["w"][mk["rank"][:, r] < rk].sum()), 4),
                   "pct_all_windows": round(float(puu["best"][puu["refs"].index(r), 0]), 1)}

    # Bonferroni over the lunar targets, and the headline sentence generated from the numbers (never typed by hand)
    for v in pu.values():
        v["p_bonferroni"] = round(min(1.0, v["p_value_region_matched"] * len(pu)), 4)
    best_t = min(pu, key=lambda t: (pu[t]["rank"], pu[t]["p_value_region_matched"]))
    b = pu[best_t]
    label = load_config()["sites"][best_t]["label"].split("·", 1)[1].split("(")[0].strip()
    headline = (f"Only {100 * b['p_value_region_matched']:.1f} % of Mauna Kea scores as high as NASA's exact test site for "
                f"{label} (p = {b['p_value_region_matched']:.3f}; p = {b['p_bonferroni']:.3f} after correcting for "
                f"{len(pu)} lunar targets)")

    names = list(SCORES)
    out = {"_stub": False,
           "_meta": meta(SEED, {"n_perm": N_PERM, "lattice_m": LATTICE_M, "window_km": 6, "n_tests": n_tests,
                                "n_sites": len(tests), "p_value": "(1 + #null>=observed) / (N + 1)",
                                "statistic": "median over the (site, target) tests of the best-window percentile"},
                        [PROCESSED / "windows.csv", PROCESSED / "known_analogs.json"]),
           "n_perm": N_PERM, "seed": SEED, "questions": QUESTIONS,
           "observed": {f"median_pct_{s}": round(float(obs[i]), 2) for i, s in enumerate(names)},
           "p_value": {m: {s: round(pval(m, i), 5) for i, s in enumerate(names)} for m in null},
           "null_summary": {m: {s: {"mean": round(float(null[m][:, i].mean()), 2),
                                    "p05": round(float(np.percentile(null[m][:, i], 5)), 2),
                                    "p95": round(float(np.percentile(null[m][:, i], 95)), 2)}
                                for i, s in enumerate(names)} for m in null},
           "headline": headline, "headline_target": best_t,
           "pu_uhiwahine": pu,
           "null_hist": {m: {"score": "combined", "bins": HIST_BINS.tolist(),
                             "counts": np.histogram(null[m][:, 0], HIST_BINS)[0].tolist()} for m in null},
           "sites": [{"name": t["name"], "region": t["region"], "n_tests": len(t["refs"])} for t in tests]}
    out["observed"] = {"median_pct_illum": out["observed"]["median_pct_illum"],
                       "median_pct_terrain": out["observed"]["median_pct_terrain"],
                       "median_pct_combined": out["observed"]["median_pct_combined"]}
    path = write("null", out)
    print(json.dumps({k: out[k] for k in ("observed", "p_value", "null_summary", "pu_uhiwahine")}, indent=1))
    print(f"→ {path}  ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
