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
These six p-values are not corrected for multiple testing; with a Bonferroni factor of 6, only Malapert stays
below 0.05 (0.004 × 6 = 0.025).

**Sentence for the deck (defensible):** "The NASA lunar test site on Mauna Kea is P.E.N.'s #1 of 10,424 windows for
Malapert Massif; only 0.4 % of Mauna Kea scores as high (p = 0.004 within the region)." Do **not** claim that the 8
known sites as a group beat random points of our regions (p = 0.37 global, 0.10 region-matched).

## 2 · ROC and AUC (`scripts/stats/roc.py` → `roc.json`)

**Positives:** the 6 km windows that contain a known analog site of the target's body (Moon: 6 sites, 22 windows;
Mars: 4 sites, 14 windows). **Negatives:** the remaining windows. AUC = P(score of a positive > score of a negative),
ties ½ (Mann-Whitney). **95 % CI:** cluster bootstrap (B = 2,000) that resamples whole sites, because the windows of one
site overlap and are not independent, and resamples the negatives.

| Target | AUC combined [95 % CI] | AUC terrain | AUC illumination |
|---|---|---|---|
| Connecting Ridge | 0.65 [0.44–0.83] | 0.63 | 0.75 |
| Nobile Rim 1 | 0.61 [0.39–0.82] | 0.59 | 0.75 |
| de Gerlache Rim | 0.63 [0.41–0.83] | 0.61 | 0.75 |
| Malapert Massif | 0.59 [0.37–0.79] | 0.57 | 0.75 |
| Haworth | 0.68 [0.49–0.82] | 0.65 | 0.75 |
| Leibnitz Beta | 0.66 [0.48–0.82] | 0.63 | 0.75 |
| Arcadia Planitia | 0.33 [0.15–0.59] | 0.33 | 0.37 |
| Jezero | 0.50 [0.38–0.65] | 0.46 | 0.63 |
| Deuteronilus | 0.45 [0.22–0.71] | 0.42 | 0.54 |

**Interpretation.** With 4–6 sites per body this is descriptive. For the Moon, the combined AUC is 0.59–0.68 and every
CI includes 0.5; the illumination score alone separates the known sites better (AUC ≈ 0.75 for every lunar target).
For Mars the score does **not** separate the known sites (AUC 0.33–0.50). The Mars analog sites (Haughton, Mauna Kea,
Atacama, Dry Valleys) were chosen for climate, chemistry or ice, not for terrain resemblance to these three CTX
targets, and Arcadia is a flat plain (see the "flat-plains degeneracy" in the README).

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

## 6 · Control regions (`controls.py`)
*Pending.*

## Prior work
*Pending.*
