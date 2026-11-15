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

# Reference coordinates of classic analog sites. Each `note` gives the source of the coordinate and its tier:
#   1 = official gazetteer (USGS GNIS), 2 = publication, 3 = secondary source (not verified against an official database).
# analog_for: which reference bodies the site is used for.
KNOWN = [
    dict(name="Meteor Crater (Barringer), AZ", lat=35.0281, lon=-111.0233, analog_for="moon",
         note="Apollo and Artemis astronaut training. Coordinate: USGS GNIS ID 7945 (35.02808, -111.02321), difference 0.01 km"),
    dict(name="SP Crater, San Francisco Volcanic Field, AZ", lat=35.5822, lon=-111.6318, analog_for="moon",
         note="NASA Desert RATS analog site since 1998. Coordinate: USGS GNIS ID 33907 'S P Crater' (35.58223, -111.63183)"),
    dict(name="Pinacate Peaks, Sonora, MX", lat=31.77, lon=-113.49, analog_for="moon",
         note="Apollo astronaut geology training 1965-1970. Coordinate: secondary source (Wikipedia), not verified "
              "(no official gazetteer entry found for Cerro del Pinacate / Volcan Santa Clara)"),
    dict(name="Haughton impact crater, Devon Island, CA", lat=75.3667, lon=-89.6833, analog_for="moon,mars",
         note="Haughton-Mars Project; lunar and Mars analog. Coordinate: Osinski et al., Meteoritics & Planetary Science, "
              "75°22'N 89°41'W (75.3667, -89.6833); Frisch & Thorsteinsson 1978, Arctic 31(2), gives 75°22'N 89°40'W"),
    dict(name="Cinder Lake Crater Field, AZ", lat=35.3066, lon=-111.5048, analog_for="moon",
         note="Apollo-era crater field built by USGS for astronaut training. Coordinate: centre of the bounding box in the USGS "
              "data release doi:10.5066/P13W5FTZ (Scheidt, Hudziak & Morse; W -111.507610, E -111.502037, N 35.309627, S 35.303513)"),
    # Removed: "HMP Research Station, Devon Island" (75.433, -89.867 = 75°26'N 89°52'W, Mars Institute, https://www.marsinstitute.no/hmp).
    # It is the Haughton-Mars Project base camp on the NW rim of Haughton crater, ~7.9 km from the crater centre (~9 km with the updated Haughton coordinate) used
    # above, so it is the same analog site and would count Haughton twice.
    dict(name="Pu'u Hiwahine, Mauna Kea, HI", lat=19.7609, lon=-155.4707, analog_for="moon,mars",
         note="NASA/CSA/DLR ISRU analog field tests 2010 & 2012 (PISCES). Coordinate: NTRS 20140008708, 19°45'39.29\"N 155°28'14.56\"W "
              "(19.76091, -155.47071). GNIS ID 363687 (summit Puʻuhaiwahine) is 0.55 km away"),
    # Removed: "Askja caldera, IS" (65.03, -16.75; Apollo training 1965 & 1967). The point falls on the Oskjuvatn lake, which
    # pen.grid.mask_water sets to NaN (flat 1055.5 m plateau): ~30 % of its 6 km box is masked, so no window reaches the 95 %
    # valid-pixel minimum and the site cannot be tested.
    dict(name="Yungay, Atacama Desert, CL", lat=-24.0806, lon=-69.9861, analog_for="mars",
         note="Hyperarid Mars analog. Coordinate: McKay et al. 2003, Astrobiology 3(2), p. 394, University of Antofagasta "
              "Desert Research Station, 24°04'50\"S 69°59'10\"W (-24.0806, -69.9861)"),
    dict(name="University Valley, McMurdo Dry Valleys, AQ", lat=-77.867, lon=160.75, analog_for="mars",
         note="Dry-permafrost analog of the Phoenix site. Coordinate: Marinova et al. 2022, Antarctic Science 34(2), "
              "doi:10.1017/S0954102022000025, 77°52'S 160°45'E"),
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
            print(f"WARNING: {k['name']} ({k['lat']}, {k['lon']}) is not inside any {ref} window; it is NOT tested")
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
