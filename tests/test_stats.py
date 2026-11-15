# AI-assisted (Claude, Anthropic); reviewed by the team.
"""Tests for the validation statistics (scripts/stats/) and their web exporter (web/tools/exports/stats.py)."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_stub_has_final_shape():
    ex = _load(ROOT / "web" / "tools" / "exports" / "stats.py", "stats_export")
    s = ex.stubs()
    assert set(s) == set(ex.SRC)
    targets = [k for k in s["roc"] if not k.startswith("_")]
    assert len(targets) == 9 and sum(t.startswith("moon_") for t in targets) == 6
    for name, obj in s.items():
        assert obj["_stub"] is True and "_meta" in obj, name
    n = s["null"]
    assert set(n["p_value"]) == {"global", "region_matched"} and set(n["questions"]) == set(n["p_value"])
    assert set(n["pu_uhiwahine"]) == {t for t in targets if t.startswith("moon_")}
    for t in targets:
        assert {"fpr", "tpr", "auc", "auc_ci95", "n_pos", "n_neg"} <= set(s["roc"][t])
        assert len(s["bootstrap"][t]) == 20 and {"window_id", "site", "score", "ci95"} <= set(s["bootstrap"][t][0])
        assert {"p_top1", "p_top10", "kendall_tau_3_6", "kendall_tau_6_12", "kendall_tau_3_12"} <= set(s["stability"][t])
        assert {r["feature"] for r in s["tornado"][t]} == set(ex.FEATURES)
        assert {"control", "candidates"} <= set(s["controls"][t])
    assert set(s["bootstrap"]["n_ref"]) == set(targets)


# ---- helpers of scripts/stats/ on synthetic data with known answers
import sys
import numpy as np
sys.path.insert(0, str(ROOT / "scripts" / "stats"))


def test_pct_below_and_stable_rank():
    from common import pct_below, stable_rank
    s = np.sort(np.array([1.0, 2.0, 2.0, 3.0]))
    assert pct_below(s, np.array([2.0, 3.0, 0.5])).tolist() == [25.0, 75.0, 0.0]   # strictly lower, as validate_known_analogs.py
    assert stable_rank([5.0, 7.0, 7.0, 1.0]).tolist() == [3, 1, 2, 4]              # ties keep file order


def test_known_sites_read_without_running_script():
    from common import known_sites
    k = known_sites()
    assert len(k) == 8 and all({"name", "lat", "lon", "analog_for"} <= set(x) for x in k)


def test_auc_known_values():
    from roc import auc, roc_curve
    neg = np.sort(np.array([0.0, 1.0, 2.0, 3.0]))
    assert auc(np.array([10.0, 11.0]), neg) == 1.0
    assert auc(np.array([-1.0]), neg) == 0.0
    assert auc(np.array([1.0]), neg) == (1 + 0.5) / 4          # one below, one tie
    fpr, tpr = roc_curve(np.array([5.0, 6.0]), np.array([1.0, 2.0]))
    assert fpr[0] == 0 and tpr[0] == 0 and fpr[-1] == 1 and tpr[-1] == 1
    assert tpr[np.flatnonzero(fpr == 0)].max() == 1.0          # perfect separation reaches tpr 1 at fpr 0


def test_cluster_bootstrap_is_seeded_and_bounded():
    from roc import bootstrap_auc
    sites = [np.array([5.0, 5.1]), np.array([0.5])]
    neg = np.arange(10, dtype=float) / 10
    a = bootstrap_auc(sites, neg, np.random.default_rng(1), b=200)
    b = bootstrap_auc(sites, neg, np.random.default_rng(1), b=200)
    assert np.array_equal(a, b) and a.min() >= 0 and a.max() <= 1


def test_lattice_cells_area_shares():
    """Two overlapping squares (like 6 km windows with a 3 km step): the overlap cell holds 1/3 of the union area."""
    from null_test import lattice_cells
    from shapely.geometry import box
    d = 0.01
    keys, cnt = lattice_cells([box(0, 0, 2 * d, 2 * d), box(d, 0, 3 * d, 2 * d)], spacing_m=50)
    share = dict(zip(keys, cnt / cnt.sum()))
    assert set(share) == {(0,), (0, 1), (1,)}
    for v in share.values():
        assert abs(v - 1 / 3) < 0.03


def test_combined_from_dims_equal_weights_is_rms_over_all_features():
    from common import combined_from_dims, dim_distances, KEYS
    d = np.random.default_rng(0).normal(size=(5, len(KEYS)))
    want = 100 * np.exp(-np.sqrt((d ** 2).mean(-1)))
    assert np.allclose(combined_from_dims(dim_distances(d)), want)


def test_top_probabilities_follow_the_weights():
    """Window 0 matches in terrain only, window 1 in illumination only: the heavier dimension decides #1."""
    from stability import top_probabilities
    D = {"terrain": np.array([0.0, 2.0, 3.0]), "illumination": np.array([2.0, 0.0, 3.0])}
    W = {"terrain": np.array([4.0, 0.25]), "illumination": np.array([0.25, 4.0])}
    p1, p10 = top_probabilities(D, W, ["a", "b", "c"], k=2)
    assert p1 == {"a": 0.5, "b": 0.5} and p10 == {"a": 1.0, "b": 1.0}


def test_jaccard_area():
    from stability import jaccard_area
    from shapely.geometry import box
    a, b = [box(0, 0, 2, 2)], [box(1, 0, 3, 2)]
    assert abs(jaccard_area(a, a) - 1) < 1e-9
    assert jaccard_area(a, [box(5, 5, 6, 6)]) == 0
    assert abs(jaccard_area(a, b) - 1 / 3) < 1e-9


def test_bootstrap_identical_reference_windows_give_zero_width():
    from bootstrap import bootstrap_scores
    X = np.random.default_rng(0).normal(size=(30, 7))
    R = np.tile(X[0], (5, 1))                                  # all reference windows identical to window 0
    S = bootstrap_scores(X, R, np.ones(7), np.random.default_rng(0), b=60)
    assert np.allclose(S, S[0]) and np.isclose(S[0, 0], 100)


def test_tornado_and_decomposition():
    from tornado import decomposition, score_from_d, tornado_rows
    d = np.zeros((1, 7)); d[0, 3] = 1.0
    sh = decomposition(d)
    assert np.isclose(sh.sum(), 1) and sh[0, 3] == 1
    rows = {r["feature"]: r for r in tornado_rows(d)}
    assert rows["rough"]["removed"] > 0                       # removing the only differing feature makes it identical
    assert np.isclose(score_from_d(np.zeros((1, 7)))[0], 100)
    assert rows["relief"]["low"] == rows["relief"]["high"] < 0
