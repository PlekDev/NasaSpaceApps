"""Control regions (D2): Earth tiles with no lunar or Mars analog interest, scored like the 14 candidate regions.

Question: does P.E.N. rank any rugged or flat terrain high, or terrain that resembles the targets?
  - agricultural plain (Iowa), rolling prairie hills (Flint Hills), rugged non-volcanic high mountains (Swiss Alps).
Each control tile goes through the pipeline's own functions imported from pen/ (via scripts/stats/extract_features.py):
same 30 m grid, water mask, 6 km windows with a 3 km step, and the SAME IQR and reference vectors as the main run
(IQR of the 10,424 Earth windows in windows.csv; reference medians from results.json). Nothing is recomputed with the
controls in the pool, config/sites.yaml is not touched, and the official ranking does not change.

Per target and control: P50 / P90 / max of the combined score, compared with the 14 candidate regions (pooled and per
region), and the rank the control's best window would have if it were inserted among the 10,424 windows (1 + number of
official windows with a strictly higher score, scores rounded to 0.1 as in windows.csv).

Downloads 3 Copernicus GLO-30 tiles (~124 MB) into data/raw/ (git-ignored).
Writes data/processed/controls/controls.json and control_windows.csv.  Run: python scripts/stats/controls.py
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from common import DIM_IDX, KEYS, PROCESSED, ROOT, SEED, combined_from_dims, dim_distances, earth_features, iqr, load_windows, meta, scaled_diff
from pen.config import RAW, load_config  # noqa: E402
sys.path.insert(0, str(ROOT / "scripts"))
from download_data import fetch  # noqa: E402
from extract_features import site_features  # noqa: E402

OUT = PROCESSED / "controls"
URL = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{t}_00_DEM/Copernicus_DSM_COG_10_{t}_00_DEM.tif"
CONTROLS = [
    dict(id="control_iowa_plain", tile="N42_00_W094", label="Central Iowa, USA (agricultural plain)",
         why="Flat cultivated plain. No use as a lunar or Mars analog was found in our search. Expected low for the Moon; "
             "a test of the documented flat-plains degeneracy for Arcadia Planitia."),
    dict(id="control_flint_hills", tile="N38_00_W097", label="Flint Hills, Kansas, USA (rolling prairie hills)",
         why="Gentle, stepped limestone hills under tallgrass prairie, no volcanism or impact craters. No use as a lunar or "
             "Mars analog was found in our search. Tests whether ordinary hills score like the targets."),
    dict(id="control_alps_grisons", tile="N46_00_E009", label="Grisons, Swiss Alps (rugged non-volcanic high mountains)",
         why="High-relief crystalline and sedimentary Alpine terrain (about 1,000-4,049 m, Piz Bernina), no volcanism. "
             "Answers: does P.E.N. only detect rugged terrain, or terrain that resembles the Moon? The tile contains "
             "glaciers (smooth ice surfaces in the DSM, which can lower roughness); their fraction was not measured. "
             "Lakes are removed by the water mask."),
]


def stats(x):
    x = np.asarray(x)
    return {"p50": round(float(np.percentile(x, 50)), 1), "p90": round(float(np.percentile(x, 90)), 1),
            "max": round(float(x.max()), 1), "n_windows": int(len(x))}


def control_features(c, cfg):
    path = RAW / f"Copernicus_DSM_COG_10_{c['tile']}_00_DEM.tif"
    fetch(URL.format(t=c["tile"]), path)
    main = cfg["main_window_km"]
    f = site_features(c["id"], dict(body="earth", role="candidate"), dict(cfg, window_km=[main]), path=path)
    return f[f.window_km == main].reset_index(drop=True)


def main():
    cfg = load_config()
    w = load_windows()
    g0, X = earth_features(w)
    scale = iqr(X)
    rv = json.load(open(PROCESSED / "results.json"))["reference_features"]
    targets = list(dict.fromkeys(w["reference"]))
    feats = {c["id"]: control_features(c, cfg) for c in CONTROLS}

    out = {"_stub": False, "regions": [{k: c[k] for k in ("id", "label", "tile", "why")} for c in CONTROLS]}
    rows = []
    for t in targets:
        ref = np.array([rv[t][k] for k in KEYS])
        off = w[w.reference == t]
        official = np.sort(off["score_combined"].to_numpy())
        rec = {"candidates": stats(official), "by_region": {r: stats(g["score_combined"]) for r, g in off.groupby("site")},
               "controls": {}}
        pooled = []
        for c in CONTROLS:
            F = feats[c["id"]]
            if F.empty:
                rec["controls"][c["id"]] = {"n_windows": 0}
                continue
            d = scaled_diff(F[KEYS].to_numpy(dtype=np.float64), ref, scale)
            D = dim_distances(d)
            s = np.round(combined_from_dims(D), 1)
            best = float(s.max())
            p90_regions = sorted([v["p90"] for v in rec["by_region"].values()], reverse=True)
            st = stats(s)
            rec["controls"][c["id"]] = dict(st, best_rank_if_inserted=int(1 + (official > best).sum()),
                                            of=int(len(official)),
                                            p90_rank_among_regions=int(1 + sum(p > st["p90"] for p in p90_regions)),
                                            n_regions=len(p90_regions),
                                            terrain=stats(np.round(100 * np.exp(-D["terrain"]), 1)),
                                            illumination=stats(np.round(100 * np.exp(-D["illumination"]), 1)))
            pooled.append(s)
            rows += [dict(control=c["id"], reference=t, i=int(F.i[k]), j=int(F.j[k]), lon=round(float(F.lon[k]), 5),
                          lat=round(float(F.lat[k]), 5), score_combined=float(s[k]),
                          score_terrain=round(float(100 * np.exp(-D["terrain"][k])), 1),
                          score_illumination=round(float(100 * np.exp(-D["illumination"][k])), 1)) for k in range(len(s))]
        rec["control"] = stats(np.concatenate(pooled))
        out[t] = rec
        print(f"{t:24s} candidates p50 {rec['candidates']['p50']:5.1f} p90 {rec['candidates']['p90']:5.1f} max {rec['candidates']['max']:5.1f} | "
              + " | ".join(f"{cid.split('_', 1)[1]} p50 {v['p50']:5.1f} p90 {v['p90']:5.1f} max {v['max']:5.1f} #{v['best_rank_if_inserted']}"
                           for cid, v in rec["controls"].items()))
    out["_meta"] = meta(SEED, {"window_km": cfg["main_window_km"], "iqr": "main run (windows.csv pool), not recomputed",
                               "reference": "results.json reference_features (main run)",
                               "rank_if_inserted": "1 + #official windows with a strictly higher score (0.1 rounding)",
                               "tiles": {c["id"]: c["tile"] for c in CONTROLS}},
                        [PROCESSED / "windows.csv", PROCESSED / "results.json"]
                        + [RAW / f"Copernicus_DSM_COG_10_{c['tile']}_00_DEM.tif" for c in CONTROLS])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "controls.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    pd.DataFrame(rows).to_csv(OUT / "control_windows.csv", index=False)
    print("→", OUT / "controls.json", {c["id"]: len(feats[c["id"]]) for c in CONTROLS})


if __name__ == "__main__":
    main()
