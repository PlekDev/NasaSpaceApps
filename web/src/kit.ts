/** "Field kit": optional field tools (twin-light video, astronaut view, rover traverse, region brief). Returns "" when none exist, so no empty heading or toggle is rendered. */
import { esc } from './format.ts';
import { BASE } from './base.ts';

export interface Rover { earth_site: string; target: Record<string, number>; earth: Record<string, number> }
export interface KitInput {
  ex: { twin?: string; astro?: string; rover?: string; video?: string } | undefined;
  brief: { brief?: string; calendar?: string; csv?: string } | undefined;
  targetName: string; regionName: string; rover: Rover | undefined; regions: { id: string; name: string }[];
}

function roverTable(r: Rover, name: string, regions: KitInput['regions']) {
  const site = regions.find(x => x.id === r.earth_site)?.name ?? '';
  const row = (l: string, f: (o: Record<string, number>) => string) => `<tr><th scope="row">${l}</th><td class="tnum">${f(r.target)}</td><td class="tnum">${f(r.earth)}</td></tr>`;
  return `<table class="rt"><thead><tr><th></th><th>${esc(name)}</th><th>${esc(site)}</th></tr></thead><tbody>
    ${row('Length', o => `${o.length_km} km`)}${row('Climb', o => `${o.climb_m} m`)}${row('Max slope', o => `${o.max_slope_deg}°`)}${row('In shadow', o => `${Math.round(o.share_in_shadow * 100)}%`)}</tbody></table>`;
}

export function fieldKitHTML({ ex, brief, targetName: t, regionName, rover, regions }: KitInput): string {
  ex = ex ?? {};
  const has = [ex.twin, ex.astro, ex.rover, brief && (brief.brief || brief.calendar || brief.csv)].filter(Boolean);
  if (!has.length) return '';
  const names = [ex.twin && 'twin light', ex.astro && 'astronaut view', ex.rover && 'rover traverse', brief && 'brief and calendar'].filter(Boolean).join(' · ');
  return `<section class="d-sec kit-sec"><details class="kit"><summary><span class="k-t"><h3>Field kit</h3><span class="muted tiny">${names}</span></span></summary><div class="kit-in">
    ${ex.twin ? `<details class="xtra"><summary>Twin-light timelapse</summary><div class="xbody"><p class="d-cap">Sun 2° above the horizon, azimuth stepping 5°: shadows on ${esc(t)} and its best Earth window.</p>
      ${ex.video ? `<video controls preload="none" poster="${BASE}extras/${ex.twin}" src="${BASE}extras/${ex.video}" aria-label="Twin-light timelapse for ${esc(t)}"></video>` : `<img src="${BASE}extras/${ex.twin}" alt="Twin-light poster" loading="lazy">`}</div></details>` : ''}
    ${ex.astro ? `<details class="xtra"><summary>What the astronaut sees</summary><div class="xbody"><img src="${BASE}extras/${ex.astro}" alt="Eye-level view, ${esc(t)} and its best Earth window" loading="lazy"><p class="d-cap">Eye level (1.7 m), terrain up to 15 km away, each body's curvature.</p></div></details>` : ''}
    ${ex.rover ? `<details class="xtra"><summary>Twin rover traverse</summary><div class="xbody"><img src="${BASE}extras/${ex.rover}" alt="Least-cost route on ${esc(t)} and its Earth analog" loading="lazy">
      ${rover ? roverTable(rover, t, regions) : ''}</div></details>` : ''}
    ${brief ? `<div class="dl-row"><span class="muted">Field brief · ${esc(regionName)}</span><span>${([['brief', 'Brief'], ['calendar', 'Calendar .ics'], ['csv', 'Low-Sun CSV']] as const).filter(x => brief[x[0]]).map(x => `<a class="link" download href="${BASE}extras/briefs/${brief[x[0]]}">${x[1]}</a>`).join('')}</span></div>` : ''}
  </div></details></section>`;
}
