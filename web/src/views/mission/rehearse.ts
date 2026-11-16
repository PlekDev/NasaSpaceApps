// AI-assisted (Claude Code); reviewed by the author.
/**
 * Step 3 · "When does Earth match": the verdict and the rehearsal windows.
 *
 * The 365-day scan (sim.ts `rehearse`) finds the dates and UTC / local solar times when the Earth Sun
 * reproduces the target's low-Sun direction. The verdict has three states:
 *  - good:    a date exists within the azimuth tolerance → headline, fidelity, 101-point strip, .ics, dossier
 *  - nomatch: the target Sun direction never occurs at this Earth site → say so, show the gap, offer a fix
 *  - loading: the scan is running
 * The windows list groups the scan's dates into runs of consecutive days.
 */
import { h } from './dom.ts';
import { buildAzimuthStrip } from './controls.ts';
import { routeToLonLat, toICS, type RehearsalPlan, type RehearsalWindow, type SimWindow } from './sim.ts';

export type VerdictState = 'good' | 'nomatch' | 'loading';

export interface VerdictOptions {
  state: VerdictState;
  targetId: string;
  /** "Moon" or "Mars" */
  targetBody: string;
  targetName: string;
  targetLabel: string;
  earthWin: SimWindow;
  earthRoute: ReadonlyArray<readonly [number, number]>;
  routeKm: number;
  /** null while loading */
  plan: RehearsalPlan | null;
  /** target lit profile (101 samples) when the plan is not ready yet */
  targetProfile: Uint8Array | null;
  /** target Sun grid azimuth (deg) */
  targetAzDeg: number;
  selectedIdx: number;
  roverProgress: number;
  reachAz: number[];
  onSelectWindow: (index: number) => void;
  /** set the target Sun to the nearest direction the Earth site reaches */
  onSnapSun: (gridAzDeg: number) => void;
  /** move focus to the Earth analog picker */
  onPickAnotherSite: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NBSP = ' ';

function dParts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m: m - 1, d };
}
export function fmtDate(date: string, withYear = true): string {
  const { y, m, d } = dParts(date);
  return withYear ? `${d} ${MONTHS[m]} ${y}` : `${d} ${MONTHS[m]}`;
}
function fmtUtcRange(startIso: string, endIso: string): string {
  return `${startIso.slice(11, 16)}–${endIso.slice(11, 16)} UTC`;
}
function dayNum(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}
function fmtRange(a: string, b: string): string {
  if (a === b) return fmtDate(a);
  const pa = dParts(a);
  const pb = dParts(b);
  if (pa.y === pb.y && pa.m === pb.m) return `${pa.d}–${pb.d} ${MONTHS[pb.m]} ${pb.y}`;
  if (pa.y === pb.y) return `${pa.d} ${MONTHS[pa.m]} – ${pb.d} ${MONTHS[pb.m]} ${pb.y}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
function fmtRangeShort(a: string, b: string): string {
  if (a === b) return fmtDate(a, false);
  const pa = dParts(a);
  const pb = dParts(b);
  if (pa.m === pb.m) return `${pa.d}–${pb.d} ${MONTHS[pb.m]}`;
  return `${pa.d} ${MONTHS[pa.m]} – ${pb.d} ${MONTHS[pb.m]}`;
}
const pct1 = (v: number) => `${v.toFixed(1)}${NBSP}%`;

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

/** a run of consecutive days in the scan, best day first */
export interface WindowRun {
  first: string;
  last: string;
  days: number;
  bestIdx: number;
  best: RehearsalWindow;
  minFidelity: number;
  members: number[];
}

/** group the plan's windows (one per date and time) into runs of consecutive days, best run first */
export function groupRuns(windows: RehearsalWindow[]): WindowRun[] {
  // keep the best window of each date
  const byDate = new Map<string, number>();
  windows.forEach((w, i) => {
    const prev = byDate.get(w.date);
    if (prev === undefined || windows[prev].fidelity < w.fidelity) byDate.set(w.date, i);
  });
  const dates = [...byDate.keys()].sort();
  const runs: WindowRun[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (!cur.length) return;
    const members = cur.map((d) => byDate.get(d)!);
    let bestIdx = members[0];
    let minF = Infinity;
    for (const i of members) {
      if (windows[i].fidelity > windows[bestIdx].fidelity) bestIdx = i;
      minF = Math.min(minF, windows[i].fidelity);
    }
    runs.push({
      first: cur[0],
      last: cur[cur.length - 1],
      days: cur.length,
      bestIdx,
      best: windows[bestIdx],
      minFidelity: minF,
      members,
    });
    cur = [];
  };
  for (const d of dates) {
    if (cur.length && dayNum(d) - dayNum(cur[cur.length - 1]) > 1) flush();
    cur.push(d);
  }
  flush();
  runs.sort((a, b) => b.best.fidelity - a.best.fidelity || a.first.localeCompare(b.first));
  return runs;
}

/* ── 101-point comparison strip ───────────────────────────────────────── */

function stripRow(cls: string, cells: Array<string>): HTMLElement {
  const row = h('div', { class: `mission-strip-cells ${cls}`, 'aria-hidden': 'true' });
  for (const c of cells) row.appendChild(h('i', { class: c }));
  return row;
}

function buildStrip(
  body: string,
  tProf: Uint8Array | null,
  eProf: Uint8Array | null,
  roverProgress: number,
): HTMLElement {
  const n = tProf?.length ?? 101;
  const share = (p: Uint8Array | null) => {
    if (!p || !p.length) return null;
    let s = 0;
    for (let i = 0; i < p.length; i++) s += p[i];
    return Math.round((s / p.length) * 100);
  };
  let same = 0;
  if (tProf && eProf) for (let i = 0; i < n; i++) if (tProf[i] === eProf[i]) same++;
  const tShare = share(tProf);
  const eShare = share(eProf);

  const litCls = (p: Uint8Array | null, i: number) => (p ? (p[i] ? 'is-lit' : 'is-shadow') : 'is-empty');
  const marker = h('i', { class: 'mission-strip-rover' });
  marker.style.left = `${(Math.max(0, Math.min(1, roverProgress)) * 100).toFixed(2)}%`;

  const summary =
    tProf && eProf
      ? `${body} route ${tShare} % lit, Earth route ${eShare} % lit, ${same} of ${n} points lit or shadowed alike.`
      : `${body} route ${tShare ?? '–'} % lit. Earth route pending.`;

  return h(
    'figure',
    { class: 'mission-strip' },
    h(
      'figcaption',
      { class: 'mission-strip-head' },
      h('span', { class: 'mission-cap' }, `Route A → B · ${n} points`),
      h('span', { class: 'mission-cap mission-strip-rover-val' }, `Rover ${Math.round(roverProgress * 100)} %`),
    ),
    h('p', { class: 'sr-only' }, summary),
    h(
      'div',
      { class: 'mission-strip-grid' },
      h('span', { class: 'mission-strip-lbl' }, body),
      stripRow('', Array.from({ length: n }, (_, i) => litCls(tProf, i))),
      h('span', { class: 'mission-strip-val' }, tShare === null ? '–' : `${tShare}${NBSP}% lit`),
      h('span', { class: 'mission-strip-lbl' }, 'Earth'),
      stripRow('', Array.from({ length: n }, (_, i) => litCls(eProf, i))),
      h('span', { class: 'mission-strip-val' }, eShare === null ? '–' : `${eShare}${NBSP}% lit`),
      h('span', { class: 'mission-strip-lbl' }, 'Same'),
      stripRow(
        'mission-strip-cells--same',
        Array.from({ length: n }, (_, i) => (tProf && eProf && tProf[i] === eProf[i] ? 'is-same' : 'is-empty')),
      ),
      h('span', { class: 'mission-strip-val mission-strip-val--same' }, tProf && eProf ? `${same} / ${n}` : '–'),
      h('div', { class: 'mission-strip-track', 'aria-hidden': 'true' }, marker),
    ),
    h(
      'div',
      { class: 'mission-strip-ab', 'aria-hidden': 'true' },
      h('span', null, 'A'),
      h('span', null, 'B'),
    ),
    h(
      'ul',
      { class: 'mission-legend mission-legend--sm', 'aria-hidden': 'true' },
      h('li', null, h('i', { class: 'mission-key mission-key--lit' }), 'Lit'),
      h('li', null, h('i', { class: 'mission-key mission-key--shadow' }), 'Shadow'),
      h('li', null, h('i', { class: 'mission-key mission-key--same' }), 'Same on both'),
    ),
  );
}

/** move the rover mark on the strip without rebuilding the verdict */
export function updateVerdictRover(container: HTMLElement, progress: number): void {
  const p = Math.max(0, Math.min(1, progress));
  const mk = container.querySelector<HTMLElement>('.mission-strip-rover');
  if (mk) mk.style.left = `${(p * 100).toFixed(2)}%`;
  const val = container.querySelector<HTMLElement>('.mission-strip-rover-val');
  if (val) val.textContent = `Rover ${Math.round(p * 100)} %`;
}

/* ── verdict ──────────────────────────────────────────────────────────── */

function stepHead(state: VerdictState, fidelity: number | null): HTMLElement {
  let badge: HTMLElement;
  if (state === 'loading') {
    badge = h('span', { class: 'mission-badge', 'data-state': 'loading' }, h('i'), 'Scanning');
  } else if (state === 'nomatch') {
    badge = h('span', { class: 'mission-badge', 'data-state': 'nomatch' }, h('i'), 'No direction match');
  } else if (fidelity !== null && fidelity < 60) {
    badge = h('span', { class: 'mission-badge', 'data-state': 'partial' }, h('i'), 'Partial match');
  } else {
    badge = h('span', { class: 'mission-badge', 'data-state': 'good' }, h('i'), 'Good match');
  }
  return h(
    'div',
    { class: 'mission-step-head' },
    h('span', { class: 'mission-step-num', 'aria-hidden': 'true' }, '3'),
    h('h2', { class: 'mission-step-title' }, 'When does Earth match'),
    badge,
  );
}

export function renderVerdict(container: HTMLElement, o: VerdictOptions): void {
  const { plan, earthWin } = o;
  const site = earthWin.region;
  const pair = h('p', { class: 'mission-verdict-pair' }, `${o.targetName} ↔ ${site}`);
  const active = plan ? (plan.windows[o.selectedIdx] ?? plan.best) : null;
  const state: VerdictState = o.state === 'loading' || !plan ? 'loading' : !active || !plan.exactAzimuthMatch ? 'nomatch' : 'good';

  const root = h('section', {
    class: 'panel mission-verdict',
    'data-state': state,
    'aria-labelledby': 'mission-verdict-title',
    'aria-busy': state === 'loading' ? 'true' : 'false',
  });
  const head = stepHead(state, active?.fidelity ?? null);
  head.querySelector('h2')!.id = 'mission-verdict-title';
  root.appendChild(head);

  const live = h('div', { class: 'mission-verdict-live', 'aria-live': 'polite' });
  root.appendChild(live);

  if (state === 'loading') {
    live.append(
      h(
        'div',
        { class: 'mission-verdict-copy' },
        pair,
        h('p', { class: 'mission-verdict-headline is-pending' }, `Scanning 365 days at ${site} for this Sun direction`),
        h('p', { class: 'mission-verdict-sub' }, 'Sun position every 10 minutes, next 12 months'),
      ),
      h(
        'div',
        { class: 'mission-fidelity is-pending', 'aria-hidden': 'true' },
        h('span', { class: 'mission-fidelity-num' }, '––.–', h('small', null, '%')),
        h('span', { class: 'mission-fidelity-bar' }, h('i')),
      ),
    );
    root.appendChild(buildStrip(o.targetBody, o.targetProfile, null, o.roverProgress));
    root.appendChild(
      h(
        'div',
        { class: 'mission-verdict-actions' },
        h('button', { type: 'button', class: 'btn mission-ics-btn', disabled: true }, 'Download .ics'),
        h('span', { class: 'btn mission-dossier-btn', 'aria-disabled': 'true' }, 'Open dossier →'),
      ),
    );
    container.replaceChildren(root);
    return;
  }

  const win = active!;
  const tProf = plan!.targetLitProfile;
  const eProf = win.earthLitProfile;
  const n = Math.min(tProf.length, eProf.length);
  let same = 0;
  for (let i = 0; i < n; i++) if (tProf[i] === eProf[i]) same++;

  const dossierHref = buildDossierHref(o.targetId, earthWin, o.earthRoute, win);
  const handleICS = () => {
    downloadICSFile(
      `pen-rehearsal-${o.targetId}-${earthWin.site}-${win.date}.ics`,
      toICS({
        targetLabel: o.targetLabel,
        earthRegion: earthWin.region,
        earthPlace: earthWin.place,
        lat: earthWin.lat,
        lon: earthWin.lon,
        window: win,
        routeKm: o.routeKm,
      }),
    );
  };

  if (state === 'good') {
    live.append(
      h(
        'div',
        { class: 'mission-rehearse-headline' },
        h(
          'div',
          { class: 'mission-verdict-copy' },
          pair,
          h(
            'p',
            { class: 'mission-verdict-headline' },
            'Rehearse this traverse on Earth on ',
            h('strong', null, `${fmtDate(win.date)},`),
            ' ',
            h('strong', null, fmtUtcRange(win.startIso, win.endIso)),
          ),
          h('p', { class: 'mission-verdict-sub' }, `Local solar time ${win.localStart}–${win.localEnd}`),
        ),
        h(
          'div',
          { class: 'mission-fidelity' },
          h('span', { class: 'sr-only' }, `Rehearsal fidelity ${pct1(win.fidelity)}.`),
          h('span', { class: 'mission-fidelity-num', 'aria-hidden': 'true' }, win.fidelity.toFixed(1), h('small', null, '%')),
          h(
            'span',
            { class: 'mission-fidelity-meta' },
            h('span', { class: 'mission-cap', 'aria-hidden': 'true' }, 'Rehearsal fidelity'),
            h('span', null, `${same} / ${n} points lit or shadowed alike`),
          ),
        ),
      ),
    );
    root.appendChild(buildStrip(o.targetBody, tProf, eProf, o.roverProgress));
    root.appendChild(
      h(
        'div',
        { class: 'mission-verdict-actions' },
        h('button', { type: 'button', class: 'btn primary mission-ics-btn', onclick: handleICS }, 'Download .ics'),
        h('a', { class: 'btn mission-dossier-btn', href: dossierHref }, 'Open dossier →'),
      ),
    );

    // "also on": other runs whose best day is within 2 points of the selected window
    const runs = groupRuns(plan!.windows);
    const others = runs
      .flatMap((r) => {
        const near = r.members.filter((i) => plan!.windows[i].fidelity >= win.fidelity - 2);
        return near.length ? [{ r, near }] : [];
      })
      .map(({ r, near }) => {
        // a run that contains the selected day lists its other days one by one
        if (r.members.includes(plan!.windows.indexOf(win))) {
          return near
            .filter((i) => plan!.windows[i].date !== win.date)
            .map((i) => ({ label: fmtDate(plan!.windows[i].date, false), idx: i, date: plan!.windows[i].date }));
        }
        return [{ label: fmtRangeShort(r.first, r.last), idx: r.bestIdx, date: r.first }];
      })
      .flat()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
    if (others.length) {
      root.appendChild(
        h(
          'div',
          { class: 'mission-also' },
          h(
            'div',
            { class: 'mission-also-head' },
            h('span', { class: 'mission-cap' }, 'Also on'),
            h('a', { class: 'mission-link', href: '#mission-windows', onclick: (ev: MouseEvent) => {
              ev.preventDefault();
              document.getElementById('mission-windows')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            } }, 'All windows ↓'),
          ),
          h(
            'div',
            { class: 'mission-also-dates' },
            ...others.map((x) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'mission-chip',
                  'aria-label': `Preview ${x.label} in 3D (fidelity ${plan!.windows[x.idx].fidelity.toFixed(1)} %)`,
                  onclick: () => o.onSelectWindow(x.idx),
                },
                x.label,
              ),
            ),
          ),
          h('p', { class: 'mission-also-note' }, 'Days within 2 points of this fidelity. Select one to preview it in 3D.'),
        ),
      );
    }
  } else {
    // no direction match: say so, show the gap, offer the nearest reachable Sun direction
    const tAz = ((o.targetAzDeg % 360) + 360) % 360;
    let nearest = win.earthGridAzDeg;
    let gap = win.azErrorDeg;
    if (o.reachAz.length) {
      gap = 999;
      for (const c of o.reachAz) {
        for (const edge of [c - 2.5, c + 2.5]) {
          const d = Math.abs((((edge - tAz) % 360) + 540) % 360 - 180);
          if (d < gap) {
            gap = d;
            nearest = ((edge % 360) + 360) % 360;
          }
        }
      }
    }
    // land a little inside the reachable range, not on its edge
    const inside = o.reachAz.length
      ? o.reachAz.reduce((a, c) => (Math.abs((((c - nearest) % 360) + 540) % 360 - 180) < Math.abs((((a - nearest) % 360) + 540) % 360 - 180) ? c : a), o.reachAz[0])
      : nearest;
    live.append(
      h(
        'div',
        { class: 'mission-rehearse-headline' },
        h(
          'div',
          { class: 'mission-verdict-copy' },
          pair,
          h('p', { class: 'mission-verdict-headline' }, `No date at ${site} has this Sun direction`),
          h(
            'p',
            { class: 'mission-verdict-sub' },
            `The ${o.targetBody} Sun is at azimuth ${Math.round(tAz)}°. The closest ${site} reaches in 12 months is ${Math.round(nearest)}°, ${Math.round(gap)}° off.`,
          ),
        ),
        o.reachAz.length
          ? h(
              'div',
              { class: 'mission-verdict-gap' },
              buildAzimuthStrip(o.reachAz, tAz, null, {
                gap: true,
                label: `${o.targetBody} Sun at ${Math.round(tAz)}°, ${Math.round(gap)}° outside ${site}'s range`,
              }),
              h(
                'ul',
                { class: 'mission-legend mission-legend--sm', 'aria-hidden': 'true' },
                h('li', null, h('i', { class: 'mission-key mission-key--moonmark' }), `${o.targetBody} Sun ${Math.round(tAz)}°`),
                h('li', null, h('i', { class: 'mission-key mission-key--reach' }), `${site} reach`),
                h('li', { class: 'is-warn' }, h('i', { class: 'mission-key mission-key--gap' }), `${Math.round(gap)}° gap`),
              ),
            )
          : null,
        h(
          'div',
          { class: 'mission-fidelity mission-fidelity--weak' },
          h('span', { class: 'sr-only' }, `Best fidelity ${pct1(win.fidelity)}.`),
          h('span', { class: 'mission-fidelity-num', 'aria-hidden': 'true' }, win.fidelity.toFixed(1), h('small', null, '%')),
          h(
            'span',
            { class: 'mission-fidelity-meta' },
            h('span', { class: 'mission-cap', 'aria-hidden': 'true' }, 'Best fidelity'),
            h('span', null, `${same} / ${n} points, on ${fmtDate(win.date)}`),
          ),
        ),
      ),
    );
    root.appendChild(buildStrip(o.targetBody, tProf, eProf, o.roverProgress));
    root.appendChild(
      h(
        'div',
        { class: 'mission-verdict-actions' },
        h(
          'button',
          { type: 'button', class: 'btn primary mission-verdict-fix', onclick: () => o.onSnapSun(inside) },
          `Move Sun into range (${Math.round(inside)}°)`,
        ),
        h('button', { type: 'button', class: 'btn', onclick: () => o.onPickAnotherSite() }, 'Try another Earth site'),
      ),
    );
    root.appendChild(
      h(
        'div',
        { class: 'mission-verdict-links' },
        h('button', { type: 'button', class: 'mission-link mission-ics-btn', onclick: handleICS }, `.ics of best window (${pct1(win.fidelity)})`),
        h('a', { class: 'mission-link mission-dossier-btn', href: dossierHref }, 'Open dossier →'),
      ),
    );
  }

  container.replaceChildren(root);
}

/* ── rehearsal windows (runs of consecutive days) ─────────────────────── */

export interface WindowsOptions {
  site: string;
  plan: RehearsalPlan | null;
  selectedIdx: number;
  onSelectWindow: (index: number) => void;
}

export function renderWindows(container: HTMLElement, o: WindowsOptions): void {
  const head = h(
    'div',
    { class: 'mission-sec-head' },
    h('h2', { class: 'mission-sec-title' }, 'Rehearsal windows, next 12 months'),
    h('p', { class: 'mission-sec-lede' }, `Best low-Sun dates at ${o.site}, grouped into runs of consecutive days.`),
  );
  const sec = h('section', { id: 'mission-windows', class: 'mission-dates', 'aria-labelledby': 'mission-windows-title' }, head);
  head.querySelector('h2')!.id = 'mission-windows-title';

  if (!o.plan) {
    sec.appendChild(h('p', { class: 'mission-empty' }, 'Scanning…'));
    container.replaceChildren(sec);
    return;
  }
  const plan = o.plan;
  if (!plan.windows.length) {
    sec.appendChild(h('p', { class: 'mission-empty' }, 'No low-Sun window found in the next 12 months.'));
    container.replaceChildren(sec);
    return;
  }

  const runs = groupRuns(plan.windows).slice(0, 5);
  const selDate = plan.windows[o.selectedIdx]?.date;
  const list = h('ul', { class: 'mission-runs', role: 'list' });
  for (const r of runs) {
    const w = r.best;
    const selected = r.members.some((i) => plan.windows[i].date === selDate);
    list.appendChild(
      h(
        'li',
        null,
        h(
          'button',
          {
            type: 'button',
            class: 'mission-run',
            'aria-pressed': String(selected),
            onclick: () => o.onSelectWindow(r.bestIdx),
          },
          h(
            'span',
            { class: 'mission-run-main' },
            h(
              'span',
              { class: 'mission-run-title' },
              h('span', { class: 'mission-run-dates' }, fmtRange(r.first, r.last)),
              h('span', { class: 'mission-run-days' }, r.days === 1 ? '1 day' : `${r.days} days`),
              r.days > 1 ? h('span', { class: 'mission-cap mission-run-best' }, `Best ${fmtDate(w.date, false)}`) : null,
            ),
            h(
              'span',
              { class: 'mission-run-sub' },
              `${fmtUtcRange(w.startIso, w.endIso)} · local solar ${w.localStart}–${w.localEnd} · Earth Sun az ${Math.round(w.earthGridAzDeg)}° (Δ ${w.azErrorDeg.toFixed(1)}°)`,
            ),
          ),
          h(
            'span',
            { class: 'mission-run-fid' },
            h('span', { class: 'mission-run-num' }, pct1(w.fidelity)),
            r.days > 1 && r.minFidelity !== w.fidelity
              ? h('span', { class: 'mission-run-range' }, `${r.minFidelity.toFixed(1)}–${w.fidelity.toFixed(1)}`)
              : null,
          ),
        ),
      ),
    );
  }
  sec.appendChild(list);
  if (!plan.exactAzimuthMatch) {
    sec.appendChild(
      h('p', { class: 'mission-dates-note' }, `None of these dates has the target Sun direction; they are the closest ${o.site} reaches.`),
    );
  }
  container.replaceChildren(sec);
}
