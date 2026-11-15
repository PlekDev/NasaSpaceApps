# AI-assisted (Claude, Anthropic); reviewed by the team.
"""Synthetic-data tests for scripts/earth_emit.py: quality filter, EMIT-10 weighting, unmapped IDs and window aggregation."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from affine import Affine
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import earth_emit as ee  # noqa: E402


def tables():
    cols = {m: [np.nan] * 3 for m in ee.EMIT10}
    matrix = pd.DataFrame(dict(Index=[1, 2, 3], Record=[10, 20, 30], Group=[1, 2, 2], **cols))
    matrix.loc[0, "Hematite"] = 0.4        # ID 1: hematite 0.4 + goethite 0.1 (group 1)
    matrix.loc[0, "Goethite"] = 0.1
    matrix.loc[1, "Gypsum"] = 1.0          # ID 2: gypsum (group 2)
    matrix.loc[2, "Kaolinite"] = -1        # ID 3: kaolinite "unknown but non-zero" (group 2)
    embedded = pd.DataFrame(dict(index=[1, 2, 3, 4], record=[10, 20, 30, 99], group=[1, 2, 2, 1]))   # ID 4: new in V002
    return ee.weight_tables(matrix, embedded)


def test_quality_filter_two_sigma():
    ids = np.array([5, 5, 5, 0, -9999])
    depth = np.array([0.10, 0.10, 0.10, 0.0, np.nan], np.float32)
    unc = np.array([0.04, 0.05, np.nan, 0.0, np.nan], np.float32)
    kept, valid = ee.classify(ids, depth, unc)
    assert kept.tolist() == [5, 0, 0, 0, 0]       # 0.10 > 2*0.04 kept; 0.10 == 2*0.05 rejected; NaN uncertainty rejected
    assert valid.tolist() == [True, True, True, True, False]


def test_weights_unknown_and_unmapped():
    t = tables()
    k1 = np.array([1, 4, 0, 0])
    k2 = np.array([2, 0, 3, 0])
    px = ee.pixel_layers(k1, k2, np.ones(4, bool), t)
    assert np.allclose(px["frac_iron_oxides"], [0.5, 0, 0, 0])          # weighted share, not presence
    assert np.allclose(px["frac_sulfates"], [1, 0, 0, 0])
    assert np.allclose(px["frac_clays"], [0, 0, 0, 0])                   # -1 never enters the weighted share
    assert np.allclose(px["frac_present_unweighted_clays"], [0, 0, 1, 0])
    assert np.allclose(px["frac_unmapped_g1"], [0, 1, 0, 0]) and np.allclose(px["frac_unmapped_g2"], 0)
    assert np.allclose(px["frac_no_detection"], [0, 0, 0, 1])


def test_embedded_table_mismatch_stops():
    cols = {m: [np.nan] for m in ee.EMIT10}
    matrix = pd.DataFrame(dict(Index=[1], Record=[10], Group=[1], **cols))
    try:
        ee.weight_tables(matrix, pd.DataFrame(dict(index=[1], record=[11], group=[1])))
    except ValueError:
        return
    raise AssertionError("a record mismatch must raise")


def test_one_observation_per_granule_and_window_stats():
    grid = ee.RegionGrid(0.0, 0.10, 0.01, (10, 10))
    zeros = {k: np.zeros((2, 2), np.float32) for k in ee.FRACTION_COLS}
    # granule A: 4 pixels inside the same cell (0, 0): 2 gypsum, 2 nothing -> one observation with sulfates 0.5
    pa = dict(zeros, frac_sulfates=np.array([[1, 1], [0, 0]], np.float32))
    lon = np.array([[0.002, 0.004], [0.006, 0.008]])
    lat = np.array([[0.098, 0.098], [0.096, 0.096]])
    grid.add(pa, np.ones((2, 2), bool), lon, lat, "20240101")
    # granule B: one pixel in cell (0, 0), no gypsum
    grid.add(dict(zeros), np.array([[True, False], [False, False]]), lon, lat, "20240601")
    assert grid.n_obs[0, 0] == 2 and grid.n_obs.sum() == 2
    res = ee.window_stats(grid, [(dict(site="a", i=0, j=0), box(0.0, 0.08, 0.02, 0.10)),
                                 (dict(site="a", i=0, j=1), box(0.06, 0.0, 0.10, 0.04))])
    a, b = res.iloc[0], res.iloc[1]
    assert a["n_obs_valid"] == 2 and a["n_pixels_valid"] == 1 and a["coverage_frac"] == 0.25
    assert abs(a["frac_sulfates"] - 0.25) < 1e-6          # (0.5 + 0) / 2 observations: both granules count equally
    assert a["n_granules"] == 2 and a["granule_dates"] == "20240101;20240601"
    assert b["coverage_frac"] == 0.0 and np.isnan(b["frac_sulfates"]) and b["n_granules"] == 0


def test_usable_filters_cloud_and_footprint():
    def g(name, cc, x0, x1):
        pts = [dict(Longitude=x, Latitude=y) for x, y in [(x0, 0), (x1, 0), (x1, 1), (x0, 1), (x0, 0)]]
        return {"meta": {"native-id": name}, "umm": {"CloudCover": cc, "SpatialExtent": {"HorizontalSpatialDomain": {
            "Geometry": {"GPolygons": [{"Boundary": {"Points": pts}}]}}}}}
    keep = ee.usable([g("b", 20, 0, 0.5), g("a", 5, 0.5, 1), g("c", 21, 0, 1), g("d", 0, 2, 3)], box(0, 0, 1, 1))
    assert [x["meta"]["native-id"] for x in keep] == ["a", "b"]
