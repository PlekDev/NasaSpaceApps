"""ROC curve and AUC per target (proof 1): does the score separate windows that contain known analog sites from the rest?

Positives: the 6 km windows that contain a known analog site used for the target's body (KNOWN list of
scripts/validate_known_analogs.py). Negatives: every other window of the target. Score: score_combined
(AUC for terrain and illumination is also reported).

AUC = P(score of a random positive > score of a random negative), ties count 1/2 (Mann-Whitney).
95 % CI: cluster bootstrap. Windows of one site overlap and are not independent, so each replicate resamples the
SITES with replacement (all windows of a drawn site enter) and the negatives with replacement; B replicates, percentile CI.
With only 4-6 sites per body the CI is wide; the JSON carries n_sites and a warning.

Writes data/processed/stats/roc.json.  Run: python scripts/stats/roc.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from shapely import STRtree
from shapely.geometry import Point, Polygon
from common import PROCESSED, SCORES, SEED, body_of, known_sites, load_windows, meta, write

B = 2000
MAX_CURVE_PTS = 200


def auc(pos, neg_sorted):
    """Mann-Whitney AUC with ties = 1/2; neg_sorted must be sorted ascending."""
    lo = np.searchsorted(neg_sorted, pos, side="left")
    hi = np.searchsorted(neg_sorted, pos, side="right")
    return float((lo + 0.5 * (hi - lo)).sum() / (len(pos) * len(neg_sorted)))


def roc_curve(pos, neg):
    """(fpr, tpr) for thresholds at every distinct score, from the strictest to the loosest."""
    thr = np.unique(np.concatenate([pos, neg]))[::-1]
    ps, ns = np.sort(pos), np.sort(neg)
    tpr = 1 - np.searchsorted(ps, thr, side="left") / len(ps)
    fpr = 1 - np.searchsorted(ns, thr, side="left") / len(ns)
    fpr, tpr = np.r_[0.0, fpr], np.r_[0.0, tpr]
    if len(fpr) > MAX_CURVE_PTS:
        keep = np.unique(np.r_[np.linspace(0, len(fpr) - 1, MAX_CURVE_PTS).astype(int), np.flatnonzero(np.diff(tpr, prepend=0) > 0)])
        fpr, tpr = fpr[keep], tpr[keep]
    return fpr, tpr


def bootstrap_auc(site_pos, neg, rng, b=B):
    """Cluster bootstrap: resample sites (lists of positive scores) and negatives."""
    out = np.empty(b)
    k = len(site_pos)
    for n in range(b):
        pos = np.concatenate([site_pos[i] for i in rng.integers(0, k, k)])
        out[n] = auc(pos, np.sort(rng.choice(neg, size=len(neg), replace=True)))
    return out


def main():
    rng = np.random.default_rng(SEED)
    w = load_windows()
    known = known_sites()
    out = {"_stub": False,
           "_meta": meta(SEED, {"bootstrap": B, "ci": "percentile 2.5-97.5, cluster bootstrap over sites", "window_km": 6,
                                "positives": "windows containing a known analog site of the target's body"},
                        [PROCESSED / "windows.csv"])}
    for ref, g in w.groupby("reference", sort=False):
        g = g.reset_index(drop=True)
        tree = STRtree([Polygon(json.loads(s)) for s in g["polygon"]])
        sites = {k["name"]: tree.query(Point(k["lon"], k["lat"]), predicate="within")
                 for k in known if body_of(ref) in k["analog_for"]}
        sites = {n: ix for n, ix in sites.items() if len(ix)}
        is_pos = np.zeros(len(g), bool)
        for ix in sites.values():
            is_pos[ix] = True
        rec = {"auc_by_score": {}, "auc_ci95_by_score": {}}
        state = rng.bit_generator.state                       # same bootstrap draws for every score (paired CIs)
        for s, col in SCORES.items():
            sc = g[col].to_numpy()
            pos, neg = sc[is_pos], sc[~is_pos]
            a = auc(pos, np.sort(neg))
            rng.bit_generator.state = state
            bs = bootstrap_auc([sc[ix] for ix in sites.values()], neg, rng)
            ci = [round(float(np.percentile(bs, 2.5)), 4), round(float(np.percentile(bs, 97.5)), 4)]
            rec["auc_by_score"][s] = round(a, 4)
            rec["auc_ci95_by_score"][s] = ci
            if s == "combined":
                fpr, tpr = roc_curve(pos, neg)
                rec.update(fpr=np.round(fpr, 4).tolist(), tpr=np.round(tpr, 4).tolist(), auc=round(a, 4), auc_ci95=ci,
                           n_pos=int(is_pos.sum()), n_neg=int((~is_pos).sum()), n_sites=len(sites), sites=list(sites))
        if rec["n_sites"] < 10:
            rec["warning"] = (f"only {rec['n_sites']} known sites ({rec['n_pos']} overlapping windows): "
                              "the AUC is descriptive and its CI is wide")
        out[ref] = rec
        print(f"{ref:24s} " + "  ".join(f"{s} {rec['auc_by_score'][s]:.3f} {rec['auc_ci95_by_score'][s]}" for s in SCORES)
              + f"  n_pos {rec['n_pos']} ({rec['n_sites']} sites)")
    print("→", write("roc", out))


if __name__ == "__main__":
    main()
