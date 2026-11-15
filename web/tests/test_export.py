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


# ---- end-to-end export runs in a scratch copy of the repo inputs (never touches web/public) ----
import json, shutil, subprocess, sys


def _scratch_repo(tmp, with_extras):
    """Copy only what export_data.py reads into tmp. figures/extras and data/processed/briefs are left out unless with_extras."""
    for rel in ["config", "docs/METHOD.md", "app/streamlit_app.py", "scripts/validate_known_analogs.py", "pen/features.py", "pen/scoring.py", "README.md"]:
        src, dst = ROOT / rel, tmp / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dst) if src.is_dir() else shutil.copyfile(src, dst)
    shutil.copytree(ROOT / "data" / "processed", tmp / "data" / "processed", ignore=None if with_extras else shutil.ignore_patterns("briefs"))
    (tmp / "figures").mkdir()
    for f in (ROOT / "figures").glob("fig*.png"):
        shutil.copyfile(f, tmp / "figures" / f.name)
    if with_extras:
        shutil.copytree(ROOT / "figures" / "extras", tmp / "figures" / "extras")
    (tmp / "web" / "tools").mkdir(parents=True)
    shutil.copyfile(ROOT / "web" / "tools" / "export_data.py", tmp / "web" / "tools" / "export_data.py")
    return tmp


def _export(tmp, env_extra=None, flags=()):
    import os
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONUTF8", "PYTHONIOENCODING")}
    env.update(env_extra or {})
    r = subprocess.run([sys.executable, *flags, "-I", str(tmp / "web" / "tools" / "export_data.py")], capture_output=True, encoding="utf-8", errors="replace", env=env, cwd=tmp)
    assert r.returncode == 0, r.stderr[-800:]
    return tmp / "web" / "public" / "data"


def test_export_without_extras_has_no_field_kit_inputs(tmp_path):
    """No figures/extras and no briefs: the manifest lists no extras and no briefs, so the UI renders no Field kit section."""
    data = _export(_scratch_repo(tmp_path, with_extras=False))
    m = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    assert m["targets"] and all(e == {} for e in m["extras"].values()), m["extras"]
    assert m["briefs"] == {}
    assert not (tmp_path / "web" / "public" / "extras").exists()
    assert not (data / "rover_twin.json").exists()


def _legacy_locale():
    """A single-byte locale that cannot encode U+02BB, like Windows cp1252; None if this machine has none."""
    out = subprocess.run(["locale", "-a"], capture_output=True, encoding="utf-8", errors="replace").stdout.split() if sys.platform != "win32" else []
    for name in out:
        if name.lower().endswith(("iso88591", "iso-8859-1")):
            env = {"LC_ALL": name, "PYTHONCOERCECLOCALE": "0"}
            enc = subprocess.run([sys.executable, "-X", "utf8=0", "-I", "-c", "import locale;print(locale.getpreferredencoding(False))"], capture_output=True, encoding="utf-8", env={**__import__("os").environ, **env}).stdout.strip().lower()
            if enc.replace("-", "").replace("_", "") in ("iso88591", "latin1", "cp1252"):
                return env
    return None


def test_export_is_identical_under_a_cp1252_like_locale(tmp_path):
    """Simulated Windows default encoding: no UnicodeEncodeError on U+02BB (Hawai'i), no mojibake, bytes equal to the UTF-8 run."""
    env = _legacy_locale()
    if env is None:
        import pytest; pytest.skip("no single-byte locale installed to simulate cp1252")
    scratch = _scratch_repo(tmp_path, with_extras=False)
    ref = _export(scratch)
    want = {f.name: f.read_bytes() for f in ref.glob("*.json")}
    for f in ref.glob("*.json"):
        f.unlink()
    got_dir = _export(scratch, env_extra=env, flags=("-X", "utf8=0"))
    got = {f.name: f.read_bytes() for f in got_dir.glob("*.json")}
    assert got == want
    assert "ʻ" in got["manifest.json"].decode("utf-8")
    assert not list(got_dir.glob("*.tmp")) and json.loads(got["manifest.json"].decode("utf-8"))
