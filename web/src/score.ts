/** S = 100*exp(-sqrt(sum_dim W*n_dim*D_dim^2 / sum_dim W*n_dim)),  D_dim = -ln(score_dim/100). Same formula as app/streamlit_app.py. */
export function combine(dimScores: number[], weights: number[], counts: number[]): number {
  let num = 0, den = 0;
  for (let k = 0; k < dimScores.length; k++) {
    const D = -Math.log(dimScores[k] / 100);
    num += weights[k] * counts[k] * D * D; den += weights[k] * counts[k];
  }
  return 100 * Math.exp(-Math.sqrt(num / (den || 1)));
}
export const RAMP: [number, number, number][] = [[28, 61, 110], [42, 120, 214], [109, 167, 236], [255, 209, 102]];
export const RAMP_HEX = ['#1c3d6e', '#2a78d6', '#6da7ec', '#ffd166'];
export function ramp(s: number, lo: number): string {
  const t = Math.min(1, Math.max(0, (s - lo) / Math.max(100 - lo, 1)));
  const k = Math.min(Math.floor(t * 3), 2), f = t * 3 - k;
  const c = RAMP[k].map((v, n) => Math.round(v + f * (RAMP[k + 1][n] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
