"""Bring any DEM (Moon, Mars, Earth) onto a common local metric grid.

Each DEM is reprojected to a local azimuthal-equidistant projection centred on the DEM, using the body's
radius (WGS84 for Earth), and averaged to `res` metres. Distances and slopes are then comparable across bodies.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
from dataclasses import dataclass
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import reproject, Resampling, calculate_default_transform, transform as warp_transform
from affine import Affine

from .config import RADIUS_M


@dataclass
class Grid:
    z: np.ndarray          # elevation [m], NaN = no data
    transform: Affine      # pixel -> projected metres
    crs: CRS               # local AEQD
    geog: CRS              # lon/lat CRS of the same body
    lat0: float
    lon0: float
    res: float

    def pixel_to_lonlat(self, rows, cols):
        xs, ys = rasterio.transform.xy(self.transform, rows, cols)
        lon, lat = warp_transform(self.crs, self.geog, np.atleast_1d(xs), np.atleast_1d(ys))
        return np.asarray(lon), np.asarray(lat)


def body_geog(body: str) -> CRS:
    if body == "earth":
        return CRS.from_epsg(4326)
    return CRS.from_proj4(f"+proj=longlat +R={RADIUS_M[body]} +no_defs")


def to_metric(path, body: str, res: float = 30.0) -> Grid:
    with rasterio.open(path) as src:
        b = src.bounds
        geog = body_geog(body)
        cx, cy = (b.left + b.right) / 2, (b.top + b.bottom) / 2
        if src.crs.is_geographic:
            lon0, lat0 = cx, cy
        else:
            lo, la = warp_transform(src.crs, geog, [cx], [cy])
            lon0, lat0 = lo[0], la[0]
        datum = "+datum=WGS84" if body == "earth" else f"+R={RADIUS_M[body]}"
        dst_crs = CRS.from_proj4(f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} {datum} +units=m +no_defs")
        transform, w, h = calculate_default_transform(src.crs, dst_crs, src.width, src.height, *b, resolution=res)
        arr = src.read(1).astype(np.float32)
        if src.nodata is not None and not np.isnan(src.nodata):
            arr[arr == src.nodata] = np.nan
        arr[arr < -1e4] = np.nan
        dst = np.full((h, w), np.nan, dtype=np.float32)
        reproject(arr, dst, src_transform=src.transform, src_crs=src.crs, dst_transform=transform,
                  dst_crs=dst_crs, resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
    return Grid(dst, transform, dst_crs, geog, lat0, lon0, res)


def resample_onto(path, grid: Grid, resampling=Resampling.bilinear) -> np.ndarray:
    """Resample another raster (e.g. LOLA illumination map) onto an existing Grid."""
    with rasterio.open(path) as src:
        a = src.read(1).astype(np.float32)
        if src.nodata is not None:
            a[a == src.nodata] = np.nan
        out = np.full(grid.z.shape, np.nan, np.float32)
        reproject(a, out, src_transform=src.transform, src_crs=src.crs, dst_transform=grid.transform,
                  dst_crs=grid.crs, resampling=resampling, src_nodata=np.nan, dst_nodata=np.nan)
    return out
