"""Mars context: surface temperature and pressure at the Mars reference sites, next to Earth.

The Moon sites have LRO Diviner measurements for "where Earth stops being an analog". Mars has no equivalent
per-site product in our pipeline, so we use the Mars Climate Database v6.2 (LMD/OU/IAA, supported by ESA and CNES),
a climate MODEL validated against orbiter data, through its public web interface. For the centre of each Mars
reference we ask for surface temperature and surface pressure at every season (areocentric longitude Ls, every 30°
in the rows we keep) and every local hour, with the "climatology" dust scenario.

These are modelled values at a ~5.6° grid interpolated to the point, not measurements, and they are context only:
nothing here is scored. scripts/thermal_gap.py (run after this one) puts them next to the Moon and Earth in fig8.

Outputs
  data/processed/mars_context.json      (the answers are cached there, so the script also runs offline)
Usage:  python scripts/mars_context.py [--refresh]
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, re, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from pen.config import load_config, PROCESSED

BASE = "https://www-mars.lmd.jussieu.fr/mcd_python/"
QUERY = ("cgi-bin/mcdcgi.py?var1=tsurf&var2=ps&var3=none&var4=none&datekeyhtml=1&ls=all&localtime=all&year=2024&month=1"
         "&day=1&hours=0&minutes=0&seconds=0&julian=2460310.5&martianyear=37&sol=1&latitude={lat:.3f}&longitude={lon:.3f}"
         "&altitude=0.&zkey=3&isfixedlt=off&dust=1&hrkey=1&averaging=off&dpi=80&islog=off&colorm=jet&minval=&maxval="
         "&proj=cyl&plat=&plon=&trans=&iswind=off&latpoint=&lonpoint=")
OUT = PROCESSED / "mars_context.json"
TRIPLE_POINT_PA = 611.657      # water: below this pressure liquid water is not stable at any temperature
EARTH_SEA_LEVEL_PA = 101_325.0

cfg = load_config()
res = json.load(open(PROCESSED / "results.json", encoding="utf-8"))
old = json.load(open(OUT, encoding="utf-8")) if OUT.exists() else {}
refresh = "--refresh" in sys.argv


def blocks(txt):
    """The text file holds one table per variable: rows = Ls, columns = local time. Returns {title: 2D array}."""
    out, title, rows = {}, None, []
    for line in txt.splitlines() + ["###"]:
        m = re.match(r"### Columns 2\+ are (.+)", line)
        if line.startswith("###"):          # any header line closes the table before it
            if title and rows:
                out[title] = np.array(rows)
                rows = []
            title = m.group(1).strip() if m else title
        elif re.match(r"^[+-]?\d", line) and "||" in line:
            rows.append([float(v) for v in line.split("||")[1].split()])
    return out


def mcd_point(lon, lat):
    with urllib.request.urlopen(BASE + QUERY.format(lon=lon, lat=lat), timeout=180) as r:
        html = r.read().decode("utf-8", "replace")
    href = re.search(r"\.\./(txt/[0-9a-f]+\.txt)", html).group(1)
    with urllib.request.urlopen(BASE + href, timeout=60) as r:
        b = blocks(r.read().decode("utf-8", "replace"))
    t = next(v for k, v in b.items() if "temperature" in k.lower())[:-1, :-1]   # drop Ls = 360 and hour 24 (duplicates)
    p = next(v for k, v in b.items() if "pressure" in k.lower())[:-1, :-1]
    return dict(tsurf_mean_K=round(float(t.mean()), 1), tsurf_min_K=round(float(t.min()), 1),
                tsurf_max_K=round(float(t.max()), 1), ps_mean_Pa=round(float(p.mean())),
                ps_min_Pa=round(float(p.min())), ps_max_Pa=round(float(p.max())),
                share_above_freezing=round(float((t > 273.15).mean()), 3), n_samples=int(t.size))


mars = {}
for sid, s in cfg["sites"].items():
    if s["body"] != "mars" or s["role"] != "reference" or sid not in res["site_centers"]:
        continue
    lon, lat = res["site_centers"][sid]
    cached = old.get("sites", {}).get(sid)
    if cached and not refresh:
        mars[sid] = cached
    else:
        mars[sid] = dict(label=s["label"], lon=round(lon, 3), lat=round(lat, 3), **mcd_point(lon, lat))
        print("MCD", sid, mars[sid], flush=True)

summary = dict(
    mars_mean_K=[min(m["tsurf_mean_K"] for m in mars.values()), max(m["tsurf_mean_K"] for m in mars.values())],
    mars_min_K=min(m["tsurf_min_K"] for m in mars.values()),
    mars_max_K=max(m["tsurf_max_K"] for m in mars.values()),
    mars_pressure_Pa=[min(m["ps_min_Pa"] for m in mars.values()), max(m["ps_max_Pa"] for m in mars.values())],
    pressure_share_of_earth_sea_level=[round(min(m["ps_mean_Pa"] for m in mars.values()) / EARTH_SEA_LEVEL_PA, 4),
                                       round(max(m["ps_mean_Pa"] for m in mars.values()) / EARTH_SEA_LEVEL_PA, 4)],
)
json.dump(dict(sites=mars, summary=summary, water_triple_point_Pa=TRIPLE_POINT_PA, earth_sea_level_Pa=EARTH_SEA_LEVEL_PA,
               source="Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES), web interface, climatology scenario: modelled "
                      "surface temperature and pressure at the site centre, 12 seasons x 24 local hours"),
          open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("summary", summary)
