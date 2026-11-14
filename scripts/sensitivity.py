"""Sensitivity of the ranking to (a) the weight of illumination vs terrain and (b) the window size.
Writes data/processed/sensitivity.json and figures/fig5_sensitivity.png."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pen.config import load_config, PROCESSED, FIGURES
from pen.features import DIMENSIONS

cfg = load_config()
win = pd.read_csv(PROCESSED / "windows.csv")
R = json.load(open(PROCESSED / "results.json"))
nT, nI = len(DIMENSIONS["terrain"]), len(DIMENSIONS["illumination"])
WEIGHTS = [0.0, 0.25, 0.5, 1.0, 2.0, 4.0]  # illumination weight, terrain fixed at 1


def combined(df, wi):
    dT = -np.log(df.score_terrain / 100); dI = -np.log(df.score_illumination / 100)
    return 100 * np.exp(-np.sqrt((nT * dT ** 2 + wi * nI * dI ** 2) / (nT + wi * nI)))


out = {"illumination_weight": WEIGHTS, "top10_overlap_vs_equal": {}, "top_region": {}}
for ref, g in win.groupby("reference"):
    g = g.copy()
    key = lambda d: set(zip(d.site, d.i, d.j))
    base = key(g.assign(s=combined(g, 1.0)).nlargest(10, "s"))
    ov, top = [], []
    for w in WEIGHTS:
        t = g.assign(s=combined(g, w)).nlargest(10, "s")
        ov.append(len(base & key(t)))
        top.append(t.site.iloc[0])
    out["top10_overlap_vs_equal"][ref] = ov
    out["top_region"][ref] = top
out["window_size_top10_region_counts"] = R["stability_top10_by_window_km"]
json.dump(out, open(PROCESSED / "sensitivity.json", "w"), indent=1)

# figure: one line per reference
SURF, INK, INK2 = "#fcfcfb", "#0b0b0b", "#52514e"
CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "figure.facecolor": SURF, "axes.facecolor": SURF,
                     "axes.edgecolor": "#c9c8c2", "xtick.color": INK2, "ytick.color": INK2, "axes.labelcolor": INK2})
fig, ax = plt.subplots(figsize=(10, 4.6))
x = np.arange(len(WEIGHTS))
for k, (ref, ov) in enumerate(out["top10_overlap_vs_equal"].items()):
    ax.plot(x, ov, marker="o", lw=2, ms=6, color=CAT[k % len(CAT)], label=cfg["sites"][ref]["label"].split("(")[0].strip())
ax.set_xticks(x, [f"{w:g}×" for w in WEIGHTS]); ax.set_ylim(-0.3, 10.6); ax.set_yticks(range(0, 11, 2))
ax.set_xlabel("weight of illumination relative to terrain"); ax.set_ylabel("windows shared with equal-weight top 10")
ax.grid(axis="y", color="#e8e7e2", lw=0.8); ax.set_axisbelow(True)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=2, fontsize=9)
ax.set_title("Illumination changes which sites win: the top 10 shifts as its weight grows", loc="left",
             fontsize=12.5, color=INK, fontweight="bold")
fig.tight_layout(); fig.savefig(FIGURES / "fig5_sensitivity.png", dpi=150); plt.close(fig)
for ref in out["top10_overlap_vs_equal"]:
    print(ref, out["top10_overlap_vs_equal"][ref], out["top_region"][ref])
