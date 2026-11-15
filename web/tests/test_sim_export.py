"""The sim exporter: the exporter contract (index.json, manifest) and the int16 grids Mission Rehearsal reads.

Runs on the committed data/processed/sim/ (no data/cache/ needed). AI-assisted (Claude); reviewed by the author."""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "processed" / "sim"
OUT = ROOT / "web" / "public" / "data" / "sim"

pytestmark = pytest.mark.skipif(not (SRC / "targets.json").exists(), reason="data/processed/sim/ not built")


@pytest.fixture(scope="module")
def exported():
    subprocess.run([sys.executable, "-I", str(ROOT / "web" / "tools" / "exports" / "sim.py")], cwd=ROOT, check=True)
    return json.loads((OUT / "index.json").read_text(encoding="utf-8"))


def test_index_lists_every_file(exported):
    assert exported["generated"] and len(exported["targets"]) == 9
    for f in exported["files"]:
        assert (OUT / f).is_file(), f
    assert sorted(exported["files"]) == exported["files"]


def test_grids_decode_to_the_stated_range(exported):
    for t in exported["targets"]:
        meta = json.loads((OUT / f"{t}.json").read_text(encoding="utf-8"))
        assert meta["n"] == 200 and meta["dx"] == 30 and len(meta["windows"]) == 5
        assert [w["rank"] for w in meta["windows"]] == [1, 2, 3, 4, 5]
        assert len({w["site"] for w in meta["windows"]}) == 5, "one window per region"
        assert -90 <= meta["grid"]["lat"] <= 90 and 0 <= meta["grid"]["up_az"] < 360
        for g in [meta["grid"]] + meta["windows"]:
            assert 0 <= g["up_az"] < 360
            raw = (OUT / g["file"]).read_bytes()
            assert len(raw) == 200 * 200 * 2
            q = np.frombuffer(raw, "<i2")
            assert (q != -32768).all()
            z = g["offset"] + g["scale"] * q.astype(np.float64)
            assert abs(z.min() - g["min"]) <= g["scale"] and abs(z.max() - g["max"]) <= g["scale"]


def test_windows_match_windows_csv(exported):
    import csv
    best = {}
    with open(ROOT / "data" / "processed" / "windows.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if float(r["window_km"]) == 6:
                key = (r["reference"], r["site"], int(r["i"]), int(r["j"]))
                best[key] = float(r["score_combined"])
    for t in exported["targets"]:
        meta = json.loads((OUT / f"{t}.json").read_text(encoding="utf-8"))
        scores = [w["score"] for w in meta["windows"]]
        assert scores == sorted(scores, reverse=True)
        for w in meta["windows"]:
            assert best[(t, w["site"], w["i"], w["j"])] == pytest.approx(w["score"], abs=0.05)
