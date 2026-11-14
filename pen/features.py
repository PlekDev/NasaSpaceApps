"""Per-window features. Add new dimensions here (thermal, mineralogy, ice …) as new keys + a DIMENSIONS entry."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import math
import numpy as np
from scipy import ndimage

# Dimension name -> feature keys. Scoring reports one similarity per dimension + a combined score.
DIMENSIONS = {
    "terrain": ["relief", "slope_med", "slope_p90", "rough", "hypso"],
    "illumination": ["shadow_e2", "shadow_e5"],
    # "thermal": ["lst_range", ...],        # TODO(Diego Lizárraga / Diego Doña): Diviner vs MODIS/ECOSTRESS
    # "mineralogy": ["gypsum", ...],        # TODO(Diego Doña): EMIT L2B mineral fractions
}


def slope_deg(z, dx=30.0):
    zf = np.nan_to_num(z, nan=float(np.nanmean(z)))
    gx = ndimage.sobel(zf, axis=1) / (8 * dx)
    gy = ndimage.sobel(zf, axis=0) / (8 * dx)
    s = np.degrees(np.arctan(np.hypot(gx, gy)))
    s[np.isnan(z)] = np.nan
    return s


def roughness_sq(z, size=5):
    """Squared deviation from a size×size moving mean (150 m baseline at 30 m)."""
    zf = np.nan_to_num(z, nan=float(np.nanmean(z)))
    r = (zf - ndimage.uniform_filter(zf, size=size)) ** 2
    r[np.isnan(z)] = np.nan
    return r


def window_features(z, slope, rough, shadows: dict, win_px: int, step_px: int, min_valid=0.95):
    rows = []
    H, W = z.shape
    for i in range(0, H - win_px + 1, step_px):
        for j in range(0, W - win_px + 1, step_px):
            zz = z[i:i + win_px, j:j + win_px]
            valid = np.isfinite(zz)
            if valid.mean() < min_valid:
                continue
            v = zz[valid]
            p2, p98 = np.percentile(v, [2, 98])
            rel = p98 - p2
            if rel < 1.0:  # water bodies / flat artefacts
                continue
            ss = slope[i:i + win_px, j:j + win_px][valid]
            rr = rough[i:i + win_px, j:j + win_px][valid]
            f = dict(i=i, j=j,
                     relief=math.log10(rel),
                     slope_med=float(np.median(ss)),
                     slope_p90=float(np.percentile(ss, 90)),
                     rough=math.log10(math.sqrt(float(np.mean(rr))) + 1e-3),
                     hypso=float((v.mean() - p2) / rel))
            for e, m in shadows.items():
                f[f"shadow_e{e:g}"] = float(m[i:i + win_px, j:j + win_px][valid].mean())
            rows.append(f)
    return rows
