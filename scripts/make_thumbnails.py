"""Low-Sun preview thumbnails for the app's Analog card → data/processed/thumbs/.

For each reference: one image of its most representative 6 km window, plus the top-N Earth windows,
all rendered with the same 3° Sun from the south-west (cast shadows in black). Needs data/cache from run_pipeline.py.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pen.config import load_config, PROCESSED, CACHE
from pen.shadows import lowsun_hillshade

TOP_N = 15
cfg = load_config()
RES = cfg["resolution_m"]
W = int(cfg["main_window_km"] * 1000 / RES)
OUT = PROCESSED / "thumbs"
OUT.mkdir(parents=True, exist_ok=True)
R = json.load(open(PROCESSED / "results.json"))
win = pd.read_csv(PROCESSED / "windows.csv")
_z = {}


def grid(site):
    if site not in _z:
        _z[site] = np.load(CACHE / f"{site}_z.npy")
    return _z[site]


def render(z, i, j, path, pad=60):
    i0, j0 = max(i - pad, 0), max(j - pad, 0)
    sub = z[i0:i + W + pad, j0:j + W + pad]
    img = lowsun_hillshade(sub, 3, 225, RES)[i - i0:i - i0 + W, j - j0:j - j0 + W]
    img = np.where(np.isnan(img), 0.0, img)
    plt.imsave(path, img, cmap="gray", vmin=0, vmax=1)


def reference_window(ref):
    z = grid(ref)
    shm = np.load(CACHE / f"{ref}_shadow_e2.npy")
    rf = R["reference_features"][ref]
    best, bd = None, 1e9
    for i in range(0, z.shape[0] - W + 1, W // 2):
        for j in range(0, z.shape[1] - W + 1, W // 2):
            zz = z[i:i + W, j:j + W]
            if np.isfinite(zz).mean() < 0.95:
                continue
            d = abs(math.log10(np.subtract(*np.nanpercentile(zz, [98, 2]))) - rf["relief"]) \
                + abs(shm[i:i + W, j:j + W][np.isfinite(zz)].mean() - rf["shadow_e2"])
            if d < bd:
                best, bd = (i, j), d
    return best


manifest = {}
for ref in R["reference_features"]:
    i, j = reference_window(ref)
    render(grid(ref), i, j, OUT / f"ref__{ref}.png")
    top = win[win.reference == ref].sort_values("score_combined", ascending=False).head(TOP_N)
    for r in top.itertuples():
        name = f"{r.site}_{r.i}_{r.j}.png"
        if not (OUT / name).exists():
            render(grid(r.site), int(r.i), int(r.j), OUT / name)
    manifest[ref] = len(top)
    print(ref, "→", len(top), "thumbnails")
json.dump(manifest, open(OUT / "manifest.json", "w"))
