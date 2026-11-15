"""Terrain grids for Mission Rehearsal (owner: Victor). Contract: web/tools/exports/README.md, section "sim".

Two modes:
  python -I web/tools/exports/sim.py --build   rebuild data/processed/sim/ from the pipeline's 30 m grids (needs data/cache/,
                                               i.e. a full pipeline run); run it after any pipeline rerun and commit the result
  python -I web/tools/exports/sim.py           export mode (run by export_data.py): copy data/processed/sim/ to
                                               web/public/data/sim/ and write index.json; needs no data/cache/

Each grid is a 200 x 200 window (6 km at 30 m) encoded as little-endian int16 with a per-grid offset and scale.
For every target: its reference window (thumbs/ref_windows.json) and the best window of each of its 5 best Earth regions.
AI-assisted (Claude); reviewed by the author."""
import argparse
import csv
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # web/tools, for export_data's helpers
from export_data import DATA, PROC, ROOT, copy_atomic, read_json, region_label, write_index, write_json  # noqa: E402

NAME = "sim"
SRC = PROC / "sim"
N = 200            # 6 km / 30 m
DX = 30
REGIONS = 5
NODATA = -32768


def encode(z):
    """float heights -> (int16 little-endian bytes, offset, scale, filled): heights = offset + scale * value."""
    import numpy as np
    from scipy.ndimage import distance_transform_edt
    z = np.asarray(z, dtype=np.float64)
    bad = ~np.isfinite(z)
    filled = int(bad.sum())
    if filled == z.size:
        raise ValueError("window has no valid heights")
    if filled:   # nearest valid height, as the pipeline does before computing shadows
        idx = distance_transform_edt(bad, return_distances=False, return_indices=True)
        z = z[tuple(idx)]
    lo, hi = float(z.min()), float(z.max())
    offset = round((lo + hi) / 2, 2)
    # smallest of 1 cm steps that keeps the range inside +-32767 (a 6 km window rarely spans more than 655 m)
    scale = max(0.01, math.ceil((hi - lo) / 65000 * 100) / 100)
    q = np.round((z - offset) / scale)
    assert q.min() > NODATA and q.max() <= 32767
    return q.astype("<i2").tobytes(), offset, scale, filled, round(lo, 2), round(hi, 2)


def build():
    import numpy as np
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "scripts" / "extras"))
    import common                                            # same grids as scripts/extras (pipeline cache)
    cfg = common.cfg
    ref_win = read_json(PROC / "thumbs" / "ref_windows.json")
    centers = read_json(PROC / "results.json").get("site_centers", {})
    w = common.windows()
    w = w[w.window_km == cfg["main_window_km"]]
    SRC.mkdir(parents=True, exist_ok=True)
    for old in SRC.glob("*.bin"):
        old.unlink()
    targets, total = [], 0
    for ref in [r for r in cfg["sites"] if cfg["sites"][r]["body"] != "earth" and r in ref_win]:
        z = common.grid(ref)
        i, j = map(int, ref_win[ref])
        sub = z[i:i + N, j:j + N]
        assert sub.shape == (N, N), (ref, sub.shape)
        raw, off, sc, filled, lo, hi = encode(sub)
        fname = f"{ref}.bin"
        (SRC / fname).write_bytes(raw); total += len(raw)
        lon, lat = centers.get(ref, [None, None])
        meta = dict(target=ref, label=cfg["sites"][ref]["label"], body=cfg["sites"][ref]["body"], dx=DX, n=N,
                    center=dict(lat=lat, lon=lon, of="site"),
                    grid=dict(file=fname, offset=off, scale=sc, i=i, j=j, nodata_filled=filled, min=lo, max=hi),
                    windows=[])
        g = w[w.reference == ref].sort_values("score_combined", ascending=False)
        best = g.groupby("site", sort=False).head(1).head(REGIONS)
        for rank, r in enumerate(best.itertuples(), 1):
            ze = common.grid(r.site)
            sub = ze[int(r.i):int(r.i) + N, int(r.j):int(r.j) + N]
            assert sub.shape == (N, N), (r.site, sub.shape)
            raw, off, sc, filled, lo, hi = encode(sub)
            fname = f"{ref}__{r.site}_{int(r.i)}_{int(r.j)}.bin"
            (SRC / fname).write_bytes(raw); total += len(raw)
            name, place, _ = region_label(cfg["sites"][r.site]["label"])
            meta["windows"].append(dict(
                rank=rank, site=r.site, region=name, place=place, i=int(r.i), j=int(r.j),
                lat=round(float(r.lat), 5), lon=round(float(r.lon), 5),
                score=round(float(r.score_combined), 1), terrain=round(float(r.score_terrain), 1),
                illumination=round(float(r.score_illumination), 1),
                file=fname, offset=off, scale=sc, nodata_filled=filled, min=lo, max=hi))
        (SRC / f"{ref}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        targets.append(ref)
    (SRC / "targets.json").write_text(json.dumps(targets) + "\n", encoding="utf-8")
    print(f"sim --build: {len(targets)} targets, {sum(1 for _ in SRC.glob('*.bin'))} grids, {total / 1e6:.1f} MB in {SRC.relative_to(ROOT)}")


def export():
    if not (SRC / "targets.json").exists():
        raise SystemExit(f"{SRC.relative_to(ROOT)} is missing: run  python -I web/tools/exports/sim.py --build")
    targets = json.loads((SRC / "targets.json").read_text(encoding="utf-8"))
    files = []
    for t in targets:
        meta = read_json(SRC / f"{t}.json")
        for f in [meta["grid"]["file"]] + [w["file"] for w in meta["windows"]]:
            copy_atomic(SRC / f, DATA / NAME / f)
            files.append(f)
        write_json(DATA / NAME / f"{t}.json", meta)
        files.append(f"{t}.json")
    write_index(NAME, files, {"targets": targets})


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--build", action="store_true", help="rebuild data/processed/sim/ from data/cache/ (pipeline grids)")
    a = ap.parse_args()
    build() if a.build else export()
