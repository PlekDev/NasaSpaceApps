# P.E.N. extras: from "where" to "how and when"

Four add-ons that turn the ranking into things a field team can use. They only **read** the pipeline's outputs
(`data/processed/windows.csv`, `thumbs/ref_windows.json`) and its 30 m grids; nothing in `pen/`, the app or the
pipeline changes. Everything is rendered from NASA/ESA elevation models: no photographs, no AI imagery.

| Extra | What it answers | Outputs | Run |
|---|---|---|---|
| Twin-light timelapse | How do the long polar shadows sweep over the Moon site and its Earth analog? | `figures/extras/twin_light_<ref>.mp4` + `_poster.png` | `python scripts/extras/twin_timelapse.py [--gif]` |
| Campaign calendar + field brief | When exactly is there lunar-pole light at each analog, and what should the team know? | `data/processed/briefs/<region>.md`, `.ics`, `_lowsun_windows.csv`, `README.md` | `python scripts/extras/campaign_calendar.py` |
| What the astronaut sees | What does the horizon look like at eye level, Moon vs Earth? | `figures/extras/astronaut_view_<ref>.png` | `python scripts/extras/astronaut_view.py` |
| Twin rover traverse | Can the same drive be rehearsed on Earth? | `figures/extras/rover_twin_<ref>.png`, `data/processed/briefs/rover_twin.json` | `python scripts/extras/rover_twin.py` |

Needs the pipeline's cache (`data/cache/`, from `make pipeline`); missing grids are rebuilt from `data/raw/`.
`astronaut_view.py` also uses the LOLA 85°S 40 m DEM (`python scripts/download_data.py lola_ldem_85s_40m`).
Runtime on a laptop: ~1.5 min for all six timelapses, 2 s for the calendars, ~1 min for the views, 10 s for the drives.

## 1 · Twin-light timelapse

72 frames per Moon site: the Sun 2° above the horizon, its azimuth stepping 5° at a time, cast shadows on the
reference window and on its best Earth window, side by side. A badge on the Earth panel says whether a 2° Sun can
really come from that direction there (at sunrise or sunset, some day of the year). At Mauna Kea it can for 31 % of
the directions: the east and west sectors. The rest is light that only exists near the lunar pole. That gap is the
argument for the "analog in time" and for polar analogs. The poster is the frame where both windows are most lit.
Use the MP4s in the demo video; `--gif` adds a small GIF for the README or slides.

## 2 · Campaign calendar and field brief

For every Earth region that is a top-3 analog of at least one Moon Base site (6 regions), minute by minute over 12
months from 1 Dec 2026: when the Sun is 0–7° high (NOAA solar position, no refraction), the 14-day block with the
most of that light, an iCalendar file with each low-Sun window in that block (UTC; Google Calendar or Outlook
convert), a CSV of every window of the year, and a one-page brief: why here (rank for each Moon site), images,
what matches and what differs, where the analogy breaks (Diviner), best weeks, and the NASA EONET snapshot.

- Mauna Kea, the best region for all six Moon sites: 10–23 Dec 2026, 67 min/day in two windows (sunrise, sunset).
- University Valley, Antarctica: 5–18 Feb 2027, 432 min/day; polar sites give hours, not minutes.

Index: [`data/processed/briefs/README.md`](../data/processed/briefs/README.md).

## 3 · What the astronaut sees

An eye-level (1.7 m, 75° field of view) render of each Moon site and its best Earth window, terrain up to 15 km
away, with each body's curvature. The Moon side uses the LOLA 85°S 40 m DEM so the horizon holds the real distant
mountains (the ones the far-horizon test showed matter). The astronaut stands on the local high point of the 6 km
window and looks toward the most distant relief. The polar Sun circles the horizon, so the Moon view uses the Sun
direction that lights the site; the Earth view uses the best real sunrise/sunset direction there. Grey shading with
a camera-like tone curve; the blue sky and the softer shadows on Earth are the atmosphere the Moon lacks.

## 4 · Twin rover traverse

On each 6 km window, a least-cost route links the same two relative points (SW → NE corner areas). Cost per 30 m
cell = 1 + (slope/10°)² + 3 × shadow fraction at 2° Sun; slopes above 20° are impassable. For the Moon/Mars site
and its Earth analog we report length, climb, maximum and mean slope, and share of the way in shadow.

| Target | Earth analog | Length (km) | Max slope (°) | In shadow |
|---|---|---|---|---|
| Leibnitz Beta Plateau | Mauna Kea | 6.8 vs 6.6 | 15.7 vs 12.9 | 13 % vs 9 % |
| de Gerlache Rim | Mauna Kea | 8.2 vs 6.9 | 19.7 vs 19.8 | 27 % vs 26 % |
| Haworth | Mauna Kea | 6.7 vs 6.5 | 7.8 vs 14.8 | 12 % vs 12 % |
| Shackleton Connecting Ridge | Mauna Kea | 7.2 vs 6.6 | 17.5 vs 17.7 | 2 % vs 47 % |
| Malapert Massif | Mauna Kea | 12.9 vs 8.6 | 26.4 vs 20.8 | 21 % vs 28 % |
| Nobile Rim 1 | Mauna Kea | 10.6 vs 6.9 | 29.0 vs 19.8 | 52 % vs 26 % |
| Jezero (Mars) | Sierra Chichinautzin | 7.1 vs 6.9 | 19.6 vs 16.3 | 38 % vs 27 % |
| Arcadia Planitia (Mars) | Atacama, Yungay | 7.1 vs 6.6 | 3.2 vs 3.9 | 1 % vs 0 % |
| Deuteronilus Mensae (Mars) | Atacama, Yungay | 6.5 vs 7.1 | 7.0 vs 14.7 | 28 % vs 30 % |

On Malapert and Nobile Rim 1 no route stays under 20°: the figure says so. That is a real constraint for a rover,
and the Earth drive is gentler, so it under-rehearses those two sites.

## Limits

- The timelapse and views use a single Sun elevation (2°). Over a lunar day the real Sun at these sites (85–89.5°S)
  moves between roughly −5° and +6.5° depending on azimuth and season (±1.5° at the pole itself).
- The views and the rover routes use 30–40 m grids: boulders and small craters are not in them.
- Solar times ignore refraction (~0.5° at the horizon), which shifts low-Sun windows by a few minutes.
- The rover cost weights are a reasonable first choice, not a mission's traverse planner.
