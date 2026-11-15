"""Tests for the Moon & Mars context helpers.

The scripts load large raw files or call web services at import time, so the pure functions are extracted from the
source with `ast` and run on their own: no data and no network are needed (CI has neither).
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import ast
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def load_functions(script, names, **globs):
    """Compile only the named top-level functions of scripts/<script> into a namespace."""
    tree = ast.parse((ROOT / "scripts" / script).read_text(encoding="utf-8"))
    fns = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert {f.name for f in fns} == set(names), f"missing functions in {script}"
    ns = dict(np=np, math=math, re=re, **globs)
    exec(compile(ast.Module(fns, []), script, "exec"), ns)
    return ns


FAR = dict(N=7584, SCALE=40.0, N_AZ=72, MAX_D=150_000.0)


def test_ray_reach_at_the_pole_is_never_cut():
    f = load_functions("validate_far_horizons.py", ["ray_reach"], **FAR)["ray_reach"]
    r = f(np.array([0.0]), np.array([0.0]))        # the DEM edge is 151.68 km away in every direction
    assert r["share_rays_shorter_than_max"] == 0.0
    assert r["median_ray_km"] == 150.0 and r["outward_ray_km_min"] == 150.0


def test_ray_reach_near_the_dem_edge():
    f = load_functions("validate_far_horizons.py", ["ray_reach"], **FAR)["ray_reach"]
    half = FAR["N"] * FAR["SCALE"] / 2             # 151,680 m
    r = f(np.array([0.0]), np.array([half - 30_000.0]))   # 30 km from the top edge, on the +y axis
    assert r["outward_ray_km_min"] == r["outward_ray_km_max"] == 30.0   # the ray away from the pole stops at the edge
    assert 0.3 < r["share_rays_shorter_than_max"] < 0.5                 # only the rays pointing toward that edge are cut
    # Malapert's footprint: the README numbers (21-39 km, 49 %) must keep coming out of this function
    xs, ys = np.arange(-11_000 + 1500, 10_000 - 1500 + 1, 240.0), np.arange(111_000 + 1500, 132_000 - 1500 + 1, 240.0)
    X, Y = np.meshgrid(xs, ys)
    m = f(X.ravel(), Y.ravel())
    assert (m["outward_ray_km_min"], m["outward_ray_km_max"]) == (21.2, 39.3)
    assert m["share_rays_shorter_than_max"] == 0.487


def test_psr_agreement_counts():
    f = load_functions("validate_far_horizons.py", ["psr_agreement"])["psr_agreement"]
    lit = np.array([0.0, 0.0, 0.2, 0.5, 0.0])                 # our model: three points never lit
    nasa = np.array([True, True, True, False, False])         # NASA: three PSR points, two of them shared
    r = f(lit, nasa)
    assert r["model_psr_share"] == 0.6 and r["nasa_psr_share"] == 0.6
    assert r["agreement"] == 0.6                              # points 0, 1 and 3 agree
    assert r["precision"] == round(2 / 3, 3) and r["recall"] == round(2 / 3, 3)
    assert r["iou"] == 0.5                                    # 2 shared / 4 in either


MCD_TEXT = """##########
### MCD_v6.2 with climatology average solar scenario.
### Columns 2+ are Surface temperature (K)
### Line 1 is Local time (Martian hour)
##########
---- ||    0.00000e+00    1.20000e+01    2.40000e+01
-----------------------------------
+000 ||    1.90000e+02    2.70000e+02    1.90000e+02
+180 ||    1.80000e+02    2.60000e+02    1.80000e+02
+360 ||    1.90000e+02    2.70000e+02    1.90000e+02
##########
### MCD_v6.2 with climatology average solar scenario.
### Columns 2+ are Surface pressure (Pa)
##########
---- ||    0.00000e+00    1.20000e+01    2.40000e+01
-----------------------------------
+000 ||    7.00000e+02    7.10000e+02    7.00000e+02
+180 ||    6.00000e+02    6.10000e+02    6.00000e+02
+360 ||    7.00000e+02    7.10000e+02    7.00000e+02
"""


def test_mars_climate_database_tables_are_parsed():
    blocks = load_functions("mars_context.py", ["blocks"])["blocks"]
    b = blocks(MCD_TEXT)
    assert list(b) == ["Surface temperature (K)", "Surface pressure (Pa)"]     # both tables, in order
    t, p = b["Surface temperature (K)"], b["Surface pressure (Pa)"]
    assert t.shape == p.shape == (3, 3)                                         # the header row is not data
    assert t[1].tolist() == [180.0, 260.0, 180.0] and p[0, 1] == 710.0
    core = t[:-1, :-1]                                                          # what the script keeps (no Ls 360, no hour 24)
    assert core.min() == 180.0 and core.max() == 270.0 and core.mean() == 225.0


# ----------------------------------------------------------------------------- proof 2: light agreement helpers
def _light():
    import importlib.util
    spec = importlib.util.spec_from_file_location("light_agreement", ROOT / "scripts" / "stats" / "light_agreement.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)            # importing it needs no raw data: the light model is loaded inside main()
    return mod


def test_bland_altman_bias_and_limits():
    la = _light()
    nasa = np.linspace(0.1, 0.9, 101)
    r = la.bland_altman(nasa - 0.02, nasa)                  # a model that is uniformly 2 points darker
    assert r["bias"] == -0.02 and r["sd"] == 0.0
    assert r["loa_low"] == r["loa_high"] == -0.02 and r["n"] == 101
    d = np.array([-0.03, -0.01, 0.01, 0.03])                # mean 0, sample sd = sqrt(20/3)/100
    r = la.bland_altman(0.5 + d, np.full(4, 0.5))
    sd = float(np.std(d, ddof=1))
    assert abs(r["bias"]) < 1e-9 and r["sd"] == round(sd, 4)
    assert r["loa_high"] == round(1.96 * sd, 4) and r["loa_low"] == round(-1.96 * sd, 4)
    assert r["share_within_loa"] == 1.0


def test_density_counts_every_point_once():
    la = _light()
    model, nasa = np.array([0.0, 0.01, 0.5, 1.0, 1.0]), np.array([0.0, 0.01, 0.5, 1.0, 0.0])
    d = la.density(model, nasa, bins=10)
    assert sum(c for _, _, c in d["cells"]) == 5 and d["max_count"] == 2
    assert [0, 0, 2] in d["cells"]                          # the two points near the origin share a cell
    assert [9, 9, 1] in d["cells"] and [9, 0, 1] in d["cells"]   # the value 1.0 falls in the last bin, not outside


def test_subsample_is_reproducible_and_grid_thinning():
    la = _light()
    a, b = la.subsample(5000, 100), la.subsample(5000, 100)
    assert (a == b).all() and len(set(a.tolist())) == 100 and (np.diff(a) > 0).all()
    assert la.subsample(7, 100).tolist() == list(range(7))  # fewer points than the cap: keep them all
    t, step = la.thin_grid(np.zeros((113, 90)), max_side=64)
    assert step == 2 and t.shape == (57, 45)
    assert la.to_list(np.array([[1.23456, np.nan]])) == [[1.235, None]]
