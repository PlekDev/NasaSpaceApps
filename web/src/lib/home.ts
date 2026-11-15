// AI-assisted (Claude Code); reviewed by the author.
/** Facts for Home (the judge's path), all derived from exported data. Pure (type-only imports): node --test loads it directly.
 *  Nothing here is typed by hand: rank/N from known_ranks.json, rho from far_horizons.json, p from stats/null.json.
 *  Stubbed stats (`_stub: true`) never become a number: p is null and the UI shows a calm "pending" state. */
import type { Manifest } from '../types';
import { pyFixed as fx } from '../format.ts';   // exact Python rounding (fixed in #30)

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const SITE = /hiwahine/i, PINACATE = /pinacate/i;
const nf = (n: number) => n.toLocaleString('en-US');
export interface HomeFacts {
  target: { id: string; name: string };
  rank: number; n: number; rankText: string;                       // "#1", "10,424"
  rho: number | null; rhoText: string | null;                      // Malapert (headline target), horizons up to 150 km
  rhoRange: string | null;                                         // "0.92–0.99" over the lunar targets (top-bar seal)
  horizonKm: number | null;
  p: number | null; pText: string | null; pCorrText: string | null; pending: boolean; pCaption: string; headline: string | null;
  site: { lat: number; lon: number } | null;                       // NASA's Pu'u Hiwahine test site
}

/** "(19.76091, -155.47071)" decimal pair inside the note of the known-analog row. */
export function parseSiteCoords(note: string | undefined): { lat: number; lon: number } | null {
  const m = /\((-?\d+\.\d+),\s*(-?\d+\.\d+)\)/.exec(note ?? '');
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

export function homeFacts(m: Manifest, kr: Rec, far: Rec | null, nul: Rec | null, known: Rec | null): HomeFacts | null {
  const nullOk = !!nul && nul._stub === false && nul.pu_uhiwahine && typeof nul.headline_target === 'string';
  const lunar = m.targets.filter(t => t.body === 'moon');
  const rankOf = (id: string) => { const hit = Object.entries(kr?.[id] ?? {}).find(([s]) => SITE.test(s)); return hit ? (hit[1] as Rec) : null; };
  // headline target: the one the null test chose (stats) else the best blind rank
  let tid: string | null = nullOk ? nul!.headline_target : null;
  if (!tid || !rankOf(tid)) tid = lunar.map(t => ({ id: t.id, r: rankOf(t.id)?.rank ?? 1e12 })).sort((a, b) => a.r - b.r)[0]?.id ?? null;
  const rk = tid ? rankOf(tid) : null;
  if (!tid || !rk) return null;
  const name = m.targets.find(t => t.id === tid)?.name ?? tid;
  const v3 = far?.sites?.[tid]?.V3_far_curved?.spearman_rho;
  const rhos = lunar.map(t => far?.sites?.[t.id]?.V3_far_curved?.spearman_rho).filter((x): x is number => typeof x === 'number');
  const pu = nullOk ? nul!.pu_uhiwahine[tid] : null;
  const p: number | null = pu && typeof pu.p_value_region_matched === 'number' ? pu.p_value_region_matched : null;
  const nLunar = nullOk ? Object.keys(nul!.pu_uhiwahine).length : 0;
  const row = known?.rows?.find((r: Rec) => r.reference === tid && SITE.test(r.site));
  return {
    target: { id: tid, name }, rank: rk.rank, n: rk.n, rankText: `#${nf(rk.rank)}`,
    rho: typeof v3 === 'number' ? v3 : null, rhoText: typeof v3 === 'number' ? fx(v3, 3) : null,       // headline rho with the precision the README gives (Malapert 0.975); the range keeps two decimals like the README (0.92–0.99)
    rhoRange: rhos.length ? `${fx(Math.min(...rhos), 2)}–${fx(Math.max(...rhos), 2)}` : null,
    horizonKm: far?.settings?.max_distance_m ? far.settings.max_distance_m / 1000 : null,
    p, pText: p === null ? null : fx(p, 3), pending: p === null,
    pCorrText: pu && typeof pu.p_bonferroni === 'number' ? fx(pu.p_bonferroni, 3) : null,
    // the caption is the null test's own sentence: share of Mauna Kea, p, and BOTH corrections (the wider one is the fair one, as on Proof)
    pCaption: p === null ? 'Permutation test pending' : typeof nul!.headline === 'string' ? nul!.headline : `p = ${fx(p, 3)} for ${name}`,
    headline: nullOk && typeof nul!.headline === 'string' ? nul!.headline : null,
    site: parseSiteCoords(row?.note),
  };
}

export interface Shortcut { id: 'moon' | 'mars' | 'mexico'; label: string; pair: string; hash: string }
/** Three shortcuts, pairs taken from the exported score matrix and the blind ranks. */
export function shortcuts(m: Manifest, mx: Rec | null, kr: Rec | null, headlineTarget: string | null): Shortcut[] {
  const out: Shortcut[] = [];
  const tname = (id: string) => m.targets.find(t => t.id === id)?.name ?? id;
  const rname = (id: string) => m.regions.find(r => r.id === id)?.name ?? id;
  const best = (tid: string) => {                              // Earth region with the best combined score for a target
    const j = mx?.targets?.indexOf(tid); if (!mx || j == null || j < 0) return null;
    let bi = -1, bv = -1; (mx.v.combined as (number | null)[][]).forEach((row, i) => { const v = row[j]; if (v != null && v > bv) { bv = v; bi = i; } });
    return bi < 0 ? null : (mx.regions[bi] as string);
  };
  const mk = (id: Shortcut['id'], label: string, tid: string, rid: string | null): Shortcut | null =>
    rid ? { id, label, pair: `${tname(tid)} ↔ ${rname(rid)}`, hash: `#/explore?target=${encodeURIComponent(tid)}&region=${encodeURIComponent(rid)}` } : null;
  const moon = headlineTarget ?? m.targets.find(t => t.body === 'moon')?.id;
  const jez = m.targets.find(t => t.body === 'mars' && /jezero/i.test(t.name))?.id ?? m.targets.find(t => t.body === 'mars')?.id;
  const pin = m.regions.find(r => PINACATE.test(r.name))?.id ?? null;
  // Mexico: the lunar target for which the Pinacate known site ranks best
  const pinTarget = Object.entries(kr ?? {}).map(([t, sites]) => { const hit = Object.entries(sites as Rec).find(([s]) => PINACATE.test(s)); return hit && m.targets.find(x => x.id === t)?.body === 'moon' ? { t, r: (hit[1] as Rec).rank as number } : null; })
    .filter((x): x is { t: string; r: number } => !!x).sort((a, b) => a.r - b.r)[0]?.t ?? moon;
  for (const s of [moon ? mk('moon', 'Moon', moon, best(moon)) : null, jez ? mk('mars', 'Mars', jez, best(jez)) : null, pinTarget && pin ? mk('mexico', 'Mexico', pinTarget, pin) : null]) if (s) out.push(s);
  return out;
}
