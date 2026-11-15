"""Fact-check of the deck and project page: every number in docs/numbers.json is recomputed from data/processed.

docs/numbers.json (filled by Angel) lists each number as it is written on a slide or on the project page:

    {"numbers": [
      {"key": "blind.rank_of_n", "text": "#1 of 10,424 Earth windows", "where": "slide 1"},
      {"key": "light.rho_far",   "text": "ρ 0.92–0.99 vs NASA LOLA",  "where": "slide 4"}
    ]}

The test passes when the value of `key`, computed now from data/processed (formatted as below), appears in `text`.
If a rerun changes a result, CI fails and names the slide. See every key and its current value with:

    python tests/test_factcheck_numbers.py          (add --json for a numbers.json skeleton with every key)

Formatting: Python rounding (half to even), en dash ranges, thousands with a comma, as in the README.
AI-assisted (Claude); reviewed by the author."""
import csv
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
NUMBERS = ROOT / "docs" / "numbers.json"


def load(name):
    return json.loads((PROC / f"{name}.json").read_text(encoding="utf-8"))


def rng(values, d):
    return f"{min(values):.{d}f}–{max(values):.{d}f}"


def known_ranks():
    spec = importlib.util.spec_from_file_location("export_data", ROOT / "web" / "tools" / "export_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.known_ranks(load("known_analogs"))


def best_windows():
    best = {}
    with open(PROC / "windows.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if float(r["window_km"]) == 6 and (r["reference"] not in best or float(r["score_combined"]) > float(best[r["reference"]]["score_combined"])):
                best[r["reference"]] = r
    return best


def registry():
    """key -> (value as written, what it is). Every value is computed from data/processed."""
    out = {}

    def put(k, v, what):
        out[k] = (v, what)

    # blind rediscovery of NASA's Mauna Kea test site (Pu'u Hiwahine)
    ranks = known_ranks()
    lunar = {ref: v for ref, sites in ranks.items() if ref.startswith("moon_") for name, v in sites.items() if "Hiwahine" in name}
    ref, b = min(lunar.items(), key=lambda kv: kv[1]["rank"])
    put("blind.rank", f"#{b['rank']}", f"rank of Pu'u Hiwahine for {ref}, best of the 6 lunar sites")
    put("blind.n", f"{b['n']:,}", "Earth windows ranked per target")
    put("blind.rank_of_n", f"#{b['rank']} of {b['n']:,}", "blind-test headline")
    put("blind.top02_count", str(sum(1 for v in lunar.values() if round(100 * v["rank"] / v["n"], 1) <= 0.2)), "lunar sites with Pu'u Hiwahine in the top 0.2 %")
    put("blind.top5_count", str(sum(1 for v in lunar.values() if 100 * v["rank"] / v["n"] <= 5)), "lunar sites with Pu'u Hiwahine in the top 5 %")
    for r, v in sorted(lunar.items()):
        put(f"blind.rank.{r}", f"#{v['rank']:,}", f"rank of Pu'u Hiwahine for {r}")

    # light model vs NASA LOLA, permanent shadow vs LPSR
    sites = load("far_horizons")["sites"].values()
    put("light.rho_far", rng([s["V3_far_curved"]["spearman_rho"] for s in sites], 2), "Spearman ρ, far horizons (150 km)")
    put("light.rho_local", rng([s["V1_local_flat"]["spearman_rho"] for s in sites], 2), "Spearman ρ, local DEM only")
    put("light.mae_pp", rng([100 * s["V3_far_curved"]["mean_abs_error"] for s in sites], 1), "mean absolute error, percentage points")
    psr = [s["psr"] for s in sites if s.get("psr")]
    put("psr.agreement_pct", rng([100 * p["agreement"] for p in psr], 1), "permanent-shadow agreement with NASA LPSR, %")
    put("psr.iou", rng([p["iou"] for p in psr], 2), "permanent-shadow IoU with NASA LPSR")
    put("light.sites", str(len(list(load("far_horizons")["sites"]))), "lunar sites validated against LOLA")

    # known analogs
    s = load("known_analogs")["summary"]
    put("known.median_pct_illumination", f"{s['median_percentile_illumination_best']:.0f}", "median percentile of known analogs, illumination")
    put("known.median_pct_terrain", f"{s['median_percentile_terrain_best']:.0f}", "median percentile of known analogs, terrain")
    put("known.n_tests", str(s["n_tests"]), "site × target tests")

    # thermal gap
    t = load("thermal_gap")["summary"]
    put("thermal.moon_gap_K", rng(list(t["gap_to_coldest_earth_mean_K"].values()), 0), "lunar sites colder than Earth's coldest region (mean), K")
    put("thermal.coldest_earth_K", f"{t['coldest_earth_mean_K']:.0f}", "coldest Earth region, mean K")
    put("thermal.mars_mean_K", rng(t["mars_mean_K"], 0), "Mars sites, mean K")
    put("thermal.mars_gap_K", rng(list(t["mars_gap_to_coldest_earth_mean_K"].values()), 0), "Mars sites colder than Earth's coldest region, K")

    # robustness: illumination weight 0.5–2× (sensitivity.json)
    sens = load("sensitivity")
    w = sens["illumination_weight"]
    keep = [i for i, x in enumerate(w) if 0.5 <= x <= 2]
    ov = [v[i] for v in sens["top10_overlap_vs_equal"].values() for i in keep]
    put("stability.top10_kept", f"{min(ov)}–{max(ov)}", "of the top 10 kept with the illumination weight at 0.5–2×")

    # scale of the search
    best = best_windows()
    cfg = __import__("yaml").safe_load((ROOT / "config" / "sites.yaml").read_text(encoding="utf-8"))["sites"]
    put("search.targets", str(len(best)), "targets (Moon + Mars)")
    put("search.moon_targets", str(sum(1 for r in best if r.startswith("moon_"))), "lunar targets")
    put("search.mars_targets", str(sum(1 for r in best if r.startswith("mars_"))), "Mars targets")
    put("search.regions", str(sum(1 for v in cfg.values() if v.get("role") == "candidate")), "Earth regions")
    with open(PROC / "windows.csv", newline="", encoding="utf-8") as f:
        n = sum(1 for r in csv.DictReader(f) if r["reference"] == "moon_malapert" and float(r["window_km"]) == 6)
    put("search.windows", f"{n:,}", "6 km Earth windows per target")
    with open(PROC / "earth_lst_windows.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    put("lst.windows_with_data", f"{sum(1 for r in rows if r['lst_mean_K'] not in ('', 'nan'))
                                      :,} of {len(rows):,}", "windows with MODIS LST")

    # scalability (scripts/benchmark_tile.py)
    if (PROC / "benchmark_tile.json").exists():
        bt = load("benchmark_tile")
        put("scale.seconds_per_tile", f"{bt['median_seconds']['total_without_reproject']:.0f}", "seconds per 1° tile, one core, without reprojection")
        put("scale.shadow_share_pct", f"{100 * bt['median_seconds']['shadows'] / bt['median_seconds']['total_without_reproject']:.0f}", "% of that time spent on shadows")
        put("scale.core_hours_all_land", f"{bt['all_land_estimate']['core_hours']:,}", "core-hours for all land covered by GLO-30")
        put("scale.hours_on_64_cores", f"{bt['all_land_estimate']['hours_on_64_cores']:.1f}", "hours for all land on 64 cores")

    # best Earth window per target (README table)
    for r, row in sorted(best.items()):
        put(f"best.{r}.score", f"{float(row['score_combined']):.0f}", f"best combined score for {r}")
        put(f"best.{r}.terrain", f"{float(row['score_terrain']):.0f}", f"terrain score of that window")
        put(f"best.{r}.illumination", f"{float(row['score_illumination']):.0f}", f"illumination score of that window")
        put(f"best.{r}.region", cfg[row["site"]]["label"].split("·")[-1].split("(")[0].split(",")[0].strip(), "its region")
    return out


def entries():
    if not NUMBERS.exists():
        return []
    return json.loads(NUMBERS.read_text(encoding="utf-8")).get("numbers", [])


@pytest.fixture(scope="module")
def reg():
    return registry()


def test_registry_is_computable(reg):
    assert len(reg) > 30 and all(v for v, _ in reg.values())


@pytest.mark.skipif(not NUMBERS.exists(), reason="docs/numbers.json not written yet (Angel, after 19:00)")
def test_every_deck_number_matches_the_data(reg):
    bad = []
    for e in entries():
        if e.get("key") not in reg:
            bad.append(f"{e.get('where', '?')}: unknown key {e.get('key')!r} (run python tests/test_factcheck_numbers.py)")
        elif reg[e["key"]][0] not in e.get("text", ""):
            bad.append(f"{e.get('where', '?')}: {e['text']!r} should say {reg[e['key']][0]!r} ({reg[e['key']][1]})")
    assert not bad, "\n".join(bad)


if __name__ == "__main__":
    reg = registry()
    if "--json" in sys.argv:
        print(json.dumps({"numbers": [{"key": k, "text": v, "where": ""} for k, (v, _) in reg.items()]}, ensure_ascii=False, indent=1))
    else:
        w = max(map(len, reg))
        for k, (v, what) in reg.items():
            print(f"{k:{w}s}  {v:22s}  {what}")
