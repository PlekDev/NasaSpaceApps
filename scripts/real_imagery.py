"""Real imagery for the Analog card, from NASA APIs listed on api.nasa.gov → data/processed/thumbs/real__*.jpg

  Moon  : Moon Trek WMTS, LRO NAC south-pole mosaic (1 m/px, polar stereographic)  — NASA SSERVI / JPL Trek
  Mars  : Mars Trek WMTS, CTX global mosaic (Murray Lab, ~5 m/px; served through Trek's catalogue)
  Earth : GIBS WMS, Landsat WELD annual true colour (30 m); MODIS true colour (250 m) where WELD has no data;
          HLS (Harmonized Landsat Sentinel-2, 30 m) for the few windows where WELD shows striping artefacts

Every image is reprojected onto the SAME 6 km window grid as the low-Sun preview, so the two line up pixel by pixel.

Usage
  python scripts/real_imagery.py jobs              # writes data/processed/imagery/jobs.json (what to download)
  python scripts/real_imagery.py fetch             # downloads the tiles with urllib and builds the images
  python scripts/real_imagery.py import FILE.json  # same, from mosaics composed elsewhere (e.g. in a browser)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, math, io, base64, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin, xy
from rasterio.warp import reproject, Resampling, transform as warp_transform
from pen.config import load_config, RAW, PROCESSED, RADIUS_M
from pen.grid import to_metric

cfg = load_config()
RES = cfg["resolution_m"]
W = int(cfg["main_window_km"] * 1000 / RES)       # window size in pixels (200 at 6 km)
UP = 3                                            # output images are 3× the DEM resolution (600 px, 10 m/px)
THUMBS = PROCESSED / "thumbs"
JOBS = PROCESSED / "imagery" / "jobs.json"
TOP_N = 15

MOON_SP = CRS.from_proj4(f"+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={RADIUS_M['moon']} +units=m +no_defs")
MARS_GEO = CRS.from_proj4(f"+proj=longlat +R={RADIUS_M['mars']} +no_defs")
EARTH_GEO = CRS.from_epsg(4326)

# Moon Trek south-polar TileMatrixSet (from WMTSCapabilities): origin (-1095930, 1095930) m, 256 px tiles,
# level-0 scale denominator 3.0578404017857101e7 → 8561.95 m/px, halving per level.
MOON = dict(url="https://trek.nasa.gov/tiles/Moon/SP/LRO_NAC_AvgMosaic_SPole855_1mp/1.0.0/default/default028mm/{z}/{row}/{col}.png",
            x0=-1095930.0, y0=1095930.0, tile=256, res0=3.0578404017857101e7 * 0.00028, z=10,
            credit="NASA LRO NAC south-pole mosaic via Moon Trek WMTS")
# Mars Trek CTX global mosaic: geographic, origin (-180, 90), 512 px tiles, level z = 180/2^z degrees per tile
MARS = dict(url="https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{row}/{col}",
            tile=512, z=10, credit="MRO CTX global mosaic (Murray Lab) via Mars Trek WMTS")
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" \
       "&LAYERS={layer}&CRS=EPSG:4326&BBOX={s},{w},{n},{e}&WIDTH={px}&HEIGHT={px}&FORMAT=image/jpeg{time}"
EARTH_LAYERS = [("Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", "", "Landsat WELD annual mosaic (30 m) via NASA GIBS"),
                ("MODIS_Terra_CorrectedReflectance_TrueColor", "&TIME={date}", "MODIS Terra true colour (250 m) via NASA GIBS")]


def window_corners(g, i, j):
    """Lon/lat of the window's outer corners (and a dense edge sample for safe bounding boxes)."""
    t = np.linspace(0, W, 9)
    rows = np.r_[np.full(9, i), np.full(9, i + W), i + t, i + t]
    cols = np.r_[j + t, j + t, np.full(9, j), np.full(9, j + W)]
    xs, ys = xy(g.transform, rows, cols, offset="ul")
    lon, lat = warp_transform(g.crs, g.geog, np.atleast_1d(xs), np.atleast_1d(ys))
    return np.asarray(lon), np.asarray(lat)


def build_jobs():
    win = pd.read_csv(PROCESSED / "windows.csv")
    refwin = json.load(open(THUMBS / "ref_windows.json"))
    grids, jobs = {}, []

    def grid(site):
        if site not in grids:
            s = cfg["sites"][site]
            grids[site] = to_metric(RAW / s["file"], s["body"], RES)
            grids[site].z = None  # keep only the geometry
        return grids[site]

    for ref, (i, j) in refwin.items():
        body = cfg["sites"][ref]["body"]
        lon, lat = window_corners(grid(ref), i, j)
        if body == "moon":
            x, y = warp_transform(grid(ref).geog, MOON_SP, lon, lat)
            res = MOON["res0"] / 2 ** MOON["z"]; span = MOON["tile"] * res
            c0, c1 = int((min(x) - MOON["x0"]) // span), int((max(x) - MOON["x0"]) // span)
            r0, r1 = int((MOON["y0"] - max(y)) // span), int((MOON["y0"] - min(y)) // span)
            jobs.append(dict(id=f"ref__{ref}", site=ref, i=i, j=j, kind="tiles", src="moon", z=MOON["z"],
                             rows=[r0, r1], cols=[c0, c1], tile=MOON["tile"], url=MOON["url"],
                             bounds=[MOON["x0"] + c0 * span, MOON["y0"] - r0 * span, res], credit=MOON["credit"]))
        else:
            lon = (np.asarray(lon) + 180) % 360 - 180
            deg = 180 / 2 ** MARS["z"]
            c0, c1 = int((min(lon) + 180) // deg), int((max(lon) + 180) // deg)
            r0, r1 = int((90 - max(lat)) // deg), int((90 - min(lat)) // deg)
            jobs.append(dict(id=f"ref__{ref}", site=ref, i=i, j=j, kind="tiles", src="mars", z=MARS["z"],
                             rows=[r0, r1], cols=[c0, c1], tile=MARS["tile"], url=MARS["url"],
                             bounds=[-180 + c0 * deg, 90 - r0 * deg, deg / MARS["tile"]], credit=MARS["credit"]))
        top = win[win.reference == ref].sort_values("score_combined", ascending=False).head(TOP_N)
        for r in top.itertuples():
            jid = f"{r.site}_{int(r.i)}_{int(r.j)}"
            if any(jb["id"] == jid for jb in jobs):
                continue
            lon, lat = window_corners(grid(r.site), int(r.i), int(r.j))
            pad = 0.05 * (max(lat) - min(lat))
            s_, n_ = float(min(lat) - pad), float(max(lat) + pad)
            dlon = max(lon) - min(lon); w_, e_ = float(min(lon) - 0.05 * dlon), float(max(lon) + 0.05 * dlon)
            summer = "2024-07-15" if (s_ + n_) / 2 > 0 else "2024-01-15"
            jobs.append(dict(id=jid, site=r.site, i=int(r.i), j=int(r.j), kind="wms", src="earth", px=768,
                             bbox=[s_, w_, n_, e_],
                             urls=[GIBS.format(layer=l, s=s_, w=w_, n=n_, e=e_, px=768, time=tm.format(date=summer))
                                   for l, tm, _ in EARTH_LAYERS],
                             credits=[c for _, _, c in EARTH_LAYERS]))
    JOBS.parent.mkdir(parents=True, exist_ok=True)
    json.dump(jobs, open(JOBS, "w"))
    n_tiles = sum((jb["rows"][1] - jb["rows"][0] + 1) * (jb["cols"][1] - jb["cols"][0] + 1) for jb in jobs if jb["kind"] == "tiles")
    print(f"{len(jobs)} jobs ({n_tiles} map tiles + {sum(jb['kind'] == 'wms' for jb in jobs)} GIBS images) → {JOBS}")


def _png(b):
    from PIL import Image
    return Image.open(io.BytesIO(b)).convert("RGB")


def fetch_all():
    """Download with urllib (needs internet). Produces the same dict as the browser import."""
    from PIL import Image
    jobs = json.load(open(JOBS)); out = {}
    for jb in jobs:
        try:
            if jb["kind"] == "tiles":
                nr, nc = jb["rows"][1] - jb["rows"][0] + 1, jb["cols"][1] - jb["cols"][0] + 1
                canvas = Image.new("RGB", (nc * jb["tile"], nr * jb["tile"]))
                for a in range(nr):
                    for b in range(nc):
                        u = jb["url"].format(z=jb["z"], row=jb["rows"][0] + a, col=jb["cols"][0] + b)
                        try:
                            canvas.paste(_png(urllib.request.urlopen(u, timeout=30).read()), (b * jb["tile"], a * jb["tile"]))
                        except Exception:
                            pass
                buf = io.BytesIO(); canvas.save(buf, "PNG"); out[jb["id"]] = dict(img=buf.getvalue(), layer=0)
            else:
                for k, u in enumerate(jb["urls"]):
                    b = urllib.request.urlopen(u, timeout=60).read()
                    if not _blank(_png(b)):
                        out[jb["id"]] = dict(img=b, layer=k); break
            print("✓", jb["id"])
        except Exception as e:
            print("✗", jb["id"], e)
    return out


def _blank(img):
    a = np.asarray(img, dtype=float)
    return a.std() < 4 or (a.mean(axis=2) < 8).mean() > 0.5


def import_browser(path):
    d = json.load(open(path)); out = {}
    for k, v in d.items():
        out[k] = dict(img=base64.b64decode(v["data"].split(",", 1)[1]), layer=v.get("layer", 0), credit=v.get("credit"))
    return out


def warp(mosaics):
    """Reproject every mosaic onto its 6 km window grid (3× finer than the DEM) and save JPEGs + credits."""
    jobs = {jb["id"]: jb for jb in json.load(open(JOBS))}
    grids = {}
    cpath = THUMBS / "real_credits.json"
    credits = json.load(open(cpath)) if cpath.exists() else {}   # merge, so partial re-runs keep earlier images
    for jid, m in mosaics.items():
        jb = jobs[jid]; site = jb["site"]
        if site not in grids:
            s = cfg["sites"][site]; grids[site] = to_metric(RAW / s["file"], s["body"], RES); grids[site].z = None
        g = grids[site]
        img = np.asarray(_png(m["img"]), dtype=np.uint8)
        if jb["kind"] == "tiles":
            x0, y0, res = jb["bounds"]
            src_t, src_crs = from_origin(x0, y0, res, res), (MOON_SP if jb["src"] == "moon" else MARS_GEO)
            credit = jb["credit"]
        else:
            s_, w_, n_, e_ = jb["bbox"]; px = jb["px"]
            src_t, src_crs = from_origin(w_, n_, (e_ - w_) / px, (n_ - s_) / px), EARTH_GEO
            credit = m.get("credit") or jb["credits"][m["layer"]]
        ox, oy = xy(g.transform, jb["i"], jb["j"], offset="ul")
        dst_t = from_origin(ox, oy, RES / UP, RES / UP)
        dst = np.zeros((3, W * UP, W * UP), np.uint8)
        for b in range(3):
            reproject(img[..., b], dst[b], src_transform=src_t, src_crs=src_crs, dst_transform=dst_t, dst_crs=g.crs,
                      resampling=Resampling.bilinear)
        if dst.max() == 0:
            print("  (empty after reprojection)", jid); continue
        from PIL import Image
        out = THUMBS / f"real__{jid}.jpg"
        Image.fromarray(np.moveaxis(dst, 0, -1)).save(out, quality=82)
        credits[jid] = credit
    json.dump(credits, open(cpath, "w"), indent=1)
    print(f"{len(mosaics)} images processed, {len(credits)} real images in total → {THUMBS}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "jobs"
    if cmd == "jobs":
        build_jobs()
    elif cmd == "fetch":
        if not JOBS.exists():
            build_jobs()
        warp(fetch_all())
    elif cmd == "import":
        warp(import_browser(sys.argv[2]))
