# Mission Rehearsal: the simulator core (`web/src/sim/`)

*Owner: Victor. To be merged into `docs/METHOD.md`.*

The browser recomputes light, routes and rehearsal dates on the same 30 m grids the pipeline uses. The TypeScript
code ports the Python methods, and tests check it against Python's results on the committed grids
(`web/tests/sim_*.test.mjs`, fixtures from `python -I web/tools/exports/sim.py --fixtures`).

## Data

`data/processed/sim/` holds, for each of the 9 targets, its reference window (the one used for its thumbnails) and the
best window of each of its 5 best Earth regions: 54 windows of 200 × 200 cells (6 km at 30 m), cut from the pipeline's
grids. Heights are stored as int16 with a per-window offset and scale (1–3 cm steps, worst error 1.5 cm), 4.3 MB in
total. Each window also carries its centre and `up_az`, the geographic azimuth of the grid's up edge there. Near the
lunar pole this is not north: the projection is centred on the site, and a window 10–40 km away is turned by several
degrees (up to about 6° for the targets here). Every Sun azimuth is converted to the window's frame before casting
shadows: `az_grid = az − up_az`.

## Shadows

`castShadow` is the method of `pen/shadows.py`: rotate the grid so the Sun comes from the left, keep a running maximum
of `z + x·tan(e)` along each row (a cell is in shadow when an earlier cell is higher than that line), and rotate the mask
back. The port copies scipy's `ndimage.rotate`: the same output size, offsets, bilinear weights and edge rules.
**Parity: 100 % of cells identical** to Python on 3 windows × 6 Suns. One mask takes about 5 ms in the browser. As in
Python, only terrain inside the 6 km window casts shadows.

Slope (`slopeDeg`) is the Sobel slope of `pen/features.slope_deg`, within 0.001° of Python.

## Sun

- **Earth:** the NOAA solar position algorithm of `scripts/extras/common.py` (about 0.01°; no refraction, which adds
  about 0.5° at the horizon and shifts low-Sun times by a few minutes). Within 0.1° of Python at 5 places and 6 dates.
- **Moon and Mars:** the same spherical formula, from the local hour angle `H` and the subsolar latitude `δ`:
  `sin e = sin φ sin δ + cos φ cos δ cos H`. On the Moon `|δ| ≤ 1.54°`, so at 85–89.5°S the Sun circles the horizon
  once per lunar day at −6.5° to +6.5° (85°S) or −2° to +2° (89.5°S), with its elevation set by its direction.
  For Mars `|δ| ≤ 25.19°`.

## Rover route and telemetry

As in `scripts/extras/rover_twin.py`:

```
cost per cell = 1 + (slope / 10°)² + 3 × shadow fraction (Sun at 2°, 8 directions)
slope > 20° is impassable (cost 10⁶: if no route avoids it, the route says it had to cross it)
step cost     = (cost_a + cost_b) / 2 × step length, 8 neighbours (Dijkstra)
```

**Parity:** the same cells as Python on all 3 test windows, so length, climb, slopes and shadow match exactly (±2 %
allowed by the tests). Telemetry adds three Sun-specific numbers:

- `litShareNow`: the share of the route in sunlight for the chosen Sun;
- `solarEnergyRel`: equal to `litShareNow` while the Sun is above the horizon. Polar rovers use vertical panels that
  track the low Sun, so energy is roughly proportional to time in light;
- `driveHours`: time at 0.2 m/s (a VIPER-class rover), slowed linearly to half that speed at 20°.

These are planning numbers for comparing two drives, not a power model.

## "Rehearse this traverse on Earth, on this date"

Inputs:

- a route on the target window;
- the target's Sun;
- one Earth analog window.

Steps:

1. **The same drive on Earth.** The least-cost route between the same relative start and end points of the Earth
   window.
2. **Search the dates.** Over the next 365 days, every 10 minutes, the Earth Sun (NOAA) at the window qualifies when:
   - its elevation is 0–7°;
   - it comes from the same direction of the terrain as the target Sun, within 10° (both in their grid frames).
3. **Group and pick.** Consecutive qualifying steps form one window of time. Its best moment is the step closest to the
   target Sun, by direction and then elevation.
4. **Rehearsal fidelity.** At the best moment, sample both drives at 101 evenly spaced fractions of their length, and
   mark each sample sunlit or in shadow from the window's cast shadows:

   ```
   fidelity = 100 × (samples whose light condition is the same on Earth and on the target) / 101
   ```

   100 % means that every point of the Earth drive is lit or dark exactly where the target drive is.

If no moment qualifies, the result says so and gives the closest Earth low Sun in direction. At 19.8°N, Mauna Kea's
low Sun only comes from roughly east-northeast to east-southeast and west-northwest to west-southwest, so a lunar Sun
from due north or south cannot be rehearsed there at all. `earthLowSunDirections` gives the minutes per year for each
direction, so the interface can show which lunar Suns a site can rehearse.

Each window can be downloaded as an `.ics` calendar event (UTC times, with the site's coordinates).

**Limits:**

- shadows come only from terrain inside the 6 km windows;
- no refraction;
- the target Sun is chosen by the user (hour angle and subsolar latitude), not tied to a lunar date;
- a target Sun below the horizon makes the whole target drive dark, so fidelity then measures how dark the Earth
  drive is.
