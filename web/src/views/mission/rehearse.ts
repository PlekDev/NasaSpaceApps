// AI-assisted (Claude Code); reviewed by the author.
/**
 * A2 · "Rehearse this traverse on Earth, on this date" (U7 — Star Feature)
 *
 * Searches 365 days of real Earth solar ephemeris (10-minute cadence) at the
 * selected Earth analog window to find the exact dates and UTC / local solar
 * times when the Sun reproduces the Moon/Mars low-angle illumination geometry
 * along the planned rover traverse, with .ics export and #/dossier deep-linking.
 */
import { h } from './dom.ts';
import {
  earthLowSunDirections,
  routeToLonLat,
  toICS,
  type RehearsalPlan,
  type RehearsalWindow,
  type SimWindow,
} from './sim.ts';

export interface RehearsePanelOptions {
  targetId: string;
  targetName: string;
  targetLabel: string;
  earthWin: SimWindow;
  earthRoute: ReadonlyArray<readonly [number, number]>;
  routeKm: number;
  plan: RehearsalPlan;
  selectedIdx: number;
  isEarthSyncedToWindow: boolean;
  onSelectWindow: (index: number, syncSun: boolean) => void;
}

function fmtUtcRange(startIso: string, endIso: string): string {
  const s = startIso.slice(11, 16);
  const e = endIso.slice(11, 16);
  return `${s}–${e} UTC`;
}

function downloadICSFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildDossierHref(
  targetId: string,
  earthWin: SimWindow,
  earthRoute: ReadonlyArray<readonly [number, number]>,
  win: RehearsalWindow | null,
): string {
  const windowKey = `${earthWin.site}_${earthWin.i}_${earthWin.j}`;
  const routeParam = routeToLonLat(earthRoute, earthWin);
  const qs = new URLSearchParams();
  qs.set('target', targetId);
  qs.set('window', windowKey);
  if (routeParam) qs.set('route', routeParam);
  if (win) {
    qs.set('when', win.startIso);
    qs.set('fidelity', win.fidelity.toFixed(1));
  }
  return `#/dossier?${qs.toString()}`;
}

export function renderRehearsePanel(
  container: HTMLElement,
  opts: RehearsePanelOptions,
): void {
  const { targetId, targetName, targetLabel, earthWin, earthRoute, routeKm, plan, selectedIdx } = opts;
  const activeWin = plan.windows[selectedIdx] ?? plan.best;

  if (!activeWin) {
    container.replaceChildren(
      h(
        'section',
        { class: 'panel mission-rehearse-card', 'aria-label': 'Rehearse this traverse on Earth' },
        h('div', { class: 'eyebrow' }, 'Earth field campaign scheduler · 365-day ephemeris scan'),
        h('h2', { class: 'h2' }, 'Rehearse this traverse on Earth, on this date'),
        h('p', { class: 'lede' }, 'No low-Sun windows found for this geometry.'),
      ),
    );
    return;
  }

  const dossierHref = buildDossierHref(targetId, earthWin, earthRoute, activeWin);
  const icsFilename = `pen-rehearsal-${targetId}-${earthWin.site}-${activeWin.date}.ics`;

  const handleDownloadICS = () => {
    const ics = toICS({
      targetLabel,
      earthRegion: earthWin.region,
      earthPlace: earthWin.place,
      lat: earthWin.lat,
      lon: earthWin.lon,
      window: activeWin,
      routeKm,
    });
    downloadICSFile(icsFilename, ics);
  };

  // Build 101-sample agreement visual bar
  const tProf = plan.targetLitProfile;
  const eProf = activeWin.earthLitProfile;
  const samples = Math.min(tProf.length, eProf.length);

  // Build 365-day low-Sun azimuth reachability strip (72 bins of 5 deg)
  const reachableAz = earthLowSunDirections(earthWin.lat, earthWin.lon, plan.elevBandDeg[0], plan.elevBandDeg[1], earthWin.up_az ?? 0);
  const reachSet = new Set(reachableAz.map((a) => Math.floor(a / 5)));
  const targetBin = Math.floor((((plan.targetGridAzDeg % 360) + 360) % 360) / 5);
  const earthBin = Math.floor((((activeWin.earthGridAzDeg % 360) + 360) % 360) / 5);

  const section = h(
    'section',
    {
      class: 'panel mission-rehearse-card',
      id: 'mission-rehearse',
      'aria-label': 'Rehearse this traverse on Earth, on this date',
    },
    h(
      'div',
      { class: 'mission-section-head' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'eyebrow' },
          'Field rehearsal ephemeris · 365-day × 10-min NOAA solar search (0–7° elevation)',
        ),
        h('h2', { class: 'h2' }, 'Rehearse this traverse on Earth, on this date'),
      ),
      h(
        'div',
        { class: 'mission-rehearse-badges' },
        h(
          'span',
          {
            class: `mission-pill ${activeWin.exactAzimuthMatch ? 'mission-pill-emerald' : 'mission-pill-amber'}`,
          },
          activeWin.exactAzimuthMatch
            ? `Azimuth within ±${plan.azToleranceDeg}° (Δaz ${activeWin.azErrorDeg.toFixed(1)}°)`
            : `Closest low-Sun azimuth at lat ${earthWin.lat.toFixed(1)}° (Δaz ${activeWin.azErrorDeg.toFixed(1)}°)`,
        ),
        h(
          'span',
          { class: 'mission-pill mission-pill-gold' },
          `Rehearsal fidelity: ${activeWin.fidelity.toFixed(1)} %`,
        ),
      ),
    ),

    // Star Feature Actionable Banner
    h(
      'div',
      { class: 'mission-rehearse-banner' },
      h(
        'div',
        { class: 'mission-rehearse-statement' },
        h(
          'p',
          { class: 'mission-rehearse-headline' },
          'Rehearse this ',
          h('strong', null, targetName),
          ' traverse on ',
          h('strong', null, earthWin.region),
          earthWin.place ? ` (${earthWin.place})` : '',
          ' on ',
          h('strong', { class: 'num' }, activeWin.date),
          ', ',
          h('strong', { class: 'num' }, fmtUtcRange(activeWin.startIso, activeWin.endIso)),
          ` (local solar ${activeWin.localStart}–${activeWin.localEnd}, ${activeWin.durationMin} min) · fidelity `,
          h('strong', { class: 'num mission-fidelity-highlight' }, `${activeWin.fidelity.toFixed(1)} %`),
          '.',
        ),
        h(
          'p',
          { class: 'mission-rehearse-sub' },
          `Target Sun: elev ${plan.targetElevDeg.toFixed(1)}°, grid az ${plan.targetGridAzDeg.toFixed(0)}° (${(plan.targetLitShare * 100).toFixed(0)}% route lit)  ·  Earth Sun on ${activeWin.date}: elev ${activeWin.earthElevDeg.toFixed(1)}°, compass az ${activeWin.earthAzDeg.toFixed(0)}°, grid az ${activeWin.earthGridAzDeg.toFixed(0)}° (${(activeWin.earthLitShare * 100).toFixed(0)}% route lit).`,
        ),
      ),
      h(
        'div',
        { class: 'mission-rehearse-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn primary mission-ics-btn',
            onclick: handleDownloadICS,
          },
          'Download .ics',
        ),
        h(
          'a',
          {
            class: 'btn mission-dossier-btn',
            href: dossierHref,
          },
          'Open dossier →',
        ),
        h(
          'button',
          {
            type: 'button',
            class: `btn ${opts.isEarthSyncedToWindow ? 'mission-btn-active' : ''}`,
            onclick: () => opts.onSelectWindow(selectedIdx, true),
          },
          opts.isEarthSyncedToWindow ? '3D Earth synced to date' : 'Preview date in 3D',
        ),
      ),
    ),

    // 101-sample Lit/Shadow Agreement Strip + 365-Day Azimuth Reachability Strip
    h(
      'div',
      { class: 'mission-rehearse-strips' },
      h(
        'div',
        { class: 'mission-strip-card' },
        h(
          'div',
          { class: 'mission-strip-header' },
          h('span', { class: 'mission-strip-title' }, '101-Sample Traverse Illumination Agreement (A → B)'),
          h(
            'span',
            { class: 'mission-strip-meta num' },
            `${Math.round((activeWin.fidelity / 100) * samples)} / ${samples} waypoints match lit/shadow state`,
          ),
        ),
        h(
          'div',
          { class: 'mission-fidelity-rows', 'aria-label': 'Traverse lit and shadow state comparison' },
          h(
            'div',
            { class: 'mission-fidelity-row' },
            h('span', { class: 'mission-fidelity-lbl' }, 'Target'),
            h(
              'div',
              { class: 'mission-fidelity-cells' },
              ...Array.from({ length: samples }, (_, i) =>
                h('i', {
                  class: tProf[i] ? 'fcell fcell-lit' : 'fcell fcell-shadow',
                  title: `Sample ${i}%: Target ${tProf[i] ? 'Lit' : 'Shadowed'}`,
                }),
              ),
            ),
          ),
          h(
            'div',
            { class: 'mission-fidelity-row' },
            h('span', { class: 'mission-fidelity-lbl' }, 'Earth'),
            h(
              'div',
              { class: 'mission-fidelity-cells' },
              ...Array.from({ length: samples }, (_, i) =>
                h('i', {
                  class: eProf[i] ? 'fcell fcell-lit' : 'fcell fcell-shadow',
                  title: `Sample ${i}%: Earth ${eProf[i] ? 'Lit' : 'Shadowed'}`,
                }),
              ),
            ),
          ),
          h(
            'div',
            { class: 'mission-fidelity-row' },
            h('span', { class: 'mission-fidelity-lbl' }, 'Match'),
            h(
              'div',
              { class: 'mission-fidelity-cells' },
              ...Array.from({ length: samples }, (_, i) =>
                h('i', {
                  class: tProf[i] === eProf[i] ? 'fcell fcell-agree' : 'fcell fcell-mismatch',
                  title: `Sample ${i}%: ${tProf[i] === eProf[i] ? 'Identical illumination state' : 'Illumination mismatch'}`,
                }),
              ),
            ),
          ),
        ),
      ),

      h(
        'div',
        { class: 'mission-strip-card' },
        h(
          'div',
          { class: 'mission-strip-header' },
          h(
            'span',
            { class: 'mission-strip-title' },
            `Annual Low-Sun Azimuth Envelope at ${earthWin.lat.toFixed(2)}° Lat`,
          ),
          h(
            'span',
            { class: 'mission-strip-meta num' },
            `${reachableAz.length * 5}° of horizon reachable at 0–7° Sun`,
          ),
        ),
        h(
          'div',
          { class: 'mission-azimuth-bar', 'aria-label': '365-day low-Sun grid azimuth reachability (0 to 360 degrees)' },
          ...Array.from({ length: 72 }, (_, b) => {
            const isTarget = b === targetBin;
            const isEarth = b === earthBin;
            const ok = reachSet.has(b);
            const cls = [
              'az-bin',
              ok ? 'az-bin-reachable' : 'az-bin-blocked',
              isTarget ? 'az-bin-target' : '',
              isEarth ? 'az-bin-earth' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return h('i', {
              class: cls,
              title: `Grid azimuth ${b * 5}°–${(b + 1) * 5}°: ${ok ? 'Reachable at 0–7° Sun' : 'Not reached at low Sun'}${isTarget ? ' · Target Sun' : ''}${isEarth ? ' · Earth Rehearsal Sun' : ''}`,
            });
          }),
        ),
        h(
          'div',
          { class: 'mission-azimuth-ticks num' },
          h('span', null, '0° (N)'),
          h('span', null, '90° (E)'),
          h('span', null, '180° (S)'),
          h('span', null, '270° (W)'),
          h('span', null, '360°'),
        ),
      ),
    ),

    // Top Candidate Rehearsal Windows Table
    h(
      'div',
      { class: 'mission-table-wrap' },
      h(
        'table',
        { class: 'mission-rehearse-table', 'aria-label': 'Candidate Earth rehearsal windows across next 12 months' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, 'Rank'),
            h('th', { scope: 'col' }, 'Date (UTC)'),
            h('th', { scope: 'col', class: 'num' }, 'UTC window'),
            h('th', { scope: 'col', class: 'num' }, 'Local solar'),
            h('th', { scope: 'col', class: 'num' }, 'Duration'),
            h('th', { scope: 'col', class: 'num' }, 'Earth Sun (el / grid az)'),
            h('th', { scope: 'col', class: 'num' }, 'Azimuth Δ'),
            h('th', { scope: 'col', class: 'num' }, 'Route lit (T / E)'),
            h('th', { scope: 'col', class: 'num' }, 'Fidelity'),
          ),
        ),
        h(
          'tbody',
          null,
          ...plan.windows.map((w, idx) => {
            const isSel = idx === selectedIdx;
            return h(
              'tr',
              {
                class: isSel ? 'mission-row-selected' : 'mission-row-clickable',
                tabIndex: 0,
                role: 'button',
                'aria-pressed': isSel ? 'true' : 'false',
                onclick: () => opts.onSelectWindow(idx, true),
                onkeydown: (ev: KeyboardEvent) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    opts.onSelectWindow(idx, true);
                  }
                },
              },
              h('td', { class: 'num' }, `#${idx + 1}`),
              h('td', { class: 'num mission-date-cell' }, w.date),
              h('td', { class: 'num' }, fmtUtcRange(w.startIso, w.endIso)),
              h('td', { class: 'num' }, `${w.localStart}–${w.localEnd}`),
              h('td', { class: 'num' }, `${w.durationMin} min`),
              h('td', { class: 'num' }, `${w.earthElevDeg.toFixed(1)}° / ${w.earthGridAzDeg.toFixed(0)}°`),
              h('td', { class: 'num' }, `${w.azErrorDeg.toFixed(1)}°`),
              h(
                'td',
                { class: 'num' },
                `${(w.targetLitShare * 100).toFixed(0)}% / ${(w.earthLitShare * 100).toFixed(0)}%`,
              ),
              h(
                'td',
                { class: 'num mission-fidelity-cell' },
                h('span', { class: 'mission-fidelity-pill' }, `${w.fidelity.toFixed(1)} %`),
              ),
            );
          }),
        ),
      ),
    ),
  );

  container.replaceChildren(section);
}
