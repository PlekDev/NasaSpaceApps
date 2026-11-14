"""Field-campaign calendar + one-page field brief for the best Earth analogs of the Moon Base sites.

For every Earth region that is among the top 3 regions of at least one Moon reference, this script:
  * computes, minute by minute for the next 12 months, when the Sun stands 0–7° above the horizon at the best
    window (NOAA solar position) — the light of the lunar south pole;
  * picks the 14-day campaign block with the most of that light per day;
  * writes an iCalendar file with one event per low-Sun window in that block (UTC; calendar apps convert),
    a CSV with every window of the year, and a markdown field brief (where, why, when, what differs, hazards).

Outputs: data/processed/briefs/<region>.md, <region>.ics, <region>_lowsun_windows.csv, README.md (index)
Usage:   python scripts/extras/campaign_calendar.py [--start YYYY-MM-DD]
"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, datetime as dt
import numpy as np
import pandas as pd
import common as c
from pen.scoring import explain, FEATURE_LABELS
from pen.features import DIMENSIONS
from pen.eonet import parse as eonet_parse

EMIN, EMAX = 0.0, 7.0
TOP_REGIONS = 3
BLOCK_DAYS = 14
start = dt.date.fromisoformat(sys.argv[sys.argv.index("--start") + 1]) if "--start" in sys.argv else dt.date(2026, 12, 1)
DAYS = 365

w = c.windows()
lunar = c.lunar_refs()
div = json.load(open(c.PROCESSED / "diviner.json")) if (c.PROCESSED / "diviner.json").exists() else {"sites": {}}
snap = json.load(open(c.PROCESSED / "eonet_snapshot.json")) if (c.PROCESSED / "eonet_snapshot.json").exists() else None


def rank_table():
    """region → its best window and, for each Moon target it serves, rank / scores."""
    regions = {}
    for ref in lunar:
        g = w[w.reference == ref].sort_values("score_combined", ascending=False).reset_index(drop=True)
        g["rank"] = np.arange(1, len(g) + 1)
        best_per_region = g.groupby("site", sort=False).head(1).head(TOP_REGIONS)
        for r in best_per_region.itertuples():
            reg = regions.setdefault(r.site, dict(best=None, serves=[]))
            reg["serves"].append(dict(ref=ref, rank=int(r.rank), n=len(g), score=r.score_combined,
                                      terrain=r.score_terrain, illumination=r.score_illumination,
                                      i=int(r.i), j=int(r.j), lat=r.lat, lon=r.lon,
                                      d={k: getattr(r, f"d_{k}") for ks in DIMENSIONS.values() for k in ks
                                         if f"d_{k}" in g.columns}))
    for reg in regions.values():
        reg["serves"].sort(key=lambda s: s["rank"])
        reg["best"] = reg["serves"][0]
    return regions


def lowsun_windows(lat, lon):
    t0 = np.datetime64(start.isoformat() + "T00:00:00")
    t = t0 + np.arange(DAYS * 1440).astype("timedelta64[m]")
    el, az = c.solar_position(lat, lon, t)
    low = (el >= EMIN) & (el <= EMAX)
    edges = np.flatnonzero(np.diff(np.r_[0, low.astype(int), 0]))
    rows = []
    for a, b in zip(edges[::2], edges[1::2]):
        rows.append(dict(start_utc=str(t[a])[:16], end_utc=str(t[b - 1] + np.timedelta64(1, "m"))[:16],
                         minutes=int(b - a), sun_az_start=round(float(az[a])), sun_az_end=round(float(az[b - 1])),
                         kind="morning" if el[min(b, len(el) - 1)] > el[a] else "evening"))
    return pd.DataFrame(rows)


def best_block(df):
    if df.empty:
        return None, 0.0
    d = df.assign(day=pd.to_datetime(df.start_utc).dt.date).groupby("day").minutes.sum()
    full = pd.Series(0.0, index=pd.date_range(start, periods=DAYS).date).add(d, fill_value=0)
    roll = full.rolling(BLOCK_DAYS).mean()
    end = roll.idxmax()
    return end - dt.timedelta(days=BLOCK_DAYS - 1), float(roll.max())


def fold(line):
    """RFC 5545: lines longer than 75 octets continue on the next line after CRLF + one space."""
    b = line.encode("utf-8"); out = []
    while len(b) > 75:
        cut = 75
        while (b[cut] & 0xC0) == 0x80:      # never split a UTF-8 character
            cut -= 1
        out.append(b[:cut].decode("utf-8")); b = b[cut:]
        b = b" " + b
    out.append(b.decode("utf-8"))
    return "\r\n".join(out)


def ics(region, df, b0, lat, lon, serves):
    b1 = b0 + dt.timedelta(days=BLOCK_DAYS)
    sel = df[(pd.to_datetime(df.start_utc).dt.date >= b0) & (pd.to_datetime(df.start_utc).dt.date < b1)]
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    targets = ", ".join(c.short(s["ref"]) for s in serves)
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pollones en Fuga//P.E.N.//EN", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:P.E.N. lunar-pole light · {c.short(region)}"]
    for k, r in enumerate(sel.itertuples()):
        s = r.start_utc.replace("-", "").replace(":", "") + "00Z"
        e = r.end_utc.replace("-", "").replace(":", "") + "00Z"
        desc = (f"Sun 0–7° above the horizon ({r.kind}, azimuth {r.sun_az_start}°→{r.sun_az_end}°): the light of the lunar "
                f"south pole. Analog of: {targets}. Test rover vision, EVA lighting and shadow navigation. "
                f"Brief: data/processed/briefs/{region}.md")
        lines += ["BEGIN:VEVENT", f"UID:pen-{region}-{s}@pollones-en-fuga", f"DTSTAMP:{stamp}", f"DTSTART:{s}", f"DTEND:{e}",
                  f"SUMMARY:Lunar-pole light window · {c.short(region)}", f"LOCATION:{lat:.4f}, {lon:.4f}",
                  f"GEO:{lat:.5f};{lon:.5f}", "DESCRIPTION:" + desc.replace(";", "\\;").replace(",", "\\,"), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    (c.OUT_BRIEF / f"{region}.ics").write_bytes(("\r\n".join(fold(l) for l in lines) + "\r\n").encode("utf-8"))
    return len(sel)


def thumbs_for(site, i, j):
    th = c.PROCESSED / "thumbs"
    real, low = th / f"real__{site}_{i}_{j}.jpg", th / f"{site}_{i}_{j}.png"
    return [(p, cap) for p, cap in [(low, "Low-Sun preview (3° Sun from SW, cast shadows black)"),
                                    (real, "Real view (NASA GIBS)")] if p.exists()]


def brief(region, reg, df, b0, per_day, n_events):
    b = reg["best"]; lat, lon = b["lat"], b["lon"]
    month = (df.assign(m=pd.to_datetime(df.start_utc).dt.to_period("M")).groupby("m").minutes.sum()
             / pd.Series({p: p.days_in_month for p in pd.period_range(start, periods=12, freq="M")})).fillna(0)
    sim, dif = explain(b["d"], FEATURE_LABELS)
    dv = div["sites"].get(b["ref"], {})
    L = [f"# Field brief · {c.short(region)}", "",
         f"**Best 6 km window:** {lat:.4f}, {lon:.4f} · [Google Maps](https://www.google.com/maps/@{lat},{lon},13z) · "
         f"[NASA Worldview](https://worldview.earthdata.nasa.gov/?v={lon-0.2:.3f},{lat-0.2:.3f},{lon+0.2:.3f},{lat+0.2:.3f})  ",
         f"**Region:** {c.label(region).split('·', 1)[-1].strip()}", "",
         "## Why here", "",
         "Rank of this region's best window for each Moon Base site, among all Earth windows (6 km).", "",
         "| Moon Base site | Rank | Combined | Terrain | Illumination | Window centre |", "|---|---|---|---|---|---|"]
    for s in reg["serves"]:
        rk = (f"#1 of {s['n']:,} (best on Earth)" if s["rank"] == 1
              else f"#{s['rank']:,} of {s['n']:,} (top {max(100 * s['rank'] / s['n'], 0.1):.1f} %)")
        L.append(f"| {c.label(s['ref']).split('·', 1)[-1].split('(')[0].strip()} | {rk} | {s['score']:.0f} | "
                 f"{s['terrain']:.0f} | {s['illumination']:.0f} | {s['lat']:.3f}, {s['lon']:.3f} |")
    L += [""]
    L.append(f"Images and the lines below are for the window best matched to {c.short(b['ref'])}.")
    L.append("")
    for p, cap in thumbs_for(region, b["i"], b["j"]):
        L.append(f"![{cap}](../thumbs/{p.name})")
    L += ["", f"**Similar in:** {', '.join(sim) or '—'}  ", f"**Differs in:** {', '.join(dif) or 'nothing beyond 1.5 IQR'}", "",
          "## When to go", "",
          f"Best {BLOCK_DAYS}-day campaign block: **{b0:%d %b %Y} – {(b0 + dt.timedelta(days=BLOCK_DAYS - 1)):%d %b %Y}**, "
          f"with {per_day:.0f} min/day of Sun 0–7° above the horizon. The calendar file "
          f"[`{region}.ics`]({region}.ics) has its {n_events} low-Sun windows (times in UTC; calendar apps convert); "
          f"[`{region}_lowsun_windows.csv`]({region}_lowsun_windows.csv) lists every window of the year.", "",
          "| Month | Sun 0–7° (min/day) |", "|---|---|"]
    for m, v in month.items():
        L.append(f"| {m.strftime('%b %Y')} | {v:.0f} |")
    L += ["", "## Where the analogy breaks", ""]
    if dv:
        L.append(f"- Diviner: {dv['share_colder_than_earth_record']:.1%} of {c.short(b['ref'])} has an annual mean temperature "
                 f"(2 cm below the surface) below Earth's record low (184 K); water ice is stable within 1 m in "
                 f"{dv['share_ice_stable_within_1m']:.0%} of it.")
    L += ["- Gravity 1 g vs 1/6 g; atmosphere, weather and vegetation vs hard vacuum; no anorthosite highland regolith.",
          "- Real low Sun on Earth comes only from the east (morning) or west (evening) at this latitude, except near the poles.", "",
          "## Field safety (NASA EONET)", ""]
    if snap and region in snap["events"]:
        ev = eonet_parse({"events": snap["events"][region]}, lat, lon, 150)
        if ev:
            L += [f"Open natural events within 150 km in the snapshot of {snap['taken_utc']} UTC (check again before travel):", ""]
            L += [f"- {e['title']} ({e['category']}, {e['date']}, ~{e['distance_km']} km)" for e in ev[:6]]
        else:
            L.append(f"No open natural events within 150 km in the snapshot of {snap['taken_utc']} UTC.")
    else:
        L.append("No EONET snapshot for this region; check https://eonet.gsfc.nasa.gov before travel.")
    L += ["", "*Generated by `scripts/extras/campaign_calendar.py` from P.E.N. outputs. Solar times: NOAA algorithm, "
              "no refraction (refraction adds ~0.5° near the horizon, shifting windows by a few minutes).*"]
    (c.OUT_BRIEF / f"{region}.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    regs = rank_table()
    index = ["# Field briefs", "",
             f"One brief and one calendar per Earth region that is a top-{TOP_REGIONS} analog of a Moon Base site "
             f"(low-Sun windows from {start:%d %b %Y}, 12 months).", "",
             "| Region | Serves | Best campaign block | Sun 0–7° in block | Files |", "|---|---|---|---|---|"]
    for region, reg in sorted(regs.items(), key=lambda kv: kv[1]["best"]["rank"]):
        b = reg["best"]
        df = lowsun_windows(b["lat"], b["lon"])
        df.to_csv(c.OUT_BRIEF / f"{region}_lowsun_windows.csv", index=False)
        b0, per_day = best_block(df)
        n = ics(region, df, b0, b["lat"], b["lon"], reg["serves"])
        brief(region, reg, df, b0, per_day, n)
        serves = ", ".join(f"{c.short(s['ref'])} #{s['rank']}" for s in reg["serves"])
        index.append(f"| {c.short(region)} | {serves} | {b0:%d %b} – {(b0 + dt.timedelta(days=BLOCK_DAYS - 1)):%d %b %Y} | "
                     f"{per_day:.0f} min/day | [brief]({region}.md) · [calendar]({region}.ics) |")
        print(f"{region:36s} serves {serves:60s} block {b0} {per_day:5.0f} min/day  {n} events")
    (c.OUT_BRIEF / "README.md").write_text("\n".join(index) + "\n", encoding="utf-8")
