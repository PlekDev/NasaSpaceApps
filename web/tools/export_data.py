"""Export compact, UI-ready data for the static web app (web/public/data).

Read-only on config/ and data/processed/. Run with:  python -I web/tools/export_data.py
Nothing is typed by hand: targets, regions, dimensions and every number come from the repo files.
AI-assisted (Claude Code); reviewed by the author."""
import ast, csv, hashlib, json, re, shutil, subprocess, sys
from pathlib import Path
import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "data" / "processed"
OUT = ROOT / "web" / "public"
DATA = OUT / "data"


def literal_assign(path, name):
    """Read a module-level literal (dict/list) without importing the module."""
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(name)


def split_label(label):
    """'Moon · Nobile Rim 1 (LOLA Site06, Artemis candidate region)' -> short name, detail line, tags.
    Robust to labels without a "·" prefix, a parenthesis or a comma; never returns an empty name or an ellipsis."""
    body = label.split("·", 1)[1].strip() if "·" in label else label.strip()
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", body)
    name, paren = (m.group(1), m.group(2)) if m else (body, "")
    name = name.replace("…", "").replace("...", "").strip() or body.replace("…", "").strip() or label.strip()
    tags, detail = [], []
    for part in [p.strip() for p in paren.split(",")] if paren else []:
        (tags if "artemis" in part.lower() else detail).append(
            "Artemis candidate" if "artemis" in part.lower() else part)
    return name.strip(), ", ".join(detail), tags


def region_label(label):
    """'Earth · Yungay, hyperarid Atacama Desert (CL)' -> (name, place, country code); tolerant of missing parts."""
    body = label.split("·", 1)[1].strip() if "·" in label else label.strip()
    m = re.match(r"^(.*?)\s*\(([A-Z]{2})\)\s*$", body)
    body, cc = (m.group(1), m.group(2)) if m else (body, "")
    name, sep, place = body.partition(",")
    if not sep:  # no comma: whole text is the name
        return body.strip() or label.strip(), "", cc
    return name.strip() or body.strip(), place.strip(), cc


def source_stamp():
    """Hash of every file in data/processed (name + bytes) and the git commit: the web app can never silently show other numbers."""
    h = hashlib.sha256()
    for p in sorted(PROC.rglob("*")):
        if p.is_file() and "thumbs" not in p.parts and "imagery" not in p.parts:
            h.update(str(p.relative_to(PROC)).encode()); h.update(p.read_bytes())
    for p in sorted((PROC / "thumbs").glob("*.json")):
        h.update(p.name.encode()); h.update(p.read_bytes())
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain", "data/processed"], cwd=ROOT, capture_output=True, text=True).stdout.strip())
    except Exception:
        commit, dirty = "unknown", False
    return h.hexdigest()[:8], commit + ("+dirty" if dirty else "")


def thumb(src, dst, px=192, quality=80):
    if not src.exists():
        return None
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    im.thumbnail((px, px))
    im.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
    return dst.name


def main():
    cfg = yaml.safe_load((ROOT / "config" / "sites.yaml").read_text(encoding="utf-8"))
    dims = literal_assign(ROOT / "pen" / "features.py", "DIMENSIONS")
    labels = literal_assign(ROOT / "pen" / "scoring.py", "FEATURE_LABELS")
    centers = json.loads((PROC / "results.json").read_text())["site_centers"]
    credits = json.loads((PROC / "thumbs" / "real_credits.json").read_text())
    win_km = cfg["main_window_km"]

    rows = [r for r in csv.DictReader(open(PROC / "windows.csv", encoding="utf-8")) if float(r["window_km"]) == win_km]
    present = [d for d in dims if f"score_{d}" in rows[0]]
    feats = [f for d in present for f in dims[d]]
    sites = cfg["sites"]
    targets_all = [k for k, v in sites.items() if v["role"] == "reference"]
    regions_all = [k for k, v in sites.items() if v["role"] == "candidate"]
    by_ref = {}
    for r in rows:
        by_ref.setdefault(r["reference"], []).append(r)
    targets = [t for t in targets_all if t in by_ref]
    regions = [s for s in regions_all if any(r["site"] == s for r in by_ref[targets[0]])]
    ridx = {s: n for n, s in enumerate(regions)}

    DATA.mkdir(parents=True, exist_ok=True)
    tman = []
    for t in targets:
        s = sites[t]
        name, detail, tags = split_label(s["label"])
        if not detail:
            detail = {"moon": "LRO LOLA", "mars": "MRO CTX"}.get(s["body"], s["body"])
        lon, lat = centers[t]
        tman.append(dict(id=t, body=s["body"], label=s["label"], name=name, detail=detail, tags=tags,
                         center=[lon, lat], thumb=thumb(PROC / "thumbs" / f"real__ref__{t}.jpg", OUT / "thumbs" / f"{t}.jpg"),
                         credit=credits.get(f"ref__{t}")))
        rs = by_ref[t]
        q = lambda k, f: [round(float(r[k]) * f) for r in rs]
        cols = dict(n=len(rs), site=[ridx[r["site"]] for r in rs], i=[int(r["i"]) for r in rs], j=[int(r["j"]) for r in rs],
                    lon=q("lon", 1e5), lat=q("lat", 1e5), combined=q("score_combined", 10))
        for d in present:
            cols[f"score_{d}"] = q(f"score_{d}", 10)
        for f in feats:
            cols[f"d_{f}"] = q(f"d_{f}", 1000)
        (DATA / f"{t}.json").write_text(json.dumps(cols, separators=(",", ":")))

    rman = []
    for s in regions:
        name, place, cc = region_label(sites[s]["label"])
        rman.append(dict(id=s, label=sites[s]["label"], name=name, place=place, cc=cc, center=centers[s]))

    dhash, commit = source_stamp()
    manifest = dict(
        data_hash=dhash, git_commit=commit,
        window_km=win_km, dims={d: dims[d] for d in present}, feature_labels={f: labels.get(f, f) for f in feats},
        scale=dict(lonlat=1e5, score=10, d=1000), targets=tman, regions=rman,
        windows_per_target=len(by_ref[targets[0]]))
    # secondary datasets are passed through as-is (read-only copies of committed results)
    for name in ["results", "diviner", "far_horizons", "known_analogs", "validation", "thermal_gap", "sensitivity",
                 "mars_context", "eonet_snapshot"]:
        p = PROC / f"{name}.json"
        if p.exists():
            shutil.copyfile(p, DATA / f"{name}.json")
    (DATA / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False))
    print(f"exported {len(targets)} targets, {len(regions)} regions, {len(present)} dimensions")


if __name__ == "__main__":
    sys.exit(main())
