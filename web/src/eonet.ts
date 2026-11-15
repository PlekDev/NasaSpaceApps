/** Port of pen/eonet.py: open NASA EONET events within radius_km of a point (live from the browser, else the committed snapshot). */
import { getJSON } from './data';
export interface FieldEvent { title: string; category: string; date: string; distance_km: number; link?: string }
interface Raw { events?: { title?: string; link?: string; categories?: { title?: string }[]; geometry?: { type: string; date?: string; coordinates: any }[] }[] } // eslint-disable-line @typescript-eslint/no-explicit-any
const km = (la1: number, lo1: number, la2: number, lo2: number) => {
  const p = Math.PI / 180, a = Math.sin((la2 - la1) * p / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin((lo2 - lo1) * p / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};
const points = (g: { type: string; coordinates: any }): [number, number][] => // eslint-disable-line @typescript-eslint/no-explicit-any
  g.type === 'Point' ? [g.coordinates] : g.type === 'Polygon' ? g.coordinates.flat() : [];
export function parseEvents(p: Raw, lat: number, lon: number, radius: number): FieldEvent[] {
  const out: FieldEvent[] = [];
  for (const ev of p.events ?? []) {
    let best: number | null = null, when: string | undefined;
    for (const g of ev.geometry ?? []) for (const [lo, la] of points(g)) { const d = km(lat, lon, la, lo); if (best === null || d < best) { best = d; when = g.date; } }
    if (best !== null && best <= radius) out.push({ title: ev.title ?? '', category: (ev.categories ?? []).map(c => c.title ?? '').join(', '), date: (when ?? '').slice(0, 10), distance_km: Math.round(best), link: ev.link });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
const cache = new Map<string, Promise<{ events: FieldEvent[] | null; how: string }>>();
export function fieldEvents(site: string, lat: number, lon: number, radius = 150) {
  const key = `${site}:${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const dlat = radius / 111, dlon = radius / (111 * Math.max(Math.cos(lat * Math.PI / 180), 0.05));
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&bbox=${lon - dlon},${Math.min(lat + dlat, 90)},${lon + dlon},${Math.max(lat - dlat, -90)}&limit=50`;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
      if (r.ok) return { events: parseEvents(await r.json(), lat, lon, radius), how: 'live' };
    } catch { /* offline, blocked or CORS: use the snapshot */ }
    try {
      const snap = await getJSON<{ taken_utc: string; events: Record<string, Raw['events']> }>('eonet_snapshot');
      if (snap.events[site]) return { events: parseEvents({ events: snap.events[site] }, lat, lon, radius), how: `snapshot ${snap.taken_utc} UTC` };
    } catch { /* no snapshot */ }
    return { events: null, how: 'unavailable' };
  })());
  return cache.get(key)!;
}
