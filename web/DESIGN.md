# P.E.N. web — design system

Status: "Industry over the globe". Implemented as CSS variables in `src/tokens.css`; components and the skin in `src/style.css`.
Traced from the Mission Stage prototype (Claude artifact); square instrument chrome from the team's Industry proposal.
UI AI-assisted (Claude Code); reviewed by the author.

## Point of view
The globe is the product. Everything else is a thin instrument layer on top of it: precise, solid, technological. Panels are glass over the
real imagery and dock at the edges so the globe stays in the middle. Numbers are the content, so they get the type; chrome is square,
hairline and quiet.

## Themes
| | Dark (default) | Light |
|---|---|---|
| page / space | `#0b0f17` / `#05070b` (deep-space gradient and stars behind the globe) | `#f2f2f3` / `#e4e7ea` |
| glass | `linear-gradient(155deg, rgba(38,60,88,.40), rgba(8,14,24,.46) 62%)` + blur 20 px, saturate 160 % | white-to-grey gradient, same blur |
| text 1 / 2 / 3 | `#eef2f6` / `#b6c2cf` / `#8a99ab` | `#1d1f20` / `#424244` / `#5b5b5e` |
| hairline / strong | `rgba(170,200,230,.16)` / `.34` | `rgba(29,31,32,.16)` / `.38` |
| accent (chrome) / text | `#94bce3` / `#b5d9fd` | `#5980a6` / `#416180` |
| primary button | fill `#94bce3`, text `#0b1a2a` | fill `#416180`, text `#fff` |

Follows `prefers-color-scheme`; the toggle stores `pen-theme` in localStorage inside try/catch. Glass is used on panels that really sit over the map; on
pages (solid ground) the same gradient is drawn without blur. In light mode each committed PNG figure sits in its own dark frame.
Contrast was checked with axe-core on the previous palette; re-run `tools/axe_run.py` before shipping (Playwright is not installed in every checkout).

## Colour
One steel accent for interactive chrome only (focus, slider ring, active nav underline, selection fills, links). Warning `#e0b060` / `#8a5a00` and
ok `#86cba7` / `#2f6b4f` are muted and used for the EONET box, fidelity chips and verdict states.

**Score ramp (data encoding, not decoration):** `#1c3d6e → #2a78d6 → #6da7ec → #ffd166`, linear from the minimum score to 100, identical in both themes. Lightness
rises monotonically (CIE L* 26, 50, 67, 86), so rank is readable without hue and stays monotonic under protanopia and deuteranopia simulation.
Over imagery every point carries a 1 px light halo (`rgba(255,255,255,.85)`). Chart series stay Okabe–Ito (colour-blind safe); chrome colours never carry data.

## Type
- **Barlow** (UI and body, tabular figures for every number) and **Barlow Condensed** (headings, scores, nav, buttons, small caps labels). Self-hosted woff2 (latin subset) in
  `public/fonts`, OFL licence alongside, `font-display: swap`. Barlow 400/500/600–700, Barlow Condensed 400–500/600–700. `--font-serif` is kept as an alias of `--font-display` for older view rules.
- Display numbers (scores, rank) are Barlow Condensed 600 at 64–88 px; page titles 44–68 px; panel titles 19–24 px.
- Labels (`.label`, table heads, group heads): Barlow Condensed 600, 12 px, uppercase, +.08em, `--text-3`. Buttons and nav: Barlow Condensed 600, 13 px, uppercase, +.1em.
- Minimum 12 px for secondary text, 14 px for anything that must be read on a projector.
- Hierarchy comes from size and weight, never from colour alone.

## Space, shape, depth
- 4/8 grid: 4, 8, 12, 16, 24, 32, 48.
- **Radii are 0 everywhere** (`--r-1..3`, `--r-pill`). Round marks (dots on the map, the compare handle) say `border-radius: 50%` explicitly; data swatches are squares.
- Hairline 1 px borders; `--line` for structure, `--line-strong` for controls and axes.
- **Registration marks:** 11 px crosses just outside the four corners of every glass panel and of the primary button (`--mark`). Panels that clip their children (page workspaces) keep them inside the border.
- One shadow per elevation: `inset 0 1px 0 rgba(255,255,255,.07), 0 18px 44px rgba(0,0,0,.38)` (softer in light).
- Controls: buttons 36 px (primary 44 px); sliders 3 px hairline track with a 14 px square thumb ringed in steel; segmented controls are bordered squares with a steel fill when selected.
- Top bar: a ruled strip, cells divided by hairlines, the active view underlined in steel.
- Popovers, sheets and dialogs are glass (`--glass-solid`, blur 24 px) over a blurred scrim.
- Motion: 160–240 ms `cubic-bezier(.2,.8,.2,1)` on hover/focus/sheet only; camera flights 600–1200 ms eased; everything off under `prefers-reduced-motion`.

## Icons
Inline SVG, 24 viewBox, 1.5 stroke, round caps, `currentColor`: crosshair, layers, moon, mars, low-sun, info, close, search,
chevron, theme (sun/moon). Drawn here, not copied from a set. No emoji.

## Layout (Explore)
Traced from the Mission Stage prototype. The globe fills the screen. **Left** (300 px, glass, registration marks): 01 Target (menu with thumbnails), 02 Weights (terrain, low-Sun illumination, minimum score, each with its end marks), 03 Zone (menu of the 14 zones, best first), Reset weights and a live "equal / custom weights" indicator.
**Right** (372 px): the overview shows the target (kicker, name, two-sentence description from `src/lib/about.ts`, topography source, ρ) and six cards: best match, NASA's test site, windows above your minimum, zones that qualify, how much your weights change the top 10, terrain vs light. Picking a dot, a zone or a table row flies the camera there and the panel becomes the **zone view**: imagery pair (NASA view of the target, real view of the window), **Open zone review** (the window's dossier, `#/dossier?target=..&window=..`), and four zone cards. A card opens in **focus**: it grows into a glass dialog (FLIP) and the stage blurs behind it; Esc or the close button returns it.
Every number is recomputed in the browser from the exported per-window scores (`src/lib/live.ts`, tested in `tests/live.test.mjs`). Known analog sites come from `known_sites.json` (written by `tools/export_data.py`). A bottom-centre legend explains the colour. At <= 820 px the panels become one bottom sheet (peek / half / full).

## Do not
Glow, orbs, dot grids, three-equal-card rows, left colour stripes, skeleton shimmer, purple gradients, rounded corners, pills, glass blur where there is no map behind it, emoji.

## Copy
Short and literal. "Best match", "Top matches", "Weights", "Minimum score", "Earth regions". Numbers always come from the data export.

## Navigation and routes (base phase)
Wordmark → Home (`#/`). Primary items, left to right: **Explore, Proof, Mission, When, Method**. **Tour** is a quiet outlined pill on the right, next to the theme toggle. **Dossier is not in the nav**: it is reached from a window's analog card (`#/dossier?target=..&window=..&route=..`). Five items plus Tour fit at 1024 px on one line (labels are one word). Active item: `aria-current="page"` with the `--raise-2` pill. At <= 820 px the nav is a menu button (Esc closes it) and Tour becomes its last item.
Aliases `#/validation` → `#/proof` and `#/time` → `#/when` use `history.replaceState` and keep the query. Unknown routes render Home. Every view module exports `render(el, m, params)` (and optionally `cleanup()`); `params` is the parsed query of the hash.

## View files and CSS prefixes
Each view lives in `src/views/<view>.ts` and imports its own `src/views/<view>.css`. Class names carry the view prefix: `.proof-*`, `.mission-*`, `.method-*`, `.home-*`, `.dossier-*`, `.tour-*`. A view never styles another view's prefix and never edits `style.css` or `tokens.css` (tokens are changed only by the integrator). Use the tokens (`var(--text-2)`, `var(--line)`, `var(--r-2)` ...), the shared classes (`.page-in`, `.prose`, `.tbl`, `.btn`, `.link`, `.seg`, `.muted`, `.sr-only`) and the 4/8 spacing scale.

## Charts (`src/lib/chart.ts`)
One way to draw a chart: Apache ECharts (modular, canvas or SVG), themed from the CSS variables, so dark and light match the rest of the UI.
```ts
import { mountChart } from '../lib/chart';
const h = mountChart(el, option, { summary: 'Plain-text message of the chart, with its key numbers.' });
h.update(next); h.update(next, { replace: true, summary: '…' }); h.dispose();   // dispose is automatic when the route is left
```
- `summary` is **required**: it becomes visually hidden text linked by `aria-describedby`; `label` adds an `aria-label`.
- Colours come from tokens: `--series-1..7` (Okabe–Ito, colour-blind safe; separate light values), `--ramp-0..3` (score ramp, data encoding), `--text-*`, `--line*`, `--panel-solid`. The theme is rebuilt live when `html[data-theme]` changes. Do not hard-code colours in an option; use the theme or read `readVars()`.
- Resize is handled (ResizeObserver); `prefers-reduced-motion` turns animation off; do not rely on colour alone (dashes, symbols, direct labels).
- `renderSVG(option, { width, height })` renders to an SVG string without a DOM (tests, print, dossier).
- Heavy libraries are loaded only through `lib/three.ts` (`loadThree()`), `lib/katex.ts` (`renderMath(el, tex)`) and `lib/scroll.ts` (`loadScrollama()`), and charts only through views, so none of them is in the first-load bundle. Views themselves are lazy chunks (`lib/lazy.ts`).
