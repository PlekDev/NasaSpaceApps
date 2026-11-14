"""Snapshot of open NASA EONET events near every Earth region → data/processed/eonet_snapshot.json

The app asks EONET live; this snapshot is the offline fallback (shown with its date).
Usage:  python scripts/eonet_snapshot.py                 # live (needs internet)
        python scripts/eonet_snapshot.py --from RAW.json  # raw EONET responses saved elsewhere {site: payload}
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, datetime, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pen.config import load_config, PROCESSED, candidates
from pen.eonet import parse, API

RADIUS_KM = 300   # region-level radius; the app filters per window at 150 km
cfg = load_config()
centers = json.load(open(PROCESSED / "results.json"))["site_centers"]
raw = json.load(open(sys.argv[2])) if len(sys.argv) > 2 and sys.argv[1] == "--from" else {}

out = {}
for site in candidates(cfg):
    if site not in centers:
        continue
    lon, lat = centers[site]
    payload = raw.get(site)
    if payload is None:
        import math
        dlat = RADIUS_KM / 111.0; dlon = RADIUS_KM / (111.0 * max(math.cos(math.radians(lat)), 0.05))
        url = API.format(w=lon - dlon, n=min(lat + dlat, 90), e=lon + dlon, s=max(lat - dlat, -90))
        payload = json.load(urllib.request.urlopen(url, timeout=30))
    out[site] = payload.get("events", [])
    print(f"{site:36s} {len(parse(payload, lat, lon, RADIUS_KM))} open events within {RADIUS_KM} km")

json.dump(dict(taken_utc=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M"),
               radius_km=RADIUS_KM, source="NASA EONET v3, status=open", events=out),
          open(PROCESSED / "eonet_snapshot.json", "w"))
