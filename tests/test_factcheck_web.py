"""Fact-check of the web app: what it serves comes from today's data/processed, and no headline number is typed by hand.

1. web/public/data/manifest.json carries the hash of data/processed it was built from: it must be today's hash.
2. Files the web serves verbatim (results, validation, far horizons, METHOD.md, the simulator grids, …) must be
   byte-identical to their sources, and every exporter's index.json must list files that exist.
3. The known-ranks file the Home and Proof views read must equal the ranks recomputed now.
4. No headline value (the ones docs/numbers.json can cite: ranges like "0.92–0.99", counts like "10,424") may appear
   typed into web/src or web/index.html: the views must compute it from the data.
When web/public/data is missing (CI test job), the export runs first. AI-assisted (Claude); reviewed by the author."""
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
WEB = ROOT / "web"
DATA = WEB / "public" / "data"


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def export():
    mod = _module("export_data", WEB / "tools" / "export_data.py")
    if not (DATA / "manifest.json").exists():
        subprocess.run([sys.executable, "-I", str(WEB / "tools" / "export_data.py")], cwd=ROOT, check=True, capture_output=True)
    return mod


@pytest.fixture(scope="module")
def manifest(export):
    return json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))


def test_web_data_is_built_from_todays_data(export, manifest):
    assert manifest["data_hash"] == export.source_stamp()[0], \
        "web/public/data was exported from other data/processed files: run  make web-data"


VERBATIM = {f"{n}.json": PROC / f"{n}.json" for n in ["results", "diviner", "far_horizons", "known_analogs", "validation",
                                                      "thermal_gap", "sensitivity", "mars_context", "eonet_snapshot"]}
VERBATIM.update({"method.md": ROOT / "docs" / "METHOD.md", "rover_twin.json": PROC / "briefs" / "rover_twin.json",
                 "credits.json": PROC / "thumbs" / "real_credits.json"})


@pytest.mark.parametrize("name", sorted(VERBATIM))
def test_verbatim_copies(manifest, name):
    src = VERBATIM[name]
    if not src.exists():
        pytest.skip(f"{src.relative_to(ROOT)} not in this checkout")
    assert (DATA / name).read_bytes() == src.read_bytes(), f"web/public/data/{name} differs from {src.relative_to(ROOT)}: run make web-data"


def test_exporters_publish_what_they_list(manifest):
    for name, idx in manifest.get("exports", {}).items():
        assert idx == json.loads((DATA / name / "index.json").read_text(encoding="utf-8"))
        assert idx["generated"] == manifest["data_hash"], f"{name}: exported from other data"
        for f in idx["files"]:
            assert (DATA / name / f).is_file(), f"{name}/{f} listed but missing"
        if name == "sim":
            for f in idx["files"]:
                assert (DATA / name / f).read_bytes() == (PROC / "sim" / f).read_bytes() or f.endswith(".json"), f


def test_known_ranks_are_current(export, manifest):
    now = json.loads(json.dumps(export.known_ranks(json.loads((PROC / "known_analogs.json").read_text(encoding="utf-8")))))
    assert json.loads((DATA / "known_ranks.json").read_text(encoding="utf-8")) == now


def _code_text(p):
    """Source without comment lines (headers may describe a claim; code may not contain it)."""
    s = re.sub(r"/\*.*?\*/", "", p.read_text(encoding="utf-8"), flags=re.S)
    return "\n".join(l for l in s.splitlines() if not l.lstrip().startswith("//"))


def test_no_headline_number_is_typed_into_the_web():
    reg = _module("factcheck_numbers", ROOT / "tests" / "test_factcheck_numbers.py").registry()
    # distinctive values only: ranges, thousands, decimals (a bare "6" or "#1" is not a claim on its own)
    values = {v for v, _ in reg.values() if re.search(r"\d[–,.]\d", v)}
    values |= {v.replace(",", "") for v in values if re.fullmatch(r"\d{1,3}(,\d{3})+", v)}
    files = sorted((WEB / "src").rglob("*.ts")) + [WEB / "index.html"]
    hits = [f"{p.relative_to(ROOT)}: {v!r}" for p in files if p.exists() for v in values
            if re.search(rf"(?<![\d.]){re.escape(v)}(?![\d])", _code_text(p))]
    assert not hits, "typed by hand (compute it from the data instead):\n" + "\n".join(hits)
