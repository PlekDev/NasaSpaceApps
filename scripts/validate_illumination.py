"""Validate the local cast-shadow model against the official LOLA average-illumination map (Mazarico et al. 2011).
Writes data/processed/validation.json and caches the two maps for figures."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from scipy.stats import spearmanr
from penumbra.config import load_config, RAW, PROCESSED, CACHE
from penumbra.grid import to_metric, resample_onto
from penumbra.shadows import shadow_fraction_maps

cfg = load_config()
avg = RAW / cfg["auxiliary"]["lola_avg_illumination_85s"]["file"]
out = {}
for sid, s in cfg["sites"].items():
    if s["body"] != "moon":
        continue
    g = to_metric(RAW / s["file"], "moon", cfg["resolution_m"])
    # Polar sun: ~0–3° elevation; average 16 azimuths and three elevations
    sh = shadow_fraction_maps(g.z, (0.5, 1.5, 2.5), tuple(range(0, 360, 22)), cfg["resolution_m"])
    lit = 1 - np.mean(list(sh.values()), axis=0)
    ref = resample_onto(avg, g)
    lit[np.isnan(g.z)] = np.nan; ref[np.isnan(g.z)] = np.nan
    ok = np.isfinite(lit) & np.isfinite(ref)
    edge = np.zeros_like(ok); b = 50; edge[b:-b, b:-b] = True; ok &= edge  # drop 1.5 km border
    sub = ok[::4, ::4]  # 120 m sampling to reduce autocorrelation
    rho, _ = spearmanr(lit[::4, ::4][sub], ref[::4, ::4][sub])
    out[sid] = dict(spearman_rho=round(float(rho), 3), n_pixels=int(sub.sum()))
    np.save(CACHE / f"{sid}_lit_model.npy", lit); np.save(CACHE / f"{sid}_lola_avgvisib.npy", ref)
    print(sid, out[sid])
json.dump(out, open(PROCESSED / "validation.json", "w"), indent=1)
