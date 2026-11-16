/** Guided tour (#/tour): the P.E.N. story in five steps, ~60 s. Blind test -> light vs NASA -> where the analogy breaks ->
 * when to go -> rehearse the mission. Every number is read from the exported data (web/public/data); nothing is typed by hand.
 * Steps are activated by scroll position (IntersectionObserver on the page scroller) or with the step buttons / arrow keys.
 * Contract (lib/lazy): render(el, m, params) returns a cleanup function that the router calls when the route is left.
 * AI-assisted (Claude Code); reviewed by the author. */
import "./tour.css";
import { BASE } from "../base";
import { esc, nf, pyFixed } from "../format";
import { getJSON, loadTarget } from "../data";
import { blindProof, type Ranks } from "../proof";
import { hasWebGL } from "../view";
import type { Manifest, Target } from "../types";

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const GIBS =
	"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const range = (a: number[], d: number) =>
	`${pyFixed(Math.min(...a), d)}–${pyFixed(Math.max(...a), d)}`;
/** "top 0.2 %" as the README writes it; below 0.05 % it reads "top < 0.1 %". */
const topShare = (rank: number, n: number) => {
	const p = (rank / n) * 100;
	return p < 0.05 ? "top < 0.1 %" : `top ${p.toFixed(1)} %`;
};
const optional = <T>(name: string) => getJSON<T>(name).catch(() => null);

interface Step {
	id: string;
	kicker: string;
	title: string;
	text: string;
	visual: string;
	cta?: [string, string];
	onShow?: (stage: HTMLElement) => void;
}

export async function render(
	el: HTMLElement,
	m: Manifest,
	_params?: Record<string, string>,
): Promise<() => void> {
	const [kr, far, gap, rover] = await Promise.all([
		getJSON<Ranks>("known_ranks"),
		getJSON<Rec>("far_horizons"),
		optional<Rec>("thermal_gap"),
		optional<Rec>("rover_twin"),
	]);
	const proof = blindProof(kr, m);
	const hero =
		m.targets.find((t) => t.id === proof?.best.id) ??
		m.targets.find((t) => t.body === "moon") ??
		m.targets[0];
	const name = (id: string) => m.targets.find((t) => t.id === id)?.name ?? id;
	const best = await bestWindow(hero, m);
	const region = m.regions[best.site];
	const brief = m.briefs[region.id];
	const lowSun = brief?.csv
		? await fetch(`${BASE}extras/briefs/${brief.csv}`)
				.then((r) => (r.ok ? r.text() : Promise.reject(new Error(brief.csv))))
				.then(monthlyMinutes)
				.catch(() => null)
		: null;

	const steps: Step[] = [];
	const maps: { remove(): void }[] = [];

	// 1 · blind test
	if (proof)
		steps.push({
			id: "blind",
			kicker: "Blind test",
			title: "P.E.N. found NASA’s lunar test site without being told",
			text: `Never shown to P.E.N., NASA’s 2012 lunar-polar rehearsal site on Mauna Kea ranks <b>#${nf(proof.best.rank)} of ${nf(proof.best.n)}</b> Earth windows for ${esc(proof.best.name)}.`,
			visual: `<div class="tour-map" id="tour-map" role="img" aria-label="Globe flying to the best Earth window for ${esc(proof.best.name)}, on ${esc(region.name)}"></div>
      <div class="tour-over"><div class="tour-big tnum" data-rank="${proof.best.rank}" data-total="${proof.best.n}"><span class="tour-big-num">#${nf(proof.best.rank)}</span><span> of ${nf(proof.best.n)}</span></div>
      <div class="tour-ranks">${proof.ranks.map((r, idx) => `<div class="tour-rank" style="--i:${idx}"><span>${esc(name(r.id))}</span><b class="tnum">#${nf(r.rank)}</b><span class="tnum tour-dim">${topShare(r.rank, r.n)}</span></div>`).join("")}</div>
      <p class="tour-cap">Rank of the window that contains Pu‘u Hiwahine, for each Moon Base site, among ${nf(proof.best.n)} Earth windows.</p></div>`,
			cta: ["See the proof", "#/proof"],
			onShow: (stage) => {
				void flyTo(stage, best.lon, best.lat, maps);
			},
		});

	// 2 · light vs NASA
	const sites = Object.entries(far.sites as Rec) as [string, Rec][];
	const rho = sites.map(([, v]) => v.V3_far_curved.spearman_rho as number);
	const maxKm = pyFixed(far.settings.max_distance_m / 1000);
	steps.push({
		id: "light",
		kicker: "Light, checked against NASA",
		title: "Its shadows match NASA’s own illumination maps",
		text: `With mountains up to ${maxKm} km away included, the model reproduces NASA’s LOLA illumination map: Spearman <b>ρ ${range(rho, 2)}</b> at all ${sites.length} Moon Base sites.`,
		visual: `<div class="tour-card"><div class="tour-legend"><span><i class="k-far"></i>Horizons up to ${maxKm} km</span><span><i class="k-loc"></i>Local terrain only</span></div>
      <div class="tour-bars" role="img" aria-label="Spearman rho against NASA LOLA per site: ${sites.map(([id, v]) => `${name(id)} ${v.V3_far_curved.spearman_rho.toFixed(2)} with far horizons, ${v.V1_local_flat.spearman_rho.toFixed(2)} local`).join("; ")}">
      ${sites.map(([id, v], idx) => `<div class="tour-bar" style="--i:${idx}"><span class="tour-bl">${esc(name(id))}</span><span class="tour-pair"><span class="tour-track"><i class="k-far" style="width:${v.V3_far_curved.spearman_rho * 100}%"></i></span><span class="tour-track thin"><i class="k-loc" style="width:${v.V1_local_flat.spearman_rho * 100}%"></i></span></span><b class="tnum">${v.V3_far_curved.spearman_rho.toFixed(2)}</b><span class="tnum tour-dim">${v.V1_local_flat.spearman_rho.toFixed(2)}</span></div>`).join("")}</div>
      <p class="tour-cap">Spearman ρ of modelled lit time against the LOLA 18.6-year average-illumination map. Distant mountains explain the gap.</p></div>`,
		cta: ["Open the three proofs", "#/proof"],
	});

	// 3 · where the analogy breaks
	if (gap?.summary) {
		const s = gap.summary,
			gaps = Object.values(
				s.gap_to_coldest_earth_mean_K as Record<string, number>,
			);
		const coldest = gap.earth[s.coldest_earth_region],
			K = (v: number) =>
				`${Math.max(0, Math.min(100, (v / 360) * 100)).toFixed(1)}%`;
		const band = (
			idx: number,
			cls: string,
			lab: string,
			lo: number,
			hi: number,
			val: string,
		) =>
			`<div class="tour-trow" style="--i:${idx}"><span class="tour-bl">${lab}</span><span class="tour-tplot"><i class="${cls}" style="left:${K(lo)};width:calc(${K(hi)} - ${K(lo)})"></i></span><b class="tnum">${val}</b></div>`;
		steps.push({
			id: "limits",
			kicker: "Where the analogy breaks",
			title: "Earth matches the terrain and the light, not the cold",
			text: `Terrain and light match. Temperature does not: the coldest Earth region we search is still <b>${range(gaps, 0)} K warmer</b> than the Moon Base sites.`,
			visual: `<div class="tour-card"><div class="tour-temp" role="img" aria-label="Mean temperatures in kelvin: Moon Base sites ${range(s.moon_mean_K, 0)}, Mars sites ${range(s.mars_mean_K, 0)}, coldest Earth region ${pyFixed(s.coldest_earth_mean_K)}">
        ${band(0, "t-moon", "Moon Base sites", s.moon_mean_K[0], s.moon_mean_K[1], `${range(s.moon_mean_K, 0)} K`)}
        ${band(1, "t-mars", "Mars sites", s.mars_mean_K[0], s.mars_mean_K[1], `${range(s.mars_mean_K, 0)} K`)}
        ${band(2, "t-earth", esc(coldest?.label ?? "Coldest Earth region"), s.coldest_earth_mean_K, s.coldest_earth_mean_K, `${pyFixed(s.coldest_earth_mean_K)} K`)}
        <div class="tour-ticks tnum">${[0, 100, 200, 300].map((v) => `<span style="left:${K(v)}">${v} K</span>`).join("")}</div></div>
        <ul class="tour-fid">${(
					[
						"ok|Terrain",
						"ok|Low-Sun light",
						"no|Temperature",
						"no|Gravity",
						"no|Vacuum",
						"no|Radiation",
					] as const
				)
					.map((entry, idx) => {
						const [cls, label] = entry.split("|");
						return `<li class="${cls}" style="--i:${idx}">${label}</li>`;
					})
					.join("")}</ul>
        <p class="tour-cap">Mean temperature: Moon, LRO Diviner (annual mean, 2 cm below the surface); Mars, Mars Climate Database (model); Earth, NASA POWER skin temperature.</p></div>`,
			cta: ["See the limits", "#/limits"],
		});
	}

	// 4 · when to go
	if (brief?.block && lowSun) {
		const peak = Math.max(...lowSun.map((x) => x.min));
		steps.push({
			id: "when",
			kicker: "Analog in time",
			title: "It also says when the light is right",
			text: `${esc(region.name)} gets <b>${pyFixed(brief.min_day ?? 0)} minutes a day</b> of lunar-pole light (Sun 0–7°) in its best 14-day block: ${esc(brief.block)}.`,
			visual: `<div class="tour-card"><div class="tour-months" role="img" aria-label="Minutes per day with the Sun between 0 and 7 degrees at ${esc(region.name)}: ${lowSun.map((x) => `${x.label} ${pyFixed(x.min)}`).join(", ")}">
        ${lowSun.map((x, idx) => `<div class="tour-month${x.min === peak ? " is-peak" : ""}" style="--i:${idx}"><b class="tnum">${pyFixed(x.min)}</b><span class="tour-col"><i style="height:${(x.min / peak) * 100}%"></i></span><span>${x.label}</span></div>`).join("")}</div>
        <p class="tour-cap">Minutes per day with the Sun 0–7° above the horizon at ${esc(region.name)}, by month, from the campaign calendar of real low-Sun windows.</p></div>`,
			cta: ["Open the calendar", "#/when"],
		});
	}

	// 5 · rehearse the mission
	const rv = rover?.[hero.id],
		ex = m.extras[hero.id] ?? {};
	if (rv || ex.twin)
		steps.push({
			id: "mission",
			kicker: "Mission rehearsal",
			title: "Rehearse the traverse on Earth before flying it",
			text: rv
				? `The same route planner on both worlds: a <b>${rv.target.length_km.toFixed(1)} km</b> traverse on ${esc(hero.name)} and its <b>${rv.earth.length_km.toFixed(1)} km</b> twin on ${esc(region.name)}.`
				: `The same low Sun on both worlds: shadows sweep ${esc(hero.name)} and its best Earth window side by side.`,
			visual: `<div class="tour-card">${
				ex.video && !reduced()
					? `<video class="tour-media" muted loop playsinline preload="none" poster="${BASE}extras/${ex.twin}" data-src="${BASE}extras/${ex.video}" aria-label="Twin-light timelapse: ${esc(hero.name)} and its best Earth window under the same low Sun"></video>`
					: ex.twin
						? `<img class="tour-media" src="${BASE}extras/${ex.twin}" alt="${esc(hero.name)} and its best Earth window under the same low Sun" loading="lazy">`
						: ""
			}
      ${
				rv
					? `<table class="tour-tele"><thead><tr><th></th><th>${esc(hero.name)}</th><th>${esc(region.name)}</th></tr></thead><tbody>
        ${(
					[
						["Length", (o: Rec) => `${o.length_km.toFixed(1)} km`],
						["Climb", (o: Rec) => `${nf(o.climb_m)} m`],
						["Max slope", (o: Rec) => `${o.max_slope_deg.toFixed(1)}°`],
						["In shadow", (o: Rec) => `${pyFixed(o.share_in_shadow * 100)} %`],
					] as [string, (o: Rec) => string][]
				)
					.map(
						([l, f], idx) =>
							`<tr style="--i:${idx}"><th scope="row">${l}</th><td class="tnum">${f(rv.target)}</td><td class="tnum">${f(rv.earth)}</td></tr>`,
					)
					.join("")}</tbody></table>`
					: ""
			}
      <p class="tour-cap">Sun 2° above the horizon. Least-cost route with the same cost function on both bodies; slopes above 20° are impassable.</p></div>`,
			cta: ["Rehearse a traverse", "#/mission"],
		});

	el.innerHTML = `<div class="tour" id="tour">
    <header class="tour-head"><div><h1>The 60-second tour</h1><p class="muted">Five steps, the whole story. Scroll, or use the arrow keys.</p></div>
      <nav class="tour-nav" aria-label="Tour steps">${steps.map((s, i) => `<button class="tour-nav-btn" data-go="${i}" aria-label="Step ${i + 1}: ${esc(s.kicker)}"><span class="tnum">${i + 1}</span></button>`).join("")}</nav>
      <div class="tour-progress" aria-hidden="true"><i id="tour-progress-bar"></i></div></header>
    <div class="tour-grid">
      <div class="tour-stage" id="tour-stage" aria-live="off">
        <div class="tour-hud" aria-hidden="true">
          <span class="tour-hud-phase tnum" id="tour-hud-phase">PHASE 01 / 0${steps.length}</span>
          <span class="tour-hud-kicker" id="tour-hud-kicker">${esc(steps[0]?.kicker ?? "")}</span>
          <span class="tour-hud-live"><i class="tour-hud-dot"></i>TELEMETRY LOCK</span>
        </div>
        ${steps.map((s, i) => `<div class="tour-visual${i === 0 ? " is-active" : ""}" data-v="${i}" aria-hidden="${i !== 0}">${s.visual}</div>`).join("")}
      </div>
      <ol class="tour-steps">${steps
				.map(
					(
						s,
						i,
					) => `<li class="tour-step" data-s="${i}" id="tour-${s.id}"><div class="tour-text"><span class="tag">${i + 1} of ${steps.length} · ${esc(s.kicker)}</span><h2>${esc(s.title)}</h2><p>${s.text}</p>
        ${s.cta ? `<a class="link" href="${s.cta[1]}">${esc(s.cta[0])} →</a>` : ""}</div></li>`,
				)
				.join("")}
        <li class="tour-step tour-end" data-s="${steps.length - 1}"><div class="tour-text">
          <span class="tag">Mission ready · ${steps.length} of ${steps.length} verified</span>
          <div class="tour-summary" aria-hidden="true">${steps.map((s, i) => `<span class="tour-sum-chip" style="--i:${i}"><b>0${i + 1}</b> ${esc(s.kicker)}</span>`).join("")}</div>
          <h2>Now try it yourself</h2><p>Pick a Moon or Mars site and find where, and when, to rehearse it on Earth.</p>
          <div class="tour-actions"><a class="btn primary" href="#/explore">Explore the map</a><a class="btn" href="#/dossier?target=${encodeURIComponent(hero.id)}">Mission dossier</a></div></div></li></ol>
    </div></div>`;

	// ---- step activation
	const tourEl = el.querySelector<HTMLElement>("#tour")!,
		headEl = el.querySelector<HTMLElement>(".tour-head")!;
	const syncHeadH = () =>
		tourEl.style.setProperty(
			"--tour-head-h",
			`${Math.ceil(headEl.getBoundingClientRect().height)}px`,
		);
	syncHeadH();
	const ro =
		typeof ResizeObserver !== "undefined"
			? new ResizeObserver(syncHeadH)
			: null;
	ro?.observe(headEl);
	const stage = el.querySelector<HTMLElement>("#tour-stage")!,
		visuals = [...stage.querySelectorAll<HTMLElement>(".tour-visual")];
	const hudPhase = el.querySelector<HTMLElement>("#tour-hud-phase")!,
		hudKicker = el.querySelector<HTMLElement>("#tour-hud-kicker")!;
	const items = [...el.querySelectorAll<HTMLElement>(".tour-step")],
		nav = [...el.querySelectorAll<HTMLButtonElement>("[data-go]")];
	let active = -1,
		rankRaf = 0;
	const animateRank = (stageEl: HTMLElement) => {
		cancelAnimationFrame(rankRaf);
		const big = stageEl.querySelector<HTMLElement>(".tour-big"),
			numEl = stageEl.querySelector<HTMLElement>(".tour-big-num");
		if (!big || !numEl) return;
		const rank = Number(big.dataset.rank),
			total = Number(big.dataset.total);
		if (!Number.isFinite(rank) || reduced()) {
			numEl.textContent = `#${nf(rank)}`;
			return;
		}
		const start = Math.min(
				total,
				Math.max(rank + 120, Math.round(total * 0.08)),
			),
			t0 = performance.now(),
			dur = 750;
		const tick = (now: number) => {
			const p = Math.min(1, (now - t0) / dur),
				eased = 1 - (1 - p) ** 3;
			const val = Math.max(rank, Math.round(start - (start - rank) * eased));
			numEl.textContent = `#${nf(p >= 1 ? rank : val)}`;
			if (p < 1) rankRaf = requestAnimationFrame(tick);
		};
		rankRaf = requestAnimationFrame(tick);
	};
	const show = (i: number) => {
		if (i === active) return;
		active = i;
		cancelAnimationFrame(rankRaf);
		visuals.forEach((v, n) => {
			v.classList.toggle("is-active", n === i);
			v.setAttribute("aria-hidden", String(n !== i));
		});
		hudPhase.textContent = `PHASE 0${i + 1} / 0${steps.length}`;
		hudKicker.textContent = steps[i].kicker;
		if (!reduced()) {
			stage.classList.remove("is-switching");
			void stage.offsetWidth;
			stage.classList.add("is-switching");
		}
		items.forEach((it) =>
			it.classList.toggle("on", Number(it.dataset.s) === i),
		);
		nav.forEach((b, n) => {
			b.classList.toggle("is-done", n < i);
			if (n === i) b.setAttribute("aria-current", "step");
			else b.removeAttribute("aria-current");
		});
		stage.querySelectorAll("video").forEach((v) => v.pause());
		const vid = visuals[i].querySelector<HTMLVideoElement>("video");
		if (vid) {
			if (!vid.src && vid.dataset.src) vid.src = vid.dataset.src;
			void vid.play().catch(() => {
				/* autoplay blocked: the poster stays */
			});
		}
		if (steps[i].id === "blind") animateRank(visuals[i]);
		steps[i].onShow?.(visuals[i]);
	};
	const sc = scroller(el);
	const scrollTarget: HTMLElement | Window = sc ?? window;
	const syncProg = () => {
		const prog = sc
			? sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight)
			: window.scrollY /
				Math.max(1, document.documentElement.scrollHeight - innerHeight);
		tourEl.style.setProperty(
			"--tour-prog",
			Math.max(0, Math.min(1, prog)).toFixed(4),
		);
	};
	syncProg();
	scrollTarget.addEventListener("scroll", syncProg, { passive: true });
	const io = new IntersectionObserver(
		(es) => {
			if (!el.isConnected) {
				io.disconnect();
				return;
			}
			const hit = es
				.filter((e) => e.isIntersecting)
				.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
			if (hit) show(Number((hit.target as HTMLElement).dataset.s));
		},
		{ root: sc, rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.5, 1] },
	);
	items.forEach((it) => io.observe(it));
	const go = (i: number) => {
		const it = items[Math.max(0, Math.min(items.length - 1, i))];
		const headH = headEl.getBoundingClientRect().height,
			behavior: ScrollBehavior = reduced() ? "auto" : "smooth";
		if (sc) {
			const scRect = sc.getBoundingClientRect(),
				itRect = it.getBoundingClientRect(),
				avail = sc.clientHeight - headH;
			sc.scrollTo({
				top: Math.max(
					0,
					sc.scrollTop +
						(itRect.top - scRect.top) -
						headH -
						Math.max(0, (avail - itRect.height) / 2),
				),
				behavior,
			});
		} else {
			const itRect = it.getBoundingClientRect(),
				avail = innerHeight - headH;
			window.scrollTo({
				top: Math.max(
					0,
					window.scrollY +
						itRect.top -
						headH -
						Math.max(0, (avail - itRect.height) / 2),
				),
				behavior,
			});
		}
	};
	nav.forEach((b, n) => b.addEventListener("click", () => go(n)));
	const key = (e: KeyboardEvent) => {
		if (!el.isConnected || !el.querySelector("#tour")) {
			removeEventListener("keydown", key);
			return;
		}
		if ((e.target as HTMLElement)?.closest?.("input, textarea, select, video"))
			return;
		if (
			e.key === "ArrowDown" ||
			e.key === "ArrowRight" ||
			e.key === "PageDown"
		) {
			go(active + 1);
			e.preventDefault();
		}
		if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
			go(active - 1);
			e.preventDefault();
		}
	};
	addEventListener("keydown", key);
	show(0);
	return () => {
		io.disconnect();
		ro?.disconnect();
		cancelAnimationFrame(rankRaf);
		scrollTarget.removeEventListener("scroll", syncProg);
		removeEventListener("keydown", key);
		stage.querySelectorAll("video").forEach((v) => v.pause());
		maps.splice(0).forEach((x) => x.remove());
	};
}

/** Nearest scrolling ancestor (the page view scrolls inside the app shell, not the window); null = the viewport. */
function scroller(el: HTMLElement): HTMLElement | null {
	for (
		let n: HTMLElement | null = el;
		n && n !== document.body;
		n = n.parentElement
	) {
		const o = getComputedStyle(n).overflowY;
		if (o === "auto" || o === "scroll") return n;
	}
	return null;
}
export { render as renderTour };

/** Best Earth window (equal weights) of a target, from the exported columns. */
async function bestWindow(t: Target, m: Manifest) {
	const d = await loadTarget(t.id);
	let k = 0;
	for (let i = 1; i < d.n; i++) if (d.combined[i] > d.combined[k]) k = i;
	return {
		lon: d.lon[k] / m.scale.lonlat,
		lat: d.lat[k] / m.scale.lonlat,
		site: d.site[k],
		score: d.combined[k] / m.scale.score,
	};
}

/** Low-Sun windows CSV (start_utc,end_utc,minutes,…) -> mean minutes per day for each month present, in calendar order of the file. */
function monthlyMinutes(csv: string) {
	const sum = new Map<string, { total: number; days: Set<string> }>();
	for (const line of csv.trim().split(/\r?\n/).slice(1)) {
		const [start, , minutes] = line.split(",");
		const ym = start.slice(0, 7),
			e = sum.get(ym) ?? { total: 0, days: new Set<string>() };
		e.total += Number(minutes);
		e.days.add(start.slice(0, 10));
		sum.set(ym, e);
	}
	return [...sum.entries()].map(([ym, e]) => ({
		label: MONTHS[Number(ym.slice(5, 7)) - 1],
		min: e.total / e.days.size,
	}));
}

/** Step 1 visual: a small globe that flies to the site. MapLibre is loaded only here; without WebGL the panel keeps its static backdrop. */
let flown: WeakSet<HTMLElement> | null = null;
async function flyTo(
	stage: HTMLElement,
	lon: number,
	lat: number,
	maps: { remove(): void }[],
) {
	const box = stage.querySelector<HTMLElement>("#tour-map");
	if (!box || (flown ??= new WeakSet()).has(box)) return;
	flown.add(box);
	if (!hasWebGL()) {
		box.classList.add("static");
		return;
	}
	try {
		const [{ default: maplibregl }] = await Promise.all([
			import("maplibre-gl"),
			import("maplibre-gl/dist/maplibre-gl.css"),
		]);
		const map = new maplibregl.Map({
			container: box,
			center: [lon + 70, 10],
			zoom: 1.2,
			interactive: false,
			attributionControl: false,
			renderWorldCopies: false,
			fadeDuration: 0,
			style: {
				version: 8,
				projection: { type: "globe" },
				sources: {
					gibs: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8 },
				},
				layers: [{ id: "imagery", type: "raster", source: "gibs" }],
			},
		});
		if (!box.isConnected) {
			map.remove();
			return;
		}
		maps.push(map);
		map.on("load", () => {
			map.resize();
			const pin = document.createElement("div");
			pin.className = "tour-pin";
			new maplibregl.Marker({ element: pin }).setLngLat([lon, lat]).addTo(map);
			const over = stage.querySelector<HTMLElement>(".tour-over");
			const bottomPad = Math.min(
				Math.round(box.clientHeight * 0.65),
				Math.round((over?.getBoundingClientRect().height ?? 260) + 16),
			);
			const padding = { top: 0, left: 0, right: 0, bottom: bottomPad };
			if (reduced()) map.jumpTo({ center: [lon, lat], zoom: 6.2, padding });
			else
				map.flyTo({
					center: [lon, lat],
					zoom: 6.2,
					padding,
					duration: 4200,
					essential: true,
				});
		});
	} catch {
		box.classList.add("static");
	}
}
