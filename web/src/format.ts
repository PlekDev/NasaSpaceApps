export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const nf = (n: number) => n.toLocaleString('en-US');
export function coord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}
/** Fixed-decimal formatting that rounds exact ties to even, like Python's format(): 122.5 -> "122", not "123". */
export function pyFixed(x: number, d = 0): string {
  const p = 10 ** d, y = x * p, f = Math.floor(y);
  if (Math.abs(y - f - 0.5) < 1e-9 && Math.abs(y - (f + 0.5)) === 0) return ((f % 2 === 0 ? f : f + 1) / p).toFixed(d);
  return x.toFixed(d);
}
