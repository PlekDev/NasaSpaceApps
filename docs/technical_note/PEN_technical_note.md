# P.E.N.: FINDING AND SCHEDULING EARTH ANALOGS OF LUNAR SOUTH-POLE AND MARS SITES BY TERRAIN AND LOW-SUN ILLUMINATION, VALIDATED AGAINST NASA LOLA

**Pollones en Fuga** (Mexico): V. Velázquez, D. Lizárraga, D. Dona, A. Landin, A. Hernández, Paul.
NASA Space Apps Challenge 2026 · *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.
Code, data and web app: https://github.com/PlekDev/NasaSpaceApps · https://plekdev.github.io/NasaSpaceApps/

<!-- DRAFT. Statistics are those in data/processed/stats and data/processed/controls on Sun 15 Nov; they are re-read
     after the 19:00 number freeze. The rehearsal example is the Mission view after the physics fixes (#39, #42), Victor's values; re-read after #42 merges. -->

**Introduction.** NASA plans its Moon Base near the lunar south pole, where the Sun never rises more than about 7°
above the horizon. Long terrain-cast shadows there control landing safety, rover vision, power and EVA planning.
Earth analog sites are usually chosen for geology and access, and the light is rarely checked. P.E.N. (Planetary
Environmental Navigator) asks a narrower question: *for a given Moon or Mars site, which 6 km place on Earth has the
same terrain and the same low-Sun shadows, when does it have them, and where does the analogy break?*

**Data.** Targets: six lunar south-pole sites from the 5 m LOLA DEMs [1] (Shackleton Connecting Ridge, Nobile Rim 1,
de Gerlache Rim, Malapert Massif, Haworth, Leibnitz Beta Plateau) and three Mars sites from MRO CTX stereo DTMs:
Arcadia Planitia, Jezero and Deuteronilus Mensae. Deuteronilus is our buried-ice reference by region: SHARAD radar
found ice-rich debris aprons there [5, 6]; we did not check that the DTM footprint itself contains one. Earth: 14
one-degree tiles of the ESA Copernicus DEM GLO-30. Validation and context: LOLA average-illumination and
permanently-shadowed-region maps [2], the LOLA 85°S 40 m DEM, the LRO Diviner polar resource product [3], the Mars
Climate Database v6.2, NASA POWER, MODIS MOD11A2 and EMIT L2B.

**Method.** *(1) Common grid.* Every DEM is reprojected to a local azimuthal-equidistant projection on its own
body and averaged to 30 m, so the 5 m lunar and 20 m Martian models are degraded to the Earth resolution.
*(2) Cast shadows.* For a Sun at elevation θ shining along a row of pixel size dx, pixel *i* is shadowed if
max<sub>j&lt;i</sub> g<sub>j</sub> &gt; g<sub>i</sub>, with g<sub>i</sub> = z<sub>i</sub> + i·dx·tan θ. One running
maximum per row gives the exact mask in O(N), with no horizon cut-off; other azimuths rotate the grid.
*(3) Features.* Each 6 km window (200 × 200 px, half-window step) gets five terrain features (log relief, median and
90th-percentile slope, 150 m roughness, hypsometric integral) and two illumination features (mean shadow fraction
with the Sun at 2° and 5°, over 8 azimuths). *(4) Score.* For a target with median feature vector r, an Earth
window x has d<sub>k</sub> = (x<sub>k</sub> − r<sub>k</sub>) / IQR<sub>k</sub>, where IQR<sub>k</sub> is taken over
all Earth windows; D = √(mean d<sub>k</sub>²) and S = 100·exp(−D). Weights are equal and were never fitted.
No analog labels enter the score.

**Results.** *Blind test.* Pu'u Hiwahine on Mauna Kea, where NASA, CSA and DLR rehearsed a lunar-polar prospecting
mission in 2012 [4], was never shown to P.E.N. Its best window is **#1 of 10,424** Earth windows for Malapert Massif,
in the top 0.2 % for four of the six Moon Base sites and in the top 5 % for all six. In a permutation test (10,000
random points), only 0.4 % of Mauna Kea scores as high for Malapert (p = 0.004; p = 0.025 after correcting for the six
lunar targets, 0.15 if all 36 lunar site × target tests are counted). The result does not generalise to the group:
across 8 classic analog sites and 48 site × target tests the median rank is the 84th percentile in illumination and the
61st in terrain, which is not significantly better than random points of our regions (p = 0.37 combined, 0.065 for
illumination). Those regions were chosen because they are analogs, so the null is a strict one. For Mars the score does
not separate the known sites (AUC 0.33–0.50).

*Light model against NASA.* With the LOLA 40 m polar DEM, horizons traced up to 150 km away on the curved Moon and
1,728 Sun positions, the modelled lit fraction reproduces the LOLA 18.6-year average-illumination map [2] with
Spearman **ρ = 0.92–0.99** at all six sites and a mean error of 2.0–3.2 percentage points of lit time. The model is
slightly darker than NASA at every site (bias −0.7 to −2.5 points; 95 % limits of agreement within −10.8 to +9.4
points). With the local DEM alone ρ is 0.46–0.88: the gap is distant mountains, not curvature. The points the model
never lights agree with NASA's permanently-shadowed-region map on 98.0–99.7 % of the points (intersection over union
0.53–0.82).

*Best analogs.* The six lunar sites match the upper slopes of Mauna Kea and the flanks of Mauna Loa (combined
scores 79–91). Deuteronilus Mensae matches the hyperarid Atacama near Yungay (93) and Jezero the Sierra Chichinautzin
volcanic field in Mexico (89). Arcadia Planitia scores 96 against Atacama, but that reflects the flat-plains effect,
not a special analog: in control tiles, a farm plain in Iowa and prairie hills in Kansas also score above the median
of our regions for Arcadia. For the lunar targets those two controls fall below all 14 regions (90th percentile of
the score); rugged Alpine terrain
reaches a terrain score of 80 for Malapert but only 60 in illumination, so the light dimension is what separates
lunar-like terrain from ordinary mountains. El Pinacate, an Apollo training ground in Sonora, is in the top 3 % for
four Moon Base sites.

*Robustness.* Re-weighting illumination from 0.5× to 2× keeps 5 to 10 of the top-10 windows. Under random weights the
top window stays #1 in 100 % of draws for Connecting Ridge and 81 % for Malapert, but only 37 % for Haworth. Resampling
the reference windows gives a 95 % interval of 60–90 for the Malapert score (79) and a rank interval of 1–78, and
rankings at 3, 6 and 12 km agree only moderately (Kendall τ 0.25–0.78). We therefore report top windows with their
intervals, not "the best place".

*When, and how.* Solar geometry gives the hours per day with the Sun at 0–7°: about 1 h/day below 40° latitude and
up to 5.6–6.7 h/day in spring and autumn at Arctic and Antarctic sites. For a traverse drawn on the lunar site, P.E.N.
lists the dates and times at which the Earth analog has the same Sun elevation and a compatible direction, with a
rehearsal fidelity (share of 101 samples along the route with the same lit or shadowed state on both bodies). For
the default Malapert traverse the lunar Sun comes from the north-northeast, a direction Mauna Kea's low Sun never
reaches; the view says so and offers the closest dates (late June, at sunrise). With the lunar Sun from the east, the
best Mauna Kea windows are in late March 2027, about half an hour after sunrise, with a rehearsal fidelity of about
80 %. Saying when no Earth date matches is part of the answer: it tells a field team which lunar lighting a site
cannot rehearse.

**Where the analogy breaks.** Per Diviner [3], in 88–100 % of each lunar site the annual mean temperature (2 cm below
the surface) is colder than the lowest air temperature ever recorded on Earth (184 K), and water ice is thermally
stable within 1 m in 22–64 % of it. The coldest Earth region searched (University Valley, Antarctica [7], 239 K mean
skin temperature) is still 95–132 K warmer than the Moon Base sites. Mars is closer, though its values are modelled
(Mars Climate Database v6.2) while the lunar ones are Diviner measurements: 15–38 K colder than University Valley, at
under 1 % of sea-level pressure. Gravity, vacuum and radiation are never reproduced.

**Limitations.** Scoring uses local horizons on both bodies; the far-horizon run validates the light model but Earth
windows are not re-scored with distant terrain. Four sites lie near the edge of the 85°S DEM, so their rays toward
lower latitudes stop after 21–91 km. Rankings depend on window size. Flat Mars plains match much of Earth. Temperature
and minerals are context, not scored. Only 14 Earth regions are searched so far. A global run is mostly a matter of
compute (52 s per one-degree tile on one core); the main method change is a land-cover mask, because the Earth
DEM is a surface model that includes forest canopy and buildings.

**References.** [1] Barker M. K. et al., High-resolution LOLA topography for lunar south pole sites, NASA GSFC PGDA
product 78. [2] Mazarico E. et al. (2011) *Icarus* 211, 1066–1081. [3] Paige D. A. et al., LRO Diviner polar resource
product, NASA PDS Geosciences. [4] Klingelhoefer G. et al. (2014) NTRS 20140008708. [5] Plaut J. J. et al. (2009)
*GRL* 36, L02203. [6] Petersen E. I., Holt J. W. & Levy J. S. (2018) *GRL* 45, 11595–11604. [7] Marinova M. M. et al.
(2022) *Antarctic Science*.

*Use of AI: an AI assistant (Claude, Anthropic) helped draft code and documentation; the team ran and checked every
result. No AI-generated images. Not endorsed by NASA or ESA.*
