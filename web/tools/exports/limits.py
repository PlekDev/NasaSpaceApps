"""Exporter "limits" (owner: D. Lizárraga): where the analogy breaks, per target.

Reads only data/processed/:
  diviner.json            Moon: LRO Diviner temperature and ice stability per site (measured)
  mars_context.json       Mars: Mars Climate Database v6.2 surface temperature and pressure (model)
  thermal_gap.json        Earth: NASA POWER skin temperature per region
  earth_lst_windows.csv   Earth: MODIS MOD11A2 land-surface temperature per 6 km window
  earth_emit_windows.csv  Earth: EMIT L2B mineral groups per 6 km window (regions between 52 N and 52 S)
  windows.csv             scores of every Earth window against every target
Writes web/public/data/limits/<target>.json, limits/scale.json and limits/index.json.

The fidelity matrix uses fixed, stated rules (RULES below, exported with the data) so the same pair always gets the
same verdict. Physical constants (gravity, sea-level pressure) are reference values, not results.
Run on its own with:  python -I web/tools/exports/limits.py     (the orchestrator in export_data.py also runs it)
AI-assisted (Claude, Anthropic); reviewed by the team."""
import statistics
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from export_data import DATA, PROC, ROOT, read_csv, read_json, region_label, source_stamp, split_label, write_json  # noqa: E402

NAME = "limits"
TOP_REGIONS = 5
RULES = dict(
    terrain="score >= 80: yes; 60 to 80: partial; below 60: no",
    light="score >= 80: yes (on the dates when the Sun is low: see When); 60 to 80: partial; below 60: no",
    thermal="|target mean - Earth window mean| <= 20 K: partial (the two are different quantities, so never 'yes'); "
            "larger: no. Earth = MODIS LST mean of the window, or the region's NASA POWER mean where LST is missing",
    minerals="Moon: not measurable (lunar silicates are not among the EMIT-10 minerals). Jezero: partial when EMIT finds "
             "clays or carbonates in the window (share >= 1 %), else no. Other Mars targets and windows without EMIT "
             "coverage: no data",
    gravity="always no: Earth cannot change its gravity",
    atmosphere="always no: Earth has neither a hard vacuum nor a thin CO2 atmosphere",
)
# Reference values (not results): standard surface gravity and mean sea-level pressure.
GRAVITY = dict(earth=9.81, moon=1.62, mars=3.71)
EARTH_PRESSURE_PA = 101_325
EMIT_GROUPS = ["clays", "carbonates", "iron_oxides", "sulfates"]


def level(score):
    return "yes" if score >= 80 else "partial" if score >= 60 else "no"


def num(v):
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def med(vals, nd=1):
    vals = [v for v in vals if v is not None]
    return round(statistics.median(vals), nd) if vals else None


def main():
    need = ["diviner.json", "thermal_gap.json", "windows.csv"]
    if any(not (PROC / n).exists() for n in need):
        print(f"{NAME}: missing one of {need}; nothing exported")
        return
    cfg = yaml.safe_load((ROOT / "config" / "sites.yaml").read_text(encoding="utf-8"))
    sites, win_km = cfg["sites"], cfg["main_window_km"]
    div = read_json(PROC / "diviner.json")
    tg = read_json(PROC / "thermal_gap.json")
    mars = read_json(PROC / "mars_context.json") if (PROC / "mars_context.json").exists() else {"sites": {}}
    record_low = div["earth_record_low_K"]

    key = lambda r: (r["site"], int(float(r["i"])), int(float(r["j"])))          # noqa: E731
    lst = {key(r): r for r in read_csv(PROC / "earth_lst_windows.csv")} if (PROC / "earth_lst_windows.csv").exists() else {}
    emit = {key(r): r for r in read_csv(PROC / "earth_emit_windows.csv")} if (PROC / "earth_emit_windows.csv").exists() else {}
    rows = [r for r in read_csv(PROC / "windows.csv") if float(r["window_km"]) == win_km]
    dims = [c[len("score_"):] for c in rows[0] if c.startswith("score_") and c != "score_combined"]

    # ---- Earth regions: temperature (MODIS LST over the windows, NASA POWER at the centre) and EMIT mineral groups
    regions = {}
    for sid in [s for s in sites if sites[s]["role"] == "candidate" and s in tg["earth"]]:
        l = [v for k, v in lst.items() if k[0] == sid]
        e = [v for k, v in emit.items() if k[0] == sid and (num(v.get("coverage_frac")) or 0) > 0]
        regions[sid] = dict(
            id=sid, name=region_label(sites[sid]["label"])[0],
            lst=dict(mean_K=med([num(v["lst_mean_K"]) for v in l]), min_K=med([num(v["lst_min_K"]) for v in l]),
                     max_K=med([num(v["lst_max_K"]) for v in l]), n_windows=sum(num(v["lst_mean_K"]) is not None for v in l)),
            power=dict(mean_K=tg["earth"][sid]["ts_mean_K"], min_K=tg["earth"][sid]["ts_min_K"], max_K=tg["earth"][sid]["ts_max_K"]),
            emit=dict(n_windows=len(e), **{g: med([num(v[f"frac_{g}"]) for v in e], 4) for g in EMIT_GROUPS}) if e else None,
        )

    # ---- every target on one temperature scale
    def target_thermal(t):
        body = sites[t]["body"]
        if body == "moon" and t in div["sites"]:
            d = div["sites"][t]
            return dict(source="LRO Diviner polar resource product", measured=True, mean_K=d["temp_avg_mean_K"],
                        min_K=d["temp_avg_min_K"], max_K=d["temp_max_max_K"],
                        note="annual mean 2 cm below the surface (site mean and coldest facet) and surface maximum")
        if body == "mars" and t in mars["sites"]:
            d = mars["sites"][t]
            return dict(source="Mars Climate Database v6.2", measured=False, mean_K=d["tsurf_mean_K"], min_K=d["tsurf_min_K"],
                        max_K=d["tsurf_max_K"], note="modelled surface temperature at the site centre, 12 seasons x 24 local hours")
        return None

    seen = {r["reference"] for r in rows}
    targets = [t for t in sites if sites[t]["role"] == "reference" and t in seen]
    thermal = {t: target_thermal(t) for t in targets}
    coldest = min(regions.values(), key=lambda r: r["power"]["mean_K"])

    def earth_mean(site, i, j):
        w = lst.get((site, i, j))
        v = num(w["lst_mean_K"]) if w else None
        return (v, "MODIS LST, window") if v is not None else (regions[site]["power"]["mean_K"], "NASA POWER, region")

    files = []
    for t in targets:
        body, th = sites[t]["body"], thermal[t]
        best = {}
        for r in rows:
            if r["reference"] == t and (r["site"] not in best or float(r["score_combined"]) > float(best[r["site"]]["score_combined"])):
                best[r["site"]] = r
        top = sorted(best.values(), key=lambda r: -float(r["score_combined"]))[:TOP_REGIONS]

        matrix = []
        for r in top:
            site, i, j = key(r)
            em, src = earth_mean(site, i, j)
            gap = round(em - th["mean_K"], 1) if th else None
            e = emit.get((site, i, j))
            covered = bool(e and (num(e.get("coverage_frac")) or 0) > 0)
            if body == "moon":
                minerals = dict(level="na", note="EMIT cannot measure lunar minerals")
            elif t == "mars_jezero" and covered:
                share = (num(e["frac_clays"]) or 0) + (num(e["frac_carbonates"]) or 0)
                minerals = dict(level="partial" if share >= 0.01 else "no", clays=num(e["frac_clays"]), carbonates=num(e["frac_carbonates"]))
            else:
                minerals = dict(level="na", note="no EMIT coverage" if not covered else "no mineral reference for this target")
            row = dict(site=site, name=regions[site]["name"] if site in regions else region_label(sites[site]["label"])[0],
                       i=i, j=j, lat=round(float(r["lat"]), 3), lon=round(float(r["lon"]), 3),
                       score_combined=float(r["score_combined"]),
                       thermal=dict(level=("partial" if gap is not None and abs(gap) <= 20 else "no") if gap is not None else "na",
                                    earth_mean_K=em, earth_source=src, gap_K=gap),
                       minerals=minerals, gravity=dict(level="no"), atmosphere=dict(level="no"))
            for d in dims:
                row[d] = dict(level=level(float(r[f"score_{d}"])), score=float(r[f"score_{d}"]))
            if covered:
                row["emit"] = {g: num(e[f"frac_{g}"]) for g in EMIT_GROUPS}
            matrix.append(row)

        out = dict(
            target=t, body=body, label=sites[t]["label"], name=split_label(sites[t]["label"])[0],
            thermal=dict(target=th, earth_record_low_K=record_low,
                         coldest_earth_region=dict(id=coldest["id"], name=coldest["name"], mean_K=coldest["power"]["mean_K"]),
                         gap_to_coldest_earth_K=round(coldest["power"]["mean_K"] - th["mean_K"], 1) if th else None),
            gravity=dict(target_m_s2=GRAVITY[body], earth_m_s2=GRAVITY["earth"], ratio=round(GRAVITY[body] / GRAVITY["earth"], 3)),
            atmosphere=(dict(kind="thin CO2 atmosphere", pressure_Pa=mars["sites"][t]["ps_mean_Pa"],
                             pressure_range_Pa=[mars["sites"][t]["ps_min_Pa"], mars["sites"][t]["ps_max_Pa"]],
                             earth_pressure_Pa=EARTH_PRESSURE_PA, water_triple_point_Pa=mars.get("water_triple_point_Pa"),
                             share_of_earth=round(mars["sites"][t]["ps_mean_Pa"] / EARTH_PRESSURE_PA, 4),
                             share_above_freezing=mars["sites"][t]["share_above_freezing"])
                        if body == "mars" and t in mars["sites"] else dict(kind="hard vacuum", earth_pressure_Pa=EARTH_PRESSURE_PA)),
            fidelity=matrix, dims=dims,
        )
        if body == "moon" and t in div["sites"]:
            d = div["sites"][t]
            out["ice"] = dict(share_stable_within_1m=d["share_ice_stable_within_1m"], share_stable_at_surface=d["share_ice_stable_surface"],
                              median_depth_m=d["median_ice_depth_m"], share_below_110K=d["share_below_110K_avg"],
                              share_colder_than_earth_record=d["share_colder_than_earth_record"], n_facets=d["n_facets"])
        write_json(DATA / NAME / f"{t}.json", out); files.append(f"{t}.json")

    scale = dict(
        earth_record_low_K=record_low, rules=RULES,
        targets=[dict(id=t, body=sites[t]["body"], name=split_label(sites[t]["label"])[0], **thermal[t]) for t in targets if thermal[t]],
        regions=sorted(regions.values(), key=lambda r: r["power"]["mean_K"]),
        sources=dict(moon=div.get("source"), mars=mars.get("source"), earth_power=tg.get("sources", {}).get("earth"),
                     earth_lst="MODIS Terra MOD11A2 v061, 2025, median over the region's 6 km windows",
                     emit="NASA EMIT L2B mineral identification (EMITL2BMIN V002), median share over the region's covered windows"),
    )
    write_json(DATA / NAME / "scale.json", scale); files.append("scale.json")
    write_json(DATA / NAME / "index.json", dict(files=files, generated=source_stamp()[0]))
    print(f"{NAME}: exported {len(files)} files")


if __name__ == "__main__":
    main()
