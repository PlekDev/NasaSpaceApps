// AI-assisted (Claude Code); reviewed by the author.
import { esc } from './format';
import type { Manifest } from './types';
import { hasWebGL, type View } from './view';
import { icon } from './icons';
import { loadHome } from './lib/homeload';
import './views/home.css';

const FALLBACK_IMG =
	"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/1/0/0.jpeg";

/** Home: the judge's path, in Explore's instrument skin. A glass panel on the left asks the question in plain words and says what P.E.N.
 *  does (counts from the manifest); the live globe turns and flies to NASA's Pu'u Hiwahine test site on Mauna Kea; then three Explore-style
 *  cards land on the right: the blind test (rank of N), the null test (p) and the light model against NASA (rho range), all from exported
 *  data, never typed. Skippable (Skip, Esc); with prefers-reduced-motion there is no flight, the end state shows at once. */
export function mountHome(root: HTMLElement, o: { m: Manifest; view: View; targetName: string }) {
  const { m, view } = o;
  const dead = !hasWebGL(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, wide = innerWidth > 820;
  const el = document.createElement('section');
  el.className = 'intro home'; el.setAttribute('aria-label', 'Home');
  const moon = m.targets.filter(t => t.body === 'moon').length, mars = m.targets.filter(t => t.body === 'mars').length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  el.innerHTML = `<div class="home-scroll"><div class="home-copy panel">
      <p class="ex-cap home-kicker">Moon Base and Mars analogs on Earth</p>
      <h1>Where on Earth can you rehearse the <em>Moon Base</em>?</h1>
      <p class="home-lead">P.E.N. compares every ${esc(String(m.window_km))} km window of ${plural(m.regions.length, 'Earth region', 'Earth regions')} with
        ${plural(moon, 'Moon Base site', 'Moon Base sites')} and ${plural(mars, 'Mars site', 'Mars sites')}, by terrain <i>and</i> by low-Sun light,
        then tells field teams where, and when, to go.</p>
      <p class="home-hook" id="home-hook" aria-live="polite" hidden></p>
      <div class="home-actions"><a class="btn primary" id="home-proof" href="#/proof">See the proof</a><button class="home-btn" id="go" type="button">Explore the map</button>
        <button class="home-skip" id="home-skip" type="button">Skip</button></div>
      <nav class="home-try" id="home-try" aria-label="Examples" hidden></nav></div>
      <div class="home-stats" id="home-stats" hidden></div></div>
    <div class="home-site" id="home-site" hidden aria-hidden="true"></div>
    ${dead ? `<div class="intro-static" role="img" aria-label="NASA Blue Marble imagery of the Americas and the Pacific"><img src="${FALLBACK_IMG}" alt="" width="256" height="256"></div>` : ''}`;
  root.appendChild(el); document.documentElement.dataset.intro = '';
  const $q = <T extends HTMLElement>(s: string) => el.querySelector(s) as T;
  const padding = wide ? { left: Math.min(520, Math.round(innerWidth * .34)), top: 0, right: innerWidth > 1180 ? 400 : 0, bottom: 0 } : { bottom: Math.round(innerHeight * .5), top: 52, left: 0, right: 0 };
  let raf = 0, last = 0, done = false, landed = false, flying = false, flyTimer = 0, landTimer = 0, siteName = "Pu'u Hiwahine";

	if (!dead) {
		view.jumpTo({ center: [-100, 18], zoom: wide ? 2.3 : 1.55, padding });
		if (!reduced) {
			// slow spin, ~5° per second, paused while the tab is hidden
			const spin = (t: number) => {
				if (done || landed || flying) return;
				if (last && !document.hidden) {
					const c = view.getCenter();
					view.jumpTo({ center: [c[0] + (t - last) * 0.005, c[1]] });
				}
				last = t;
				raf = requestAnimationFrame(spin);
			};
			raf = requestAnimationFrame(spin);
		}
	}

	const land = () => {
		if (landed || done) return;
		landed = true;
		cancelAnimationFrame(raf);
		clearTimeout(flyTimer);
		clearTimeout(landTimer);
		el.classList.add("landed");
		document.documentElement.dataset.homeLanded = "";
		$q("#home-skip").hidden = true;
		for (const id of ["#home-hook", "#home-stats", "#home-try", "#home-site"]) {
			const n = $q<HTMLElement>(id);
			if (n.innerHTML) n.hidden = false;
		}
	};
	const skip = () => {
		if (landed) return;
		clearTimeout(flyTimer);
		clearTimeout(landTimer);
		const s = facts?.site;
		if (!dead && s) view.jumpTo({ center: [s.lon, s.lat], zoom: 7.4, padding });
		land();
	};
	$q("#home-skip").addEventListener("click", skip);
	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Escape") skip();
	};
	document.addEventListener("keydown", onKey);
	$q("#go").addEventListener("click", () => {
		location.hash = "#/explore";
	});

  let facts: Awaited<ReturnType<typeof loadHome>>['facts'] = null;
  loadHome(m).then(d => {
    if (done) return; facts = d.facts;
    const f = d.facts;
    if (f) {
      const n = f.n.toLocaleString('en-US');
      $q('#home-hook').innerHTML = `<b>Blind test.</b> NASA rehearsed a lunar-pole mission at Pu'u Hiwahine, on Mauna Kea, in 2012. Never told about it, P.E.N. ranks that exact site <b>${esc(f.rankText)} of ${esc(n)}</b> for ${esc(f.target.name)}.`;
      // the null test's own sentence: "Only x % of Mauna Kea scores as high as NASA's exact test site for <target>: p = ... (corrections)"
      const notLuck = f.headline ? f.headline.split(':')[0].replace(/ for [^:]+$/, '') : f.pCaption;
      const logp = (r: number) => `${((100 * Math.log(Math.max(1, r))) / Math.log(Math.max(2, f.n))).toFixed(2)}%`;
      const [r0, r1] = (f.rhoRange ?? '').split('–').map(Number);
      const card = (cls: string, i: number, cap: string, num: string, txt: string, mini: string, href: string, pending = false) =>
        `<a class="home-stat ex-card ex-glass ${cls}${pending ? ' pending' : ''}" style="--i:${i}" href="${href}"><span class="ex-cap"><span class="ex-n">0${i + 1}</span>${esc(cap)}${icon.chevron}</span>` +
        `<span class="home-num ex-num">${num}</span><span class="home-cap ex-txt">${txt}</span><span class="ex-mini" aria-hidden="true">${mini}</span></a>`;
      $q('#home-stats').innerHTML =
        card('is-lead', 0, 'Blind test', `${esc(f.rankText)}<small>of ${esc(n)}</small>`,
          `NASA's own 2012 test site, among all Earth windows for <b>${esc(f.target.name)}</b>. Found without labels.`,
          `<span class="ex-ml"><b style="left:${logp(f.rank)}"></b><span>${esc(f.rankText)}</span><span>#100</span><span>#${esc(n)}</span></span>`, '#/proof') +
        card('', 1, 'Not luck', f.pText ? `${esc(f.pText)}<small>p-value</small>` : '—',
          f.pText ? `${esc(notLuck)}${f.pCorrText ? ` (${esc(f.pCorrText)} after correcting for ${moon} targets)` : ''}.` : esc(f.pCaption),
          f.p !== null ? `<span class="ex-mb"><i style="--w:${Math.max(1, 100 * f.p).toFixed(1)}%"></i><i style="--w:100%"></i></span>` : '', '#/proof', f.pending) +
        card('', 2, 'Checked against NASA', f.rhoRange ? `${esc(f.rhoRange)}<small>Spearman ρ</small>` : '—',
          `Our cast shadows against NASA's LOLA illumination map, at all ${plural(moon, 'Moon Base site', 'Moon Base sites')}${f.horizonKm ? `, horizons up to ${f.horizonKm} km` : ''}.`,
          f.rhoRange ? `<span class="home-rng"><i style="left:${(100 * r0).toFixed(1)}%;right:${(100 - 100 * r1).toFixed(1)}%"></i><span>0</span><span>1</span></span>` : '', '#/proof', !f.rhoRange);
      siteName = "Pu'u Hiwahine";
      $q('#home-site').innerHTML = `<b>${esc(siteName)}</b><span>NASA's 2012 lunar-pole field-test site</span>`;
    }
    $q('#home-try').innerHTML = d.shortcuts.length ? `<h2 class="ex-cap home-try-h">Try a pair</h2><ul>${d.shortcuts.map(s => `<li><a href="${esc(s.hash)}"><b>${esc(s.label)}</b><span>${esc(s.pair)}</span></a></li>`).join('')}</ul>` : '';
    if (landed) { for (const id of ['#home-hook', '#home-stats', '#home-try', '#home-site']) { const n = $q<HTMLElement>(id); if (n.innerHTML) n.hidden = false; } }
    else if (dead || reduced) skip();
    else {
      const s = f?.site;
      flyTimer = window.setTimeout(() => { flying = true; cancelAnimationFrame(raf); if (s) view.fly(s.lon, s.lat, 7.4, padding); landTimer = window.setTimeout(land, s ? 1600 : 0); }, 1000);
    }
  }).catch(() => land());

	return {
		finish() {
			if (done) return;
			done = true;
			document.removeEventListener("keydown", onKey);
			cancelAnimationFrame(raf);
			clearTimeout(flyTimer);
			clearTimeout(landTimer);
			if (!dead)
				view.jumpTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 } });
			/* give Explore its camera back without Home's left padding */ el.classList.add(
				"leaving",
			);
			delete document.documentElement.dataset.intro;
			delete document.documentElement.dataset.homeLanded;
			setTimeout(() => el.remove(), 260);
		},
	};
}
