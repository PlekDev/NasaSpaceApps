"""Download every raster listed in config/sites.yaml into data/raw/ (skips files already present).

Usage:  python scripts/download_data.py            # all
        python scripts/download_data.py earth_pinacate moon_malapert
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, urllib.request, shutil
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pen.config import load_config, RAW


def fetch(url, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  ✓ {dest.name} (already here)")
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  ↓ {dest.name}")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length", 0))
        done = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r    {done/1e6:6.1f} / {total/1e6:.1f} MB", end="", flush=True)
    print()
    shutil.move(tmp, dest)


def fetch_diviner_filtered(url, dest: Path, lat_max: float):
    """Stream the Diviner polar resource table (CSV, ~605 MB) and keep facets with latitude <= lat_max.
    Output columns: clon, clat, temp_avg, temp_max, ice_depth (same as the committed pipeline input)."""
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  ✓ {dest.name} (already here)")
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  ↓ {dest.name}  (streaming {url.rsplit('/', 1)[-1]}, keeping lat <= {lat_max})")
    kept = rows = 0
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "w") as f:
        header = [h.strip() for h in r.readline().decode().split(",")]
        ix = [header.index(c) for c in ("tri_clon", "tri_clat", "temp_avg", "temp_max", "ice_depth")]
        f.write("clon,clat,temp_avg,temp_max,ice_depth\n")
        for raw in r:
            rows += 1
            v = raw.decode().split(",")
            lon, lat, ta, tm, ice = (v[i].strip() for i in ix)
            if float(lat) <= lat_max:
                f.write(f"{float(lon):.5f},{float(lat):.5f},{ta},{tm},{ice}\n")
                kept += 1
            if rows % 200_000 == 0:
                print(f"\r    {rows/1e6:.1f} M rows read, {kept:,} kept", end="", flush=True)
    print()
    shutil.move(tmp, dest)


def main(only):
    cfg = load_config()
    RAW.mkdir(parents=True, exist_ok=True)
    items = {**cfg["sites"], **cfg.get("auxiliary", {})}
    for key, s in items.items():
        if only and key not in only:
            continue
        if "filter_lat_max" in s:
            fetch_diviner_filtered(s["url"], RAW / s["file"], float(s["filter_lat_max"]))
        else:
            fetch(s["url"], RAW / s["file"])


if __name__ == "__main__":
    main(set(sys.argv[1:]))
