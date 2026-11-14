"""P.E.N. — Planetary Environmental Navigator: interactive Earth analog explorer.
Run:  streamlit run app/streamlit_app.py"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np
import pandas as pd
import pydeck as pdk
import streamlit as st
from pen.config import load_config, PROCESSED, FIGURES
from pen.features import DIMENSIONS
from pen.scoring import explain, FEATURE_LABELS
from pen.eonet import events_near, parse as eonet_parse

st.set_page_config(page_title="P.E.N. · Planetary Environmental Navigator", page_icon="🌗", layout="wide")
cfg = load_config()
ASSETS = Path(__file__).parent / "assets"
THUMBS = PROCESSED / "thumbs"

# ---------------- look (Paul: tweak freely)
st.markdown("""
<style>
.block-container {padding-top: 1.6rem; max-width: 1400px;}
.pen-hero {padding: 1.4rem 1.6rem; border-radius: 16px; margin-bottom: 1rem;
  background: radial-gradient(1200px 300px at 10% -40%, rgba(57,135,229,.35), transparent 60%),
              radial-gradient(800px 260px at 95% 0%, rgba(235,104,52,.18), transparent 60%), #111723;
  border: 1px solid rgba(255,255,255,.07);}
.pen-hero h1 {font-size: 2.6rem; margin: 0; letter-spacing: .06em;}
.pen-hero .sub {color: #c3c2b7; font-size: 1.02rem; margin-top: .25rem;}
.pen-hero .q {font-size: 1.35rem; margin-top: .9rem; color: #f0efec;}
.pen-badges span {display:inline-block; margin: .6rem .4rem 0 0; padding: .22rem .65rem; border-radius: 999px;
  font-size: .8rem; background: rgba(57,135,229,.16); border: 1px solid rgba(57,135,229,.45); color: #cfe2fb;}
div[data-testid="stMetric"] {background: #111723; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: .7rem 1rem;}
.pen-legend {display:flex; align-items:center; gap:.6rem; font-size:.85rem; color:#c3c2b7; margin:.4rem 0 .2rem;}
.pen-legend .bar {width: 220px; height: 10px; border-radius: 5px;
  background: linear-gradient(90deg, #1c3d6e, #2a78d6, #6da7ec, #ffd166);}
.pen-foot {color:#8b8a83; font-size:.8rem; margin-top: 2rem; border-top: 1px solid rgba(255,255,255,.07); padding-top:.8rem;}
</style>""", unsafe_allow_html=True)


@st.cache_data
def load():
    win = pd.read_csv(PROCESSED / "windows.csv")
    win["polygon"] = win["polygon"].apply(json.loads)
    res = json.load(open(PROCESSED / "results.json"))
    val = json.load(open(PROCESSED / "validation.json")) if (PROCESSED / "validation.json").exists() else {}
    known = json.load(open(PROCESSED / "known_analogs.json")) if (PROCESSED / "known_analogs.json").exists() else None
    countries = json.load(open(ASSETS / "countries_110m.geojson"))
    div = json.load(open(PROCESSED / "diviner.json")) if (PROCESSED / "diviner.json").exists() else None
    far = json.load(open(PROCESSED / "far_horizons.json")) if (PROCESSED / "far_horizons.json").exists() else None
    real = json.load(open(PROCESSED / "thumbs" / "real_credits.json")) if (PROCESSED / "thumbs" / "real_credits.json").exists() else {}
    snap = json.load(open(PROCESSED / "eonet_snapshot.json")) if (PROCESSED / "eonet_snapshot.json").exists() else None
    return win, res, val, known, countries, div, far, real, snap


win, res, val, known, countries, div, far, real, snap = load()


@st.cache_data(ttl=3600, show_spinner=False)
def field_events(lat, lon, site):
    """Open NASA EONET events within 150 km: live if possible, else the committed snapshot (with its date)."""
    import os
    live = None if os.environ.get("PEN_OFFLINE") else events_near(lat, lon, 150)
    if live is not None:
        return live, "live"
    if snap and site in snap["events"]:
        return eonet_parse({"events": snap["events"][site]}, lat, lon, 150), f"snapshot {snap['taken_utc']} UTC"
    return None, "unavailable"


def cant_reproduce(ref, body):
    """Generic limits, plus measured Diviner numbers for the lunar targets."""
    items = list(EARTH_LIMITS[body])
    dv = (div or {}).get("sites", {}).get(ref)
    if dv:
        items = [f"**{dv['share_colder_than_earth_record']:.1%}** of the site has an annual mean temperature below "
                 f"Earth's record low (184 K); site mean {dv['temp_avg_mean_K']:.0f} K, coldest spot "
                 f"{dv['temp_avg_min_K']:.0f} K (Diviner, 2 cm below the surface)",
                 f"Water ice thermally stable within 1 m in **{dv['share_ice_stable_within_1m']:.0%}** of it "
                 f"(median depth {dv['median_ice_depth_m']*100:.0f} cm)",
                 f"Surface peaks reach {dv['temp_max_max_K']:.0f} K ({dv['temp_max_max_K']-273.15:.0f} °C)"] + items
    return items

refs = [r for r in cfg["sites"] if cfg["sites"][r]["role"] == "reference" and r in set(win.reference)]
cands = [c for c in cfg["sites"] if cfg["sites"][c]["role"] == "candidate" and c in set(win.site)]
label = lambda k: cfg["sites"][k]["label"]
short = lambda k: label(k).split("·", 1)[1].split("(")[0].split(",")[0].strip()

EARTH_LIMITS = {
    "moon": ["Gravity 1 g vs 1/6 g", "Atmosphere and weather vs hard vacuum",
             "Sun up to ~23° in polar summer vs ≤ ~7° at the lunar pole", "No anorthosite highland regolith"],
    "mars": ["Gravity 1 g vs ~3/8 g", "Dense air vs thin CO₂ atmosphere", "Liquid water and life almost everywhere",
             "Radiation shielding by Earth's magnetic field"],
}

# ---------------- sidebar
st.sidebar.markdown("## 🌗 P.E.N.")
st.sidebar.caption("Planetary Environmental Navigator")
ref = st.sidebar.selectbox("Moon / Mars target site", refs, format_func=label)
if ref in res.get("site_centers", {}):
    rlon, rlat = res["site_centers"][ref]
    st.sidebar.caption(f"Reference center: {rlat:.3f}°, {rlon:.3f}° ({cfg['sites'][ref]['body'].capitalize()})")
st.sidebar.markdown("**Weight of each dimension**")
active_dims = {d: k for d, k in DIMENSIONS.items() if f"score_{d}" in win.columns}
weights = {d: st.sidebar.slider(d.capitalize(), 0.0, 2.0, 1.0, 0.1) for d in active_dims}
regions = st.sidebar.multiselect("Earth regions", cands, default=cands, format_func=short)
min_score = st.sidebar.slider("Minimum combined score", 0, 100, 60)

df = win[(win.reference == ref) & (win.site.isin(regions))].copy()
num = sum(weights[d] * len(k) * (-np.log(df[f"score_{d}"] / 100)) ** 2 for d, k in active_dims.items())
den = sum(weights[d] * len(k) for d, k in active_dims.items()) or 1
df["score"] = (100 * np.exp(-np.sqrt(num / den))).round(1)
df = df.sort_values("score", ascending=False)
shown = df[df.score >= min_score].copy()
body = cfg["sites"][ref]["body"]
best = df.iloc[0] if len(df) else None

# ---------------- hero
target = label(ref).split("·")[1].split("(")[0].strip()
v = val.get(ref)
badges = ["NASA LRO · LOLA", "NASA LRO · Diviner", "NASA MRO · CTX", "ESA Copernicus DEM"]
fv = (far or {}).get("sites", {}).get(ref, {}).get("V3_far_curved")
if fv:
    badges.insert(0, f"Light model vs NASA LOLA · ρ = {fv['spearman_rho']:.2f}")
elif v:
    badges.insert(0, f"Light model validated vs LOLA · ρ = {v['spearman_rho']:.2f}")
st.markdown(f"""<div class="pen-hero"><h1>P.E.N.</h1>
<div class="sub">Planetary Environmental Navigator · Earth analogs for the Moon Base and Mars, by terrain <b>and</b> low-Sun light</div>
<div class="q">Where on Earth looks — and is lit — like <b>{target}</b>?</div>
<div class="pen-badges">{''.join(f'<span>{b}</span>' for b in badges)}</div></div>""", unsafe_allow_html=True)

c1, c2, c3, c4 = st.columns(4)
c1.metric("6 km windows scored", f"{len(df):,}")
c2.metric(f"Above {min_score}", f"{len(shown):,}")
if best is not None:
    c3.metric("Best match", f"{best.score:.0f} / 100", short(best.site))
if known:
    c4.metric("Known analogs, light rank", f"Top {100 - known['summary']['median_percentile_illumination_best']:.0f}%",
              help="Median percentile of classic NASA analog sites (Pinacate, SP Crater, Haughton, Meteor Crater) "
                   "in the illumination ranking. 50 = random.")

tab_map, tab_card, tab_time, tab_val, tab_about = st.tabs(["🌍 Explore", "🔎 Analog card", "🕒 Analog in time", "✅ Validation", "📖 Method & data"])


def ramp(s, lo):
    t = float(np.clip((s - lo) / max(100 - lo, 1), 0, 1))
    stops = np.array([[28, 61, 110], [42, 120, 214], [109, 167, 236], [255, 209, 102]])
    k = min(int(t * 3), 2); f = t * 3 - k
    return (stops[k] + f * (stops[k + 1] - stops[k])).astype(int).tolist()


REFERENCE_ANALOGS = [
    dict(name="★ Meteor Crater", lat=35.0281, lon=-111.0233, bodies=("moon",)),
    dict(name="★ SP Crater", lat=35.5822, lon=-111.6318, bodies=("moon",)),
    dict(name="★ Pinacate Peaks", lat=31.77, lon=-113.49, bodies=("moon",)),
    dict(name="★ Haughton Crater", lat=75.383, lon=-89.667, bodies=("moon", "mars")),
    dict(name="★ Cinder Lake", lat=35.3066, lon=-111.5048, bodies=("moon",)),
    dict(name="★ HMP Station", lat=75.433, lon=-89.867, bodies=("moon", "mars")),
    dict(name="★ Pu'u Hiwahine (ISRU)", lat=19.7609, lon=-155.4707, bodies=("moon", "mars")),
    dict(name="★ Askja Caldera", lat=65.03, lon=-16.75, bodies=("moon",)),
    dict(name="★ Yungay (Atacama)", lat=-24.067, lon=-69.86, bodies=("mars",)),
    dict(name="★ University Valley", lat=-77.867, lon=160.75, bodies=("mars",)),
]

with tab_map:
    a, b, c = st.columns([2.3, 1.1, 1])
    color_opts = ["combined"] + [d for d in DIMENSIONS if f"score_{d}" in shown.columns]
    color_by = b.selectbox("Colour map by", color_opts, format_func=lambda k: f"Colour: {k}", label_visibility="collapsed")
    color_col = "score" if color_by == "combined" else f"score_{color_by}"
    view = c.radio("View", ["3D globe", "Flat map"], horizontal=True, label_visibility="collapsed")
    hint = (f"dot size & colour = {color_by} · gold rings = regions · ★ = NASA reference analogs"
            if view == "3D globe" else f"column height & colour = {color_by} · ★ = NASA reference analogs · drag to tilt")
    a.markdown(f'<div class="pen-legend">{color_by} similarity <div class="bar"></div> {min_score} → 100 · {hint}</div>',
               unsafe_allow_html=True)
    shown["color"] = shown[color_col].apply(lambda s: ramp(s, min_score) + [235])
    shown["region"] = shown.site.map(short)
    shown["height"] = (shown.score - min_score + 3) ** 2 * (5000 if view == "3D globe" else 25)
    dim_cols = [f"score_{d}" for d in active_dims]
    dim_tip = " · ".join(f"{d} {{score_{d}}}" for d in active_dims)
    tooltip = {"html": f"<b>{{region}}</b><br/>combined <b>{{score}}</b><br/>{dim_tip}<br/>{{lat}}, {{lon}}",
               "style": {"backgroundColor": "#111723", "color": "#f0efec", "fontSize": "12px"}}
    cols = ["lon", "lat", "score", *dim_cols, "region", "color", "height", "polygon", "radius"]
    labels = pd.DataFrame([dict(name=short(c), lon=res["site_centers"][c][0], lat=res["site_centers"][c][1]) for c in regions])
    ref_marks = pd.DataFrame([m for m in REFERENCE_ANALOGS if body in m["bodies"]])
    shown["radius"] = 14000 + np.maximum(shown[color_col] - min_score, 0) * 2500
    best_by_region = df.groupby("site")[color_col].max()
    rings = pd.DataFrame([dict(lon=res["site_centers"][c][0], lat=res["site_centers"][c][1],
                               r=120000 + 6000 * max(best_by_region.get(c, 0) - min_score, 0)) for c in regions])
    if view == "3D globe":
        layers = [
            pdk.Layer("SolidPolygonLayer", [{"p": [[-180, 90], [0, 90], [180, 90], [180, -90], [0, -90], [-180, -90]]}],
                      get_polygon="p", get_fill_color=[14, 30, 52]),
            pdk.Layer("GeoJsonLayer", countries, stroked=True, filled=True, get_fill_color=[38, 44, 54],
                      get_line_color=[90, 110, 140], line_width_min_pixels=0.6),
            pdk.Layer("ScatterplotLayer", shown[cols], get_position=["lon", "lat"], get_radius="radius",
                      get_fill_color="color", pickable=True, auto_highlight=True, opacity=0.9),
            pdk.Layer("ScatterplotLayer", rings, get_position=["lon", "lat"], get_radius="r", filled=False,
                      stroked=True, get_line_color=[255, 209, 102, 200], line_width_min_pixels=2),
            pdk.Layer("ScatterplotLayer", ref_marks, get_position=["lon", "lat"], get_radius=45000, filled=False,
                      stroked=True, get_line_color=[235, 104, 52, 230], line_width_min_pixels=2),
            pdk.Layer("TextLayer", labels, get_position=["lon", "lat"], get_text="name", get_size=13,
                      get_color=[255, 209, 102], get_pixel_offset=[0, -22], billboard=True, font_weight=700,
                      parameters={"depthTest": False}),
        ]
        center = shown.iloc[0] if len(shown) else pd.Series(dict(lat=35, lon=-100))
        deck = pdk.Deck(layers=layers, views=[pdk.View(type="_GlobeView", controller=True)], map_provider=None,
                        initial_view_state=pdk.ViewState(latitude=float(center.lat), longitude=float(center.lon), zoom=1.6),
                        tooltip=tooltip, parameters={"cull": True})
    else:
        layers = [
            pdk.Layer("PolygonLayer", shown[cols], get_polygon="polygon", get_fill_color="color",
                      get_line_color=[255, 255, 255, 60], line_width_min_pixels=0.5, pickable=True,
                      auto_highlight=True, extruded=True, get_elevation="height", elevation_scale=1),
            pdk.Layer("ScatterplotLayer", ref_marks, get_position=["lon", "lat"], get_radius=1200,
                      get_fill_color=[235, 104, 52, 220], get_line_color=[255, 255, 255, 230],
                      stroked=True, line_width_min_pixels=1.5),
            pdk.Layer("TextLayer", ref_marks, get_position=["lon", "lat"], get_text="name", get_size=12,
                      get_color=[255, 209, 102], get_pixel_offset=[0, -16], billboard=True, font_weight=700),
        ]
        center = shown.iloc[0] if len(shown) else pd.Series(dict(lat=35, lon=-100))
        deck = pdk.Deck(layers=layers, map_provider="carto", map_style="dark", tooltip=tooltip,
                        initial_view_state=pdk.ViewState(latitude=float(center.lat), longitude=float(center.lon),
                                                         zoom=8, pitch=45, bearing=-15))
    st.pydeck_chart(deck, height=560)
    top = df.head(15)[["site", "lat", "lon", "score", *dim_cols]].copy()
    top["site"] = top.site.map(short)
    top[["lat", "lon"]] = top[["lat", "lon"]].round(4)
    st.dataframe(top.rename(columns={"site": "Earth region", "score": "combined",
                                     **{f"score_{d}": d for d in active_dims}}),
                 hide_index=True, width="stretch")
    st.download_button("Download all windows (CSV)", df.drop(columns=["polygon"]).to_csv(index=False),
                       file_name=f"pen_{ref}_windows.csv", mime="text/csv")

with tab_card:
    if best is None:
        st.info("No windows match the current filters.")
    else:
        opts = df.head(10).reset_index(drop=True)
        k = st.selectbox("Earth window", range(len(opts)),
                         format_func=lambda n: f"#{n+1} · {short(opts.site[n])} · {opts.score[n]:.0f}/100",
                         key=f"earth_window_{ref}")
        r = opts.iloc[k]
        p1, p2 = st.columns(2)
        ref_img, win_img = THUMBS / f"ref__{ref}.png", THUMBS / f"{r.site}_{int(r.i)}_{int(r.j)}.png"
        if ref_img.exists():
            p1.image(str(ref_img), caption=f"{target} · 6 km · Sun 3° from SW", width="stretch")
        if win_img.exists():
            p2.image(str(win_img), caption=f"{short(r.site)} ({r.lat:.3f}, {r.lon:.3f}) · same Sun, same scale", width="stretch")
        elif ref_img.exists():
            p2.info("Low-Sun preview not precomputed for this window (run scripts/make_thumbnails.py).")
        wid = f"{r.site}_{int(r.i)}_{int(r.j)}"
        ref_real, win_real = THUMBS / f"real__ref__{ref}.jpg", THUMBS / f"real__{wid}.jpg"
        if ref_real.exists() or win_real.exists():
            q1, q2 = st.columns(2)
            if ref_real.exists():
                q1.image(str(ref_real), caption=f"Real view · {real.get('ref__' + ref, 'NASA imagery')}", width="stretch")
            if win_real.exists():
                q2.image(str(win_real), caption=f"Real view · {real.get(wid, 'NASA imagery')}", width="stretch")
            st.caption("Same 6 km windows, reprojected onto the same grid as the previews above, from NASA APIs "
                       "(Moon/Mars Trek WMTS and GIBS, api.nasa.gov).")
        evs, how = field_events(round(float(r.lat), 3), round(float(r.lon), 3), r.site)
        if evs:
            lines = "\n".join(f"- **{e['title']}** ({e['category']}, {e['date']}, ~{e['distance_km']} km away)" for e in evs[:4])
            st.warning(f"🛰️ **Field safety · NASA EONET ({how}):** {len(evs)} open natural event(s) within 150 km\n\n{lines}")
        elif evs is not None:
            st.success(f"🛰️ **Field safety · NASA EONET ({how}):** no open natural events within 150 km.")
        d = {f: r[f"d_{f}"] for ks in active_dims.values() for f in ks if f"d_{f}" in r}
        dim_summary = " · ".join(f"**{dim.capitalize()}:** {r[f'score_{dim}']:.0f}/100" for dim in active_dims)
        st.caption(f"Dimension scores — {dim_summary}")
        similar, differs = explain(d, FEATURE_LABELS)
        a, b, c = st.columns(3)
        a.subheader("✅ Similar in"); a.write("\n".join(f"- {s}" for s in similar) or "—")
        b.subheader("⚠️ Differs in"); b.write("\n".join(f"- {s}" for s in differs) or "— nothing beyond 1.5 IQR")
        c.subheader("🚫 Earth can't reproduce"); c.write("\n".join(f"- {s}" for s in cant_reproduce(ref, body)))
        st.markdown(f"**Location:** {r.lat:.4f}, {r.lon:.4f} · "
                    f"[Google Maps](https://www.google.com/maps/@{r.lat},{r.lon},12z) · "
                    f"[NASA Worldview](https://worldview.earthdata.nasa.gov/?v={r.lon-0.2},{r.lat-0.2},{r.lon+0.2},{r.lat+0.2})")
        st.caption("Scaled differences: (Earth − target) / IQR of all Earth windows. |d| ≤ 0.5 = similar, |d| ≥ 1.5 = different.")
        st.bar_chart(pd.Series(d, name="scaled difference").rename(index=FEATURE_LABELS), color="#3987e5")

with tab_time:
    st.subheader("An analog in time, not only in place")
    st.write("At the lunar south pole the Sun never climbs above ~7°. On Earth that light only lasts minutes at sunrise "
             "and sunset — except at high latitudes, where it lasts for hours around the equinoxes. P.E.N. tells field "
             "teams **when** to test rover vision and EVA lighting, not just **where**.")
    lows = pd.DataFrame(res["low_sun_hours_by_month"],
                        index=[f"{i:02d} {m}" for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)])
    lows.columns = [short(c) for c in lows.columns]
    st.line_chart(lows, y_label="hours/day with Sun 0–7°")

with tab_val:
    st.subheader("1 · Is the illumination metric real?")
    for kk, vv in val.items():
        st.write(f"- **{label(kk)}** — Spearman ρ = {vv['spearman_rho']:.2f} against NASA's LOLA average-illumination map "
                 f"(n = {vv['n_pixels']:,} pixels at 120 m)")
    f4 = FIGURES / "fig4_illumination_validation.png"
    if f4.exists():
        st.image(str(f4))
    f7 = FIGURES / "fig7_far_horizons.png"
    if far and f7.exists():
        st.markdown("**Where the remaining gap comes from.** Away from the pole, the Sun is hidden by mountains tens of "
                    "kilometres away. Re-computing the light with NASA's 40 m polar DEM out to 150 km, on the curved "
                    "lunar surface and with real Sun positions, brings the agreement to:")
        rows = [dict(site=label(k).split("·")[1].split("(")[0].strip(),
                     **{"local DEM (ρ)": vv["V1_local_flat"]["spearman_rho"],
                        "horizons up to 150 km (ρ)": vv["V3_far_curved"]["spearman_rho"],
                        "error, lit fraction": f"±{vv['V3_far_curved']['mean_abs_error']:.3f}"})
                for k, vv in far["sites"].items()]
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        rm = far["sites"].get("moon_malapert", {}).get("ray_reach")
        rn = far["sites"].get("moon_nobile_rim1", {}).get("ray_reach")
        m_rng = f"{rm['outward_ray_km_min']:.0f}–{rm['outward_ray_km_max']:.0f} km" if rm else "21–39 km"
        n_rng = f"{rn['outward_ray_km_min']:.0f}–{rn['outward_ray_km_max']:.0f} km" if rn else "41–66 km"
        st.caption(f"Malapert and Nobile Rim 1 sit near the edge of NASA's 85°S DEM: rays toward lower latitudes reach "
                   f"only {m_rng} and {n_rng}.")
        st.image(str(f7))
        st.caption("Scoring still uses local windows on both bodies, so Moon and Earth are treated the same way; "
                   "this test shows the light model itself is right once distant terrain is included.")
    if known:
        st.subheader("2 · Does it rediscover known analog sites?")
        s = known["summary"]
        st.write(f"Classic NASA analog sites inside our regions rank at the **{s['median_percentile_illumination_best']:.0f}th "
                 f"percentile** in illumination and **{s['median_percentile_terrain_best']:.0f}th** in terrain (median of "
                 f"{s['n_tests']} site × target tests; 50 = random).")
        st.success("**Blind rediscovery:** Pu'u Hiwahine on Mauna Kea, where NASA, CSA and DLR rehearsed a lunar-polar "
                   "prospecting mission in 2012 (PISCES ISRU field test), ranks **#1 of 10,424** Earth windows for "
                   "Malapert and in the **top 0.2 %** for four of the six Moon Base sites (#9 Nobile Rim 1, #19 de Gerlache, "
                   "#23 Connecting Ridge); top 1.1 % for Leibnitz Beta and top 5 % for Haworth. P.E.N. was never told about it.")
        st.caption("Sites chosen for other reasons rank lower, as they should: Meteor Crater is an impact-geology analog and "
                   "University Valley a dry-permafrost (thermal) analog, not terrain-and-light analogs.")
        raw_kt = pd.DataFrame(known["rows"])
        kt_dim_cols = [f"score_{d}_pct_best" for d in DIMENSIONS if f"score_{d}_pct_best" in raw_kt.columns]
        kt = raw_kt[["reference", "site", "score_combined_pct_best", *kt_dim_cols]].copy()
        kt["reference"] = kt.reference.map(lambda x: label(x).split("(")[0].strip())
        st.dataframe(kt.rename(columns={"score_combined_pct_best": "combined pct",
                                        **{f"score_{d}_pct_best": f"{d} pct" for d in DIMENSIONS}}),
                     hide_index=True, width="stretch")
    f5 = FIGURES / "fig5_sensitivity.png"
    if f5.exists():
        st.subheader("3 · How robust is the ranking?")
        st.image(str(f5))
        st.caption("Re-weighting illumination 0.5–2× keeps 7–10 of the top 10 for seven of nine targets (down to 5 for Malapert and Haworth); the "
                   "window size (3/6/12 km) changes rankings much more — reported, not hidden.")

    f6 = FIGURES / "fig6_diviner.png"
    if div and f6.exists():
        st.subheader("4 · Where Earth stops being an analog")
        st.write("Analogs reproduce terrain and light, not lunar polar temperature. LRO Diviner measurements show all six "
                 "lunar sites average below Earth's coldest recorded temperature over 88–100 % of their area, with water ice stable "
                 "just under the surface. P.E.N. says so on every analog card instead of overselling the match.")
        st.image(str(f6))

with tab_about:
    st.markdown((ROOT / "docs" / "METHOD.md").read_text(encoding="utf-8"))

st.markdown('<div class="pen-foot">P.E.N. · Pollones en Fuga · NASA Space Apps Challenge 2026 · Data: NASA LRO/LOLA (GSFC PGDA), '
            'NASA LRO Diviner (PDS Geosciences), NASA Moon/Mars Trek WMTS, NASA GIBS, NASA EONET, NASA MRO CTX DTMs (USGS Astrogeology), ESA Copernicus DEM GLO-30, Natural Earth. Code MIT. '
            'Built with AI assistance (see README → Use of AI).</div>', unsafe_allow_html=True)
