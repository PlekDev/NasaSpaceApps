"""Exact cast-shadow computation for a low sun.

Key idea (O(N) per row, no maximum horizon distance):
with the sun coming from the left of a row, pixel i is shadowed iff there is j < i with
    z_j - (i - j)·dx·tan(e) > z_i.
Define g_i = z_i + i·dx·tan(e). The condition becomes  max_{j<i} g_j > g_i  → a running maximum.
Other azimuths rotate the DEM so the sun comes from the left, then rotate the mask back.

Known simplifications: no body curvature, no horizons outside the DEM, sun treated as a point source.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import math
import numpy as np
from scipy import ndimage


def _shadow_rows(z: np.ndarray, tan_e: float, dx: float) -> np.ndarray:
    n = z.shape[1]
    g = z + np.arange(n)[None, :] * dx * tan_e
    g = np.where(np.isnan(g), -np.inf, g)
    prev = np.maximum.accumulate(g, axis=1)
    prev = np.concatenate([np.full((z.shape[0], 1), -np.inf), prev[:, :-1]], axis=1)
    return (prev > g) & np.isfinite(g)


def cast_shadow(z: np.ndarray, elev_deg: float, az_deg: float, dx: float = 30.0) -> np.ndarray:
    """Boolean shadow mask. az: direction the sun comes FROM, degrees clockwise from image-up (north)."""
    tan_e = math.tan(math.radians(elev_deg))
    nanmask = np.isnan(z)
    if nanmask.any():  # fill holes with nearest valid value so they do not act as artificial pits
        idx = ndimage.distance_transform_edt(nanmask, return_distances=False, return_indices=True)
        zf = z[tuple(idx)]
    else:
        zf = z
    ang = az_deg - 270.0  # az=270 (west) already comes from the left
    if ang % 360 == 0:
        sh = _shadow_rows(zf, tan_e, dx)
    else:
        zr = ndimage.rotate(zf, ang, reshape=True, order=1, mode="nearest")
        mr = ndimage.rotate(nanmask.astype(np.float32), ang, reshape=True, order=1, cval=1.0) > 1e-3
        zr[mr] = np.nan
        shr = _shadow_rows(zr, tan_e, dx).astype(np.uint8)
        back = ndimage.rotate(shr, -ang, reshape=True, order=0, cval=0)
        oy = (back.shape[0] - z.shape[0]) // 2
        ox = (back.shape[1] - z.shape[1]) // 2
        sh = back[oy:oy + z.shape[0], ox:ox + z.shape[1]].astype(bool)
    sh[nanmask] = False
    return sh


def shadow_fraction_maps(z, elevs=(2, 5), azs=tuple(range(0, 360, 45)), dx=30.0) -> dict:
    """Per pixel: fraction of azimuths in shadow, for each sun elevation."""
    out = {e: np.zeros(z.shape, np.float32) for e in elevs}
    for a in azs:
        for e in elevs:
            out[e] += cast_shadow(z, e, a, dx)
    return {e: m / len(azs) for e, m in out.items()}


def lowsun_hillshade(z, elev=3.0, az=225.0, dx=30.0) -> np.ndarray:
    """Hillshade with cast shadows (black), contrast-stretched on lit pixels. For figures and the app."""
    zf = np.where(np.isnan(z), np.nanmean(z), z)
    gy, gx = np.gradient(zf, dx)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    zen, azr = math.radians(90 - elev), math.radians(az)
    hs = np.clip(np.cos(zen) * np.cos(slope) + np.sin(zen) * np.sin(slope) * np.cos(azr - aspect), 0, 1)
    sh = cast_shadow(z, elev, az, dx)
    lit = hs[~sh & np.isfinite(z)]
    top = np.percentile(lit, 99) if lit.size else 1.0
    img = np.clip(hs / max(top, 1e-6), 0, 1) * 0.92 * (~sh) + 0.03
    img[np.isnan(z)] = np.nan
    return img
