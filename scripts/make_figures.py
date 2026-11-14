"""Figures for README, slides and the app → figures/*.png (English labels, as required for submission)."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from pen.config import load_config, PROCESSED, CACHE, FIGURES
from pen.shadows import lowsun_hillshade

cfg = load_config()
RES = cfg["resolution_m"]; W6 = int(cfg["main_window_km"] * 1000 / RES)
R = json.load(open(PROCESSED / "results.json"))
V = json.load(open(PROCESSED / "validation.json")) if (PROCESSED / "validation.json").exists() else {}
win = pd.read_csv(PROCESSED / "windows.csv")
summ = pd.read_csv(PROCESSED / "summary.csv")
FIGURES.mkdir(exist_ok=True)

SURF, INK, INK2 = "#fcfcfb", "#0b0b0b", "#52514e"
CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
SEQ = LinearSegmentedColormap.from_list("blue", ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"])
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": "#c9c8c2",
                     "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
                     "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF})
SHORT = {k: v["label"].split("·", 1)[-1].split("(")[0].split(",")[0].strip() for k, v in cfg["sites"].items()}
REFS = [r for r in cfg["sites"] if cfg["sites"][r]["role"] == "reference" and r in R["reference_features"]]
CANDS = [c for c in cfg["sites"] if cfg["sites"][c]["role"] == "candidate" and c in R["low_sun_hours_by_month"]]
CREDIT = "Data: NASA LRO/LOLA (GSFC PGDA), NASA MRO CTX DTMs (USGS), ESA Copernicus DEM GLO-30. Team Pollones en Fuga · NASA Space Apps 2026."


def ref_window(ref):
    z = np.load(CACHE / f"{ref}_z.npy"); shm = np.load(CACHE / f"{ref}_shadow_e2.npy")
    rf = R["reference_features"][ref]; best, bd = None, 1e9
    for i in range(0, z.shape[0] - W6 + 1, W6 // 2):
        for j in range(0, z.shape[1] - W6 + 1, W6 // 2):
            zz = z[i:i + W6, j:j + W6]
            if np.isfinite(zz).mean() < 0.95: continue
            d = abs(math.log10(np.subtract(*np.nanpercentile(zz, [98, 2]))) - rf["relief"]) \
                + abs(shm[i:i + W6, j:j + W6][np.isfinite(zz)].mean() - rf["shadow_e2"])
            if d < bd: best, bd = (i, j), d
    return z, best


def crop_render(z, i, j, pad=60):
    i0, j0 = max(i - pad, 0), max(j - pad, 0)
    sub = z[i0:i + W6 + pad, j0:j + W6 + pad]
    return lowsun_hillshade(sub, 3, 225, RES)[i - i0:i - i0 + W6, j - j0:j - j0 + W6]


# 1 — side by side under the same 3° sun
pairs = [r for r in ["moon_connecting_ridge", "mars_arcadia"] if r in REFS]
fig, axs = plt.subplots(len(pairs), 2, figsize=(10, 5.2 * len(pairs)), squeeze=False)
for row, ref in enumerate(pairs):
    zr, (i, j) = ref_window(ref)
    top = win[win.reference == ref].sort_values("score_combined", ascending=False).iloc[0]
    zc = np.load(CACHE / f"{top.site}_z.npy")
    panels = [(zr, i, j, cfg["sites"][ref]["label"]),
              (zc, int(top.i), int(top.j), f"Best Earth analog: {SHORT[top.site]}  ({top.lat:.3f}, {top.lon:.3f})\n"
               f"terrain {top.score_terrain:.0f} · illumination {top.score_illumination:.0f} · combined {top.score_combined:.0f}")]
    for col, (z, ii, jj, title) in enumerate(panels):
        ax = axs[row, col]
        ax.imshow(crop_render(z, ii, jj), cmap="gray", vmin=0, vmax=1, interpolation="nearest")
        ax.set_title(title, fontsize=10.5, color=INK, loc="left"); ax.set_xticks([]); ax.set_yticks([])
        ax.plot([10, 10 + 1000 / RES], [W6 - 10, W6 - 10], color="white", lw=3)
        ax.text(10, W6 - 16, "1 km", color="white", fontsize=9)
fig.suptitle("Same low Sun (3° elevation, from SW), same scale: 6 km windows at 30 m", x=0.02, ha="left",
             fontsize=12.5, color=INK, fontweight="bold")
fig.text(0.02, 0.005, "Black = cast shadow. " + CREDIT, fontsize=8, color=INK2)
fig.tight_layout(rect=(0, 0.02, 1, 0.96)); fig.savefig(FIGURES / "fig1_low_sun_side_by_side.png", dpi=150); plt.close(fig)

# 2 — score matrix per dimension
dims = [c for c in summ.columns if c.startswith("score_") and c != "score_combined"] + ["score_combined"]
fig, axs = plt.subplots(1, len(dims), figsize=(4.5 * len(dims), 4.6), sharey=True)
for ax, key in zip(axs, dims):
    M = np.array([[summ[(summ.reference == r) & (summ.site == c)][key].iloc[0] for c in CANDS] for r in REFS])
    ax.imshow(M, cmap=SEQ, vmin=20, vmax=100)
    for a in range(len(REFS)):
        for b in range(len(CANDS)):
            ax.text(b, a, f"{M[a, b]:.0f}", ha="center", va="center", fontsize=11, color="white" if M[a, b] > 65 else INK)
    ax.set_xticks(range(len(CANDS)), [SHORT[c] for c in CANDS], rotation=30, ha="right")
    ax.set_yticks(range(len(REFS)), [cfg["sites"][r]["label"].split("(")[0].strip() for r in REFS])
    ax.set_title(key.replace("score_", "").capitalize(), loc="left", color=INK, fontsize=11)
    for s in ax.spines.values(): s.set_visible(False)
    ax.tick_params(length=0)
fig.suptitle("Similarity score (0–100) of the best 6 km window in each Earth region", x=0.01, ha="left",
             fontsize=12.5, color=INK, fontweight="bold")
fig.text(0.01, 0.01, "100 = identical features; ~37 = one inter-quartile range apart on average.", fontsize=8.5, color=INK2)
fig.tight_layout(rect=(0, 0.04, 1, 0.93)); fig.savefig(FIGURES / "fig2_score_matrix.png", dpi=150); plt.close(fig)

# 3 — analog in time
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
fig, ax = plt.subplots(figsize=(10, 4.8))
for k, c in enumerate(CANDS):
    v = R["low_sun_hours_by_month"][c]
    ax.plot(range(12), v, color=CAT[k % len(CAT)], lw=2, marker="o", ms=5, label=SHORT[c])
ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.09), ncol=4, fontsize=9)
ax.set_xticks(range(12), months); ax.set_ylabel("hours per day"); ax.set_ylim(0, 6.8)
ax.grid(axis="y", color="#e8e7e2", lw=0.8); ax.set_axisbelow(True)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
ax.set_title("High Arctic sites give 4–6 h/day of lunar-pole-like low Sun near the equinoxes", loc="left",
             fontsize=12.5, color=INK, fontweight="bold")
ax.text(0, 6.45, "Hours per day with the Sun 0–7° above the horizon. At the lunar south pole the Sun never rises above ~7°.",
        fontsize=9, color=INK2)
fig.tight_layout(rect=(0, 0.03, 1, 1)); fig.savefig(FIGURES / "fig3_analog_in_time.png", dpi=150); plt.close(fig)

# 4 — validation
if V:
    ref = "moon_connecting_ridge"
    lit = np.load(CACHE / f"{ref}_lit_model.npy"); av = np.load(CACHE / f"{ref}_lola_avgvisib.npy"); b = 50
    fig, axs = plt.subplots(1, 2, figsize=(10, 5.2))
    for ax, (img, t) in zip(axs, [(lit[b:-b, b:-b], "Our model: lit fraction, Sun at 0.5–2.5°"),
                                  (av[b:-b, b:-b], "LOLA (Mazarico et al.): 18.6-yr average illumination")]):
        lo, hi = np.nanpercentile(img, [2, 98])
        ax.imshow(img, cmap=SEQ, vmin=lo, vmax=hi); ax.set_title(t, fontsize=10, loc="left", color=INK)
        ax.set_xticks([]); ax.set_yticks([])
    others = ", ".join(f"{SHORT[k]} ρ = {v['spearman_rho']:.2f}" for k, v in V.items() if k != ref)
    fig.suptitle(f"Connecting Ridge: our local shadow model reproduces the official pattern (Spearman ρ = {V[ref]['spearman_rho']:.2f})",
                 x=0.02, ha="left", fontsize=12, color=INK, fontweight="bold")
    fig.text(0.02, 0.01, f"Darker = more illuminated. {others}: distant horizons outside the local DEM matter more there.",
             fontsize=8.5, color=INK2)
    fig.tight_layout(rect=(0, 0.03, 1, 0.94)); fig.savefig(FIGURES / "fig4_illumination_validation.png", dpi=150); plt.close(fig)
print("figures →", FIGURES)
