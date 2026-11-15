export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const nf = (n: number) => n.toLocaleString('en-US');
export function coord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}
/** Fixed-decimal formatting identical to Python's format(x, f".{d}f"): the EXACT binary value of x decides, and only a true tie
 *  (e.g. 122.5, 0.125) rounds half to even. So 0.975 -> "0.97" (the double is slightly below 0.975), 2.675 -> "2.67", 0.125 -> "0.12", 2.5 -> "2".
 *  Uses the exact decimal expansion from toFixed(100); sign handling like Python ("-0.00" is kept). Tested against 3,588 Python-generated
 *  fixtures (tests/pyfixed.fixtures.json). */
export function pyFixed(x: number, d = 0): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const neg = x < 0 || Object.is(x, -0), a = Math.abs(x);
  let int: string, frac: string;
  if (a >= 1e21) { int = BigInt(a).toString(); frac = '0'.repeat(100); }          // toFixed switches to exponent notation here
  else { const t = a.toFixed(100), dot = t.indexOf('.'); int = t.slice(0, dot); frac = t.slice(dot + 1); }
  const keep = frac.slice(0, d).padEnd(d, '0'), rest = frac.slice(d);
  const last = d > 0 ? keep[d - 1] : int[int.length - 1];
  const up = rest[0] > '5' || (rest[0] === '5' && (/[1-9]/.test(rest.slice(1)) || Number(last) % 2 === 1));
  let digits = BigInt(int + keep) + (up ? 1n : 0n);
  let str = digits.toString().padStart(d + 1, '0');
  if (d > 0) str = `${str.slice(0, -d)}.${str.slice(-d)}`;
  return (neg ? '-' : '') + str;
}
