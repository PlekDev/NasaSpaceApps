"""Known-analog test: do classic NASA training/analog sites rank high among all Earth windows?

For each known site we take the 6 km windows that contain it (windows overlap, so up to 4) and report the
percentile of their scores among ALL Earth windows for each reference (100 = best window on Earth, 50 = random).
Writes data/processed/known_analogs.json and .csv. A good method should put real analog sites well above 50.
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
from shapely.geometry import Point, Polygon
from pen.config import PROCESSED

# Coordinates from Wikipedia / published sources (see docs/METHOD.md). analog_for: which reference bodies it is used for.
KNOWN = [
    dict(name="Meteor Crater (Barringer), AZ", lat=35.0281, lon=-111.0233, analog_for="moon",
         note="Apollo and Artemis astronaut training"),
    dict(name="SP Crater, San Francisco Volcanic Field, AZ", lat=35.5822, lon=-111.6318, analog_for="moon",
         note="NASA Desert RATS analog site since 1998"),
    dict(name="Pinacate Peaks, Sonora, MX", lat=31.77, lon=-113.49, analog_for="moon",
         note="Apollo astronaut geology training 1965–1970"),
    dict(name="Haughton impact crater, Devon Island, CA", lat=75.383, lon=-89.667, analog_for="moon,mars",
         note="Haughton-Mars Project; lunar and Mars analog"),
    dict(name="Pu'u Hiwahine, Mauna Kea, HI", lat=19.7609, lon=-155.4707, analog_for="moon,mars",
         note="NASA/CSA/DLR ISRU analog field tests 2010 & 2012 (PISCES); NTRS 20140008708"),
    dict(name="Askja caldera, IS", lat=65.03, lon=-16.75, analog_for="moon",
         note="Apollo astronaut geology training 1965 & 1967"),
    dict(name="Yungay, Atacama Desert, CL", lat=-24.067, lon=-69.86, analog_for="mars",
         note="Hyperarid Mars analog (McKay et al. 2003, Astrobiology)"),
    dict(name="University Valley, McMurdo Dry Valleys, AQ", lat=-77.867, lon=160.75, analog_for="mars",
         note="Dry-permafrost analog of the Phoenix site (Marinova et al. 2022)"),
]

win = pd.read_csv(PROCESSED / "windows.csv")
win["poly"] = win["polygon"].apply(lambda s: Polygon(json.loads(s)))
rows = []
for ref, g in win.groupby("reference"):
    body = ref.split("_")[0]
    for k in KNOWN:
        if body not in k["analog_for"]:
            continue
        pt = Point(k["lon"], k["lat"])
        inside = g[g["poly"].apply(lambda p: p.contains(pt))]
        if inside.empty:
            continue
        rec = dict(reference=ref, site=k["name"], note=k["note"], n_windows=len(inside))
        for s in ["score_combined", "score_terrain", "score_illumination"]:
            pct = [100.0 * (g[s] < v).mean() for v in inside[s]]
            rec[f"{s}_pct_best"] = round(max(pct), 1)
            rec[f"{s}_pct_mean"] = round(float(np.mean(pct)), 1)
        rows.append(rec)

df = pd.DataFrame(rows)
df.to_csv(PROCESSED / "known_analogs.csv", index=False)
summary = {
    "median_percentile_combined_best": float(df["score_combined_pct_best"].median()),
    "share_in_top20pct_combined_best": float((df["score_combined_pct_best"] >= 80).mean()),
    "median_percentile_illumination_best": float(df["score_illumination_pct_best"].median()),
    "median_percentile_terrain_best": float(df["score_terrain_pct_best"].median()),
    "n_tests": int(len(df)),
}
json.dump(dict(summary=summary, rows=rows), open(PROCESSED / "known_analogs.json", "w"), indent=1)
pd.set_option("display.width", 200)
print(df[["reference", "site", "n_windows", "score_combined_pct_best", "score_terrain_pct_best", "score_illumination_pct_best", "score_combined_pct_mean"]].to_string(index=False))
print(summary)
