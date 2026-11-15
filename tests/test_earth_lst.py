# AI-assisted (Claude, Anthropic); reviewed by the team.
"""Synthetic-data tests for the per-pixel and per-window logic of scripts/earth_lst.py (no network)."""
import sys
from pathlib import Path

import numpy as np
from affine import Affine
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import earth_lst as el  # noqa: E402

T, H, W = 46, 4, 4


def test_qc_rule():
    # bits 0-1 mandatory flag, bits 6-7 LST error
    qc = np.array([0b00000000,   # good
                   0b00000001,   # other quality, error <= 1 K  -> accepted
                   0b01000001,   # other quality, error <= 2 K  -> accepted
                   0b10000001,   # other quality, error <= 3 K  -> rejected
                   0b00000010,   # cloud                         -> rejected
                   0b00000011], dtype=np.uint8)
    assert el.qc_ok(qc).tolist() == [True, True, True, False, False, False]


def test_pixel_stats_percentiles_and_thresholds():
    good = np.zeros((T, H, W), np.uint8)
    day = np.full((T, H, W), 300.0, np.float32)
    night = np.full((T, H, W), 270.0, np.float32)
    night[0, 0, 0] = 200.0                      # undetected cloud: false cold value, must not set the minimum
    day[:, 1, 1] = np.nan
    day[:el.MIN_COMPOSITES - 1, 1, 1] = 310.0   # only 11 valid day composites -> below the threshold
    s = el.pixel_stats(day, night, good, good)
    assert s["lst_min_K"][0, 0] == 270.0        # P05, not the raw minimum
    assert s["lst_max_K"][0, 0] == 300.0
    assert s["lst_range_K"][0, 0] == 30.0
    assert abs(s["lst_mean_K"][2, 2] - 285.0) < 1e-4
    assert np.isnan(s["lst_max_K"][1, 1]) and np.isnan(s["lst_range_K"][1, 1])  # 11 < 12 composites
    assert s["n_valid_day"][2, 2] == T and s["n_valid_night"][2, 2] == T


def test_pixel_stats_rejects_cloudy_qc():
    cloud = np.full((T, H, W), 0b10, np.uint8)
    good = np.zeros((T, H, W), np.uint8)
    day = np.full((T, H, W), 300.0, np.float32)
    s = el.pixel_stats(day, np.full((T, H, W), 270.0, np.float32), good, cloud)
    assert np.isnan(s["lst_min_K"]).all() and np.isfinite(s["lst_max_K"]).all()


def test_decode_lst_scale_and_fill():
    raw = np.array([0, 13500, 14000], np.float32)             # raw digital numbers
    out = el.decode_lst(raw)
    assert np.isnan(out[0]) and np.allclose(out[1:], [270.0, 280.0])
    assert np.allclose(el.decode_lst(np.array([0, 270.5], np.float32))[1], 270.5)   # already Kelvin


def test_aggregate_windows_mean_and_validity_threshold():
    # 10x10 grid, 0.01 deg pixels, origin at lon 0 / lat 0.10 (north-up)
    tr = Affine(0.01, 0, 0.0, 0, -0.01, 0.10)
    full = np.arange(100, dtype=np.float32).reshape(10, 10)
    stats = dict(lst_min_K=full.copy(), lst_max_K=full + 40, lst_mean_K=full + 20, lst_range_K=np.full((10, 10), 40, np.float32),
                 n_valid_day=np.full((10, 10), 40, np.float32), n_valid_night=np.full((10, 10), 30, np.float32))
    stats["lst_min_K"][0:2, 0:2] = np.nan                       # kill 4 pixels in the top-left corner
    win_ok = box(0.04, 0.02, 0.08, 0.06)                        # 4x4 px, no invalid pixels
    win_half = box(0.0, 0.08, 0.04, 0.10)                       # 4x2 px, 4 of 8 invalid -> exactly 50 % -> kept
    win_bad = box(0.0, 0.07, 0.02, 0.10)                        # 2x3 px, 4 of 6 invalid -> dropped
    res = el.aggregate_windows(stats, tr, [(dict(site="a", i=0, j=0), win_ok), (dict(site="a", i=0, j=1), win_half),
                                           (dict(site="a", i=0, j=2), win_bad)])
    r0, r1, r2 = res.iloc[0], res.iloc[1], res.iloc[2]
    rows, cols = np.mgrid[4:8, 4:8]                             # pixels of win_ok: rows 4-7 (lat .06-.02), cols 4-7
    expect_min = float(full[rows, cols].mean())
    assert r0["n_pixels"] == 16 and r0["n_pixels_valid"] == 16
    assert abs(r0["lst_min_K"] - round(expect_min, 2)) < 0.01
    assert abs(r0["lst_range_K"] - 40.0) < 1e-6 and r0["n_valid_day"] == 40 and r0["n_valid_night"] == 30
    assert r1["n_pixels_valid"] == 4 and np.isfinite(r1["lst_min_K"])
    assert r2["n_pixels_valid"] == 2 and np.isnan(r2["lst_min_K"]) and np.isnan(r2["lst_range_K"])


def test_task_payload_is_geographic_geotiff_with_all_layers():
    p = el.task_payload("earth_iceland_askja", {"file": "Copernicus_DSM_COG_10_N65_00_W017_00_DEM.tif"})
    assert p["params"]["output"] == {"format": {"type": "geotiff"}, "projection": "geographic"}
    assert [l["layer"] for l in p["params"]["layers"]] == el.LAYERS
    ring = p["params"]["geo"]["features"][0]["geometry"]["coordinates"][0]
    assert min(x for x, _ in ring) < -17 and max(x for x, _ in ring) > -16 and min(y for _, y in ring) < 65
