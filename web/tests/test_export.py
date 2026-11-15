"""Export checks: run with  python -m pytest web/tests  (kept out of `make test` testpaths on purpose; `make web-test` runs it)."""
import importlib.util, sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("export_data", ROOT / "web" / "tools" / "export_data.py")
ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)
SITES = yaml.safe_load((ROOT / "config" / "sites.yaml").read_text(encoding="utf-8"))["sites"]


def test_every_target_gets_a_short_name():
    for k, s in SITES.items():
        if s["role"] != "reference":
            continue
        name, detail, tags = ex.split_label(s["label"])
        assert name and "…" not in name and "..." not in name, k
        assert "(" not in name and "·" not in name, k


def test_every_region_gets_a_short_name():
    for k, s in SITES.items():
        if s["role"] != "candidate":
            continue
        name, place, cc = ex.region_label(s["label"])
        assert name and "…" not in name + place and "(" not in name, k


def test_label_edge_cases():
    assert ex.region_label("Earth · Axel Heiberg Island high Arctic (CA)") == ("Axel Heiberg Island high Arctic", "", "CA")
    assert ex.region_label("Earth · Plain name")[0] == "Plain name"
    assert ex.split_label("Mars · Jezero crater") == ("Jezero crater", "", [])
    assert ex.split_label("Moon · Foo (LOLA Site99, Artemis candidate region)") == ("Foo", "LOLA Site99", ["Artemis candidate"])
    assert ex.split_label("No prefix at all")[0] == "No prefix at all"


def test_reproduce_text_matches_the_app():
    """reproduce.json is produced by the app's own cant_reproduce(); lunar targets carry 3 Diviner items, Mars targets 2 climate items."""
    import json
    out = ROOT / "web" / "public" / "data" / "reproduce.json"
    if not out.exists():
        import pytest; pytest.skip("run python -I web/tools/export_data.py first")
    rep = json.loads(out.read_text(encoding="utf-8"))
    for k, items in rep.items():
        assert items and all(i.count("**") % 2 == 0 for i in items), k
        if k.startswith("moon_"):
            assert "Diviner" in items[0] and "Water ice thermally stable" in items[1] and items[2].startswith("Surface peaks reach"), k
        if k.startswith("mars_"):
            assert "Mars Climate Database" in items[0] and items[1].startswith("Air pressure"), k


def test_blind_rediscovery_ranks_match_the_readme():
    """Ranks computed in export_data.py (from windows.csv) must equal the ranks printed in README.md and the deck."""
    import json, re
    out = ROOT / "web" / "public" / "data" / "known_ranks.json"
    if not out.exists():
        import pytest; pytest.skip("run python -I web/tools/export_data.py first")
    ranks = json.loads(out.read_text(encoding="utf-8"))
    hiw = {ref: [v for k, v in d.items() if "Hiwahine" in k][0] for ref, d in ranks.items()}
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    expect = {"moon_malapert": r"#1 of 10,424", "moon_nobile_rim1": r"#(\d+) Nobile Rim 1", "moon_de_gerlache_rim": r"#(\d+) de Gerlache",
              "moon_connecting_ridge": r"#(\d+) Connecting Ridge", "moon_leibnitz_beta": r"Leibnitz Beta, #(\d+)", "moon_haworth": r"Haworth, #(\d+)"}
    for ref, pat in expect.items():
        m = re.search(pat, readme); assert m, f"README no longer states a rank for {ref}"
        stated = int(m.group(1)) if m.groups() else 1
        assert hiw[ref]["rank"] == stated, f"{ref}: computed #{hiw[ref]['rank']} vs README #{stated}"
        assert hiw[ref]["n"] == 10424 or f"{hiw[ref]['n']:,}" in readme
