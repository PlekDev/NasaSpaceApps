"""Twin rover traverse: plan the same drive on a Moon/Mars site and on its best Earth analog, then compare them.

On each 6 km window (30 m grid) a least-cost route links the same two relative positions (SW → NE corner areas):
  cost per cell = 1 + (slope / 10°)² + 3 × shadow fraction at 2° Sun      (steep and dark cost more)
  slopes above 20° are impassable (a typical limit for planetary rovers).
For both routes we report length, climb, slope and shadow along the way, so a field team can see whether the Earth
drive really rehearses the lunar one, and where it does not.

Outputs: figures/extras/rover_twin_<ref>.png, data/processed/briefs/rover_twin.json
Usage:   python scripts/extras/rover_twin.py [ref ...]          (default: every reference)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from skimage.graph import route_through_array
from scipy.ndimage import distance_transform_edt
import common as c
from pen.features import slope_deg
from pen.shadows import lowsun_hillshade

MAX_SLOPE = 20.0
START, END = (0.85, 0.12), (0.15, 0.88)          # (row, col) as fractions of the window: SW → NE
BG, INK, INK2, MOON, EARTH = "#0b0f17", "#f0efec", "#9a978f", "#5fd0ff", "#f2a65a"


def window_layers(site, i, j):
    z = c.grid(site)
    sub, (oi, oj) = c.crop(z, i, j, 60)
    zz = sub[oi:oi + c.W, oj:oj + c.W]
    sl = slope_deg(zz, c.RES)
    sh = c.shadow2(site, z)[i:i + c.W, j:j + c.W]
    img = lowsun_hillshade(sub, 3, 225, c.RES)[oi:oi + c.W, oj:oj + c.W]
    return zz, sl, sh, np.where(np.isnan(img), 0, img)


def plan(zz, sl, sh):
    bad = ~np.isfinite(zz) | ~np.isfinite(sl) | (sl > MAX_SLOPE)
    cost = 1 + (np.nan_to_num(sl) / 10.0) ** 2 + 3 * np.nan_to_num(sh)
    cost = np.where(bad, 1e6, cost)
    idx = distance_transform_edt(bad, return_distances=False, return_indices=True)   # snap endpoints to passable
    pts = []
    for fr, fc in (START, END):
        r, cc = int(fr * (c.W - 1)), int(fc * (c.W - 1))
        if bad[r, cc]:
            free = np.argwhere(~bad)
            r, cc = free[np.argmin(((free - [r, cc]) ** 2).sum(1))]
        pts.append((int(r), int(cc)))
    path, _ = route_through_array(cost, pts[0], pts[1], fully_connected=True, geometric=True)
    p = np.array(path)
    step = np.r_[0, np.hypot(*np.diff(p, axis=0).T)] * c.RES
    dist = np.cumsum(step)
    zp, slp, shp = zz[p[:, 0], p[:, 1]], sl[p[:, 0], p[:, 1]], sh[p[:, 0], p[:, 1]]
    blocked = bool((cost[p[:, 0], p[:, 1]] >= 1e6).any())
    dz = np.diff(zp)
    stats = dict(length_km=round(float(dist[-1]) / 1000, 2), climb_m=round(float(dz[dz > 0].sum())),
                 descent_m=round(float(-dz[dz < 0].sum())), max_slope_deg=round(float(np.nanmax(slp)), 1),
                 mean_slope_deg=round(float(np.nanmean(slp)), 1), share_in_shadow=round(float(np.mean(shp > 0.5)), 3),
                 mean_shadow_fraction=round(float(np.nanmean(shp)), 3), impassable_cells_crossed=blocked,
                 share_window_impassable=round(float(bad.mean()), 3))
    return p, dist, slp, shp, stats


def make(ref, out):
    pairs = c.best_pairs()
    if ref not in pairs:
        print("skip", ref); return
    p = pairs[ref]
    try:
        zr, ir, jr = c.ref_grid_and_window(ref)
    except (KeyError, FileNotFoundError) as e:
        print("skip", ref, e); return
    A = window_layers(ref, ir, jr)
    B = window_layers(p["site"], p["i"], p["j"])
    pa, da, sla, sha, sa = plan(*A[:3])
    pb, db, slb, shb, sb = plan(*B[:3])
    out[ref] = dict(earth_site=p["site"], earth_window=[p["lat"], p["lon"]], target=sa, earth=sb)

    fig = plt.figure(figsize=(13, 9.6), facecolor=BG)
    tgt = "Moon" if c.body(ref) == "moon" else "Mars"
    for k, (L, path, col, title) in enumerate([(A, pa, MOON, f"{tgt} · {c.short(ref)}"),
                                               (B, pb, EARTH, f"Earth · {c.short(p['site'])} ({p['lat']:.3f}, {p['lon']:.3f})")]):
        ax = fig.add_axes([0.04 + 0.48 * k, 0.40, 0.44, 0.47])
        ax.imshow(L[3], cmap="gray", vmin=0, vmax=1)
        imp = np.ma.masked_where(~(L[1] > MAX_SLOPE), np.ones_like(L[1]))
        ax.imshow(imp, cmap=matplotlib.colors.ListedColormap(["#e34948"]), alpha=0.45)
        ax.plot(path[:, 1], path[:, 0], color=col, lw=2.5)
        ax.plot(path[0, 1], path[0, 0], "o", color="white", ms=7); ax.plot(path[-1, 1], path[-1, 0], "s", color="white", ms=7)
        ax.set_xticks([]); ax.set_yticks([])
        for sp in ax.spines.values(): sp.set_color(col); sp.set_linewidth(2)
        ax.set_title(title, color=INK, fontsize=11.5, loc="left")
        st = sa if k == 0 else sb
        ax.text(0, 1.0 + 0.004, "", transform=ax.transAxes)
        ax.text(0.01, -0.06, f"{st['length_km']} km · climb {st['climb_m']} m · max slope {st['max_slope_deg']}° · "
                f"in shadow {st['share_in_shadow']:.0%} of the way", transform=ax.transAxes, color=INK2, fontsize=9.5)
        if st["impassable_cells_crossed"]:
            ax.text(0.01, -0.11, f"no route stays under {MAX_SLOPE:.0f}°: it must cross steeper ground (a real constraint for "
                    "the rover)", transform=ax.transAxes, color="#e34948", fontsize=9.5)
    for k, (key, ylab, a, b) in enumerate([("slope", "slope (°)", sla, slb), ("shadow", "shadow fraction (Sun 2°, 8 directions)", sha, shb)]):
        ax = fig.add_axes([0.06 + 0.48 * k, 0.07, 0.42, 0.22], facecolor=BG)
        sm = lambda v: np.convolve(np.nan_to_num(v), np.ones(9) / 9, mode="same")    # ~300 m running mean
        ax.plot(da / 1000, sm(a), color=MOON, lw=1.8, label=tgt)
        ax.plot(db / 1000, sm(b), color=EARTH, lw=1.8, label="Earth analog")
        if key == "slope":
            ax.axhline(MAX_SLOPE, color="#e34948", lw=1, ls="--"); ax.text(0.99, MAX_SLOPE + 0.6, "rover limit", color="#e34948", fontsize=8, ha="right", transform=ax.get_yaxis_transform())
        ax.set_xlabel("distance along route (km)", color=INK2); ax.set_ylabel(ylab, color=INK2)
        ax.tick_params(colors=INK2)
        for sp in ["top", "right"]: ax.spines[sp].set_visible(False)
        for sp in ["left", "bottom"]: ax.spines[sp].set_color("#3a3f4a")
        ax.legend(frameon=False, labelcolor=INK, fontsize=9)
    fig.text(0.04, 0.955, "Twin rover traverse: rehearse the same drive on Earth", color=INK, fontsize=16, fontweight="bold")
    fig.text(0.04, 0.925, f"Least-cost route between the same two points of each 6 km window (slopes > {MAX_SLOPE:.0f}° in red are "
             f"impassable; ground often in shadow costs more). P.E.N. similarity of the windows {p['score']:.0f}/100.", color=INK2, fontsize=10)
    fig.savefig(c.OUT_FIG / f"rover_twin_{ref}.png", facecolor=BG, dpi=100); plt.close(fig)
    print(f"{ref:24s} ↔ {p['site']:30s} | {sa['length_km']} km vs {sb['length_km']} km, "
          f"max slope {sa['max_slope_deg']}° vs {sb['max_slope_deg']}°, shadow {sa['share_in_shadow']:.0%} vs {sb['share_in_shadow']:.0%}")


if __name__ == "__main__":
    out = {}
    for ref in (sys.argv[1:] or list(c.best_pairs())):
        make(ref, out)
    path = c.OUT_BRIEF / "rover_twin.json"
    old = json.load(open(path)) if path.exists() else {}
    old.update(out)
    json.dump(dict(sorted(old.items())), open(path, "w"), indent=1)
