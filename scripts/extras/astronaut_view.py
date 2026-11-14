"""What the astronaut sees: an eye-level view (1.7 m) of a Moon Base site and of its best Earth analog, low Sun.

Rendered straight from the elevation models with a column ray-caster (no AI imagery):
  * Moon: the LOLA 85°S polar DEM at 40 m, so the horizon holds the real mountains up to 15 km away
    (falls back to the 30 m site grid if that DEM is missing);
  * Earth: the Copernicus 30 m grid of the region;
  * curvature of each body; terrain shaded with the same low-Sun hillshade + cast shadows as the rest of P.E.N.;
  * the astronaut stands on the local high point of the 6 km window and looks toward the most distant relief;
    the Sun is 2° high, to the right on the Moon, and on Earth at the closest direction where a 2° Sun really
    occurs at that latitude.
Grey shading only (the DEM has no colour); the blue sky on Earth is the atmosphere the Moon does not have.

Outputs: figures/extras/astronaut_view_<ref>.png
Usage:   python scripts/extras/astronaut_view.py [ref ...]      (default: every Moon reference)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.ndimage import map_coordinates
import common as c
from pen.grid import to_metric
from pen.shadows import lowsun_hillshade
from pen.config import RAW, RADIUS_M
from rasterio.transform import xy
from rasterio.warp import transform as warp_transform

IMG_W, IMG_H, HFOV = 1400, 460, 75.0
EYE = 1.7
DMAX = 15_000.0
HORIZON_ROW = 0.62          # camera tilted slightly up: more horizon, less ground at your feet
ELEV = 2.0
BG, INK, INK2 = "#0b0f17", "#f0efec", "#9a978f"
F = (IMG_W / 2) / math.tan(math.radians(HFOV / 2))
D = 2.0 * 1.006 ** np.arange(0, 3000)
D = D[D <= DMAX]
R_EARTH = 6_371_000.0


class Surface:
    """Height + shade sampler on a raster, with directions given relative to LOCAL north."""

    def __init__(self, z, res, r0, c0, north_angle, radius, sun_az, scale=1.0):
        self.res, self.r0, self.c0, self.R = res, r0, c0, radius
        self.rot = north_angle                       # clockwise angle from grid-up to local north (deg)
        pad = int(DMAX / res) + 40
        i0, j0 = max(int(r0) - pad, 0), max(int(c0) - pad, 0)
        self.z = np.asarray(z[i0:int(r0) + pad, j0:int(c0) + pad], dtype=np.float32) * scale
        self.off = (i0, j0)
        from scipy.ndimage import gaussian_filter
        hs = lowsun_hillshade(self.z, ELEV, (sun_az + self.rot) % 360, res)
        lit = gaussian_filter((hs > 0.031).astype(np.float32), 0.8)          # soften the 30–40 m shadow staircase
        self.shade = np.where(np.isfinite(hs), 0.03 + (hs - 0.03).clip(0) + 0 * lit, np.nan)
        self.litfrac = lit
        self._viewpoint()

    def _viewpoint(self):
        """Stand on the local high point of the 6 km window (highest above its 1 km surroundings): open view."""
        from scipy.ndimage import uniform_filter
        half = int(c.W * c.RES / 2 / self.res)
        rc, cc0 = int(self.r0 - self.off[0]), int(self.c0 - self.off[1])
        zf = np.nan_to_num(self.z, nan=float(np.nanmean(self.z)))
        k = 2 * int(round(1000 / self.res)) + 1
        tpi = zf - uniform_filter(zf, size=k)
        sub = tpi[rc - half:rc + half, cc0 - half:cc0 + half]
        a, b = np.unravel_index(np.nanargmax(sub), sub.shape)
        self.r0, self.c0 = rc - half + a + self.off[0], cc0 - half + b + self.off[1]
        self.z0 = self.sample(self.z, np.array([self.r0 - self.off[0]]), np.array([self.c0 - self.off[1]]))[0] + EYE

    @staticmethod
    def sample(a, r, cc):
        return map_coordinates(a, [r, cc], order=1, mode="constant", cval=np.nan)

    def lit_near(self, radius_m=3000.0):
        """Share of terrain within radius_m of the viewpoint that is in sunlight."""
        k = int(radius_m / self.res)
        r, cc = int(self.r0 - self.off[0]), int(self.c0 - self.off[1])
        return float(np.nanmean(self.litfrac[max(r - k, 0):r + k, max(cc - k, 0):cc + k]))

    def rays(self, az_deg):
        g = np.radians(np.asarray(az_deg) + self.rot)[:, None]
        rr = (self.r0 - self.off[0]) - (D[None, :] / self.res) * np.cos(g)
        cc = (self.c0 - self.off[1]) + (D[None, :] / self.res) * np.sin(g)
        return rr, cc

    def horizon(self, az_deg, dmin=2000.0):
        """Highest terrain elevation angle beyond dmin in each direction (where the distant relief is)."""
        rr, cc = self.rays(az_deg)
        h = self.sample(self.z, rr.ravel(), cc.ravel()).reshape(rr.shape) - D ** 2 / (2 * self.R)
        e = np.degrees(np.arctan2(h - self.z0, D))
        return np.nanmax(np.where(D[None, :] >= dmin, e, np.nan), axis=1)

    def render(self, cam_az, sky_top, sky_bottom, fog, ambient):
        cols = np.arange(IMG_W)
        az = cam_az + np.degrees(np.arctan((cols - IMG_W / 2) / F))
        rr, cc = self.rays(az)
        h = self.sample(self.z, rr.ravel(), cc.ravel()).reshape(rr.shape) - D ** 2 / (2 * self.R)
        s = self.sample(self.shade, rr.ravel(), cc.ravel()).reshape(rr.shape)
        lf = self.sample(self.litfrac, rr.ravel(), cc.ravel()).reshape(rr.shape)
        ytop = IMG_H * HORIZON_ROW - F * (h - self.z0) / D
        ytop = np.where(np.isfinite(ytop), ytop, np.inf)
        m = np.minimum.accumulate(ytop, axis=1)
        img = np.zeros((IMG_H, IMG_W, 3))
        t = np.linspace(0, 1, IMG_H)[:, None]
        sky = np.array(sky_top)[None, :] * (1 - t) + np.array(sky_bottom)[None, :] * t
        rows = np.arange(IMG_H)
        for x in cols:
            k = np.searchsorted(-m[x], -rows, side="left")          # first step whose terrain covers this row
            k = np.where(rows >= m[x][0], 0, k)
            vis = k < len(D)
            col = np.repeat(sky[:, None, :], 1, axis=1)[:, 0, :].copy()
            kk = k[vis]
            sv = np.nan_to_num(s[x, kk], nan=0.0)
            w = np.nan_to_num(lf[x, kk], nan=0.0)   # 0 = cast shadow, 1 = sunlit (softened edge)
            sun = 0.20 + 0.75 * np.clip((sv - 0.03) / 0.92, 0, 1) ** 0.5
            tone = w * sun + (1 - w) * ambient
            v = tone[:, None] * np.array([1.0, 1.0, 1.0])
            if fog:
                a = (D[kk] / DMAX)[:, None] ** 0.8 * fog
                v = v * (1 - a) + np.array(sky_bottom)[None, :] * a
            col[vis] = v
            img[:, x, :] = col
        return np.clip(img, 0, 1)


def moon_surface(ref, sun_rel):
    zr, i, j = c.ref_grid_and_window(ref)
    s = c.cfg["sites"][ref]
    g = to_metric(RAW / s["file"], "moon", c.RES)
    x, y = xy(g.transform, i + c.W / 2, j + c.W / 2)
    ldem = RAW / c.cfg["auxiliary"]["lola_ldem_85s_40m"]["file"]
    if ldem.exists():
        lon, lat = warp_transform(g.crs, g.geog, [x], [y])
        from pyproj import Transformer
        R = RADIUS_M["moon"]
        to_ps = Transformer.from_crs(f"+proj=longlat +R={R} +no_defs",
                                     f"+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={R} +units=m +no_defs", always_xy=True)
        px, py = to_ps.transform(lon[0], lat[0])
        z = np.memmap(ldem, dtype="<f4", mode="r", shape=(7584, 7584))
        north = math.degrees(math.atan2(px, py))   # local north = away from the pole
        surf = lambda sun: Surface(z, 40.0, 3791.5 - py / 40, px / 40 + 3791.5, north, R, sun, scale=1000.0)
        return surf, "LOLA 85°S polar DEM, 40 m"
    surf = lambda sun: Surface(zr, c.RES, i + c.W / 2, j + c.W / 2, 0.0, RADIUS_M["moon"], sun)
    return surf, "LOLA 5 m site DEM resampled to 30 m"


def make(ref):
    pairs = c.best_pairs()
    if ref not in pairs:
        print("skip", ref); return
    p = pairs[ref]
    azs = np.arange(0, 360, 5)
    mk, moon_src = moon_surface(ref, 0)
    probe = mk(0.0)
    cam_m = float(azs[np.nanargmax(probe.horizon(azs))])
    # The polar Sun circles the horizon: show the time of day when the site is lit (Sun not in your face: 60–300° off)
    rel = range(60, 301, 20)
    sun_m = max(((cam_m + r) % 360 for r in rel), key=lambda a: mk(a).lit_near())
    moon = mk(sun_m)
    ze = c.grid(p["site"])
    earth_probe = Surface(ze, c.RES, p["i"] + c.W / 2, p["j"] + c.W / 2, 0.0, R_EARTH, 0.0)
    cam_e = float(azs[np.nanargmax(earth_probe.horizon(azs))])
    ok = [a for a in range(0, 360, 4) if c.low_sun_azimuth_reachable(p["lat"], a, ELEV)
          and 60 <= ((a - cam_e) % 360) <= 300]
    mke = lambda a: Surface(ze, c.RES, p["i"] + c.W / 2, p["j"] + c.W / 2, 0.0, R_EARTH, a)
    sun_e = max(ok, key=lambda a: mke(a).lit_near()) if ok else (cam_e + 100) % 360
    earth = mke(sun_e)
    im_m = moon.render(cam_m, (0, 0, 0), (0.02, 0.02, 0.03), 0, ambient=0.06)    # no air: only light reflected from lit terrain
    im_e = earth.render(cam_e, (0.30, 0.50, 0.80), (0.72, 0.82, 0.92), 0.55, ambient=0.16)  # skylight fills shadows
    fig = plt.figure(figsize=(14, 11.2), facecolor=BG)
    for k, (im, title, sub) in enumerate([
            (im_m, f"Moon · {c.short(ref)}", f"looking {cam_m:.0f}° · Sun 2° high from {sun_m:.0f}° (the polar Sun circles the horizon; time of day with the site lit) · {moon_src}"),
            (im_e, f"Earth · {c.short(p['site'])} ({p['lat']:.3f}, {p['lon']:.3f})",
             f"looking {cam_e:.0f}° · Sun 2° high from {sun_e:.0f}° (a real sunrise/sunset direction here) · Copernicus DEM 30 m")]):
        ax = fig.add_axes([0.02, 0.53 - 0.47 * k, 0.96, 0.38])
        ax.imshow(im, interpolation="bilinear", aspect="auto"); ax.axis("off")
        fig.text(0.02, 0.925 - 0.47 * k, title, color=INK, fontsize=14, fontweight="bold")
        fig.text(0.02, 0.91 - 0.47 * k, sub, color=INK2, fontsize=10)
    fig.text(0.02, 0.975, "What the astronaut sees: eye level, 1.7 m, 75° field of view, terrain up to 15 km",
             color=INK, fontsize=16, fontweight="bold")
    fig.text(0.02, 0.012, f"P.E.N. · similarity {p['score']:.0f}/100 · rendered from elevation models with a camera-like tone curve; "
             "no photographs, no AI imagery. Earth's sky and the skylight in its shadows come from the atmosphere the Moon lacks.",
             color=INK2, fontsize=9)
    out = c.OUT_FIG / f"astronaut_view_{ref}.png"
    fig.savefig(out, facecolor=BG, dpi=100); plt.close(fig)
    print(f"{ref:24s} cam {cam_m:.0f}° | Earth {p['site']} cam {cam_e:.0f}° sun {sun_e}° → {out.name}")


if __name__ == "__main__":
    for ref in (sys.argv[1:] or c.lunar_refs()):
        make(ref)
