"""Fact-check: every headline number in the README and the project-page draft is recomputed from data/processed.

If a rerun changes a result, this test fails and names the claim, so no stale number reaches the judges.
Numbers are formatted the way the documents write them: Python rounding (half to even, as in the figures and the web app;
90.5 -> 90), en dash ranges."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import csv
import importlib.util
import json
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
README = (ROOT / "README.md").read_text(encoding="utf-8")
SUBMISSION = (ROOT / "docs" / "SUBMISSION.md").read_text(encoding="utf-8")
DOCS = README + "\n" + SUBMISSION


def load(name):
    return json.loads((PROC / f"{name}.json").read_text(encoding="utf-8"))


def rng(values, d):
    return f"{min(values):.{d}f}–{max(values):.{d}f}"


def claim(text):
    assert text in DOCS, f"claim {text!r} not found in README.md or docs/SUBMISSION.md (the data say this; update the text)"


@pytest.fixture(scope="module")
def ranks():
    spec = importlib.util.spec_from_file_location("export_data", ROOT / "web" / "tools" / "export_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.known_ranks(load("known_analogs"))


def test_blind_rediscovery(ranks):
    lunar = {ref: v for ref, sites in ranks.items() if ref.startswith("moon_") for name, v in sites.items() if "Hiwahine" in name}
    assert len(lunar) == 6
    best = min(lunar.items(), key=lambda kv: kv[1]["rank"])
    assert best[0] == "moon_malapert" and best[1]["rank"] == 1
    n = best[1]["n"]
    claim(f"#1 of {n:,}")
    top02 = sum(1 for v in lunar.values() if round(100 * v["rank"] / v["n"], 1) <= 0.2)
    top5 = sum(1 for v in lunar.values() if 100 * v["rank"] / v["n"] <= 5)
    assert (top02, top5) == (4, 6), "README says top 0.2 % for four of six and top 5 % for all six"
    claim("top 0.2 % for four of the six")


def test_far_horizons():
    sites = load("far_horizons")["sites"]
    far = [s["V3_far_curved"]["spearman_rho"] for s in sites.values()]
    local = [s["V1_local_flat"]["spearman_rho"] for s in sites.values()]
    mae = [100 * s["V3_far_curved"]["mean_abs_error"] for s in sites.values()]
    claim(f"ρ = {rng(far, 2)}")
    claim(f"ρ {rng(local, 2)}")
    claim(f"{rng(mae, 1)} percentage points")
    psr = [s["psr"] for s in sites.values() if s.get("psr")]
    claim(f"{rng([100 * p['agreement'] for p in psr], 1)} %")
    claim(f"IoU {rng([p['iou'] for p in psr], 2)}")


def test_known_analog_percentiles():
    s = load("known_analogs")["summary"]
    claim(f"{s['median_percentile_illumination_best']:.0f}th percentile")
    assert s["n_tests"] == 48


def test_thermal_gap():
    t = load("thermal_gap")["summary"]
    gaps = list(t["gap_to_coldest_earth_mean_K"].values())
    claim(f"{rng(gaps, 0)} K")
    claim(f"{t['coldest_earth_mean_K']:.0f} K")
    claim(f"{rng(t['mars_mean_K'], 0)} K")
    claim(f"{rng(list(t['mars_gap_to_coldest_earth_mean_K'].values()), 0)} K")


def test_best_window_table():
    """The README 'Key results' table: best window per reference, scores rounded as Python does."""
    best = {}
    with open(PROC / "windows.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if float(r["window_km"]) != 6:
                continue
            ref, c = r["reference"], float(r["score_combined"])
            if ref not in best or c > float(best[ref]["score_combined"]):
                best[ref] = r
    rows = re.findall(r"^\| (Moon|Mars) · ([^|]+?) \| [^|]*\(([-−\d.]+), ([-−\d.]+)\) \| (\d+) \| (\d+) \| (\d+) \|$", README, re.M)
    assert len(rows) == len(best) == 9, f"expected 9 table rows, found {len(rows)}"
    labels = {k: v["label"] for k, v in yaml.safe_load((ROOT / "config" / "sites.yaml").read_text(encoding="utf-8"))["sites"].items()}
    for body, name, lat, lon, comb, terr, illum in rows:
        short = name.split(" (")[0].strip()
        refs = [ref for ref in best if short in labels[ref]]
        assert len(refs) == 1, f"{name}: matches {refs}"
        r = best[refs[0]]
        assert (f"{float(r['lat']):.3f}", f"{float(r['lon']):.3f}") == (f"{float(lat.replace('−', '-')):.3f}", f"{float(lon.replace('−', '-')):.3f}"), f"{name}: coordinates"
        got = tuple(f"{float(r[k]):.0f}" for k in ("score_combined", "score_terrain", "score_illumination"))
        assert got == (comb, terr, illum), f"{name}: README {comb}/{terr}/{illum}, data {got}"


def test_window_count():
    with open(PROC / "windows.csv", newline="", encoding="utf-8") as f:
        n = sum(1 for r in csv.DictReader(f) if r["reference"] == "moon_malapert" and float(r["window_km"]) == 6)
    claim(f"{n:,} windows")
