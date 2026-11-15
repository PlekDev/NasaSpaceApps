// The blind-rediscovery headline, computed from the exported data so the intro and Validation never drift from it.
// Pu'u Hiwahine (Mauna Kea) hosted the 2012 NASA/CSA/DLR lunar-polar ISRU field test; P.E.N. is never told about it.
import type { Manifest } from './types';

export type Ranks = Record<string, Record<string, { rank: number; n: number; pct: number }>>;
export interface Proof { best: { id: string; name: string; rank: number; n: number }; topShare: number; top02: number; top5: number; lunar: number; ranks: { id: string; rank: number; n: number }[] }

// self-contained (no runtime imports) so node --test can load it directly, like model.ts
const nf = (n: number) => n.toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SITE = /hiwahine/i;
const topPct = (rank: number, n: number) => (rank / n) * 100;

export function blindProof(kr: Ranks, m: Manifest): Proof | null {
  const ranks = m.targets.filter(t => t.body === 'moon').map(t => {
    const hit = Object.entries(kr[t.id] ?? {}).find(([site]) => SITE.test(site));
    return hit ? { id: t.id, rank: hit[1].rank, n: hit[1].n } : null;
  }).filter((x): x is { id: string; rank: number; n: number } => !!x).sort((a, b) => a.rank - b.rank);
  if (!ranks.length) return null;
  const b = ranks[0];
  // "top 0.2 %" means the share rounds to 0.2 % or better at one decimal, as in the README
  const top02 = ranks.filter(r => Math.round(topPct(r.rank, r.n) * 10) / 10 <= 0.2).length;
  const top5 = ranks.filter(r => topPct(r.rank, r.n) <= 5).length;
  return { best: { id: b.id, name: m.targets.find(t => t.id === b.id)?.name ?? b.id, rank: b.rank, n: b.n }, topShare: topPct(b.rank, b.n), top02, top5, lunar: ranks.length, ranks };
}

/** One sentence, HTML: "#1 of 10,424 for Malapert Massif, top 0.2 % for 4 of 6 lunar sites and top 5 % for all 6." */
export function proofLine(p: Proof): string {
  const all = (k: number) => (k === p.lunar ? `all ${p.lunar}` : `${k} of ${p.lunar}`);
  return `<b>#${nf(p.best.rank)} of ${nf(p.best.n)}</b> Earth windows for ${esc(p.best.name)}, top 0.2 % for ${all(p.top02)} lunar sites and top 5 % for ${all(p.top5)}`;
}
