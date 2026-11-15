"""Twin-light timelapse: the same low Sun sweeping 360° over a Moon Base site and over its best Earth analog.

At the lunar south pole the Sun circles the horizon at a few degrees, so long shadows sweep around the terrain over
a lunar day. Each frame casts shadows with the Sun at 2° from one azimuth, on both 6 km windows, side by side.
A badge on the Earth panel says whether that Sun direction really happens there (at sunrise/sunset, some day of the
year) or is lunar-pole-only light.

Outputs: figures/extras/twin_light_<ref>.mp4 and _poster.png (+ a smaller .gif with --gif)
Usage:   python scripts/extras/twin_timelapse.py [ref ...] [--gif]    (default: every Moon reference)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import imageio.v2 as imageio
import common as c
from pen.shadows import lowsun_hillshade

ELEV = 2.0
STEP = 5            # degrees of azimuth per frame → 72 frames
PAD = 80            # pixels of terrain around the window so shadows from outside are cast
BG, INK, INK2, ACC, EARTH = "#0b0f17", "#f0efec", "#9a978f", "#5fd0ff", "#f2a65a"


def render(z, i, j, az):
    sub, (oi, oj) = c.crop(z, i, j, PAD)
    img = lowsun_hillshade(sub, ELEV, az, c.RES)[oi:oi + c.W, oj:oj + c.W]
    return np.where(np.isnan(img), 0.0, img)


def compass(ax, az, color):
    ax.set_xlim(-1.3, 1.3); ax.set_ylim(-1.3, 1.3); ax.set_aspect("equal"); ax.axis("off")
    ax.add_patch(plt.Circle((0, 0), 1, fill=False, ec=INK2, lw=1))
    for t, (x, y) in {"N": (0, 1.18), "E": (1.18, 0), "S": (0, -1.18), "W": (-1.18, 0)}.items():
        ax.text(x, y, t, color=INK2, ha="center", va="center", fontsize=8)
    a = math.radians(az)
    ax.plot([0, math.sin(a)], [0, math.cos(a)], color=color, lw=2)
    ax.add_patch(plt.Circle((math.sin(a), math.cos(a)), 0.16, color="#ffd166"))


def make(ref):
    pairs = c.best_pairs()
    if ref not in pairs:
        print("skip", ref, "(no windows)"); return
    p = pairs[ref]
    zr, ir, jr = c.ref_grid_and_window(ref)
    ze = c.grid(p["site"])
    lat = p["lat"]
    reach = {az: c.low_sun_azimuth_reachable(lat, az, ELEV) for az in range(0, 360, STEP)}
    frames, lit = [], []
    for az in range(0, 360, STEP):
        ra, ea = render(zr, ir, jr, az), render(ze, p["i"], p["j"], az)
        lit.append(min((ra > 0.05).mean(), (ea > 0.05).mean()))
        fig = plt.figure(figsize=(10, 5.6), dpi=100, facecolor=BG)
        for k, (z, i, j, title, col) in enumerate([
                (zr, ir, jr, c.label(ref).split("(")[0].strip(), ACC),
                (ze, p["i"], p["j"], f"Earth · {c.short(p['site'])} ({p['lat']:.3f}, {p['lon']:.3f})", EARTH)]):
            ax = fig.add_axes([0.03 + 0.485 * k, 0.12, 0.455, 0.72])
            ax.imshow(ra if k == 0 else ea, cmap="gray", vmin=0, vmax=1, interpolation="bilinear")
            ax.set_xticks([]); ax.set_yticks([])
            for sp in ax.spines.values(): sp.set_color(col); sp.set_linewidth(2)
            ax.set_title(title, color=INK, fontsize=10.5, loc="left")
            ax.plot([10, 10 + 1000 / c.RES], [c.W - 10, c.W - 10], color="white", lw=3)
            ax.text(10, c.W - 16, "1 km", color="white", fontsize=8)
        cax = fig.add_axes([0.455, 0.0, 0.09, 0.115]); compass(cax, az, ACC)
        ok = reach[az]
        fig.text(0.548, 0.055, ("✓ this light happens here at sunrise/sunset" if ok else "lunar-pole-only light: never this low from here"),
                 color=(EARTH if ok else INK2), fontsize=9, ha="left")
        fig.text(0.03, 0.055, f"Sun {ELEV:.0f}° above the horizon, from {az:03d}°", color=INK, fontsize=10)
        fig.text(0.03, 0.93, "Same low Sun, two worlds", color=INK, fontsize=15, fontweight="bold")
        fig.text(0.03, 0.885, f"P.E.N. · similarity {p['score']:.0f}/100 (terrain {p['terrain']:.0f}, illumination "
                 f"{p['illumination']:.0f}) · black = cast shadow · 6 km windows at 30 m", color=INK2, fontsize=9)
        fig.canvas.draw()
        frames.append(np.asarray(fig.canvas.buffer_rgba())[..., :3].copy())
        plt.close(fig)
    imageio.imwrite(c.OUT_FIG / f"twin_light_{ref}_poster.png", frames[int(np.argmax(lit))])   # the most-lit frame
    mp4 = c.OUT_FIG / f"twin_light_{ref}.mp4"
    imageio.mimsave(mp4, frames, fps=12, codec="libx264", quality=7, macro_block_size=8,
                    pixelformat="yuv420p", ffmpeg_params=["-preset", "veryfast"])
    if MAKE_GIF:
        small = [f[::2, ::2] for f in frames[::2]]
        imageio.mimsave(c.OUT_FIG / f"twin_light_{ref}.gif", small, duration=0.12, loop=0)
    share = np.mean(list(reach.values()))
    print(f"{ref:24s} ↔ {p['site']:30s} {len(frames)} frames · Earth reaches {share:.0%} of these Sun directions → {mp4.name}")


MAKE_GIF = "--gif" in sys.argv

if __name__ == "__main__":
    for ref in ([a for a in sys.argv[1:] if not a.startswith("--")] or c.lunar_refs()):
        make(ref)
