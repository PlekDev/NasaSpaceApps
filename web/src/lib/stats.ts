// AI-assisted (Claude Code); reviewed by the author.
/** Per-window statistics for the analog card, from stats/bootstrap.json and stats/decomp.json (contracts: docs/plan/chamba.md, section 4).
 *  Pure (no imports): node --test loads it directly. Anything stubbed (`_stub` not strictly false) or missing returns null, and the card
 *  shows nothing for it (absent, never a number, never an empty heading). Only the top windows of each target are covered by the export. */
type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const live = (d: Rec | null | undefined): d is Rec => !!d && d._stub === false;

export interface Ci { score: number; lo: number; hi: number; rankLo: number; rankHi: number; resamples: number | null }
/** 95 % interval of the score of one window, from bootstrapping the target's reference windows. */
export function ciFor(boot: Rec | null | undefined, target: string, windowId: string): Ci | null {
  if (!live(boot)) return null;
  const row = (boot[target] as Rec[] | undefined)?.find(r => r.window_id === windowId);
  if (!row || !Array.isArray(row.ci95) || !Array.isArray(row.rank_ci95)) return null;
  return { score: row.score, lo: row.ci95[0], hi: row.ci95[1], rankLo: row.rank_ci95[0], rankHi: row.rank_ci95[1], resamples: boot._meta?.params?.bootstrap ?? null };
}

export interface Driver { feature: string; label: string; share: number }
/** Share of each feature in the squared distance to the target, largest first. */
export function decompFor(decomp: Rec | null | undefined, target: string, windowId: string, labels: Record<string, string>): Driver[] | null {
  if (!live(decomp)) return null;
  const row = decomp[target]?.[windowId] as Record<string, number> | undefined;
  if (!row) return null;
  const out = Object.entries(row).filter(([, v]) => typeof v === 'number').map(([feature, share]) => ({ feature, label: labels[feature] ?? feature, share })).sort((a, b) => b.share - a.share);
  return out.length ? out : null;
}

/** One sentence for screen readers and the caption: "Local relief explains 58 % of the distance to X; 150 m roughness 12 %." */
export function decompSummary(rows: Driver[], targetName: string): string {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const [a, b] = rows;
  return `${a.label[0].toUpperCase()}${a.label.slice(1)} explains ${pct(a.share)} of the distance to ${targetName}${b ? `; ${b.label} ${pct(b.share)}` : ''}.`;
}
