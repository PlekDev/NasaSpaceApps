"""Diviner thermal & ice context for the lunar reference sites.

Earth analogs can reproduce terrain and low-Sun lighting, but not lunar polar temperatures or ice stability.
This script quantifies that gap with real data instead of a sentence: it takes the LRO Diviner polar resource
product (Paige et al., PDS; filtered to lat <= -84 by us, see config/sites.yaml) and summarises, for each
lunar reference footprint, the mean / max surface temperature and where water ice is thermally stable.

Outputs
  data/processed/diviner.json      per-site summary used by the app ("Earth can't reproduce" panel)
  figures/fig6_diviner.png         south-polar max-temperature map with the reference footprints
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from pen.config import load_config, RAW, PROCESSED, FIGURES, RADIUS_M, references

cfg = load_config()
csv = RAW / cfg["auxiliary"]["diviner_polar_south_84s"]["file"]
d = pd.read_csv(csv)
R = RADIUS_M["moon"]
to_ps = Transformer.from_crs(f"+proj=longlat +R={R} +no_defs",
                               f"+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={R} +units=m +no_defs", always_xy=True)
d["x"], d["y"] = to_ps.transform(d["clon"].values, d["clat"].values)
d["ice"] = d["ice_depth"].where(d["ice_depth"] >= 0)  # -999 = ice not stable within the modelled column

EARTH_RECORD_HIGH_K = 329.9   # 56.7 °C, Death Valley 1913 (WMO)
EARTH_RECORD_LOW_K = 183.9    # -89.2 °C, Vostok 1983 (WMO)

out, boxes = {}, {}
for ref in references(cfg):
    s = cfg["sites"][ref]
    if s["body"] != "moon":
        continue
    with rasterio.open(RAW / s["file"]) as src:
        b = src.bounds
    m = (d.x >= b.left) & (d.x <= b.right) & (d.y >= b.bottom) & (d.y <= b.top)
    g = d[m]
    boxes[ref] = b
    out[ref] = dict(
        label=s["label"], n_facets=int(len(g)),
        temp_avg_mean_K=round(float(g.temp_avg.mean()), 1),
        temp_avg_min_K=round(float(g.temp_avg.min()), 1),
        temp_max_mean_K=round(float(g.temp_max.mean()), 1),
        temp_max_max_K=round(float(g.temp_max.max()), 1),
        share_below_110K_avg=round(float((g.temp_avg < 110).mean()), 3),   # ~ water-ice cold-trap threshold
        share_ice_stable_surface=round(float((g.ice == 0).mean()), 3),
        share_ice_stable_within_1m=round(float((g.ice <= 1).mean()), 3),
        median_ice_depth_m=None if g.ice.notna().sum() == 0 else round(float(g.ice.median()), 3),
        share_colder_than_earth_record=round(float((g.temp_avg < EARTH_RECORD_LOW_K).mean()), 3),
    )
    print(ref, out[ref])

json.dump(dict(sites=out, earth_record_low_K=EARTH_RECORD_LOW_K, earth_record_high_K=EARTH_RECORD_HIGH_K,
               source="LRO Diviner polar resource product, NASA PDS Geosciences (Paige et al.)"),
          open(PROCESSED / "diviner.json", "w"), indent=1)

# ---------- figure: max temperature, 85°S–pole
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

L, px = 150_000, 1000
sel = (d.x.abs() < L) & (d.y.abs() < L)
ix = ((d.x[sel] + L) // px).astype(int); iy = ((L - d.y[sel]) // px).astype(int)
n = 2 * L // px
img = np.full((n, n), np.nan); cnt = np.zeros((n, n))
acc = np.zeros((n, n)); np.add.at(acc, (iy, ix), d.temp_avg[sel].values); np.add.at(cnt, (iy, ix), 1)
img[cnt > 0] = acc[cnt > 0] / cnt[cnt > 0]

plt.rcParams.update({"font.size": 10, "axes.facecolor": "#0b0f17", "figure.facecolor": "#0b0f17",
                     "text.color": "#f0efec", "axes.labelcolor": "#c9c7c1", "xtick.color": "#8a8780", "ytick.color": "#8a8780"})
fig, ax = plt.subplots(figsize=(7.2, 6.4))
im = ax.imshow(img, extent=[-L / 1e3, L / 1e3, -L / 1e3, L / 1e3], cmap="inferno", vmin=40, vmax=220)
names = {"moon_connecting_ridge": "Connecting Ridge", "moon_malapert": "Malapert"}
for ref, b in boxes.items():
    ax.add_patch(Rectangle((b.left / 1e3, b.bottom / 1e3), (b.right - b.left) / 1e3, (b.top - b.bottom) / 1e3,
                           fill=False, ec="#5fd0ff", lw=2))
    ax.text(b.right / 1e3 + 3, b.top / 1e3, names.get(ref, ref), color="#5fd0ff", fontsize=10, va="top")
cb = fig.colorbar(im, ax=ax, shrink=0.8); cb.set_label("Diviner average surface temperature (K)")
ax.set_xlabel("km (polar stereographic)"); ax.set_ylabel("km")
ax.set_title("Lunar south pole: what no Earth site reproduces\n"
             f"Earth's record low is {EARTH_RECORD_LOW_K:.0f} K; almost all of this map averages below it", fontsize=11)
FIGURES.mkdir(parents=True, exist_ok=True)
fig.tight_layout(); fig.savefig(FIGURES / "fig6_diviner.png", dpi=150)
print("wrote", FIGURES / "fig6_diviner.png")
