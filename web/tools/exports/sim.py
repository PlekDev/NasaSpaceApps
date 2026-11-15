"""Terrain grids for Mission Rehearsal (owner: Victor). Contract: web/tools/exports/README.md, section "sim".

Two modes:
  python -I web/tools/exports/sim.py --build   rebuild data/processed/sim/ from the pipeline's 30 m grids (needs data/cache/,
                                               i.e. a full pipeline run); run it after any pipeline rerun and commit the result
  python -I web/tools/exports/sim.py --fixtures  parity fixtures for web/tests/sim_*.test.mjs (Python reference results of
                                               pen/shadows.py, pen/features.slope_deg, scripts/extras/rover_twin.plan and
                                               the solar models, on the committed grids); needs no data/cache/
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
R_EARTH = 6371008.8
FIX = ROOT / "web" / "tests" / "fixtures" / "sim"


def aeqd_inverse(x, y, lat0, lon0, R):
    """Spherical azimuthal equidistant (x east, y north, metres from lat0/lon0) -> (lat, lon) in degrees."""
    rho = math.hypot(x, y)
    if rho == 0:
        return lat0, lon0
    c, p0 = rho / R, math.radians(lat0)
    lat = math.asin(math.cos(c) * math.sin(p0) + y * math.sin(c) * math.cos(p0) / rho)
    lon = math.radians(lon0) + math.atan2(x * math.sin(c), rho * math.cos(p0) * math.cos(c) - y * math.sin(p0) * math.sin(c))
    return math.degrees(lat), (math.degrees(lon) + 540) % 360 - 180


def bearing(lat1, lon1, lat2, lon2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    return math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) % 360


def window_geo(shape, i, j, lat0, lon0, R):
    """Centre (lat, lon) of the window at (i, j) and the geographic azimuth of the grid's 'up' there.

    The pipeline grid is an AEQD projection centred on the DEM, so its origin sits at the grid centre (checked against
    windows.csv on Earth: within 0.3 km). Near the lunar pole grid-up and true north differ by up to ~15 deg, so a Sun
    azimuth from a solar model must be turned into the grid frame: az_grid = az_geo - up_az."""
    H, W = shape
    x, y = (j + N / 2 - W / 2) * DX, (H / 2 - (i + N / 2)) * DX
    la, lo = aeqd_inverse(x, y, lat0, lon0, R)
    la2, lo2 = aeqd_inverse(x, y + DX, lat0, lon0, R)
    return round(la, 5), round(lo, 5), round(bearing(la, lo, la2, lo2), 3) % 360


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
    from pen.config import RADIUS_M
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
        lon0, lat0 = centers[ref]
        wla, wlo, up = window_geo(z.shape, i, j, lat0, lon0, RADIUS_M[cfg["sites"][ref]["body"]])
        meta = dict(target=ref, label=cfg["sites"][ref]["label"], body=cfg["sites"][ref]["body"], dx=DX, n=N,
                    center=dict(lat=round(lat0, 5), lon=round(lon0, 5), of="site"),
                    grid=dict(file=fname, offset=off, scale=sc, i=i, j=j, lat=wla, lon=wlo, up_az=up,
                              nodata_filled=filled, min=lo, max=hi),
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
            elon0, elat0 = centers[r.site]
            *_, eup = window_geo(ze.shape, int(r.i), int(r.j), elat0, elon0, R_EARTH)
            meta["windows"].append(dict(
                rank=rank, site=r.site, region=name, place=place, i=int(r.i), j=int(r.j),
                lat=round(float(r.lat), 5), lon=round(float(r.lon), 5), up_az=eup,
                score=round(float(r.score_combined), 1), terrain=round(float(r.score_terrain), 1),
                illumination=round(float(r.score_illumination), 1),
                file=fname, offset=off, scale=sc, nodata_filled=filled, min=lo, max=hi))
        (SRC / f"{ref}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        targets.append(ref)
    (SRC / "targets.json").write_text(json.dumps(targets) + "\n", encoding="utf-8")
    print(f"sim --build: {len(targets)} targets, {sum(1 for _ in SRC.glob('*.bin'))} grids, {total / 1e6:.1f} MB in {SRC.relative_to(ROOT)}")


def decode(meta_grid):
    import numpy as np
    q = np.frombuffer((SRC / meta_grid["file"]).read_bytes(), "<i2").astype(np.float64).reshape(N, N)
    return (meta_grid["offset"] + meta_grid["scale"] * q).astype(np.float32)     # same float32 heights as sim/grid.ts


def fixtures():
    """Python reference results for the TypeScript port (web/src/sim), on three committed grids."""
    import base64
    import numpy as np
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "scripts" / "extras"))
    from pen.shadows import cast_shadow, shadow_fraction_maps
    from pen.features import slope_deg
    from pen.sun import solar_elevation, low_sun_hours_by_month
    import rover_twin
    import common

    b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    cases = [(2, 0), (2, 45), (5, 135), (2, 270), (3, 213.7), (6.5, 301.2)]
    rng = np.random.default_rng(7)
    out = dict(cases=cases, grids=[])
    picks = []
    for t in ("moon_malapert", "mars_jezero"):
        m = read_json(SRC / f"{t}.json")
        picks.append((t, m["grid"]))
        if t == "moon_malapert":
            picks.append((t + " / Earth #1", m["windows"][0]))
    for name, g in picks:
        z = decode(g)
        masks = [b64(np.packbits(cast_shadow(z, e, a, DX).ravel(), bitorder="little")) for e, a in cases]
        frac = shadow_fraction_maps(z, (2,), tuple(range(0, 360, 45)), DX)[2]
        sl = slope_deg(z, DX)
        cells = rng.choice(N * N, 400, replace=False)
        p, dist, slp, shp, stats = rover_twin.plan(z, sl, frac)
        out["grids"].append(dict(
            name=name, file=g["file"], offset=g["offset"], scale=g["scale"], masks=masks,
            frac8=b64(np.round(frac * 8).astype(np.uint8)),
            slope_cells=cells.tolist(), slope=[round(float(v), 6) for v in sl.ravel()[cells]],
            route=dict(start=p[0].tolist(), end=p[-1].tolist(), n=len(p), length_m=round(float(dist[-1]), 2), stats=stats)))
    # solar models: NOAA (scripts/extras/common.solar_position) and the simple model of pen/sun.py
    times = np.array(["2026-01-15T16:40:00", "2026-06-21T05:10:00", "2026-03-20T12:00:00", "2026-09-23T02:30:00",
                      "2026-12-21T23:55:00", "2027-04-02T18:20:00"], dtype="datetime64[s]")
    places = [(19.811, -155.544), (31.77, -113.5), (-24.1, -70.0), (75.4, -89.8), (-77.9, 160.7)]
    noaa = []
    for la, lo in places:
        el, az = common.solar_position(la, lo, times)
        noaa.append(dict(lat=la, lon=lo, elev=[round(float(v), 5) for v in el], az=[round(float(v), 5) for v in az]))
    simple = [dict(lat=la, doy=d, hours=[0, 5.5, 12, 18.25], elev=[round(float(v), 5) for v in solar_elevation(la, d, [0, 5.5, 12, 18.25])])
              for la in (19.811, -85.99, 64.0) for d in (1, 80, 172, 300)]
    out["sun"] = dict(times=[str(t) + "Z" for t in times], noaa=noaa, simple=simple,
                      low_sun_hours=dict(lat=19.811, hours=[round(v, 4) for v in low_sun_hours_by_month(19.811)]))
    FIX.mkdir(parents=True, exist_ok=True)
    (FIX / "parity.json").write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"sim --fixtures: {len(out['grids'])} grids x {len(cases)} Suns -> {(FIX / 'parity.json').relative_to(ROOT)}"
          f" ({(FIX / 'parity.json').stat().st_size / 1e3:.0f} kB)")


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
    ap.add_argument("--fixtures", action="store_true", help="write the parity fixtures for web/tests/sim_*.test.mjs")
    a = ap.parse_args()
    build() if a.build else fixtures() if a.fixtures else export()
