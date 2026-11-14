"""Full pipeline: grids → shadows → window features → similarity scores → data/processed/.

Outputs
  data/processed/windows.csv   one row per (Earth window, reference) at the main window size, with lon/lat
                               polygon, scores per dimension and scaled feature differences  (used by the app)
  data/processed/summary.csv   best window per (reference, Earth region)
  data/processed/results.json  reference features, multi-scale stability, low-sun hours
  data/cache/*.npy             grids and shadow maps for figures (git-ignored)
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
import pandas as pd
from pen.config import load_config, RAW, PROCESSED, CACHE, references, candidates
from pen.grid import to_metric
from pen.shadows import shadow_fraction_maps
from pen.features import slope_deg, roughness_sq, window_features, DIMENSIONS
from pen.scoring import iqr_scale, reference_vector, similarity
from pen.sun import low_sun_hours_by_month

t0 = time.time()
cfg = load_config()
RES = cfg["resolution_m"]
WIN = cfg["window_km"]
MAIN = cfg["main_window_km"]
ELEVS = tuple(cfg["sun_elevations_deg"])
AZS = tuple(cfg["sun_azimuths_deg"])
KEYS = [k for ks in DIMENSIONS.values() for k in ks]
PROCESSED.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

store = {}
for sid, s in cfg["sites"].items():
    path = RAW / s["file"]
    if not path.exists():
        print(f"!! missing {path.name} — run scripts/download_data.py"); continue
    g = to_metric(path, s["body"], RES)
    sh = shadow_fraction_maps(g.z, ELEVS, AZS, RES)
    sl, rg = slope_deg(g.z, RES), roughness_sq(g.z)
    np.save(CACHE / f"{sid}_z.npy", g.z)
    np.save(CACHE / f"{sid}_shadow_e{ELEVS[0]:g}.npy", sh[ELEVS[0]])
    feats = {}
    for km in WIN:
        w = int(km * 1000 / RES)
        rows = window_features(g.z, sl, rg, sh, w, max(w // 2, 1))
        if s["role"] == "candidate":  # geolocate windows (centre + corners)
            for r in rows:
                rr = [r["i"], r["i"], r["i"] + w, r["i"] + w, r["i"] + w / 2]
                cc = [r["j"], r["j"] + w, r["j"] + w, r["j"], r["j"] + w / 2]
                lon, lat = g.pixel_to_lonlat(rr, cc)
                r["lon"], r["lat"] = float(lon[4]), float(lat[4])
                r["polygon"] = [[float(a), float(b)] for a, b in zip(lon[:4], lat[:4])]
        feats[km] = rows
    store[sid] = dict(cfg=s, feats=feats, lat0=g.lat0, lon0=g.lon0)
    print(f"{sid:24s} grid {g.z.shape}  windows@{MAIN}km: {len(feats[MAIN]):4d}   {time.time()-t0:5.0f}s", flush=True)

refs = [r for r in references(cfg) if r in store]
cands = [c for c in candidates(cfg) if c in store]

records, ref_features, stability = [], {}, {}
for km in WIN:
    pool = [dict(r, site=c) for c in cands for r in store[c]["feats"][km]]
    scale = iqr_scale(pool, KEYS)
    for ref in refs:
        rv = reference_vector(store[ref]["feats"][km], KEYS)
        scored = []
        for r in pool:
            row = dict(window_km=km, reference=ref, site=r["site"], i=r["i"], j=r["j"],
                       lon=r.get("lon"), lat=r.get("lat"), polygon=json.dumps(r.get("polygon")))
            for dim, ks in DIMENSIONS.items():
                row[f"score_{dim}"], d = similarity(r, rv, ks, scale)
                row.update({f"d_{k}": v for k, v in d.items()})
            row["score_combined"], _ = similarity(r, rv, KEYS, scale)
            row.update({k: r[k] for k in KEYS})
            scored.append(row)
        scored.sort(key=lambda x: -x["score_combined"])
        top10 = [x["site"] for x in scored[:10]]
        stability.setdefault(ref, {})[km] = {c: top10.count(c) for c in cands}
        if km == MAIN:
            ref_features[ref] = rv
            records += scored

df = pd.DataFrame(records)
for c in [c for c in df.columns if c.startswith("score_")]:
    df[c] = df[c].round(1)
df.to_csv(PROCESSED / "windows.csv", index=False)

best = (df.sort_values("score_combined", ascending=False).groupby(["reference", "site"], as_index=False).first())
best["reference_label"] = best["reference"].map(lambda r: cfg["sites"][r]["label"])
best["site_label"] = best["site"].map(lambda c: cfg["sites"][c]["label"])
best[["reference", "reference_label", "site", "site_label", "score_combined"] +
     [f"score_{d}" for d in DIMENSIONS] + ["lat", "lon"]].to_csv(PROCESSED / "summary.csv", index=False)

json.dump(dict(
    window_km=MAIN,
    reference_features=ref_features,
    stability_top10_by_window_km=stability,
    low_sun_hours_by_month={c: low_sun_hours_by_month(store[c]["lat0"]) for c in cands},
    site_centers={s: [store[s]["lon0"], store[s]["lat0"]] for s in store},
), open(PROCESSED / "results.json", "w"), indent=1)
print(f"done in {time.time()-t0:.0f}s → {PROCESSED}")
