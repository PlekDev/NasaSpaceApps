/** "Method": the pipeline as a flow, the two formulas that matter, the data with exact product names, and the full
 *  docs/METHOD.md under "Read more". Formulas are typeset with KaTeX (lazy-loaded, HTML + MathML output); the plain
 *  MathML below is shown first and stays if KaTeX cannot load.
 *  AI-assisted (Claude, Anthropic); reviewed by the team. */
import './method.css';
import './stage.css';
import { mountShadowLab, mountScorePlay } from './method_lab';
import { loadHome } from '../lib/homeload';
import { md } from '../markdown';
import { getText } from '../data';
import { esc } from '../format';
import { renderMath } from '../lib/katex';
import type { Manifest } from '../types';

const TEX = {
  shadow: String.raw`g_i = z_i + i\,\Delta x\,\tan\theta \qquad \max_{j<i}\, g_j > g_i \;\Rightarrow\; \text{shadow}`,
  score: String.raw`d_k = \frac{x_k - r_k}{\mathrm{IQR}_k} \qquad D = \sqrt{\frac{\sum_k w_k\, d_k^2}{\sum_k w_k}} \qquad S = 100\, e^{-D}`,
};

const STEPS: [string, string, string][] = [
  ['Terrain models', 'Moon: LOLA. Mars: CTX. Earth: Copernicus.', 'Each body keeps its own shape and radius.'],
  ['One common grid', 'Every model is reprojected and averaged to the same pixel size.', 'So a slope on the Moon and a slope on Earth mean the same thing.'],
  ['Cast shadows', 'A running maximum along each row gives the exact shadow of a low Sun.', 'Exact, with no search distance, in one pass per row.'],
  ['Features per window', 'Relief, slope, roughness, shape, and shadow at two low Sun heights.', 'Terrain and light are kept as separate dimensions.'],
  ['Scaled distance', 'Each difference is divided by how much that feature varies on Earth.', 'Different units become comparable.'],
  ['Score', '100 means identical features; it falls off with distance.', 'One score per dimension and one combined.'],
  ['Validation', 'Against NASA’s illumination map, known analog sites and random chance.', '<a href="#/proof">See the three proofs</a>.'],
];

const DATA: [string, string, string, string][] = [
  ['LOLA 5 m south-pole DEMs (Barker et al.)', 'https://pgda.gsfc.nasa.gov/products/78', 'NASA GSFC / LRO', 'Moon Base reference terrain'],
  ['LOLA polar illumination: AVGVISIB and LPSR (Mazarico et al.)', 'https://pgda.gsfc.nasa.gov/products/69', 'NASA GSFC / LRO', 'Check of the light model and of permanent shadow'],
  ['LOLA gridded polar DEM LDEM_85S_40M', 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/', 'NASA LRO / PDS', 'Distant horizons for the light check'],
  ['MRO CTX stereo DTMs', 'https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms', 'NASA MRO / USGS', 'Mars reference terrain'],
  ['LRO Diviner polar resource product (Paige et al.)', 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/', 'NASA LRO / PDS', 'Moon temperature and ice stability'],
  ['MODIS Terra MOD11A2 v061', 'https://doi.org/10.5067/MODIS/MOD11A2.061', 'NASA LP DAAC', 'Earth land-surface temperature per window'],
  ['EMIT L2B mineralogy EMITL2BMIN V002', 'https://doi.org/10.5067/EMIT/EMITL2BMIN.002', 'NASA JPL / LP DAAC', 'Earth surface minerals per window'],
  ['NASA POWER climatology API', 'https://power.larc.nasa.gov/docs/services/api/temporal/climatology/', 'NASA LaRC', 'Earth skin temperature per region'],
  ['Moon Trek and Mars Trek WMTS', 'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon', 'NASA SSERVI / JPL', 'Real view of Moon and Mars windows'],
  ['GIBS', 'https://nasa-gibs.github.io/gibs-api-docs/', 'NASA ESDIS', 'Real view of Earth windows'],
  ['EONET v3', 'https://eonet.gsfc.nasa.gov/docs/v3', 'NASA Earth Observatory', 'Live field-safety check'],
  ['Copernicus DEM GLO-30', 'https://registry.opendata.aws/copernicus-dem/', 'ESA (Space Agency Partner)', 'Earth candidate terrain'],
  ['Mars Climate Database v6.2', 'https://www-mars.lmd.jussieu.fr/mcd_python/', 'LMD/OU/IAA with ESA and CNES', 'Modelled Mars surface temperature and pressure'],
];

// MathML helpers
const mi = (s: string) => `<mi>${s}</mi>`, mo = (s: string) => `<mo>${s}</mo>`, sub = (a: string, b: string) => `<msub>${a}${b}</msub>`;
const SHADOW = `<math display="block" aria-label="g sub i equals z sub i plus i times d x times tangent of theta. Pixel i is in shadow when the maximum of g sub j over j less than i is greater than g sub i.">
  <mrow>${sub(mi('g'), mi('i'))}${mo('=')}${sub(mi('z'), mi('i'))}${mo('+')}${mi('i')}${mo('·')}${mi('Δx')}${mo('·')}<mi>tan</mi>${mi('θ')}</mrow>
  <mspace width="2em"/><mrow><munder><mi>max</mi><mrow>${mi('j')}${mo('&lt;')}${mi('i')}</mrow></munder>${sub(mi('g'), mi('j'))}${mo('&gt;')}${sub(mi('g'), mi('i'))}<mspace width=".6em"/><mo>⇒</mo><mspace width=".6em"/><mtext>shadow</mtext></mrow></math>`;
const SCORE = `<math display="block" aria-label="d sub k equals x sub k minus r sub k, over the inter-quartile range of feature k. D equals the square root of the weighted mean of d sub k squared. S equals 100 times e to the minus D.">
  <mrow>${sub(mi('d'), mi('k'))}${mo('=')}<mfrac><mrow>${sub(mi('x'), mi('k'))}${mo('−')}${sub(mi('r'), mi('k'))}</mrow>${sub('<mi>IQR</mi>', mi('k'))}</mfrac></mrow>
  <mspace width="2em"/><mrow>${mi('D')}${mo('=')}<msqrt><mfrac><mrow><mo>∑</mo>${sub(mi('w'), mi('k'))}<msubsup>${mi('d')}${mi('k')}<mn>2</mn></msubsup></mrow><mrow><mo>∑</mo>${sub(mi('w'), mi('k'))}</mrow></mfrac></msqrt></mrow>
  <mspace width="2em"/><mrow>${mi('S')}${mo('=')}<mn>100</mn>${mo('·')}<msup>${mi('e')}<mrow>${mo('−')}${mi('D')}</mrow></msup></mrow></math>`;

export async function renderMethod(el: HTMLElement, m?: Manifest) {
  const nFeat = m ? Object.values(m.dims).reduce((a, f) => a + f.length, 0) : null;
  const dims = m ? Object.entries(m.dims).map(([d, f]) => `${f.length} for ${d === 'illumination' ? 'light' : d}`).join(' and ') : '';
  const flow = STEPS.map(([t, a, b], i) => `<li class="method-step" style="--i:${i}"><span class="method-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><b>${t}</b><p>${a}</p><small>${b}</small></li>`).join('');
  // three Explore-style cards from the manifest: how many windows, features and targets (nothing typed)
  const moon = m ? m.targets.filter(t => t.body === 'moon').length : 0, mars = m ? m.targets.filter(t => t.body === 'mars').length : 0;
  const card = (i: number, cap: string, num: string, unit: string, txt: string) =>
    `<div class="ex-card ex-glass" style="--i:${i}"><span class="ex-cap">${esc(cap)}</span><span class="ex-num">${num}<small>${esc(unit)}</small></span><span class="ex-txt">${txt}</span></div>`;
  const kpis = m ? [
    card(0, 'Compared', m.windows_per_target.toLocaleString('en-US'), 'Earth windows', `Each ${m.window_km} km wide, in ${m.regions.length} Earth regions, scored against every target.`),
    nFeat ? card(1, 'Measured', String(nFeat), 'features', `${esc(dims)}. Terrain and light stay separate dimensions.`) : '',
    card(2, 'Targets', String(moon + mars), 'sites', `${moon} Moon Base sites and ${mars} Mars sites. No labels are used to fit anything.`),
  ].join('') : '';
  const rows = DATA.map(([n, u, who, use], i) => `<a class="method-src ex-glass" style="--i:${i}" href="${u}" target="_blank" rel="noopener"><span class="ex-cap">${esc(who)}</span><b>${esc(n)}</b><span>${esc(use)}</span></a>`).join('');
  el.innerHTML = `<div class="page-in method stage">
    <p class="ex-cap stage-kicker">Method · how a score is made</p>
    <h1>Method &amp; data</h1>
    <p class="method-lede">P.E.N. compares every ${m ? `${m.window_km} km ` : ''}window of Earth with a target on the Moon or Mars${nFeat ? `, using ${nFeat} features (${dims})` : ''}. Nothing is learned from labels: the known analog sites are only used afterwards, to test the result.</p>
    ${kpis ? `<div class="stage-kpis method-kpis">${kpis}</div>` : ''}
    <section aria-labelledby="method-h-flow"><h2 id="method-h-flow"><span class="ex-n">01</span>How a score is made</h2><ol class="method-flow">${flow}</ol></section>
    <section aria-labelledby="method-h-lab"><h2 id="method-h-lab"><span class="ex-n">02</span>Cast shadows, live</h2>
      <p class="method-sub">Drag the Sun. This is the exact shadow algorithm, running now on the real terrain of a Moon Base site and of its best Earth match.</p>
      <div class="panel method-lab" id="method-lab"></div></section>
    <section aria-labelledby="method-h-f"><h2 id="method-h-f"><span class="ex-n">03</span>The two formulas</h2>
      <div class="method-formulas">
        <figure class="panel"><div class="method-math" data-tex="shadow">${SHADOW}</div><figcaption><b>Shadow of a low Sun.</b> With the Sun at height θ on the left of a row of heights <i>z</i> spaced Δx apart, one running maximum per row tells exactly which pixels are in shadow.</figcaption></figure>
        <figure class="panel"><div class="method-math" data-tex="score">${SCORE}</div><figcaption><b>Similarity score.</b> <i>x</i> is the Earth window, <i>r</i> the target, and IQR the spread of that feature over all Earth windows. S = 100 means identical; S ≈ 37 means one spread apart on average.</figcaption><div class="method-play" id="method-play"></div></figure>
      </div></section>
    <section aria-labelledby="method-h-d"><h2 id="method-h-d"><span class="ex-n">04</span>Data, with exact product names</h2>
      <div class="method-data">${rows}</div>
      <p class="note">NASA data are public domain. Copernicus DEM © DLR e.V. / Airbus, provided under the Copernicus programme by ESA. The Mars Climate Database is a model, not a measurement.</p></section>
    <details class="method-more"><summary>Read more: the full method, step by step</summary><div class="prose" id="method-full"><p class="muted">Loading…</p></div></details>
  </div>`;
  mountScorePlay(el.querySelector<HTMLElement>('#method-play')!);
  if (m) loadHome(m).then(h => { const t = m.targets.find(x => x.id === (h.facts?.target.id ?? '')) ?? m.targets.find(x => x.body === 'moon'); if (t) void mountShadowLab(el.querySelector<HTMLElement>('#method-lab')!, t.id, t.name); });
  // typeset the formulas; on any failure the MathML fallback already in the box stays
  el.querySelectorAll<HTMLElement>('.method-math[data-tex]').forEach(box => {
    const tex = TEX[box.dataset.tex as keyof typeof TEX];
    if (!tex) return;
    const out = document.createElement('div');
    renderMath(out, tex, { display: true }).then(() => { box.replaceChildren(out); box.classList.add('is-katex'); }).catch(() => { /* keep MathML */ });
  });
  const more = el.querySelector<HTMLDetailsElement>('.method-more')!;
  more.addEventListener('toggle', async () => {
    const box = more.querySelector<HTMLElement>('#method-full')!;
    if (!more.open || box.dataset.done) return;
    box.dataset.done = '1';
    try { box.innerHTML = md((await getText('method.md')).replace(/^## Method\s*/, '')); } catch { box.innerHTML = '<p class="muted">The full method could not be loaded.</p>'; }
  });
}
export const render = renderMethod;
