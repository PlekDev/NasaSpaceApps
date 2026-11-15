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
