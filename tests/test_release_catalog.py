# AI-assisted (Claude, Anthropic); reviewed by the team.
"""The released catalog (data/release/, scripts/release_catalog.py) must agree with data/processed/."""
import hashlib, json
from pathlib import Path
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
REL = ROOT / "data" / "release"
pytestmark = pytest.mark.skipif(not (REL / "pen_analog_catalog.csv").exists(), reason="catalog not generated")


def test_checksums_match():
    for line in (REL / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        if (REL / name).exists():
            assert hashlib.sha256((REL / name).read_bytes()).hexdigest() == digest, name


def test_catalog_matches_windows_csv():
    cat = pd.read_csv(REL / "pen_analog_catalog.csv")
    w = pd.read_csv(ROOT / "data" / "processed" / "windows.csv")
    targets = list(dict.fromkeys(w["reference"]))
    assert len(cat) == (w["reference"] == targets[0]).sum() and cat["window_id"].is_unique
    for t in targets:
        g = w[w["reference"] == t].reset_index(drop=True)
        top = g.iloc[0]                                       # windows.csv is sorted best-first per target
        row = cat[cat["window_id"] == f"{top.site}_{top.i}_{top.j}"].iloc[0]
        assert row[f"rank__{t}"] == 1 and row[f"combined__{t}"] == top.score_combined
        assert sorted(cat[f"rank__{t}"]) == list(range(1, len(cat) + 1))
        m = cat.merge(g.assign(window_id=g.site + "_" + g.i.astype(str) + "_" + g.j.astype(str))[["window_id", "score_terrain"]], on="window_id")
        assert (m[f"terrain__{t}"] == m["score_terrain"]).all()


def test_top_windows_and_geojson():
    top = pd.read_csv(REL / "pen_top_windows.csv")
    assert (top["score_ci95_low"] <= top["score_ci95_high"]).all() and (top["rank_ci95_low"] >= 1).all()
    geo = REL / "pen_analog_catalog.geojson"
    if geo.exists():
        g = json.loads(geo.read_text(encoding="utf-8"))
        cat = pd.read_csv(REL / "pen_analog_catalog.csv")
        assert len(g["features"]) == len(cat)
        ring = g["features"][0]["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1] and len(ring) == 5


def test_readme_carries_the_usage_warnings():
    txt = (REL / "README.md").read_text(encoding="utf-8")
    assert "never \"the best place\"" in txt and "Mars does not separate" in txt and "Copernicus" in txt
