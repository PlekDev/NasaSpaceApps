"""P.E.N. — interactive Earth analog explorer.  Run:  streamlit run app/streamlit_app.py"""
# AI-assisted (Claude, Anthropic); reviewed by the team.
import sys, json, math
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

st.set_page_config(page_title="P.E.N. · Earth analogs for the Moon Base and Mars", layout="wide")
cfg = load_config()


@st.cache_data
def load():
    win = pd.read_csv(PROCESSED / "windows.csv")
    win["polygon"] = win["polygon"].apply(json.loads)
    res = json.load(open(PROCESSED / "results.json"))
    val = json.load(open(PROCESSED / "validation.json")) if (PROCESSED / "validation.json").exists() else {}
    return win, res, val


win, res, val = load()
refs = [r for r in cfg["sites"] if cfg["sites"][r]["role"] == "reference" and r in set(win.reference)]
cands = [c for c in cfg["sites"] if cfg["sites"][c]["role"] == "candidate" and c in set(win.site)]
label = lambda k: cfg["sites"][k]["label"]

EARTH_LIMITS = {
    "moon": ["Gravity 1 g vs 1/6 g", "Atmosphere and weather vs hard vacuum",
             "Sun up to ~23° in polar summer vs ≤ ~7° at the lunar pole", "No anorthosite highland regolith"],
    "mars": ["Gravity 1 g vs ~3/8 g", "Dense air vs thin CO₂ atmosphere", "Liquid water and life almost everywhere",
             "Radiation shielding by Earth's magnetic field"],
}

# ---------------- sidebar
st.sidebar.title("P.E.N.")
st.sidebar.caption("Planetary Environmental Navigator — Earth analogs for the Moon Base and Mars, by terrain **and** low-Sun light.")
ref = st.sidebar.selectbox("Moon / Mars reference site", refs, format_func=label)
st.sidebar.markdown("**Weight of each dimension**")
weights = {d: st.sidebar.slider(d.capitalize(), 0.0, 1.0, 1.0, 0.1) for d in DIMENSIONS}
regions = st.sidebar.multiselect("Earth regions", cands, default=cands, format_func=label)
min_score = st.sidebar.slider("Minimum combined score", 0, 100, 60)

df = win[(win.reference == ref) & (win.site.isin(regions))].copy()
# weighted combination: per-dimension distance D_d = -ln(S_d/100), RMS weighted by #features × weight
num = sum(weights[d] * len(k) * (-np.log(df[f"score_{d}"] / 100)) ** 2 for d, k in DIMENSIONS.items())
den = sum(weights[d] * len(k) for d, k in DIMENSIONS.items()) or 1
df["score"] = (100 * np.exp(-np.sqrt(num / den))).round(1)
df = df.sort_values("score", ascending=False)
shown = df[df.score >= min_score]

# ---------------- header
body = cfg["sites"][ref]["body"]
st.title("Where on Earth looks — and is lit — like " + label(ref).split("·")[1].split("(")[0].strip() + "?")
c1, c2, c3, c4 = st.columns(4)
best = df.iloc[0] if len(df) else None
c1.metric("Windows scored (6 km)", f"{len(df):,}")
c2.metric("Above threshold", f"{len(shown):,}")
if best is not None:
    c3.metric("Best match", f"{best.score:.0f} / 100", label(best.site).split("·")[1].split(",")[0].strip())
v = val.get(ref)
c4.metric("Illumination model vs LOLA", f"ρ = {v['spearman_rho']:.2f}" if v else "n/a",
          help="Spearman correlation between our cast-shadow model and the official LOLA average illumination map.")

tab_map, tab_card, tab_time, tab_val, tab_about = st.tabs(["Map", "Analog card", "Analog in time", "Validation", "Method & data"])

with tab_map:
    def color(s):
        t = max(0.0, min(1.0, (s - min_score) / max(100 - min_score, 1)))
        lo, hi = np.array([205, 226, 251]), np.array([13, 54, 107])
        return (lo + t * (hi - lo)).astype(int).tolist() + [190]
    shown = shown.assign(fill=shown.score.apply(color),
                         region=shown.site.map(lambda s: label(s).split("·")[1].strip()))
    layer = pdk.Layer("PolygonLayer", shown[["polygon", "fill", "score", "score_terrain", "score_illumination",
                                             "region", "lat", "lon"]],
                      get_polygon="polygon", get_fill_color="fill", get_line_color=[255, 255, 255, 120],
                      line_width_min_pixels=0.5, pickable=True, auto_highlight=True)
    view_src = shown if len(shown) else df
    center = view_src.iloc[0] if len(view_src) else pd.Series(dict(lat=30, lon=-105))
    st.pydeck_chart(pdk.Deck(layers=[layer], map_provider="carto", map_style="light",
                             initial_view_state=pdk.ViewState(latitude=float(center.lat), longitude=float(center.lon), zoom=7),
                             tooltip={"html": "<b>{region}</b><br/>combined <b>{score}</b><br/>terrain {score_terrain} · "
                                              "illumination {score_illumination}<br/>{lat}, {lon}"}))
    st.caption("Each square is a 6 km window. Darker = more similar to the selected reference. Use the regions list to jump between areas.")
    top = df.head(15)[["site", "lat", "lon", "score", "score_terrain", "score_illumination"]].copy()
    top["site"] = top.site.map(lambda s: label(s).split("·")[1].strip())
    top[["lat", "lon"]] = top[["lat", "lon"]].round(4)
    st.dataframe(top.rename(columns={"site": "Earth region", "score": "combined", "score_terrain": "terrain",
                                     "score_illumination": "illumination"}), hide_index=True, width="stretch")

with tab_card:
    if best is None:
        st.info("No windows match the current filters.")
    else:
        opts = df.head(10).reset_index(drop=True)
        k = st.selectbox("Window", range(len(opts)),
                         format_func=lambda n: f"#{n+1} · {label(opts.site[n]).split('·')[1].strip()} · {opts.score[n]:.0f}")
        r = opts.iloc[k]
        d = {f: r[f"d_{f}"] for ks in DIMENSIONS.values() for f in ks if f"d_{f}" in r}
        similar, differs = explain(d, FEATURE_LABELS)
        a, b, c = st.columns(3)
        a.subheader("Similar in"); a.write("\n".join(f"- {s}" for s in similar) or "—")
        b.subheader("Differs in"); b.write("\n".join(f"- {s}" for s in differs) or "— nothing beyond 1.5 IQR")
        c.subheader("Earth cannot reproduce"); c.write("\n".join(f"- {s}" for s in EARTH_LIMITS[body]))
        st.markdown(f"**Location:** {r.lat:.4f}, {r.lon:.4f} · "
                    f"[open in Google Maps](https://www.google.com/maps/@{r.lat},{r.lon},12z) · "
                    f"[NASA Worldview](https://worldview.earthdata.nasa.gov/?v={r.lon-0.2},{r.lat-0.2},{r.lon+0.2},{r.lat+0.2})")
        st.caption("Scaled differences: (Earth − reference) / IQR of all Earth windows. |d| ≤ 0.5 = similar, |d| ≥ 1.5 = different.")
        st.bar_chart(pd.Series(d, name="scaled difference").rename(index=FEATURE_LABELS))

with tab_time:
    st.subheader("An analog in time, not only in place")
    st.write("At the lunar south pole the Sun never climbs above ~7°. On Earth that light only happens near sunrise "
             "and sunset — except at high latitudes, where it lasts for hours around the equinoxes. This tells field "
             "teams **when** to test rover vision and EVA lighting, not just **where**.")
    lows = pd.DataFrame(res["low_sun_hours_by_month"],
                        index=["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
    lows.columns = [label(c).split("·")[1].split("(")[0].strip() for c in lows.columns]
    st.line_chart(lows, y_label="hours/day with Sun 0–7°")

with tab_val:
    st.subheader("Is the illumination metric real?")
    for k, vv in val.items():
        st.write(f"- **{label(k)}** — Spearman ρ = {vv['spearman_rho']:.2f} (n = {vv['n_pixels']:,} pixels at 120 m)")
    f4 = FIGURES / "fig4_illumination_validation.png"
    if f4.exists():
        st.image(str(f4))
    st.caption("Lower agreement at Malapert: distant horizons outside the local DEM matter more there (known limitation).")

with tab_about:
    st.markdown((ROOT / "docs" / "METHOD.md").read_text(encoding="utf-8"))
