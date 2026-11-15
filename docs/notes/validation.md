# Validation statistics (proofs 1 and 3)

Notes for `docs/METHOD.md` (integrated by Victor). Each script writes `data/processed/stats/<name>.json` with
`_meta` (UTC date, seed, parameters, git commit and SHA-256 of its inputs). Seed: **20261115** everywhere.
None of these scripts modify `windows.csv`, `summary.csv` or `known_analogs.*`; the main numbers (10,424 windows,
rankings and scores) are unchanged. Numbers below are copied from the JSON files named in each section.

## 1 · Permutation null test (`scripts/stats/null_test.py` → `null.json`)

**Statistic.** Exactly as `scripts/validate_known_analogs.py`: each of the 8 known sites → the 6 km windows that
contain it → best percentile of their score among all 10,424 windows of the target → median over the 48
(site, target) tests. Computed for the combined, terrain and illumination scores. The script recomputes the observed
medians and checks them against `known_analogs.json` before running the null.

**Null.** The 8 sites are replaced by random points and the statistic is recomputed, N = 10,000 times. Each site
keeps its own set of targets (Moon, Mars or both).

| Null | Question it answers | Where the random point is drawn |
|---|---|---|
| global | Do the NASA analog sites rank higher than a random point anywhere in our 14 regions? | uniform over the valid area of all 14 regions |
| region-matched | Is the exact NASA site special within its own region? | uniform over the valid area of the site's own region |

A point is *valid* when it falls inside at least one window (exactly when the known-analog test can score it; sea,
lakes and masked pixels are excluded). The valid area is sampled on a 150 m lattice; lattice points inside the same set
of windows form one cell, and cells are drawn with probability proportional to their area. The three Arizona sites
(Meteor Crater, SP Crater, Cinder Lake) are drawn independently inside the San Francisco Volcanic Field region.

p = (1 + #{null ≥ observed}) / (N + 1).

**Results.**

| Score | Observed median percentile | Global null: mean [P5–P95] | p (global) | Region-matched null: mean [P5–P95] | p (region-matched) |
|---|---|---|---|---|---|
| combined | 67.6 | 61.6 [37.3–81.4] | 0.37 | 55.3 [38.2–70.8] | 0.099 |
| terrain | 61.2 | 61.9 [38.1–81.1] | 0.55 | 54.5 [40.3–67.6] | 0.22 |
| illumination | 84.3 | 62.1 [34.7–85.6] | 0.065 | 64.2 [35.3–85.0] | 0.060 |

**Interpretation (honest).**
- Against the **global** null, the 8 known sites are **not** significantly better than random points of our regions for
  the combined or terrain score. This is expected: the 14 regions were chosen because they are analogs, so a random point
  in them is already a good analog. A random point anywhere on Earth would be a stricter, easier null.
- Illumination is the strongest signal (p ≈ 0.06 in both nulls): the known sites sit where low-Sun shadowing is most
  Moon-like, more than their terrain does. This is borderline, not significant at 0.05.
- Against the **region-matched** null the combined score gives p ≈ 0.10: the exact NASA sites tend to be better than
  the rest of their region, but with 8 sites this is not significant.

**Pu'u Hiwahine (NASA/CSA/DLR ISRU field tests 2010 and 2012) by lunar target.** The rank is the position of its best
window among the 10,424 (stable order, as `web/tools/export_data.py`). "Share of Mauna Kea ranked higher" is the exact
share of the valid Mauna Kea area whose best window ranks strictly better; the region-matched p is the share that ranks
at least as well (no sampling; computed over the 150 m lattice).

| Target | Rank (of 10,424) | Percentile among all windows | Share of Mauna Kea ranked higher | p (region-matched) |
|---|---|---|---|---|
| Malapert Massif | 1 | 100.0 | 0.0 % | 0.004 |
| Nobile Rim 1 | 9 | 99.9 | 2.0 % | 0.022 |
| de Gerlache Rim | 19 | 99.8 | 4.0 % | 0.043 |
| Connecting Ridge | 23 | 99.8 | 5.5 % | 0.057 |
| Leibnitz Beta | 115 | 98.9 | 21.9 % | 0.22 |
| Haworth | 483 | 95.3 | 52.4 % | 0.52 |

For Malapert, no part of Mauna Kea ranks higher than the NASA test site, and only 0.4 % of its valid area ranks as high.
`null.json` also gives `p_bonferroni` = p × 6 (capped at 1) for the six lunar targets: only Malapert stays below
0.05 (0.025); Nobile Rim 1 0.13, de Gerlache 0.26, Connecting Ridge 0.34, Leibnitz Beta and Haworth 1.
We report the best of all lunar (site, target) tests of the known-analog test, so the fair correction is over all of
them: 6 lunar sites × 6 lunar targets = 36 tests (the lunar rows of `known_analogs.json`). Then p = 0.004 × 36 = 0.15 for
Malapert, which is **not** significant. There is no dated record in the repository that Pu'u Hiwahine was chosen as the
test site before the result, so we do not claim it was.

**Sentence for the web and deck** (the Proof view generates it from `null.json` and `known_analogs.json`):
"Only 0.4 % of Mauna Kea scores as high as NASA's exact test site for Malapert Massif: p = 0.004 (0.025 corrected for
6 lunar targets; 0.15 corrected for all 36 site–target tests)". The `headline` field of `null.json` only carries the
6-target correction; use the sentence above.

## 2 · ROC and AUC (`scripts/stats/roc.py` → `roc.json`)

**Positives:** the 6 km windows that contain a known analog site of the target's body (Moon: 6 sites, 22 windows;
Mars: 4 sites, 14 windows). **Negatives:** the remaining windows. AUC = P(score of a positive > score of a negative),
ties ½ (Mann-Whitney). **95 % CI:** cluster bootstrap (B = 2,000) that resamples whole sites, because the windows of one
site overlap and are not independent, and resamples the negatives.

| Target | AUC combined [95 % CI] | AUC terrain [95 % CI] | AUC illumination [95 % CI] |
|---|---|---|---|
| Connecting Ridge | 0.65 [0.44–0.83] | 0.63 [0.42–0.81] | 0.75 [0.53–0.90] |
| Nobile Rim 1 | 0.61 [0.38–0.81] | 0.59 [0.37–0.80] | 0.75 [0.53–0.90] |
| de Gerlache Rim | 0.63 [0.41–0.83] | 0.61 [0.39–0.81] | 0.75 [0.53–0.89] |
| Malapert Massif | 0.59 [0.37–0.79] | 0.57 [0.36–0.77] | 0.75 [0.53–0.90] |
| Haworth | 0.68 [0.49–0.82] | 0.65 [0.48–0.79] | 0.75 [0.52–0.89] |
| Leibnitz Beta | 0.66 [0.48–0.82] | 0.63 [0.46–0.79] | 0.75 [0.54–0.87] |
| Arcadia Planitia | 0.33 [0.14–0.59] | 0.33 [0.15–0.60] | 0.37 [0.15–0.55] |
| Jezero | 0.50 [0.38–0.65] | 0.46 [0.35–0.63] | 0.63 [0.40–0.82] |
| Deuteronilus | 0.45 [0.21–0.71] | 0.42 [0.22–0.68] | 0.54 [0.26–0.76] |

The three CIs of a target use the same bootstrap draws (paired), so they can be compared with each other.

**Interpretation.** With 4–6 sites per body this is descriptive. For the Moon, the combined and terrain AUCs are
0.57–0.68 and every CI includes 0.5. The illumination AUC is 0.75 for all six lunar targets and its 95 % CI
**excludes 0.5 for all six** (lower bounds 0.52–0.54, so only just): **low-Sun illumination, not terrain, is what
separates NASA's lunar analog sites.** For Mars the score does **not** separate the known sites (AUC 0.33–0.50; see
"What the statistics do NOT support").

## Features for the robustness tests (`scripts/stats/extract_features.py`)

`windows.csv` keeps only the Earth windows at 6 km. The bootstrap needs the features of the reference (Moon/Mars)
windows, and the window-size test needs 3 and 12 km. The script recomputes them with the pipeline's own functions
imported from `pen/` (nothing in `pen/` or `config/` is changed), from the same rasters (777 MB download), into
`data/cache/stats/` (git-ignored). Check: the recomputed 6 km Earth features match `windows.csv` in all 14 regions
(10,424 windows, max |difference| 1.1e-4, the rounding of `windows.csv`).

## 3 · Bootstrap CI of the score (`scripts/stats/bootstrap.py` → `bootstrap.json`)

Each replicate resamples the target's 6 km reference windows with replacement, recomputes the median reference vector
and rescores all 10,424 Earth windows with the **same IQR** as the main run (B = 1,000, percentile CI). The script first
checks that the point estimate reproduces `score_combined` of `windows.csv`. It reports the 95 % CI of the score and of
the rank for the top-20 windows of each target.

| Target | n_ref | #1 score [95 % CI] | #1 rank [95 % CI] |
|---|---|---|---|
| Connecting Ridge | 10 | 90.9 [76.2–91.5] | 1 [1–176] |
| Nobile Rim 1 | 23 | 80.5 [64.8–85.2] | 1 [1–55] |
| de Gerlache Rim | 12 | 84.8 [70.1–91.3] | 1 [1–36] |
| Malapert Massif | 36 | 79.3 [60.3–89.9] | 1 [1–78] |
| Haworth | 64 | 89.4 [85.9–91.0] | 1 [1–22] |
| Leibnitz Beta | 11 | 85.3 [78.5–87.9] | 1 [1–47] |
| Arcadia Planitia | 94 | 96.0 [83.3–96.7] | 1 [1–94] |
| Jezero | 82 | 88.6 [83.0–91.9] | 1 [1–35] |
| Deuteronilus | 165 | 93.2 [88.1–95.1] | 1 [1–49] |

**Interpretation.** The score of the best window is uncertain by several points, and more for targets with few
reference windows (Connecting Ridge has only 10). The exact #1 is **not** guaranteed under resampling of the reference
(its rank CI reaches tens to ~180), so the web should say "a top window" with its interval, not "the single best
place on Earth". The CI is asymmetric because the point estimate already uses the best-fitting median.

## 4 · Ranking stability (`scripts/stats/stability.py` → `stability.json`)

**Weights.** N = 10,000 draws; each dimension (terrain, illumination) gets a weight log-uniform in [0.25, 4], the
range of the app sliders, and the score is recombined with the README slider formula. This **replaces the Dirichlet
weights in `docs/plan/chamba.md`**, so the test covers exactly the weightings a user can choose in the app. With two
dimensions only the ratio W_illumination / W_terrain matters (1/16 to 16, triangular in log).

**Window size.** Recomputed at 3, 6 and 12 km (IQR and reference median at each size, as the pipeline does).
Kendall τ-b between the regional rankings (best score per region, n = 14) and the Jaccard overlap of the top-10 window
footprints (area of intersection / area of union, longitude scaled by cos latitude).

| Target | P(#1 stays #1) | P(#1 in top 10) | τ 3–6 | τ 6–12 | τ 3–12 | Jaccard top-10 3–6 | 6–12 | 3–12 |
|---|---|---|---|---|---|---|---|---|
| Connecting Ridge | 1.00 | 1.00 | 0.65 | 0.45 | 0.32 | 0.15 | 0.00 | 0.00 |
| Nobile Rim 1 | 1.00 | 1.00 | 0.52 | 0.58 | 0.36 | 0.19 | 0.00 | 0.00 |
| de Gerlache Rim | 0.90 | 1.00 | 0.58 | 0.32 | 0.43 | 0.16 | 0.00 | 0.00 |
| Malapert Massif | 0.81 | 1.00 | 0.39 | 0.60 | 0.25 | 0.15 | 0.02 | 0.00 |
| Haworth | 0.37 | 0.84 | 0.74 | 0.78 | 0.60 | 0.15 | 0.17 | 0.03 |
| Leibnitz Beta | 0.59 | 1.00 | 0.76 | 0.39 | 0.32 | 0.02 | 0.08 | 0.00 |
| Arcadia Planitia | 1.00 | 1.00 | 0.43 | 0.67 | 0.49 | 0.00 | 0.04 | 0.01 |
| Jezero | 0.60 | 1.00 | 0.56 | 0.43 | 0.30 | 0.02 | 0.00 | 0.00 |
| Deuteronilus | 0.47 | 0.99 | 0.56 | 0.58 | 0.49 | 0.06 | 0.00 | 0.01 |

**Interpretation.**
- **Weights:** the #1 window stays in the top 10 under ≥ 84 % of the slider weightings for every target (≥ 99 % for
  eight of nine), and stays #1 in 37–100 %. The ranking is robust to how a user weights terrain vs illumination.
- **Window size:** the regional ranking is moderately consistent (τ 0.25–0.78, all positive), but the exact top-10
  windows do **not** carry over between sizes (Jaccard ≤ 0.19 for 3–6 km and ≈ 0 for 12 km). For the lunar targets the
  6 km top 10 is all or almost all Mauna Kea, as is the 3 km top 10; at 12 km it is mixed. Caveat: at 12 km the lunar
  reference vector is the median of only 1–10 reference windows (1 for Connecting Ridge, de Gerlache and Leibnitz Beta),
  so the 12 km comparison is weak for those targets. The result is scale-dependent; 6 km is a choice, documented as such.

## 5 · Tornado and score decomposition (`scripts/stats/tornado.py` → `tornado.json`, `decomp.json`)

**Tornado.** For the #1 window of each target (and the mean over its top 10): change of the combined score when one
feature is moved by −1 IQR (`low`) or +1 IQR (`high`), i.e. d_k ∓ 1, and when it is removed from the score
(`removed`). Sorted by max(|low|, |high|). Deterministic. A ±1 IQR move is large, so most entries are drops of 10–30
points; the asymmetry shows in which direction the window already differs from the target.

**Decomposition.** For each top-20 window: share of each feature in the squared distance,
d_k² / Σ_j d_j². Example: for Malapert's #1 window (Mauna Kea), roughness is 74 % of D² (d = −0.53, smoother than the
lunar target); removing it would raise the score by 8.7 points.

## 6 · Control regions (`scripts/stats/controls.py` → `data/processed/controls/controls.json`)

Three Copernicus GLO-30 tiles with no lunar or Mars analog use found in our search, scored with the pipeline's own
functions imported from `pen/` (same 30 m grid, water mask, 6 km windows with a 3 km step) and the **same IQR and
reference vectors as the main run**. The controls are not added to the pool, `config/sites.yaml` is not touched and the
official ranking (10,424 windows) does not change. "Rank if inserted" = 1 + number of official windows with a strictly
higher score.

| Control | Tile | Type | Why |
|---|---|---|---|
| Central Iowa, USA | N42 W094 | agricultural plain | flat cultivated plain; tests the flat-plains degeneracy for Arcadia |
| Flint Hills, Kansas, USA | N38 W097 | rolling prairie hills | ordinary gentle hills, no volcanism or craters |
| Grisons, Swiss Alps | N46 E009 | rugged non-volcanic high mountains | "does P.E.N. only detect rugged terrain, or terrain that resembles the Moon?" |

The Alpine tile contains glaciers; their smooth ice surface in the DSM can lower roughness, and their fraction of the tile
was **not measured**. An Amazon tile was considered and rejected: Copernicus is a surface model, so the roughness would
be that of the forest canopy, not the ground.

**Best-window rank if inserted among the 10,424 (combined score), and P50 of the control vs the 14 regions pooled:**

| Target | Regions P50 / max | Iowa P50 / best rank | Flint Hills P50 / best rank | Alps P50 / best rank |
|---|---|---|---|---|
| Connecting Ridge | 45.0 / 90.9 | 25.1 / #5,271 | 31.4 / #4,525 | 32.1 / #2,201 |
| Nobile Rim 1 | 36.7 / 80.5 | 20.2 / #5,932 | 24.9 / #5,443 | 36.9 / #135 |
| de Gerlache Rim | 40.0 / 84.8 | 22.3 / #6,101 | 27.6 / #5,360 | 33.8 / #766 |
| Malapert Massif | 35.4 / 79.3 | 17.7 / #5,456 | 22.1 / #5,712 | 41.6 / #82 |
| Haworth | 46.2 / 89.4 | 27.5 / #5,468 | 34.6 / #3,788 | 27.3 / #4,824 |
| Leibnitz Beta | 43.7 / 85.3 | 26.8 / #4,453 | 33.5 / #3,454 | 28.7 / #3,219 |
| Arcadia Planitia | 44.0 / 96.0 | 53.4 / #423 | 59.5 / #108 | 12.6 / #9,196 |
| Jezero | 52.7 / 88.6 | 29.5 / #5,203 | 37.7 / #2,373 | 24.2 / #7,158 |
| Deuteronilus | 52.0 / 93.2 | 36.3 / #3,755 | 46.2 / #1,501 | 20.9 / #8,682 |

`controls.json` also gives P90 and max per control, per dimension (terrain, illumination) and for each of the 14 regions.

**Interpretation (reported as it is).**
- **Moon, plain and hills:** Iowa and the Flint Hills fall below all 14 regions at P90 for every lunar target, and their
  best windows would rank #3,454 or lower. Ordinary flat or rolling terrain does not look like the lunar targets.
- **Moon, Alps:** rugged mountains do score high for some lunar targets: for Malapert the best Alpine window would rank
  #82 and the Alpine P50 (41.6) is above the pooled P50 of our regions (35.4); its P90 ranks 9th of the 14 regions.
  But it does not reach the top: Mauna Kea's NASA test site is #1 and the Alpine best is far below the top 10 for every
  target. The split by dimension shows why: the Alpine terrain score for Malapert reaches 80.4, but its illumination score
  only 59.9 (Mauna Kea's top-10 windows for Malapert score 90.7–98.0 in illumination). **P.E.N. partly detects ruggedness (the terrain
  dimension cannot tell the Alps from the Moon), and the low-Sun illumination dimension is what separates lunar-like
  terrain from ordinary high mountains.** This is consistent with the ROC result (section 2).
- **Mars, flat-plains degeneracy confirmed:** for Arcadia Planitia, the Flint Hills (best #108, P50 59.5) and Iowa
  (best #423, P50 53.4) score **above** the pooled P50 of our regions (44.0) and their P90 rank 6th and 7th of the 14
  regions. A flat or gently rolling plain on Earth looks like Arcadia to this score; Arcadia rankings should not be read
  as evidence of a special analog.

## What the statistics do NOT support

- **The 8 known sites as a group do not beat random points of our 14 regions.** Global null: p = 0.37 for the combined
  score and 0.065 for illumination alone; region-matched null: p = 0.10 combined. The regions were chosen because they
  are analogs, so a random point in them is already a reasonable analog; the test cannot tell the NASA sites apart from
  their neighbourhood as a group. The single Malapert ↔ Pu'u Hiwahine result survives the correction for 6 lunar
  targets (p = 0.025) but not the correction for all 36 lunar site–target tests (p = 0.15).
- **For Mars, the score does not separate the known analog sites** (AUC 0.33–0.50 for Arcadia, Jezero and
  Deuteronilus, all CIs include 0.5). Reasons: (1) the Mars analog sites in our list (Haughton, Mauna Kea, Atacama,
  Dry Valleys) were chosen by NASA and others for chemistry, climate, ice or field logistics, not for terrain resemblance
  to these three CTX targets; (2) Arcadia is a flat plain, and flat terrain on Earth is common, so any flat window scores
  high (the "flat-plains degeneracy" in the README); its AUC is below 0.5.
- **The exact #1 window is not stable**: under resampling of the reference windows its rank CI reaches tens to ~180, and
  the top-10 windows barely overlap between 3, 6 and 12 km (Jaccard ≤ 0.19). Claims should be about top regions and
  intervals: say "top window" with its bootstrap CI, never "the best place".
- **The terrain score alone does not mean "lunar"**: rugged non-volcanic Alpine terrain reaches a terrain score of 80.4
  for Malapert (section 6); it is the illumination dimension that keeps it out of the top.
- **Arcadia rankings are not evidence of a special analog**: a farm plain in Iowa and prairie hills in Kansas score above
  the median of our regions for Arcadia (section 6).

## Q&A for the judges (validation)

Answers use only the numbers in `data/processed/stats/`, `data/processed/controls/` and `data/processed/known_analogs.json`.

**1. "Isn't this just finding mountains?"**
Partly, for terrain, and that is why light is a separate dimension. Our hardest control, rugged non-volcanic Swiss Alps,
reaches a terrain score of 80.4 for Malapert, but only 59.9 for illumination, and its best window would rank #82 of
10,424; Mauna Kea's top-10 windows for Malapert score 90.7–98.0 in illumination. A farm plain (Iowa) and prairie hills
(Kansas) fall below all 14 regions at P90 for every lunar target.

**2. "Is the result statistically significant?"**
One result is, with a caveat. Within Mauna Kea, only 0.4 % of the area scores as high as NASA's test site for Malapert
(p = 0.004; 0.025 after correcting for 6 lunar targets), but it is the best of 36 lunar site–target tests, and corrected
for all 36 it is p = 0.15, not significant. As a group, the 8 known sites do not beat random points of our regions
(p = 0.367 global, 0.099 region-matched). We report all three numbers.

**3. "Why doesn't Mars separate?"**
For the three Mars targets the AUC is 0.33–0.50: the score does not rank the known Mars analog sites above other windows.
Those sites (Haughton, Mauna Kea, Atacama, Dry Valleys) were chosen for chemistry, climate or ice, not terrain shape, and
flat terrain is common on Earth: for Arcadia Planitia, prairie hills and a farm plain have median scores of 59.5 and
53.4, above our regions' 44.0 (the flat-plains degeneracy). We present Mars scores as terrain similarity only.

**4. "How is this different from other analog finders?"**
Ranking Earth DEM windows by terrain similarity is not new: at least three other NASA Space Apps 2026 projects do it with
the same open DEMs. In our search we found no other tool that scores Earth analog sites on how their terrain casts
shadows under a low Sun, checks that light model against NASA's LOLA illumination maps (Spearman ρ 0.92–0.99), and tests
a blind recovery of NASA's own lunar field-test site with a permutation null.

**5. "Why did you pick these 8 sites?"**
They are the classic NASA training and analog sites that fall inside our 14 regions, each with a sourced coordinate
(`scripts/validate_known_analogs.py`); two candidates were dropped before testing (Askja falls on a masked lake, and the
HMP base camp duplicates Haughton). The 14 regions themselves were chosen because they are analogs, so a random point in
them is already a reasonable analog; that makes our group test conservative and explains its p = 0.367.

**6. "Did you tune P.E.N. until it found Mauna Kea?"**
The weights are equal and the known sites are used only to check the ranking, never to fit it. We cannot prove the site
was chosen in advance (there is no dated record), which is exactly why we also report the correction over all 36 lunar
site–target tests (p = 0.15).

**7. "Is the #1 window robust?"**
To slider weights, yes: the #1 window stays in the top 10 under at least 84 % of random weightings for every target. To
resampling of the lunar reference terrain, less: Malapert's top window scores 79.3 [95 % CI 60.3–89.9] and its rank
ranges #1–#78. To window size, least: regional rankings agree with Kendall τ 0.25–0.78, and the exact top-10 windows
barely overlap between 3 and 6 km (Jaccard ≤ 0.19). So we say "top window" with its interval, never "the best place".

**8. "An AUC of 0.75 is not impressive, is it?"**
It is modest, and we say so. Illumination gives AUC 0.75 for the Moon with a 95 % CI just above 0.5 (lower bounds
0.52–0.54); terrain alone does not separate. The six lunar targets share the same six known sites, so the six AUCs are
nearly equal and are not independent evidence. With only 6 sites this is descriptive.

## Prior work

**How we searched (15 Nov 2026).** General web search plus the primary sources it returned (papers, abstracts, NASA
reports, project repositories). NASA ADS and Google Scholar were **not** queried directly (ADS needs an API token and
Scholar blocks automated queries), so peer-reviewed work that is indexed only there may be missing. Queries covered:
terrestrial analog site selection for the lunar south pole; DEM-based terrain similarity between Earth and the Moon or
Mars; analog-site catalogues; lunar polar illumination models validated against LOLA; low-Sun lighting analogs.

| Work | What it does | Like P.E.N. | Unlike P.E.N. |
|---|---|---|---|
| Mazarico et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus ([link](https://www.sciencedirect.com/science/article/abs/pii/S0019103510004203)); Gläser et al. (2014), *Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA*, Icarus ([link](https://www.sciencedirect.com/science/article/abs/pii/S0019103514004278)) | Horizon / ray-tracing illumination of the lunar poles from LOLA DEMs; the basis of NASA's average-illumination maps | Shadow modelling from DEMs; we validate against this LOLA product | Moon only; site ranking for landing, not a search for Earth analogs |
| Preston & Dartnell (2014), *Planetary habitability: lessons learned from terrestrial analogues*, Int. J. Astrobiology ([link](https://www.cambridge.org/core/journals/international-journal-of-astrobiology/article/planetary-habitability-lessons-learned-from-terrestrial-analogues/244C9EB88B74D6905133DD2228DD3112)) | Review of analogue sites and catalogues; notes there are no clearly defined criteria to evaluate them and calls for an open database | Motivates a quantitative, open ranking | Qualitative review; no terrain or light metric |
| Foucher et al. (2021), *Definition and use of functional analogues in planetary exploration*, Planet. Space Sci. 197, 105162 ([doi](https://doi.org/10.1016/j.pss.2021.105162)) | Defines "functional analogues": judge a site by the properties that matter for a given use | Our per-dimension scores (terrain, illumination) are functional in this sense | Conceptual framework; no computation |
| USGS, *Known Terrestrial Analog Sites for Planetary Science* ([doi](https://doi.org/10.5066/P9J72921)) | Point layer of known analog sites by process (craters, dunes, volcanoes…) | Open data on analog sites | A list, not a ranking; no terrain or light similarity |
| PISCES / NASA–CSA Mauna Kea field tests (EPSC-DPS 2011 abstract 1301, [pdf](https://meetingorganizer.copernicus.org/EPSC-DPS2011/EPSC-DPS2011-1301.pdf)) | Chose Mauna Kea test sites on terrain suitability and logistics | The site our blind test recovers | Expert selection, not a computed ranking; illumination is not a stated criterion |
| Artificial low-Sun lighting analogs: e.g. *Lunar Rover Cargo Transport: Mission Concept and Field Test* ([arXiv 2601.03371](https://arxiv.org/abs/2601.03371)); LunaLab facility, Scientific Data 2026 ([doi](https://doi.org/10.1038/s41597-026-06668-8)) | Reproduce polar lighting with spotlights or indoor lamps | Same goal: rehearse in long, low-Sun shadows | They build the light artificially; they do not search Earth for terrain that casts lunar-like shadows under the real Sun |
| NASA Space Apps 2026 projects on the same challenge: *terrestrial-analog-finder* ([GitHub](https://github.com/shishir-kuet/terrestrial-analog-finder)), *Mirror Terrain* ([GitHub](https://github.com/talyamorgul/mirror-terrain)), *SolMate* ([PR](https://github.com/hellorifat/solmate/pull/1)) | Rank Earth DEM windows (Copernicus GLO-30) against LOLA / CTX / MOLA targets with relief, slope, roughness and hypsometry; Mirror Terrain and SolMate report AUC against known analogs and controls | Almost the same terrain pipeline, open DEMs and AUC-style validation | As of 15 Nov 2026: terrestrial-analog-finder states "Illumination is still not represented"; Mirror Terrain does not mention illumination; SolMate cites PGDA Sun-visibility data, but its scoring is described with terrain indicators only. None reports a light model validated against LOLA illumination maps or a permutation test of a blind site recovery. Not peer-reviewed (like P.E.N.) |
| Sanganeria (2026), *Finding Earth's Best Testbeds for Moon and Mars Rovers: A Quantitative Terrain Comparison*, NHSJS ([link](https://nhsjs.com/2026/finding-earths-best-testbeds-for-moon-and-mars-rovers-a-quantitative-terrain-comparison/)) | Ranks Earth scenes by image-texture similarity to lunar and Martian images | Ranking of Earth testbeds | Image-based, no DEM and no illumination geometry; no validation against LOLA or known analogs |

**What we can and cannot claim.**
- **Not novel:** ranking Earth DEM windows by terrain similarity to the Moon or Mars. Several concurrent projects do
  this with the same open data and nearly the same features, and they report AUC-style checks against known analogs.
- **Defensible novelty sentence (for Angel):** *"In our search we found no other tool that scores Earth analog sites on
  how their terrain casts shadows under a low Sun, checks that light model against NASA's LOLA illumination maps
  (Spearman ρ 0.92–0.99), and tests a blind recovery of NASA's own lunar field-test site with a permutation null."*
  Keep the hedge "in our search"; do not write "the first" or "unique". The ρ range comes from the light-model
  validation (`docs/notes/moon_mars.md`, proof 2), not from this note.
- **Do not claim** that P.E.N. outperforms the other projects: they use different targets, windows, controls and
  validation sets, so their AUCs are not comparable with ours.

**Expert review (D6, second part).** No expert quote is in the repository. A quote may only be used on the project
page with the expert's written permission, their exact words, name and title.

