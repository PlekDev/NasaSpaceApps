"""Fallback source for the Earth LST layer: MOD11A2.061 granules straight from NASA Earthdata (earthaccess), converted to
the same per-date GeoTIFFs that AppEEARS delivers, so `python scripts/earth_lst.py compute` works unchanged.

Needs the GDAL command-line tools built with the HDF4 driver and the `earthaccess` package (pip wheels of rasterio have no
HDF4 driver, and `pyhdf` has no wheel for recent Python versions). A conda-forge environment works:
    micromamba create -p env -c conda-forge python=3.12 libgdal-hdf4 gdal earthaccess numpy pandas pyyaml
    env/bin/python scripts/earth_lst_earthaccess.py --sites earth_pinacate
Credentials: ~/.netrc (machine urs.earthdata.nasa.gov) or EARTHDATA_USERNAME / EARTHDATA_PASSWORD; never committed.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import earth_lst as el
from pen.config import candidates, load_config

GRID = "MODIS_Grid_8Day_1km_LST"
STEP_DEG = 1 / 120           # ~0.93 km, close to the 1 km MODIS pixel


def convert(hdfs, layer: str, bbox, out: Path):
    """Mosaic the same subdataset of every MODIS tile of one composite date and warp it to a GeoTIFF in EPSG:4326 on a
    fixed grid (nearest neighbour keeps raw values and QC bits)."""
    w, s, e, n = bbox
    is_qc = layer.startswith("QC")
    srcs = [f'HDF4_EOS:EOS_GRID:"{h}":{GRID}:{layer}' for h in hdfs]
    cmd = ["gdalwarp", "-q", "-overwrite", "-t_srs", "EPSG:4326", "-te", str(w), str(s), str(e), str(n),
           "-tr", str(STEP_DEG), str(STEP_DEG), "-r", "near", "-ot", "Byte" if is_qc else "UInt16",
           "-dstnodata", "255" if is_qc else "0", "-co", "COMPRESS=DEFLATE"]
    # The HDF4 metadata declares _FillValue = 0 for the QC layers, but QC = 0 means "good": ignore the source nodata there.
    cmd += ["-srcnodata", "None" if is_qc else "0"]
    subprocess.run(cmd + srcs + [str(out)], check=True)


def run(site: str, cfg_site: dict, year: int):
    import earthaccess
    w, s, e, n = el.tile_bounds(cfg_site["file"])
    bbox = (w - el.TILE_PAD_DEG, s - el.TILE_PAD_DEG, e + el.TILE_PAD_DEG, n + el.TILE_PAD_DEG)
    t0 = time.time()
    res = earthaccess.search_data(short_name="MOD11A2", version="061", bounding_box=bbox,
                                  temporal=(f"{year}-01-01", f"{year}-12-31"))
    mb = sum(r.size() if callable(r.size) else r.size for r in res)
    print(f"{site}: {len(res)} granules, {mb:.0f} MB to download", flush=True)
    hdf_dir, out_dir = el.LST_DIR / "_hdf" / site, el.LST_DIR / site
    hdf_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = earthaccess.download(res, str(hdf_dir))
    t_dl = time.time() - t0
    by_date = {}
    for f in files:
        m = re.search(r"\.A(\d{7})\.(h\d\dv\d\d)\.", Path(f).name)
        if m:
            by_date.setdefault(m.group(1), []).append(Path(f))
    for date, hdfs in by_date.items():
        for layer in el.LAYERS:
            out = out_dir / f"MOD11A2.061_{layer}_doy{date}_ea.tif"
            if not out.exists():
                convert(sorted(hdfs), layer, bbox, out)
    print(f"{site}: download {t_dl:.0f} s, total {time.time() - t0:.0f} s, {len(files)} files -> {out_dir}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sites", nargs="*")
    ap.add_argument("--year", type=int, default=el.YEAR)
    a = ap.parse_args()
    import earthaccess
    earthaccess.login(strategy="netrc")
    cfg = load_config()
    for sid in candidates(cfg):
        if not a.sites or sid in a.sites:
            run(sid, cfg["sites"][sid], a.year)


if __name__ == "__main__":
    main()
