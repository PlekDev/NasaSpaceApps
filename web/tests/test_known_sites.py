"""known_sites.json: the analog sites' coordinates for the web (Home flies to Pu'u Hiwahine from here).

They come from KNOWN in scripts/validate_known_analogs.py, the list the known-analog test uses, so the web marks exactly
the points that were tested. AI-assisted (Claude); reviewed by the author."""
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data"


@pytest.fixture(scope="module")
def sites():
    if not (DATA / "known_sites.json").exists():
        subprocess.run([sys.executable, "-I", str(ROOT / "web" / "tools" / "export_data.py")], cwd=ROOT, check=True, capture_output=True)
    return json.loads((DATA / "known_sites.json").read_text(encoding="utf-8"))


def test_every_tested_site_is_listed_with_its_targets(sites):
    rows = json.loads((ROOT / "data" / "processed" / "known_analogs.json").read_text(encoding="utf-8"))["rows"]
    by_name = {s["name"]: s for s in sites}
    for r in rows:
        assert r["site"] in by_name, r["site"]
        assert r["reference"] in by_name[r["site"]]["tested_for"]
    assert any("Hiwahine" in s["name"] for s in sites)


def test_coordinates_match_their_cited_source(sites):
    """Where the note quotes a decimal pair, the coordinate used is that pair (to 1e-3 degrees)."""
    for s in sites:
        assert -90 <= s["lat"] <= 90 and -180 <= s["lon"] <= 180
        m = re.search(r"\((-?\d+\.\d+),\s*(-?\d+\.\d+)\)", s["note"])
        if m:
            assert abs(float(m.group(1)) - s["lat"]) < 1e-3 and abs(float(m.group(2)) - s["lon"]) < 1e-3, s["name"]


def test_each_site_lies_in_one_earth_region(sites):
    regions = {r["id"] for r in json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))["regions"]}
    for s in sites:
        assert s["region"] in regions, f"{s['name']}: {s['region']}"
