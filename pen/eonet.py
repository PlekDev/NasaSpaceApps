"""Field safety from NASA EONET (Earth Observatory Natural Event Tracker, listed on api.nasa.gov).

events_near(lat, lon) returns the OPEN natural events (wildfires, volcanoes, storms, …) within radius_km of a point,
newest first. It never raises: on any network problem it returns None, and the app falls back to the snapshot in
data/processed/eonet_snapshot.json (made by scripts/eonet_snapshot.py), labelled with its date.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, math, urllib.request

API = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&bbox={w},{n},{e},{s}&limit=50"


def _km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _points(geom):
    c = geom.get("coordinates")
    if geom.get("type") == "Point":
        return [c]
    if geom.get("type") == "Polygon":
        return [pt for ring in c for pt in ring]
    return []


def parse(payload, lat, lon, radius_km):
    out = []
    for ev in payload.get("events", []):
        best, when = None, None
        for g in ev.get("geometry", []):
            for lo, la in _points(g):
                d = _km(lat, lon, la, lo)
                if best is None or d < best:
                    best, when = d, g.get("date")
        if best is not None and best <= radius_km:
            out.append(dict(title=ev.get("title"), category=", ".join(c.get("title", "") for c in ev.get("categories", [])),
                            date=(when or "")[:10], distance_km=round(best), link=ev.get("link")))
    return sorted(out, key=lambda e: e["date"], reverse=True)


def events_near(lat, lon, radius_km=150, timeout=4):
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.05))
    url = API.format(w=lon - dlon, n=min(lat + dlat, 90), e=lon + dlon, s=max(lat - dlat, -90))
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return parse(json.load(r), lat, lon, radius_km)
    except Exception:
        return None
