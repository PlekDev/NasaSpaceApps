# P.E.N. web — design system

Status: M0. Implemented as CSS variables in `src/tokens.css`; components in `src/style.css`.
UI AI-assisted (Claude Code); reviewed by the author.

## Point of view
The map is the product. Everything else is a thin instrument layer on top of it: calm, precise, quiet. Panels are
small, aligned to one 8 px grid, and sit at the edges so the globe stays in the middle. Numbers are the content,
so they get the type; chrome gets almost none.

## Themes
| | Dark (default) | Light |
|---|---|---|
| page / space | `#0b0f17` (figures are plotted on it) | `#e8ebf0` |
| panel | `rgba(15,21,32,.74)` + blur 18 px | `rgba(250,251,252,.84)` + blur 18 px |
| text 1 / 2 / 3 | `#eceff4` / `#a9b1bf` / `#8a93a2` | `#12161d` / `#46505e` / `#566070` |
| hairline | `rgba(255,255,255,.09)` | `rgba(15,23,42,.10)` |
| accent | `#3987e5` | `#1a62c4` |

Follows `prefers-color-scheme`; the toggle stores `pen-theme` in localStorage inside try/catch. Panels are translucent only
because they really sit over the map. In light mode each committed PNG figure sits in its own dark frame.
Contrast (WCAG, checked with axe-core on every view): text 3 is >= 4.6:1 on every surface in both themes; accent text `#6da7ec` (dark) and `#1a62c4` (light) >= 4.5:1; the primary button uses `--accent-btn` (`#2b72d0` dark, 4.75:1 with white; `#1a62c4` light, 5.9:1) because the raw accent `#3987e5` only reaches 3.6:1 with white text.

## Colour
One accent for interactive chrome only (focus rings, slider fill, active nav, links). Warning `#d9a548` / `#8a5a00`
and ok `#5db38b` / `#1f7a4f` are muted and used for the EONET box and nothing else.

**Score ramp (data encoding, not decoration):** `#1c3d6e → #2a78d6 → #6da7ec → #ffd166`, linear from the minimum score to 100.
CIE L* of the stops: 26, 50, 67, 86. Lightness rises monotonically, so rank is readable without hue; under
protanopia and deuteranopia simulation (Machado 2009, severity 1) it stays monotonic (28, 54, 70, 83 and 25, 48, 66, 88).
Over imagery the darkest stop only reaches 1.5:1 against deep ocean, so every point carries a 1 px light halo
(`rgba(255,255,255,.85)`), which restores >= 3:1 against both ocean and land. Same ramp in both themes.

## Type
- **Inter Variable** (UI, every number, `font-variant-numeric: tabular-nums`) and **Instrument Serif** (wordmark, intro line, big scores).
  Self-hosted woff2 (latin subset) in `public/fonts`, OFL licences alongside, `font-display: swap`.
- Scale (px, weight, tracking): caption 12/500/+.01em · small 13/400 · body 14/400 · ui 14/500 · lead 16/450 ·
  title 20/600/-.012em · display serif 40/400/-.02em · score serif 72/400/-.03em.
- Minimum 12 px for secondary text, 14 px for anything that must be read on a projector.
- Hierarchy comes from size and weight, never from colour alone.

## Space, shape, depth
- 4/8 grid: 4, 8, 12, 16, 24, 32, 48.
- Radii: 6 (chips, thumbnails, inputs), 10 (rows, buttons), 16 (panels, sheets), pill (tags, segmented toggles). Not one radius everywhere.
- Hairline 1 px borders. One shadow per elevation: panels `0 1px 0 rgba(255,255,255,.04) inset, 0 8px 32px rgba(0,0,0,.28)` (dark) / softer in light.
- Motion: 160-240 ms `cubic-bezier(.2,.8,.2,1)` on hover/focus/sheet only; camera flights 600-1200 ms eased; everything off under `prefers-reduced-motion`.

## Icons
Inline SVG, 24 viewBox, 1.5 stroke, round caps, `currentColor`: crosshair, layers, moon, mars, low-sun, info, close, search,
chevron, theme (sun/moon). Drawn here, not copied from a set. No emoji.

## Layout (Explore)
Map edge to edge. Top bar 52 px (wordmark, Explore / Analog in time / Validation / Method, theme toggle).
Left column 320 px: one panel (target, weights, regions) and below it the best-match overlay with the legend.
Right column 344 px: top matches. Both columns are 16 px from the edges; the globe is centred on the free middle.
At <= 820 px: map on top, one bottom sheet (best match, target, top matches), no side columns.

## Do not
Glow, orbs, dot grids, three-equal-card rows, left colour stripes, skeleton shimmer, purple gradients, glass without a map behind it, emoji.

## Copy
Short and literal. "Best match", "Top matches", "Weights", "Minimum score", "Earth regions". Numbers always come from the data export.

## Navigation and routes (base phase)
Wordmark → Home (`#/`). Primary items, left to right: **Explore, Proof, Mission, When, Limits, Method**. **Tour** is a quiet outlined pill on the right, next to the theme toggle. **Dossier is not in the nav**: it is reached from a window's analog card (`#/dossier?target=..&window=..&route=..`). Six items plus Tour fit at 1024 px on one line (labels are one word). Active item: `aria-current="page"` with the `--raise-2` pill. At <= 820 px the nav is a menu button (Esc closes it) and Tour becomes its last item.
Aliases `#/validation` → `#/proof` and `#/time` → `#/when` use `history.replaceState` and keep the query. Unknown routes render Home. Every view module exports `render(el, m, params)` (and optionally `cleanup()`); `params` is the parsed query of the hash.

## View files and CSS prefixes
Each view lives in `src/views/<view>.ts` and imports its own `src/views/<view>.css`. Class names carry the view prefix: `.proof-*`, `.mission-*`, `.limits-*`, `.method-*`, `.home-*`, `.dossier-*`, `.tour-*`. A view never styles another view's prefix and never edits `style.css` or `tokens.css` (tokens are changed only by the integrator). Use the tokens (`var(--text-2)`, `var(--line)`, `var(--r-2)` ...), the shared classes (`.page-in`, `.prose`, `.tbl`, `.btn`, `.link`, `.seg`, `.muted`, `.sr-only`) and the 4/8 spacing scale.

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
