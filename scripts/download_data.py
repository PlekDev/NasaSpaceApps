"""Download every raster listed in config/sites.yaml into data/raw/ (skips files already present).

Usage:  python scripts/download_data.py            # all
        python scripts/download_data.py earth_pinacate moon_malapert
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, urllib.request, shutil
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from penumbra.config import load_config, RAW


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


def main(only):
    cfg = load_config()
    RAW.mkdir(parents=True, exist_ok=True)
    items = {**cfg["sites"], **cfg.get("auxiliary", {})}
    for key, s in items.items():
        if only and key not in only:
            continue
        fetch(s["url"], RAW / s["file"])


if __name__ == "__main__":
    main(set(sys.argv[1:]))
