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


def extract_known():
    """KNOWN analog sites from scripts/validate_known_analogs.py (a list of dict(...) calls), read by AST, not executed."""
    tree = ast.parse((ROOT / "scripts" / "validate_known_analogs.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "KNOWN" for t in node.targets):
            return [{kw.arg: ast.literal_eval(kw.value) for kw in c.keywords} for c in node.value.elts]
    raise KeyError("KNOWN")


def known_ranks(known_json):
    """Rank of the best window containing each known analog site, per target (#rank of N windows).

    Same windows and containment test as scripts/validate_known_analogs.py. Rank = position of the best window in the descending
    order of score_combined over ALL windows of the target (stable sort: equal 0.1-rounded scores keep file order, pandas
    rank(method="first")). This reproduces the README (Malapert #1, Nobile Rim 1 #9, de Gerlache #19, Connecting Ridge #23,
    Leibnitz Beta #115, Haworth #483). The percentile is recomputed with the script's formula and must equal known_analogs.json."""
    def inside(poly, x, y):  # even-odd ray casting; the windows are convex quadrilaterals, boundary cases do not matter here
        c = False
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
        return c
    by_ref = {}
    for r in csv.DictReader(open(PROC / "windows.csv", encoding="utf-8")):
        by_ref.setdefault(r["reference"], []).append((float(r["score_combined"]), r["polygon"]))
    out, rows, known = {}, {(r["reference"], r["site"]): r for r in known_json["rows"]}, extract_known()
    for ref, g in by_ref.items():
        order = sorted(range(len(g)), key=lambda i: -g[i][0])          # stable: ties keep file order
        pos = {i: n + 1 for n, i in enumerate(order)}
        polys = [json.loads(t) for _, t in g]
        for k in known:
            if (ref, k["name"]) not in rows:
                continue
            ins = [i for i, pl in enumerate(polys) if inside(pl, k["lon"], k["lat"])]
            best = max(ins, key=lambda i: (g[i][0], -i))
            pct = round(max(100.0 * sum(1 for x in g if x[0] < g[i][0]) / len(g) for i in ins), 1)
            want = rows[(ref, k["name"])]["score_combined_pct_best"]
            assert abs(pct - want) < 0.05, f"percentile mismatch for {ref} / {k['name']}: {pct} vs {want} in known_analogs.json"
            out.setdefault(ref, {})[k["name"]] = dict(rank=pos[best], n=len(g), pct=pct)
    return out


def app_cant_reproduce(diviner, mars):
    """Run the app's own cant_reproduce() (and EARTH_LIMITS) from app/streamlit_app.py so the web text can never drift from it.
    Only those two definitions are extracted (no Streamlit code is executed)."""
    tree = ast.parse((ROOT / "app" / "streamlit_app.py").read_text(encoding="utf-8"))
    keep = [n for n in tree.body if (isinstance(n, ast.Assign) and any(getattr(t, "id", None) == "EARTH_LIMITS" for t in n.targets))
            or (isinstance(n, ast.FunctionDef) and n.name == "cant_reproduce")]
    assert len(keep) == 2, "cant_reproduce / EARTH_LIMITS not found in app/streamlit_app.py"
    ns = {"div": diviner, "mars_context": lambda: mars}
    exec(compile(ast.Module(body=keep, type_ignores=[]), "app/streamlit_app.py", "exec"), ns)
    return ns["cant_reproduce"]


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
    cant = app_cant_reproduce(json.loads((PROC / "diviner.json").read_text()), json.loads((PROC / "mars_context.json").read_text()) if (PROC / "mars_context.json").exists() else {})
    (DATA / "reproduce.json").write_text(json.dumps({t: cant(t, sites[t]["body"]) for t in targets}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(PROC / "thumbs" / "real_credits.json", DATA / "credits.json")
    # previews actually available (not every window has one): low-Sun render and real NASA imagery, 480 px JPEG
    previews = {"low": [], "real": []}
    for src in sorted((PROC / "thumbs").glob("*.png")):
        if not src.name.startswith(("ref__", "real__")):
            previews["low"].append(src.stem); thumb(src, OUT / "thumbs" / "win" / f"{src.stem}.jpg", 480, 78)
    for src in sorted((PROC / "thumbs").glob("real__*.jpg")):
        wid = src.stem[len("real__"):]
        if wid.startswith("ref__"):
            thumb(src, OUT / "thumbs" / "ref_real" / f"{wid[5:]}.jpg", 480, 78)
        else:
            previews["real"].append(wid); thumb(src, OUT / "thumbs" / "real" / f"{wid}.jpg", 480, 78)
    for t in targets:
        thumb(PROC / "thumbs" / f"ref__{t}.png", OUT / "thumbs" / "ref" / f"{t}.jpg", 480, 78)
    # field extras (merged from extras/field-tools): copied only if present
    EX, extras = ROOT / "figures" / "extras", {}
    for t in targets:
        e = {}
        for key, name, px in [("twin", f"twin_light_{t}_poster.png", 720), ("astro", f"astronaut_view_{t}.png", 960), ("rover", f"rover_twin_{t}.png", 960)]:
            if (EX / name).exists():
                e[key] = thumb(EX / name, OUT / "extras" / f"{key}_{t}.jpg", px, 80)
        if (EX / f"twin_light_{t}.mp4").exists():
            (OUT / "extras").mkdir(parents=True, exist_ok=True); shutil.copyfile(EX / f"twin_light_{t}.mp4", OUT / "extras" / f"twin_{t}.mp4"); e["video"] = f"twin_{t}.mp4"
        extras[t] = e
    briefs = {}
    for r in regions:
        got = {}
        for ext, key in [("md", "brief"), ("ics", "calendar"), ("_lowsun_windows.csv", "csv")]:
            f = PROC / "briefs" / (f"{r}.{ext}" if not ext.startswith("_") else f"{r}{ext}")
            if f.exists():
                (OUT / "extras" / "briefs").mkdir(parents=True, exist_ok=True); shutil.copyfile(f, OUT / "extras" / "briefs" / f.name); got[key] = f.name
        if got: briefs[r] = got
    # score matrix (fig2 as data): best window per Earth region x target, per dimension and combined
    summ = list(csv.DictReader(open(PROC / "summary.csv", encoding="utf-8")))
    mdims = [c[len("score_"):] for c in summ[0] if c.startswith("score_") and c != "score_combined"] + ["combined"]
    cell = {(r["reference"], r["site"]): r for r in summ}
    matrix = dict(dims=mdims, targets=targets, regions=regions,
                  v={d: [[float(cell[(t, s)][f"score_{d}"]) if (t, s) in cell else None for t in targets] for s in regions] for d in mdims})
    (DATA / "known_ranks.json").write_text(json.dumps(known_ranks(json.loads((PROC / "known_analogs.json").read_text(encoding="utf-8"))), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "matrix.json").write_text(json.dumps(matrix, separators=(",", ":")))
    (OUT / "figures").mkdir(parents=True, exist_ok=True)
    for f in sorted((ROOT / "figures").glob("fig*.png")):
        shutil.copyfile(f, OUT / "figures" / f.name)
    shutil.copyfile(ROOT / "docs" / "METHOD.md", DATA / "method.md")
    if (PROC / "briefs" / "rover_twin.json").exists():
        shutil.copyfile(PROC / "briefs" / "rover_twin.json", DATA / "rover_twin.json")
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
        # core: what the map and lists need at first paint; detail: window ids and scaled differences, loaded when a window is opened
        cols = dict(n=len(rs), site=[ridx[r["site"]] for r in rs], lon=q("lon", 1e5), lat=q("lat", 1e5), combined=q("score_combined", 10))
        for d in present:
            cols[f"score_{d}"] = q(f"score_{d}", 10)
        det = dict(i=[int(r["i"]) for r in rs], j=[int(r["j"]) for r in rs])
        for f in feats:
            det[f"d_{f}"] = q(f"d_{f}", 1000)
        (DATA / f"{t}.detail.json").write_text(json.dumps(det, separators=(",", ":")))
        (DATA / f"{t}.json").write_text(json.dumps(cols, separators=(",", ":")))

    rman = []
    for s in regions:
        name, place, cc = region_label(sites[s]["label"])
        rman.append(dict(id=s, label=sites[s]["label"], name=name, place=place, cc=cc, center=centers[s]))

    dhash, commit = source_stamp()
    manifest = dict(
        data_hash=dhash, git_commit=commit, previews=previews, extras=extras, briefs=briefs,
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
