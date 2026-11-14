"""Thermal gap: LRO Diviner at the Moon Base sites vs the Earth analog regions.

The challenge resources say Diviner's polar products "could be compared with extreme cold, ice-bearing, or other
terrestrial environments". This script makes that comparison with numbers, at region scale:
  * Moon:  data/processed/diviner.json (LRO Diviner polar resource product, per reference footprint).
  * Earth: NASA POWER climatology (MERRA-2, 2001-2025) at the centre of each Earth region: skin temperature
           TS (annual mean), TS_MIN and TS_MAX (coldest / warmest monthly mean of the daily extremes).
           No API key needed. The answers are cached in the output JSON, so the script also runs offline.

The two sides are not the same quantity (Diviner: annual mean 2 cm below the surface and annual maximum at the
surface, per ~240 m facet; POWER: skin temperature of a ~50 km model cell). The gap is tens to hundreds of kelvin,
far larger than that difference, but this is context, not a scored dimension.

Outputs
  data/processed/thermal_gap.json
  figures/fig8_thermal_gap.png
Usage:  python scripts/thermal_gap.py [--refresh]     (--refresh asks NASA POWER again)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pen.config import load_config, PROCESSED, FIGURES

POWER = ("https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=TS,TS_MAX,TS_MIN"
         "&community=AG&longitude={lon:.3f}&latitude={lat:.3f}&format=JSON")
OUT = PROCESSED / "thermal_gap.json"
K = 273.15

cfg = load_config()
res = json.load(open(PROCESSED / "results.json", encoding="utf-8"))
div = json.load(open(PROCESSED / "diviner.json", encoding="utf-8"))
old = json.load(open(OUT, encoding="utf-8")) if OUT.exists() else {}
refresh = "--refresh" in sys.argv


def short(sid):
    return cfg["sites"][sid]["label"].split("·", 1)[-1].split("(")[0].strip()


def power_point(lon, lat):
    with urllib.request.urlopen(POWER.format(lon=lon, lat=lat), timeout=60) as r:
        j = json.load(r)
    p = j["properties"]["parameter"]
    return dict(ts_mean_K=round(p["TS"]["ANN"] + K, 1), ts_min_K=round(p["TS_MIN"]["ANN"] + K, 1),
                ts_max_K=round(p["TS_MAX"]["ANN"] + K, 1), period=j["header"]["range"].split("(")[-1].rstrip(")"))


earth = {}
for sid, s in cfg["sites"].items():
    if s["role"] != "candidate" or sid not in res["site_centers"]:
        continue
    lon, lat = res["site_centers"][sid]
    cached = old.get("earth", {}).get(sid)
    if cached and not refresh:
        earth[sid] = cached
    else:
        earth[sid] = dict(label=short(sid), lon=round(lon, 3), lat=round(lat, 3), **power_point(lon, lat))
        print("POWER", sid, earth[sid])

moon = {sid: dict(label=short(sid), temp_avg_mean_K=v["temp_avg_mean_K"], temp_avg_min_K=v["temp_avg_min_K"],
                  temp_max_max_K=v["temp_max_max_K"]) for sid, v in div["sites"].items()}

# Mars reference sites (Mars Climate Database, written by scripts/mars_context.py); optional
mc = PROCESSED / "mars_context.json"
mars = json.load(open(mc, encoding="utf-8"))["sites"] if mc.exists() else {}
for m in mars.values():
    m["label"] = m["label"].split("·", 1)[-1].split("(")[0].strip()

coldest = min(earth, key=lambda k: earth[k]["ts_mean_K"])
hottest = max(earth, key=lambda k: earth[k]["ts_max_K"])
summary = dict(
    coldest_earth_region=coldest,
    coldest_earth_mean_K=earth[coldest]["ts_mean_K"],
    coldest_earth_min_K=min(e["ts_min_K"] for e in earth.values()),
    hottest_earth_region=hottest,
    hottest_earth_max_K=earth[hottest]["ts_max_K"],
    moon_mean_K=[min(m["temp_avg_mean_K"] for m in moon.values()), max(m["temp_avg_mean_K"] for m in moon.values())],
    moon_peak_K=[min(m["temp_max_max_K"] for m in moon.values()), max(m["temp_max_max_K"] for m in moon.values())],
    # how much colder each Moon site's mean is than the mean of the coldest Earth region
    gap_to_coldest_earth_mean_K={sid: round(earth[coldest]["ts_mean_K"] - m["temp_avg_mean_K"], 1) for sid, m in moon.items()},
)
if mars:
    summary["mars_mean_K"] = [min(m["tsurf_mean_K"] for m in mars.values()), max(m["tsurf_mean_K"] for m in mars.values())]
    summary["mars_gap_to_coldest_earth_mean_K"] = {sid: round(earth[coldest]["ts_mean_K"] - m["tsurf_mean_K"], 1)
                                                   for sid, m in mars.items()}
json.dump(dict(moon=moon, mars=mars, earth=earth, summary=summary,
               sources=dict(moon="LRO Diviner polar resource product, NASA PDS Geosciences (Paige et al.): annual mean "
                                 "2 cm below the surface, annual maximum at the surface, per reference footprint",
                            mars="Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES), modelled surface temperature at the "
                                 "site centre over 12 seasons x 24 local hours (scripts/mars_context.py)",
                            earth="NASA POWER climatology API (MERRA-2): skin temperature TS at the region centre; "
                                  "min/max = coldest/warmest monthly mean of the daily minimum/maximum")),
          open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("summary", summary)

# ---------- figure: temperature range per site, Moon on top
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SURF, INK, INK2, MOON, EARTH, MARS = "#fcfcfb", "#0b0b0b", "#52514e", "#1c5cab", "#eb6834", "#8a5a00"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": "#c9c8c2", "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "figure.facecolor": SURF, "axes.facecolor": SURF,
                     "savefig.facecolor": SURF})
rows = [(m["label"], m["temp_avg_min_K"], m["temp_avg_mean_K"], m["temp_max_max_K"], MOON) for m in moon.values()]
rows += [(m["label"], m["tsurf_min_K"], m["tsurf_mean_K"], m["tsurf_max_K"], MARS) for m in mars.values()]
rows += [(e["label"].split(",")[0], e["ts_min_K"], e["ts_mean_K"], e["ts_max_K"], EARTH)
         for e in sorted(earth.values(), key=lambda e: e["ts_mean_K"])]
fig, ax = plt.subplots(figsize=(9.5, 6.2 + 0.28 * len(mars)))
for i, (lab, lo, mid, hi, col) in enumerate(rows):
    y = len(rows) - 1 - i
    ax.plot([lo, hi], [y, y], color=col, lw=5, alpha=0.35, solid_capstyle="round")
    ax.plot(mid, y, "o", color=col, ms=7)
ax.set_yticks(range(len(rows)), [r[0] for r in rows][::-1])
ax.axhline(len(earth) - 0.5, color="#c9c8c2", lw=0.8)
lowrec = div["earth_record_low_K"]
ax.axvline(lowrec, color=INK2, lw=1, ls="--")
ax.text(lowrec - 3, len(earth) / 2 - 0.5, f"Earth's record low\n(air, {lowrec:.0f} K)", ha="right", va="center",
        fontsize=8.5, color=INK2)
ax.text(0.0, 1.02, "● Moon · LRO Diviner", transform=ax.transAxes, ha="left", va="bottom", color=MOON, fontweight="bold")
if mars:
    ax.axhline(len(earth) + len(mars) - 0.5, color="#c9c8c2", lw=0.8)
    ax.text(0.30, 1.02, "● Mars · MCD (model)", transform=ax.transAxes, ha="left", va="bottom", color=MARS, fontweight="bold")
ax.text(0.60 if mars else 0.42, 1.02, "● Earth · NASA POWER", transform=ax.transAxes, ha="left", va="bottom", color=EARTH, fontweight="bold")
ax.set_xlabel("Temperature (K)     dot = annual mean · bar = coldest to hottest")
ax.grid(axis="x", color="#e8e7e2", lw=0.8); ax.set_axisbelow(True)
for sp in ["top", "right"]:
    ax.spines[sp].set_visible(False)
fig.suptitle("Earth's coldest places come close to Mars, but not to the Moon Base" if mars else
             "Earth matches the Moon Base's heat, not its cold", x=0.02, ha="left", fontsize=12.5, color=INK, fontweight="bold")
fig.text(0.02, 0.012, "Moon: annual mean 2 cm below the surface and surface maximum, per site footprint (measured)."
         + ("  Mars: modelled surface temperature at the site centre\n(Mars Climate Database v6.2)." if mars else "")
         + "  Earth: skin temperature of the ~50 km cell at each region centre.", fontsize=7.2, color=INK2)
FIGURES.mkdir(parents=True, exist_ok=True)
fig.tight_layout(rect=(0, 0.05, 1, 0.95)); fig.savefig(FIGURES / "fig8_thermal_gap.png", dpi=150)
print("wrote", FIGURES / "fig8_thermal_gap.png")
