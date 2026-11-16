/** Guided tour (#/tour): interactive Mission Briefing condensing Explore, Proof, Limits, When, Mission, and Dossier.
 * Every number and preview path comes directly from exported repo data (web/public/data + manifest).
 * Steps activate via scroll (IntersectionObserver), sticky step nav buttons, arrow keys, or interactive lunar target switching.
 * AI-assisted (Claude Code); reviewed by the author. */
import './tour.css';
import { BASE } from '../base';
import { esc, nf, pyFixed } from '../format';
import { getJSON, loadDetail, loadTarget } from '../data';
import { castShadow, hillshade, loadSimGrid, loadSimTarget, planRoute, toGridAz, type Grid } from '../sim/index';
import { blindProof, type Ranks } from '../proof';
import { hasWebGL } from '../view';
import type { Manifest, Target } from '../types';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_SITE: Record<string, string> = {
  moon_connecting_ridge: 'Connecting',
  moon_nobile_rim1: 'Nobile 1',
  moon_de_gerlache_rim: 'de Gerlache',
  moon_malapert: 'Malapert',
  moon_haworth: 'Haworth',
  moon_leibnitz_beta: 'Leibnitz',
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const range = (a: number[], d: number) => `${pyFixed(Math.min(...a), d)}–${pyFixed(Math.max(...a), d)}`;
/** "top 0.2 %" as the README writes it; below 0.05 % it reads "top < 0.1 %". */
const topShare = (rank: number, n: number) => {
  const p = (rank / n) * 100;
  return p < 0.05 ? 'top < 0.1 %' : `top ${p.toFixed(1)} %`;
};
const optional = <T>(name: string) => getJSON<T>(name).catch(() => null);

interface Step { id: string; kicker: string; title: string; text: string; visual: string; cta?: [string, string]; onShow?: (stage: HTMLElement) => void }
interface BestWin { lon: number; lat: number; site: number; score: number; terrain: number; illum: number; wid: string }
interface LightSite {
  target: string; label: string; n_points: number;
  spearman_rho: { local_flat: number; far_curved: number }; mean_abs_error: { local_flat: number; far_curved: number };
  bland_altman: { bias: number };
  residual_map: { ny: number; nx: number; model_minus_nasa: (number | null)[][]; nasa: (number | null)[][]; model: (number | null)[][]; abs_max: number };
  psr: { nasa_psr_share: number; model_psr_share: number; agreement: number; iou: number };
}
interface LimitsSite {
  target: string; name: string;
  thermal: { target: { mean_K: number; min_K: number; max_K: number }; earth_record_low_K: number; coldest_earth_region: { name: string; mean_K: number }; gap_to_coldest_earth_K: number };
  gravity: { target_m_s2: number; ratio: number };
  fidelity: { site: string; name: string; score_combined: number; thermal: { earth_mean_K: number; gap_K: number }; terrain: { score: number }; illumination: { score: number } }[];
  ice?: { share_stable_within_1m: number; median_depth_m: number; share_below_110K: number; share_colder_than_earth_record: number };
}
interface CampaignData {
  months: { label: string; min: number; morningMin: number; eveningMin: number }[];
  morningAz: [number, number] | null;
  eveningAz: [number, number] | null;
  windows: { date: string; utc: string; minutes: number; az: string; kind: string }[];
}

const REGION_SHORT: Record<string, string> = {
  earth_hawaii_mauna_kea: 'Mauna Kea (HI)',
  earth_mx_serdan_oriental: 'Serdán-Oriental (MX)',
  earth_mx_valle_santiago: 'Valle Santiago (MX)',
  earth_mx_ceboruco: 'Ceboruco (MX)',
  earth_atacama_yungay: 'Atacama (CL)',
  earth_antarctica_university_valley: 'Antarctica (AQ)',
};

export async function render(el: HTMLElement, m: Manifest, _params?: Record<string, string>): Promise<() => void> {
  const [kr, far, gap, rover, nul, credits] = await Promise.all([
    getJSON<Ranks>('known_ranks'),
    getJSON<Rec>('far_horizons'),
    optional<Rec>('thermal_gap'),
    optional<Rec>('rover_twin'),
    optional<Rec>('stats/null'),
    optional<Record<string, string>>('credits'),
  ]);

  const proof = blindProof(kr, m);
  const lunarTargets = m.targets.filter(t => t.body === 'moon');
  let hero = m.targets.find(t => t.id === proof?.best.id) ?? lunarTargets[0] ?? m.targets[0];
  const name = (id: string) => m.targets.find(t => t.id === id)?.name ?? id;
  const shortName = (id: string) => SHORT_SITE[id] ?? name(id);

  const lightCache = new Map<string, Promise<LightSite | null>>();
  const limitsCache = new Map<string, Promise<LimitsSite | null>>();
  const csvCache = new Map<string, Promise<CampaignData | null>>();
  const fetchLight = (tid: string) => {
    if (!lightCache.has(tid)) lightCache.set(tid, optional<LightSite>(`light/${tid}`));
    return lightCache.get(tid)!;
  };
  const fetchLimits = (tid: string) => {
    if (!limitsCache.has(tid)) limitsCache.set(tid, optional<LimitsSite>(`limits/${tid}`));
    return limitsCache.get(tid)!;
  };
  const fetchCampaign = (rid: string) => {
    if (!csvCache.has(rid)) {
      const b = m.briefs[rid];
      csvCache.set(
        rid,
        b?.csv
          ? fetch(`${BASE}extras/briefs/${b.csv}`)
              .then(r => (r.ok ? r.text() : Promise.reject(new Error(b.csv))))
              .then(parseCampaignCsv)
              .catch(() => null)
          : Promise.resolve(null),
      );
    }
    return csvCache.get(rid)!;
  };

  let best = await bestWindow(hero, m);
  let region = m.regions[best.site];
  let activeWhenRegion = m.briefs[region.id] ? region.id : (Object.keys(m.briefs)[0] ?? region.id);
  const [initLight, initLimits, initCampaign] = await Promise.all([
    fetchLight(hero.id),
    fetchLimits(hero.id),
    fetchCampaign(activeWhenRegion),
  ]);
  const sites = Object.entries(far.sites as Rec) as [string, Rec][];
  const rho = sites.map(([, v]) => v.V3_far_curved.spearman_rho as number);
  const maxKm = pyFixed(far.settings.max_distance_m / 1000);
  const siteStats = (id: string) => far.sites?.[id] ?? sites[0][1];
  const brief = m.briefs[region.id];
  const lightDeltaHtml = (tid: string, ls: LightSite | null) => {
    const fs = siteStats(tid);
    const v3 = ls?.spearman_rho.far_curved ?? (fs.V3_far_curved.spearman_rho as number);
    const v1 = ls?.spearman_rho.local_flat ?? (fs.V1_local_flat.spearman_rho as number);
    const agree = ls?.psr.agreement ?? (fs.psr?.agreement as number | undefined);
    const mae = ls?.mean_abs_error.far_curved ?? (fs.V3_far_curved.mean_abs_error as number);
    const bias = ls?.bland_altman.bias ?? (fs.V3_far_curved.bias as number);
    const bSign = bias > 0 ? '+' : bias < 0 ? '−' : '';
    return `<span class="tour-delta-site">${esc(name(tid))}</span>
      <div class="tour-delta-row"><span>Far horizons (${maxKm} km)</span><b class="tnum">${v3.toFixed(3)}</b></div>
      <div class="tour-delta-row"><span>Local only (${m.window_km} km)</span><span class="tnum">${v1.toFixed(3)}</span></div>
      <div class="tour-delta-row is-gain"><span>Horizon gain</span><span class="tour-delta-badge tnum">+${(v3 - v1).toFixed(3)} ρ</span></div>
      <div class="tour-delta-mini">
        <div><span>PSR agree</span><b class="tnum">${agree != null ? `${pyFixed(agree * 100)} %` : '—'}</b></div>
        <div><span>MAE</span><b class="tnum">${pyFixed(mae * 100)} pp</b></div>
        <div><span>Bias</span><b class="tnum">${bSign}${pyFixed(Math.abs(bias) * 100)} pp</b></div>
      </div>`;
  };

  const limitsBodyHtml = (tid: string, lim: LimitsSite | null) => {
    if (!gap?.summary) return '';
    const s = gap.summary, gaps = Object.values(s.gap_to_coldest_earth_mean_K as Record<string, number>);
    const coldest = gap.earth[s.coldest_earth_region], K = (v: number) => `${Math.max(0, Math.min(100, (v / 360) * 100)).toFixed(1)}%`;
    const tName = lim?.name ?? name(tid);
    const tTherm = lim?.thermal.target;
    const moonLo = tTherm?.min_K ?? s.moon_mean_K[0], moonHi = tTherm?.max_K ?? s.moon_mean_K[1], moonMean = tTherm?.mean_K ?? s.moon_mean_K[0];
    const earthRec = lim?.thermal.earth_record_low_K ?? 183.9;
    const coldMean = lim?.thermal.coldest_earth_region.mean_K ?? s.coldest_earth_mean_K;
    const coldLabel = lim?.thermal.coldest_earth_region.name ?? coldest?.label ?? 'Coldest Earth';
    const gapK = lim?.thermal.gap_to_coldest_earth_K ?? Math.min(...gaps);
    const ice = lim?.ice;
    const fidelityRows = (lim?.fidelity ?? []).slice(0, 5);
    const earthMauna = gap.earth?.earth_hawaii_mauna_kea?.ts_mean_K as number | undefined;
    const earthAtacama = gap.earth?.earth_atacama_yungay?.ts_mean_K as number | undefined;
    const band = (idx: number, cls: string, lab: string, lo: number, hi: number, val: string, meanMark?: number) =>
      `<div class="tour-trow" style="--i:${idx}"><span class="tour-bl">${lab}</span><span class="tour-tplot"><i class="${cls}" style="left:${K(lo)};width:calc(${K(hi)} - ${K(lo)})"></i>${meanMark != null ? `<em class="tour-tmean" style="left:${K(meanMark)}" title="Annual mean ${pyFixed(meanMark)} K"></em>` : ''}</span><b class="tnum">${val}</b></div>`;
    const fidCards: { cls: 'ok' | 'no'; label: string; detail: string }[] = [
      { cls: 'ok', label: 'Terrain', detail: '30 m DEM · 5 morphometrics' },
      { cls: 'ok', label: 'Low-Sun light', detail: `0–7° Sun · ρ ${range(rho, 2)}` },
      { cls: 'no', label: 'Temperature', detail: `${pyFixed(moonMean)} K mean vs ${pyFixed(coldMean)} K` },
      { cls: 'no', label: 'Gravity', detail: lim ? `${lim.gravity.target_m_s2} m/s² (${lim.gravity.ratio} g)` : 'Moon 0.165 g · Mars 0.38 g' },
      { cls: 'no', label: 'Vacuum', detail: '3×10⁻¹⁵ bar lunar exosphere' },
      { cls: 'no', label: 'Radiation', detail: 'GCR & solar particle flux' },
    ];
    const maxGap = Math.max(1, ...fidelityRows.map(f => f.thermal.gap_K));
    return `<div class="tour-gap-banner">
        <div><span>Thermal gap · ${esc(tName)}</span><b class="tnum">+${pyFixed(gapK)} K warmer at coldest Earth analog</b></div>
        <span class="tnum tour-rec-pill">Earth record low: ${pyFixed(earthRec)} K · Diviner cold traps &lt; 110 K</span>
      </div>
      <div class="tour-limits-split">
        <div class="tour-limits-col">
          <div class="tour-temp-card">
            <div class="tour-lt-head">Cryogenic temperature spectrum (0 – 360 K)</div>
            <div class="tour-temp" role="img" aria-label="Temperatures in kelvin for ${esc(tName)} (${pyFixed(moonLo)}–${pyFixed(moonHi)} K), Mars (${range(s.mars_mean_K, 0)} K), and Earth regions">
              <div class="tour-temp-guides" aria-hidden="true">
                <div class="tour-coldtrap" style="width:${K(110)}"><span>Ice trap &lt;110 K</span></div>
                <div class="tour-earthrec" style="left:${K(earthRec)}"><span>Earth min ${pyFixed(earthRec)} K</span></div>
              </div>
              ${band(0, 't-moon', esc(shortName(tid)), moonLo, moonHi, `${pyFixed(moonLo)}–${pyFixed(moonHi)} K`, moonMean)}
              ${band(1, 't-mars', 'Mars sites', s.mars_mean_K[0], s.mars_mean_K[1], `${range(s.mars_mean_K, 0)} K`)}
              ${band(2, 't-earth', 'Antarctica (coldest)', coldMean, coldMean, `${pyFixed(coldMean)} K`)}
              ${earthAtacama ? band(3, 't-earth', 'Atacama Yungay', gap.earth.earth_atacama_yungay.ts_min_K, gap.earth.earth_atacama_yungay.ts_max_K, `${pyFixed(earthAtacama)} K`, earthAtacama) : ''}
              ${earthMauna ? band(4, 't-earth', 'Mauna Kea (#1)', gap.earth.earth_hawaii_mauna_kea.ts_min_K, gap.earth.earth_hawaii_mauna_kea.ts_max_K, `${pyFixed(earthMauna)} K`, earthMauna) : ''}
              <div class="tour-ticks tnum">${[0, 100, 200, 300].map(v => `<span style="left:${K(v)}">${v} K</span>`).join('')}</div>
            </div>
          </div>
          ${ice ? `<div class="tour-ice-kpis">
            <div class="tour-ice-kpi"><b class="tnum">${pyFixed(ice.share_colder_than_earth_record * 100)} %</b><span>colder than Earth record (${pyFixed(earthRec)} K)</span></div>
            <div class="tour-ice-kpi"><b class="tnum">${pyFixed(ice.share_stable_within_1m * 100)} %</b><span>ice stable ≤ 1 m (median ${ice.median_depth_m.toFixed(2)} m)</span></div>
            <div class="tour-ice-kpi"><b class="tnum">${pyFixed(ice.share_below_110K * 100)} %</b><span>surface below 110 K cold trap</span></div>
          </div>` : ''}
        </div>
        ${fidelityRows.length ? `<div class="tour-limits-table">
          <div class="tour-lt-head">Top Earth windows for ${esc(shortName(tid))}</div>
          <table><thead><tr><th>Region</th><th>Terr</th><th>Light</th><th>LST</th><th>Thermal gap</th></tr></thead><tbody>
            ${fidelityRows.map(f => `<tr><th scope="row">${esc(f.name.split('/')[0].split(',')[0].trim())}</th><td class="tnum">${pyFixed(f.terrain.score)}</td><td class="tnum">${pyFixed(f.illumination.score)}</td><td class="tnum">${pyFixed(f.thermal.earth_mean_K)} K</td><td class="tnum tour-gap-cell"><span class="tour-gap-bar"><i style="width:${Math.round((f.thermal.gap_K / maxGap) * 100)}%"></i></span>+${pyFixed(f.thermal.gap_K)} K</td></tr>`).join('')}
          </tbody></table>
          <div class="tour-diviner-note"><strong>Why analog testing splits:</strong> Morphometry &amp; 0–7° shadows transfer outdoors; cryogenic thermal vacuum (${pyFixed(moonMean)} K mean, 3×10⁻¹⁵ bar) moves to chamber tests.</div>
        </div>` : ''}
      </div>
      <ul class="tour-fid">${fidCards.map((c, idx) => `<li class="${c.cls}" style="--i:${idx}"><b>${c.label}</b><small>${c.detail}</small></li>`).join('')}</ul>
      <p class="tour-cap">Moon: LRO Diviner (annual mean 2 cm depth &amp; peak); Earth windows: MODIS LST 2025 vs University Valley / Mauna Kea (NASA POWER).</p>`;
  };

  const whenBodyHtml = (rid: string, camp: CampaignData | null) => {
    const b = m.briefs[rid];
    if (!b?.block || !camp || !camp.months.length) return '';
    const regName = m.regions.find(r => r.id === rid)?.name ?? rid;
    const peak = Math.max(...camp.months.map(x => x.min), 1);
    const peakEntry = camp.months.find(x => x.min === peak) ?? camp.months[0];
    const servesLine = (b.serves ?? []).slice(0, 3).join(' · ');
    return `<div class="tour-when-banner">
        <div class="tour-when-main">
          <span class="tour-when-k">Best 14-day rehearsal block · ${esc(regName)}</span>
          <b class="tnum">${esc(b.block)} · ${pyFixed(b.min_day ?? 0)} min/day (Sun 0–7°)</b>
          ${servesLine ? `<span class="tour-when-serves">Serves: ${esc(servesLine)}</span>` : ''}
        </div>
        ${b.calendar ? `<a class="tour-ics-link" href="${BASE}extras/briefs/${esc(b.calendar)}" download>Download .ics</a>` : ''}
      </div>
      <div class="tour-when-split">
        <div class="tour-when-left">
          <div class="tour-month-readout tnum" id="tour-month-readout">${esc(peakEntry.label)} peak: ${pyFixed(peakEntry.min)} min/day (AM ${pyFixed(peakEntry.morningMin)} · PM ${pyFixed(peakEntry.eveningMin)}) · 100 % of peak</div>
          <div class="tour-months" role="group" aria-label="Minutes per day with the Sun 0–7° at ${esc(regName)}">
            ${camp.months.map((x, idx) => {
              const pct = Math.max(2, Math.round((x.min / peak) * 100));
              const amShare = x.min > 0 ? Math.round((x.morningMin / x.min) * 100) : 50;
              return `<button type="button" class="tour-month${x.min === peak ? ' is-peak is-active' : ''}" data-month="${idx}" data-label="${esc(x.label)}" data-min="${pyFixed(x.min)}" data-am="${pyFixed(x.morningMin)}" data-pm="${pyFixed(x.eveningMin)}" data-pct="${pct}" style="--i:${idx}"><b class="tnum">${pyFixed(x.min)}</b><span class="tour-col"><span class="tour-col-fill" style="height:${pct}%"><i class="is-pm" style="height:${100 - amShare}%"></i><i class="is-am" style="height:${amShare}%"></i></span></span><span>${x.label}</span></button>`;
            }).join('')}
          </div>
          <div class="tour-when-legend"><span><i class="is-am"></i>Morning (East)</span><span><i class="is-pm"></i>Evening (West)</span></div>
        </div>
        <div class="tour-when-right">
          <div class="tour-compass-card">
            <div class="tour-compass-hd"><span>Solar azimuth arcs (0–7° Sun)</span><span class="tnum tour-dim">${camp.morningAz ? `AM ${camp.morningAz[0]}–${camp.morningAz[1]}°` : ''}${camp.eveningAz ? ` · PM ${camp.eveningAz[0]}–${camp.eveningAz[1]}°` : ''}</span></div>
            ${azimuthCompassSvg(camp.morningAz, camp.eveningAz)}
          </div>
          ${camp.windows.length ? `<div class="tour-win-list">
            <div class="tour-lt-head">Next low-Sun rehearsal windows (UTC)</div>
            <table><thead><tr><th>Date</th><th>UTC</th><th>Dur</th><th>Azimuth</th><th></th></tr></thead><tbody>
              ${camp.windows.map(w => `<tr><td class="tnum">${esc(w.date)}</td><td class="tnum">${esc(w.utc)}</td><td class="tnum">${w.minutes}m</td><td class="tnum">${esc(w.az)}°</td><td><span class="tour-kind-pill is-${esc(w.kind)}">${w.kind === 'morning' ? 'AM' : 'PM'}</span></td></tr>`).join('')}
            </tbody></table>
          </div>` : ''}
        </div>
      </div>
      <p class="tour-cap">Real orbital calendar windows when Sun elevation stays 0–7° above the local horizon; switch regions above to compare campaigns.</p>`;
  };

  const hasLow = (wid: string) => m.previews.low.includes(wid);
  const hasReal = (wid: string) => m.previews.real.includes(wid);
  const rankFor = (tid: string) => proof?.ranks.find(r => r.id === tid)?.rank ?? proof?.best.rank ?? 1;
  const totalWins = proof?.best.n ?? m.windows_per_target;
  const pTextFor = (tid: string, r: number) => {
    const pv = nul && nul._stub === false ? nul.pu_uhiwahine?.[tid]?.p_value_region_matched : null;
    return typeof pv === 'number' ? `p = ${pyFixed(pv, 3)}` : topShare(r, totalWins);
  };
  const twinThumbsHtml = (t: Target, b: BestWin) => {
    const regName = m.regions[b.site]?.name ?? region.name;
    const moonLow = `${BASE}thumbs/ref/${t.id}.jpg`;
    const earthLow = hasLow(b.wid) ? `${BASE}thumbs/win/${b.wid}.jpg` : (t.thumb ? `${BASE}thumbs/${t.thumb}` : moonLow);
    const moonReal = `${BASE}thumbs/ref_real/${t.id}.jpg`;
    const earthReal = hasReal(b.wid) ? `${BASE}thumbs/real/${b.wid}.jpg` : null;
    const moonCredit = credits?.[`ref__${t.id}`] ?? 'LRO NAC mosaic';
    const earthCredit = credits?.[b.wid] ?? 'NASA GIBS imagery';
    return `
      <figure class="tour-twin-cell"><img src="${moonLow}" alt="${esc(t.name)} modelled 3° low Sun"><figcaption><b>${esc(shortName(t.id))}</b> · 3° Sun</figcaption></figure>
      <figure class="tour-twin-cell"><img src="${earthLow}" alt="${esc(regName)} modelled 3° low Sun"><figcaption><b>${esc(regName)}</b> · 3° Sun</figcaption></figure>
      <figure class="tour-twin-cell"><img src="${moonReal}" alt="${esc(t.name)} real view (${esc(moonCredit)})"><figcaption>LRO NAC real</figcaption></figure>
      ${earthReal ? `<figure class="tour-twin-cell"><img src="${earthReal}" alt="${esc(regName)} real view (${esc(earthCredit)})"><figcaption>NASA GIBS real</figcaption></figure>` : ''}`;
  };
  const missionTableHtml = (tid: string, regName: string) => {
    const rv = rover?.[tid];
    if (!rv) return '';
    const tName = name(tid);
    const rows: { label: string; tVal: string; eVal: string; tNum: number; eNum: number }[] = [
      { label: 'Length', tVal: `${rv.target.length_km.toFixed(1)} km`, eVal: `${rv.earth.length_km.toFixed(1)} km`, tNum: rv.target.length_km, eNum: rv.earth.length_km },
      { label: 'Climb', tVal: `${nf(rv.target.climb_m)} m`, eVal: `${nf(rv.earth.climb_m)} m`, tNum: rv.target.climb_m, eNum: rv.earth.climb_m },
      { label: 'Max slope', tVal: `${rv.target.max_slope_deg.toFixed(1)}°`, eVal: `${rv.earth.max_slope_deg.toFixed(1)}°`, tNum: rv.target.max_slope_deg, eNum: rv.earth.max_slope_deg },
      { label: 'In shadow', tVal: `${pyFixed(rv.target.share_in_shadow * 100)} %`, eVal: `${pyFixed(rv.earth.share_in_shadow * 100)} %`, tNum: rv.target.share_in_shadow, eNum: rv.earth.share_in_shadow },
    ];
    return `<table class="tour-tele"><thead><tr><th>Metric</th><th>${esc(tName)}</th><th>${esc(regName)}</th><th class="tour-tele-bar-h">Comparison</th></tr></thead><tbody>
      ${rows.map((r, idx) => {
        const hi = Math.max(r.tNum, r.eNum, 1e-6);
        const tw = Math.max(6, Math.round((r.tNum / hi) * 100));
        const ew = Math.max(6, Math.round((r.eNum / hi) * 100));
        return `<tr style="--i:${idx}"><th scope="row">${r.label}</th><td class="tnum">${r.tVal}</td><td class="tnum">${r.eVal}</td>
          <td class="tour-tele-bars"><span class="tour-mini-pair"><i class="is-moon" style="width:${tw}%" title="${esc(tName)}: ${r.tVal}"></i><i class="is-earth" style="width:${ew}%" title="${esc(regName)}: ${r.eVal}"></i></span></td></tr>`;
      }).join('')}</tbody></table>`;
  };
  const endPairHtml = (t: Target, b: BestWin) => {
    const regName = m.regions[b.site]?.name ?? region.name;
    const earthSrc = hasLow(b.wid) ? `${BASE}thumbs/win/${b.wid}.jpg` : `${BASE}thumbs/ref/${t.id}.jpg`;
    return `<div class="tour-end-thumbs">
        <img src="${BASE}thumbs/ref/${t.id}.jpg" alt="${esc(t.name)} low-Sun reference">
        <img src="${earthSrc}" alt="${esc(regName)} low-Sun analog">
      </div>
      <div class="tour-end-meta">
        <span class="tour-end-kicker">Active mission pair</span>
        <b>${esc(t.name)} ↔ ${esc(regName)}</b>
        <span class="tnum tour-end-nums">Combined score ${pyFixed(b.score)} / 100 · Rank #${nf(rankFor(t.id))} · ${esc(brief?.block ?? 'Campaign calendar ready')}</span>
      </div>`;
  };

  const steps: Step[] = [];
  const maps: { remove(): void; flyTo?(o: Rec): void; jumpTo?(o: Rec): void }[] = [];
  const markers: { setLngLat(c: [number, number]): void }[] = [];

  // 1 · blind test (summary of Explore + Proof)
  if (proof) {
    const r0 = rankFor(hero.id);
    steps.push({
      id: 'blind',
      kicker: 'Blind test',
      title: 'P.E.N. found NASA’s lunar test site without being told',
      text: `Never shown to P.E.N., NASA’s 2012 lunar-polar rehearsal site on Mauna Kea ranks <b>#${nf(proof.best.rank)} of ${nf(proof.best.n)}</b> Earth windows for ${esc(proof.best.name)}. Select any Moon site in the HUD to inspect its match.`,
      visual: `<div class="tour-map" id="tour-map" role="img" aria-label="Globe flying to the best Earth window for ${esc(hero.name)}, on ${esc(region.name)}"></div>
        <div class="tour-map-meta" aria-hidden="true">
          <span class="tour-map-site">PUʻU HIWAHINE · ${esc(region.name)}</span>
          <span class="tnum" id="tour-map-coords">${best.lat.toFixed(3)}° N, ${Math.abs(best.lon).toFixed(3)}° W · ${m.window_km}×${m.window_km} km · 30 m/px</span>
        </div>
        <div class="tour-over">
          <div class="tour-over-grid">
            <div class="tour-over-left">
              <div class="tour-over-head">
                <div class="tour-big tnum" id="tour-hero-big" data-rank="${r0}" data-total="${proof.best.n}"><span class="tour-big-num" id="tour-hero-rank">#${nf(r0)}</span><span> of ${nf(proof.best.n)}</span></div>
                <div class="tour-badges">
                  <span class="tour-badge-accent tnum" id="tour-hero-score">Score ${pyFixed(best.score)}/100</span>
                  <span class="tour-badge-ok tnum" id="tour-hero-pval">${esc(pTextFor(hero.id, r0))}</span>
                </div>
              </div>
              <div class="tour-ranks" role="group" aria-label="Blind ranks across Moon Base sites">
                ${proof.ranks.map((r, idx) => `<button type="button" class="tour-rank${r.id === hero.id ? ' is-selected' : ''}" data-rank-target="${r.id}" style="--i:${idx}"><span>${esc(name(r.id))}</span><b class="tnum">#${nf(r.rank)}</b><span class="tnum tour-dim">${topShare(r.rank, r.n)}</span></button>`).join('')}
              </div>
            </div>
            <div class="tour-over-right">
              <div class="tour-twin-hd"><span id="tour-twin-pair">${esc(hero.name)} ↔ ${esc(region.name)}</span><span class="tnum tour-dim" id="tour-twin-sub">Terrain ${pyFixed(best.terrain)} · Light ${pyFixed(best.illum)}</span></div>
              <div class="tour-twin-grid" id="tour-twin-grid">${twinThumbsHtml(hero, best)}</div>
            </div>
          </div>
          <p class="tour-cap">Click any Moon Base site to compare its #1 Earth window (low-Sun 3° model vs NASA real imagery) across ${nf(proof.best.n)} windows.</p>
        </div>`,
      cta: ['See the proof', '#/proof'],
      onShow: stage => { void flyTo(stage, best.lon, best.lat, maps, markers); },
    });
  }

  // 2 · light vs NASA (3-map LOLA comparison + interactive Spearman rho gain)
  steps.push({
    id: 'light',
    kicker: 'Light, checked against NASA',
    title: 'Its shadows match NASA’s own illumination maps',
    text: `With mountains up to ${maxKm} km away included, the model reproduces NASA’s LOLA illumination map: Spearman <b>ρ ${range(rho, 2)}</b> at all ${sites.length} Moon Base sites.`,
    visual: `<div class="tour-card">
      <div class="tour-light-stage">
        <div class="tour-light-maps">
          <div class="tour-light-map-grid">
            <figure><figcaption>NASA LOLA (18.6 yr)</figcaption><div class="tour-m-box tour-m-nasa"></div></figure>
            <figure><figcaption>Our Model (${maxKm} km)</figcaption><div class="tour-m-box tour-m-model"></div></figure>
            <figure><figcaption>Diff (Model − NASA)</figcaption><div class="tour-m-box tour-m-res"></div></figure>
          </div>
          <div class="tour-light-scales">
            <span><i class="scale-lit"></i>0 % Shadow → 100 % Lit</span>
            <span><i class="scale-res"></i>Residual (blue darker · amber brighter)</span>
          </div>
        </div>
        <div class="tour-light-delta" id="tour-light-delta">${lightDeltaHtml(hero.id, initLight)}</div>
      </div>
      <div class="tour-legend"><span><i class="k-far"></i>Horizons up to ${maxKm} km</span><span><i class="k-loc"></i>Local terrain only (${m.window_km} km)</span></div>
      <div class="tour-bars" role="group" aria-label="Spearman rho against NASA LOLA per site">
        ${sites.map(([id, v], idx) => `<button type="button" class="tour-bar${id === hero.id ? ' is-selected' : ''}" data-bar-target="${id}" style="--i:${idx}"><span class="tour-bl">${esc(name(id))}</span><span class="tour-pair"><span class="tour-track"><i class="k-far" style="width:${v.V3_far_curved.spearman_rho * 100}%"></i></span><span class="tour-track thin"><i class="k-loc" style="width:${v.V1_local_flat.spearman_rho * 100}%"></i></span></span><b class="tnum">${v.V3_far_curved.spearman_rho.toFixed(2)}</b><span class="tnum tour-dim">${v.V1_local_flat.spearman_rho.toFixed(2)}</span></button>`).join('')}
      </div>
      <p class="tour-cap">Click any Moon Base site to inspect its 60 m illumination grid against NASA LOLA and see why distant mountains explain the shadow gap.</p></div>`,
    cta: ['Open the three proofs', '#/proof'],
    onShow: stageEl => {
      void fetchLight(hero.id).then(ls => { if (ls && stageEl.isConnected) drawTourLightMaps(stageEl, ls); });
    },
  });

  // 3 · where the analogy breaks (cryogenic benchmark + Diviner ice + fidelity scorecard)
  if (gap?.summary) {
    const s = gap.summary, gaps = Object.values(s.gap_to_coldest_earth_mean_K as Record<string, number>);
    steps.push({
      id: 'limits',
      kicker: 'Where the analogy breaks',
      title: 'Earth matches the terrain and the light, not the cold',
      text: `Terrain and light match. Temperature does not: the coldest Earth region we search is still <b>${range(gaps, 0)} K warmer</b> than the Moon Base sites, and most polar ground lies below Earth's all-time cold record.`,
      visual: `<div class="tour-card tour-limits-card" id="tour-limits-body">${limitsBodyHtml(hero.id, initLimits)}</div>`,
      cta: ['See the limits', '#/limits'],
    });
  }

  // 4 · when to go (multi-region campaign switcher + morning/evening histogram + azimuth compass + UTC windows)
  const briefRegions = Object.keys(m.briefs).filter(rid => m.briefs[rid]?.block && m.briefs[rid]?.csv);
  if (brief?.block && initCampaign) {
    steps.push({
      id: 'when',
      kicker: 'Analog in time',
      title: 'It also says when the light is right',
      text: `${esc(region.name)} gets <b>${pyFixed(brief.min_day ?? 0)} minutes a day</b> of lunar-pole light (Sun 0–7°) in its best 14-day block: ${esc(brief.block)}. Switch field campaigns to inspect azimuths and UTC windows.`,
      visual: `<div class="tour-card">
        <div class="tour-when-regions" role="group" aria-label="Select Earth analog campaign region">
          ${briefRegions.map(rid => `<button type="button" class="tour-when-reg${rid === activeWhenRegion ? ' is-selected' : ''}" data-when-region="${rid}">${esc(REGION_SHORT[rid] ?? m.regions.find(r => r.id === rid)?.name ?? rid)}</button>`).join('')}
        </div>
        <div id="tour-when-body">${whenBodyHtml(activeWhenRegion, initCampaign)}</div>
      </div>`,
      cta: ['Open the calendar', '#/when'],
    });
  }

  // 5 · rehearse the mission (summary of Mission + Rover Twin)
  const rv = rover?.[hero.id], ex = m.extras[hero.id] ?? {};
  const mediaHtml = (t: Target, ext: Manifest['extras'][string] | undefined) =>
    ext?.video && !reduced()
      ? `<video class="tour-media" id="tour-twin-video" muted loop playsinline preload="none" poster="${BASE}extras/${ext.twin}" data-src="${BASE}extras/${ext.video}" aria-label="Twin-light timelapse: ${esc(t.name)} and Earth window"></video>`
      : ext?.twin
        ? `<img class="tour-media" id="tour-twin-poster" src="${BASE}extras/${ext.twin}" alt="${esc(t.name)} and its best Earth window under the same low Sun" loading="lazy">`
        : '';
  if (rv || ex.twin) {
    steps.push({
      id: 'mission',
      kicker: 'Mission rehearsal',
      title: 'Rehearse the traverse on Earth before flying it',
      text: rv
        ? `The same route planner on both worlds: a <b>${rv.target.length_km.toFixed(1)} km</b> traverse on ${esc(hero.name)} and its <b>${rv.earth.length_km.toFixed(1)} km</b> twin on ${esc(region.name)}.`
        : `The same low Sun on both worlds: shadows sweep ${esc(hero.name)} and its best Earth window side by side.`,
      visual: `<div class="tour-card">
        <div class="tour-media-head">
          <span class="tour-media-pair" id="tour-mission-pair">${esc(hero.name)} ↔ ${esc(region.name)}</span>
          <div class="tour-media-tabs" role="tablist" aria-label="Mission rehearsal view mode">
            <button type="button" role="tab" aria-selected="true" class="tour-media-tab is-active" data-media-tab="twin">Twin-Light Timelapse</button>
            ${ex.rover ? `<button type="button" role="tab" aria-selected="false" class="tour-media-tab" data-media-tab="rover">Rover Traverse Map</button>` : ''}
          </div>
        </div>
        <div class="tour-media-stage" id="tour-media-stage">
          <div class="tour-media-pane" data-media-panel="twin" id="tour-twin-slot">${mediaHtml(hero, ex)}</div>
          <div class="tour-media-pane" data-media-panel="rover" hidden>
            <div class="tour-rover-grid">
              <figure class="tour-rover-card">
                <figcaption><span id="tour-rover-tname">${esc(hero.name)}</span><span class="tnum tour-dim">${m.window_km}×${m.window_km} km · 2° Sun</span></figcaption>
                <div class="tour-rover-cbox"><canvas id="tour-rover-c-target" width="400" height="400"></canvas></div>
              </figure>
              <figure class="tour-rover-card">
                <figcaption><span id="tour-rover-ename">${esc(region.name)}</span><span class="tnum tour-dim">${m.window_km}×${m.window_km} km · 2° Sun</span></figcaption>
                <div class="tour-rover-cbox"><canvas id="tour-rover-c-earth" width="400" height="400"></canvas></div>
              </figure>
            </div>
            <div class="tour-rover-legend">
              <span><i class="is-route"></i>Least-cost rover path (SW → NE)</span>
              <span><i class="is-shadow"></i>2° Sun shadow</span>
              <span><i class="is-slope"></i>Slope &gt; 20° (impassable)</span>
            </div>
          </div>
        </div>
        <div id="tour-mission-tele">${missionTableHtml(hero.id, region.name)}</div>
        <p class="tour-cap">Sun 2° above the horizon. Least-cost route with the same cost function on both bodies; slopes above 20° are impassable.</p></div>`,
      cta: ['Rehearse a traverse', '#/mission'],
    });
  }

  el.innerHTML = `<div class="tour" id="tour">
    <header class="tour-head"><div><h1>The 60-second tour</h1><p class="muted">Five steps, the whole story. Scroll, switch targets in the HUD, or use arrow keys.</p></div>
      <nav class="tour-nav" aria-label="Tour steps">${steps.map((s, i) => `<button class="tour-nav-btn" data-go="${i}" aria-label="Step ${i + 1}: ${esc(s.kicker)}"><span class="tnum">${i + 1}</span></button>`).join('')}</nav>
      <div class="tour-progress" aria-hidden="true"><i id="tour-progress-bar"></i></div></header>
    <div class="tour-grid">
      <div class="tour-stage" id="tour-stage" aria-live="off">
        <div class="tour-hud">
          <div class="tour-hud-title" aria-hidden="true">
            <span class="tour-hud-phase tnum" id="tour-hud-phase">PHASE 01 / 0${steps.length}</span>
            <span class="tour-hud-kicker" id="tour-hud-kicker">${esc(steps[0]?.kicker ?? '')}</span>
          </div>
          <div class="tour-hud-targets" role="group" aria-label="Select Moon Base site">
            ${lunarTargets.map(t => `<button type="button" class="tour-hud-pill${t.id === hero.id ? ' is-selected' : ''}" data-tour-target="${t.id}" title="${esc(t.name)}">${esc(shortName(t.id))}</button>`).join('')}
          </div>
          <span class="tour-hud-live" aria-hidden="true"><i class="tour-hud-dot"></i>LOCK</span>
        </div>
        ${steps.map((s, i) => `<div class="tour-visual${i === 0 ? ' is-active' : ''}" data-v="${i}" aria-hidden="${i !== 0}">${s.visual}</div>`).join('')}
      </div>
      <ol class="tour-steps">${steps.map((s, i) => `<li class="tour-step" data-s="${i}" id="tour-${s.id}"><div class="tour-text"><span class="tag">${i + 1} of ${steps.length} · ${esc(s.kicker)}</span><h2>${esc(s.title)}</h2><p>${s.text}</p>
        ${s.cta ? `<a class="link" href="${s.cta[1]}">${esc(s.cta[0])} →</a>` : ''}</div></li>`).join('')}
        <li class="tour-step tour-end" data-s="${steps.length - 1}"><div class="tour-command-card tour-text">
          <span class="tag">Mission ready · ${steps.length} of ${steps.length} verified</span>
          <div class="tour-summary" aria-hidden="true">${steps.map((s, i) => `<span class="tour-sum-chip" style="--i:${i}"><b>0${i + 1}</b> ${esc(s.kicker)}</span>`).join('')}</div>
          <h2>Now try it yourself</h2><p>Pick a Moon or Mars site and inspect terrain, Sun windows, and 3D rover traverses.</p>
          <div class="tour-end-pair" id="tour-end-pair">${endPairHtml(hero, best)}</div>
          <div class="tour-actions">
            <a class="btn primary" href="#/explore">Explore the map</a>
            <a class="btn" id="tour-cta-mission" href="#/mission?target=${encodeURIComponent(hero.id)}">Rehearse in 3D</a>
            <a class="btn" id="tour-cta-dossier" href="#/dossier?target=${encodeURIComponent(hero.id)}&window=${encodeURIComponent(best.wid)}">Mission dossier</a>
          </div></div></li></ol>
    </div></div>`;

  // ---- step activation, HUD target switching & scroll progress
  const tourEl = el.querySelector<HTMLElement>('#tour')!;
  const headEl = el.querySelector<HTMLElement>('.tour-head')!;
  const syncHeadH = () => tourEl.style.setProperty('--tour-head-h', `${Math.ceil(headEl.getBoundingClientRect().height)}px`);
  syncHeadH();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncHeadH) : null;
  ro?.observe(headEl);

  const stage = el.querySelector<HTMLElement>('#tour-stage')!;
  const visuals = [...stage.querySelectorAll<HTMLElement>('.tour-visual')];
  const hudPhase = el.querySelector<HTMLElement>('#tour-hud-phase')!;
  const hudKicker = el.querySelector<HTMLElement>('#tour-hud-kicker')!;
  const items = [...el.querySelectorAll<HTMLElement>('.tour-step')];
  const nav = [...el.querySelectorAll<HTMLButtonElement>('[data-go]')];
  let active = -1;
  let rankRaf = 0;

  const animateRank = (stageEl: HTMLElement, targetRank?: number, targetTotal?: number) => {
    cancelAnimationFrame(rankRaf);
    const big = stageEl.querySelector<HTMLElement>('.tour-big'), numEl = stageEl.querySelector<HTMLElement>('.tour-big-num');
    if (!big || !numEl) return;
    const rank = targetRank ?? Number(big.dataset.rank), total = targetTotal ?? Number(big.dataset.total);
    if (!Number.isFinite(rank) || reduced()) { numEl.textContent = `#${nf(rank)}`; return; }
    const start = Math.min(total, Math.max(rank + 120, Math.round(total * 0.08))), t0 = performance.now(), dur = 750;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), eased = 1 - (1 - p) ** 3;
      const val = Math.max(rank, Math.round(start - (start - rank) * eased));
      numEl.textContent = `#${nf(p >= 1 ? rank : val)}`;
      if (p < 1) rankRaf = requestAnimationFrame(tick);
    };
    rankRaf = requestAnimationFrame(tick);
  };

  const selectTarget = async (tid: string) => {
    const nextHero = lunarTargets.find(t => t.id === tid);
    if (!nextHero) return;
    hero = nextHero;
    best = await bestWindow(hero, m);
    if (!el.isConnected) return;
    region = m.regions[best.site];
    const rVal = rankFor(hero.id);

    el.querySelectorAll<HTMLElement>('[data-tour-target]').forEach(b => b.classList.toggle('is-selected', b.dataset.tourTarget === tid));
    el.querySelectorAll<HTMLElement>('[data-rank-target]').forEach(b => b.classList.toggle('is-selected', b.dataset.rankTarget === tid));
    el.querySelectorAll<HTMLElement>('[data-bar-target]').forEach(b => b.classList.toggle('is-selected', b.dataset.barTarget === tid));

    const coordsEl = el.querySelector('#tour-map-coords');
    if (coordsEl) coordsEl.textContent = `${best.lat.toFixed(3)}° N, ${Math.abs(best.lon).toFixed(3)}° W · ${m.window_km}×${m.window_km} km · 30 m/px`;
    const scoreEl = el.querySelector('#tour-hero-score');
    if (scoreEl) scoreEl.textContent = `Score ${pyFixed(best.score)}/100`;
    const pvalEl = el.querySelector('#tour-hero-pval');
    if (pvalEl) pvalEl.textContent = pTextFor(tid, rVal);
    const bigEl = el.querySelector<HTMLElement>('#tour-hero-big');
    if (bigEl) { bigEl.dataset.rank = String(rVal); animateRank(visuals[0], rVal, totalWins); }
    const twinPair = el.querySelector('#tour-twin-pair');
    if (twinPair) twinPair.textContent = `${hero.name} ↔ ${region.name}`;
    const twinSub = el.querySelector('#tour-twin-sub');
    if (twinSub) twinSub.textContent = `Terrain ${pyFixed(best.terrain)} · Light ${pyFixed(best.illum)}`;
    const twinGrid = el.querySelector('#tour-twin-grid');
    if (twinGrid) twinGrid.innerHTML = twinThumbsHtml(hero, best);

    markers[0]?.setLngLat([best.lon, best.lat]);
    const mapBox = el.querySelector<HTMLElement>('#tour-map');
    const over = el.querySelector<HTMLElement>('.tour-over');
    if (maps[0]?.flyTo && mapBox) {
      const bottomPad = Math.min(Math.round(mapBox.clientHeight * 0.65), Math.round((over?.getBoundingClientRect().height ?? 260) + 16));
      maps[0].flyTo({ center: [best.lon, best.lat], zoom: 6.2, padding: { top: 0, left: 0, right: 0, bottom: bottomPad }, duration: reduced() ? 0 : 1400, essential: true });
    }

    const [nextLight, nextLimits] = await Promise.all([fetchLight(tid), fetchLimits(tid)]);
    if (!el.isConnected) return;

    const lightDelta = el.querySelector('#tour-light-delta');
    if (lightDelta) lightDelta.innerHTML = lightDeltaHtml(tid, nextLight);
    const lightVisual = visuals.find((_, idx) => steps[idx]?.id === 'light');
    if (nextLight && lightVisual) drawTourLightMaps(lightVisual, nextLight);

    const limitsBody = el.querySelector('#tour-limits-body');
    if (limitsBody) limitsBody.innerHTML = limitsBodyHtml(tid, nextLimits);

    const nextEx = m.extras[tid] ?? {};
    const mPair = el.querySelector('#tour-mission-pair');
    if (mPair) mPair.textContent = `${hero.name} ↔ ${region.name}`;
    const twinSlot = el.querySelector<HTMLElement>('#tour-twin-slot');
    if (twinSlot) {
      twinSlot.innerHTML = mediaHtml(hero, nextEx);
      const activeVid = twinSlot.querySelector<HTMLVideoElement>('video');
      if (activeVid && steps[active]?.id === 'mission') {
        if (!activeVid.src && activeVid.dataset.src) activeVid.src = activeVid.dataset.src;
        void activeVid.play().catch(() => {});
      }
    }
    const roverT = el.querySelector('#tour-rover-tname'), roverE = el.querySelector('#tour-rover-ename');
    if (roverT) roverT.textContent = hero.name;
    if (roverE) roverE.textContent = region.name;
    const roverPane = el.querySelector<HTMLElement>('[data-media-panel="rover"]');
    if (roverPane && !roverPane.hidden) void drawTourRoverCanvases(el, tid);
    const mTele = el.querySelector('#tour-mission-tele');
    if (mTele) mTele.innerHTML = missionTableHtml(tid, region.name);

    const endPair = el.querySelector('#tour-end-pair');
    if (endPair) endPair.innerHTML = endPairHtml(hero, best);
    const ctaMission = el.querySelector<HTMLAnchorElement>('#tour-cta-mission');
    if (ctaMission) ctaMission.href = `#/mission?target=${encodeURIComponent(hero.id)}`;
    const ctaDossier = el.querySelector<HTMLAnchorElement>('#tour-cta-dossier');
    if (ctaDossier) ctaDossier.href = `#/dossier?target=${encodeURIComponent(hero.id)}&window=${encodeURIComponent(best.wid)}`;
  };

  el.querySelectorAll<HTMLButtonElement>('[data-tour-target], [data-rank-target], [data-bar-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.tourTarget ?? btn.dataset.rankTarget ?? btn.dataset.barTarget;
      if (tid) void selectTarget(tid);
    });
  });

  // Step 4 interactive months & multi-region campaign switcher
  const bindMonthEvents = () => {
    const monthReadout = el.querySelector('#tour-month-readout');
    const monthBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-month]')];
    const pickMonth = (btn: HTMLButtonElement) => {
      monthBtns.forEach(b => b.classList.toggle('is-active', b === btn));
      if (monthReadout) monthReadout.textContent = `${btn.dataset.label}: ${btn.dataset.min} min/day (AM ${btn.dataset.am} · PM ${btn.dataset.pm}) · ${btn.dataset.pct} % of peak`;
    };
    monthBtns.forEach(b => {
      b.addEventListener('mouseenter', () => pickMonth(b));
      b.addEventListener('focus', () => pickMonth(b));
      b.addEventListener('click', () => pickMonth(b));
    });
  };
  bindMonthEvents();
  el.querySelectorAll<HTMLButtonElement>('[data-when-region]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rid = btn.dataset.whenRegion;
      if (!rid || rid === activeWhenRegion) return;
      activeWhenRegion = rid;
      el.querySelectorAll<HTMLElement>('[data-when-region]').forEach(x => x.classList.toggle('is-selected', x.dataset.whenRegion === rid));
      void fetchCampaign(rid).then(camp => {
        if (!el.isConnected || activeWhenRegion !== rid) return;
        const body = el.querySelector('#tour-when-body');
        if (body) { body.innerHTML = whenBodyHtml(rid, camp); bindMonthEvents(); }
      });
    });
  });

  // Pre-draw Step 2 NASA/Model/Residual canvases so they are crisp on arrival
  const lightVisualInit = visuals.find((_, idx) => steps[idx]?.id === 'light');
  if (initLight && lightVisualInit) drawTourLightMaps(lightVisualInit, initLight);

  // Step 5 media mode tabs
  const mediaTabs = [...el.querySelectorAll<HTMLButtonElement>('[data-media-tab]')];
  const mediaPanels = [...el.querySelectorAll<HTMLElement>('[data-media-panel]')];
  mediaTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mediaTab;
      mediaTabs.forEach(t => { const on = t === tab; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); });
      mediaPanels.forEach(p => { p.hidden = p.dataset.mediaPanel !== mode; });
      if (mode === 'rover') void drawTourRoverCanvases(el, hero.id);
    });
  });

  const show = (i: number) => {
    if (i === active) return;
    active = i;
    cancelAnimationFrame(rankRaf);
    visuals.forEach((v, n) => { v.classList.toggle('is-active', n === i); v.setAttribute('aria-hidden', String(n !== i)); });
    hudPhase.textContent = `PHASE 0${i + 1} / 0${steps.length}`;
    hudKicker.textContent = steps[i].kicker;
    if (!reduced()) { stage.classList.remove('is-switching'); void stage.offsetWidth; stage.classList.add('is-switching'); }
    items.forEach(it => it.classList.toggle('on', Number(it.dataset.s) === i));
    nav.forEach((b, n) => { b.classList.toggle('is-done', n < i); if (n === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    stage.querySelectorAll('video').forEach(v => v.pause());
    const vid = visuals[i].querySelector<HTMLVideoElement>('video');
    if (vid) { if (!vid.src && vid.dataset.src) vid.src = vid.dataset.src; void vid.play().catch(() => { /* autoplay blocked: the poster stays */ }); }
    if (steps[i].id === 'blind') animateRank(visuals[i]);
    steps[i].onShow?.(visuals[i]);
  };

  const sc = scroller(el);
  const scrollTarget: HTMLElement | Window = sc ?? window;
  const syncProg = () => {
    const prog = sc
      ? sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight)
      : window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    tourEl.style.setProperty('--tour-prog', Math.max(0, Math.min(1, prog)).toFixed(4));
  };
  syncProg();
  scrollTarget.addEventListener('scroll', syncProg, { passive: true });

  const io = new IntersectionObserver(es => {
    if (!el.isConnected) { io.disconnect(); return; }
    const hit = es.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (hit) show(Number((hit.target as HTMLElement).dataset.s));
  }, { root: sc, rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.5, 1] });
  items.forEach(it => io.observe(it));

  const go = (i: number) => {
    const it = items[Math.max(0, Math.min(items.length - 1, i))];
    const headH = headEl.getBoundingClientRect().height, behavior: ScrollBehavior = reduced() ? 'auto' : 'smooth';
    if (sc) {
      const scRect = sc.getBoundingClientRect(), itRect = it.getBoundingClientRect(), avail = sc.clientHeight - headH;
      sc.scrollTo({ top: Math.max(0, sc.scrollTop + (itRect.top - scRect.top) - headH - Math.max(0, (avail - itRect.height) / 2)), behavior });
    } else {
      const itRect = it.getBoundingClientRect(), avail = innerHeight - headH;
      window.scrollTo({ top: Math.max(0, window.scrollY + itRect.top - headH - Math.max(0, (avail - itRect.height) / 2)), behavior });
    }
  };
  nav.forEach((b, n) => b.addEventListener('click', () => go(n)));
  const key = (e: KeyboardEvent) => {
    if (!el.isConnected || !el.querySelector('#tour')) { removeEventListener('keydown', key); return; }
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, video')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') { go(active + 1); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') { go(active - 1); e.preventDefault(); }
  };
  addEventListener('keydown', key);
  show(0);

  return () => {
    io.disconnect();
    ro?.disconnect();
    cancelAnimationFrame(rankRaf);
    scrollTarget.removeEventListener('scroll', syncProg);
    removeEventListener('keydown', key);
    stage.querySelectorAll('video').forEach(v => v.pause());
    maps.splice(0).forEach(x => x.remove());
    markers.splice(0);
  };
}

/** Render synchronized Lunar Target & Earth Analog rover traverse canvases (hillshade, 2° shadow, >20° slopes, least-cost route). */
async function drawTourRoverCanvases(host: HTMLElement, tid: string) {
  const cTarget = host.querySelector<HTMLCanvasElement>('#tour-rover-c-target');
  const cEarth = host.querySelector<HTMLCanvasElement>('#tour-rover-c-earth');
  if (!cTarget || !cEarth) return;
  const paintOne = (canvas: HTMLCanvasElement, g: Grid, upAz: number) => {
    const az = toGridAz(225, upAz);
    const sh = castShadow(g, 2, az);
    const hs = hillshade(g, 2, az, sh);
    const route = planRoute(g);
    const n = g.n, W = canvas.width, H = canvas.height;
    const off = document.createElement('canvas');
    off.width = n; off.height = n;
    const og = off.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!og || !ctx) return;
    const img = og.createImageData(n, n);
    for (let k = 0; k < n * n; k++) {
      const i = k * 4, v = hs[k], isShadow = sh[k] === 1, isBad = route.layers.bad[k] === 1;
      let r = Math.round(v * 215 + 18), gr = Math.round(v * 222 + 22), b = Math.round(v * 234 + 28);
      if (isShadow) { r = Math.round(r * 0.42); gr = Math.round(gr * 0.46); b = Math.round(b * 0.58 + 10); }
      if (isBad) { r = Math.min(255, Math.round(r * 0.65 + 140)); gr = Math.round(gr * 0.45); b = Math.round(b * 0.45); }
      img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, H);
    if (route.path.length > 1) {
      const sx = W / n, sy = H / n;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(5, 7, 11, 0.8)'; ctx.lineWidth = 6;
      ctx.beginPath();
      route.path.forEach(([pr, pc], idx) => { const x = (pc + 0.5) * sx, y = (pr + 0.5) * sy; if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;
      ctx.stroke();
      const [sr, sc0] = route.path[0], [er, ec] = route.path[route.path.length - 1];
      for (const [rr, cc, col] of [[sr, sc0, '#86cba7'], [er, ec, '#94bce3']] as const) {
        ctx.fillStyle = col; ctx.strokeStyle = '#05070b'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc((cc + 0.5) * sx, (rr + 0.5) * sy, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  };
  try {
    const tm = await loadSimTarget(tid);
    const ew = tm.windows[0];
    if (!ew) return;
    const [tGrid, eGrid] = await Promise.all([loadSimGrid(tm.grid), loadSimGrid(ew)]);
    if (!host.isConnected) return;
    paintOne(cTarget, tGrid, tm.grid.up_az);
    paintOne(cEarth, eGrid, ew.up_az);
  } catch { /* fallback silently if offline or sim missing */ }
}

/** Nearest scrolling ancestor (the page view scrolls inside the app shell, not the window); null = the viewport. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if (o === 'auto' || o === 'scroll') return n;
  }
  return null;
}
export { render as renderTour };

/** Best Earth window (equal weights) of a target, from the exported columns + detail window indices. */
async function bestWindow(t: Target, m: Manifest): Promise<BestWin> {
  const [d, det] = await Promise.all([loadTarget(t.id), loadDetail(t.id)]);
  let k = 0;
  for (let i = 1; i < d.n; i++) if (d.combined[i] > d.combined[k]) k = i;
  const ii = det.i as number[], jj = det.j as number[];
  const regId = m.regions[d.site[k]].id;
  const rec = d as unknown as Rec;
  return {
    lon: d.lon[k] / m.scale.lonlat,
    lat: d.lat[k] / m.scale.lonlat,
    site: d.site[k],
    score: d.combined[k] / m.scale.score,
    terrain: (rec.score_terrain?.[k] ?? d.combined[k]) / m.scale.score,
    illum: (rec.score_illumination?.[k] ?? d.combined[k]) / m.scale.score,
    wid: `${regId}_${ii[k]}_${jj[k]}`,
  };
}

/** Draw the 3 illumination grid canvases (NASA LOLA, Our Model 150 km, Residual) from light/<target>.json. */
function drawTourLightMaps(host: HTMLElement, s: LightSite) {
  const m = s.residual_map;
  const px = Math.max(2, Math.floor(156 / Math.max(m.nx, m.ny)));
  const w = m.nx * px, h = m.ny * px;
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const rgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-f]{3,6}$/i.test(clean)) return [148, 188, 227];
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
    `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t)))).join(',')})`;
  const dark = rgb(css('--space') || '#05070b'), light: [number, number, number] = [242, 244, 248];
  const cold = rgb(css('--accent') || '#3987e5'), warm = rgb(css('--warn') || '#e0b060'), mid = rgb(css('--panel-solid') || '#0e1722');

  const paint = (sel: string, grid: (number | null)[][], col: (v: number) => string) => {
    const box = host.querySelector<HTMLElement>(sel);
    if (!box) return;
    const c = box.querySelector('canvas') ?? box.appendChild(document.createElement('canvas'));
    const r = Math.min(devicePixelRatio || 1, 2);
    c.width = w * r; c.height = h * r;
    c.style.aspectRatio = `${w} / ${h}`;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, h);
    grid.forEach((row, ry) => row.forEach((v, cx) => {
      if (v == null) return;
      g.fillStyle = col(v);
      g.fillRect(cx * px, ry * px, px, px);
    }));
  };
  paint('.tour-m-nasa', m.nasa, v => mix(dark, light, v));
  paint('.tour-m-model', m.model, v => mix(dark, light, v));
  paint('.tour-m-res', m.model_minus_nasa, v => {
    const t = Math.max(-1, Math.min(1, v / (m.abs_max || 1)));
    return t < 0 ? mix(mid, cold, -t) : mix(mid, warm, t);
  });
}

/** Parse low-Sun campaign CSV -> monthly AM/PM means, azimuth arcs, and next UTC rehearsal windows. */
function parseCampaignCsv(csv: string): CampaignData {
  const sum = new Map<string, { total: number; am: number; pm: number; days: Set<string> }>();
  let amLo = 360, amHi = 0, pmLo = 360, pmHi = 0, hasAm = false, hasPm = false;
  const allRows: { date: string; utc: string; minutes: number; az: string; kind: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [start, end, minStr, az1Str, az2Str, kindRaw] = line.split(',');
    if (!start || !end) continue;
    const mins = Number(minStr) || 0, az1 = Number(az1Str), az2 = Number(az2Str), kind = (kindRaw ?? '').trim();
    const ym = start.slice(0, 7);
    const e = sum.get(ym) ?? { total: 0, am: 0, pm: 0, days: new Set<string>() };
    e.total += mins;
    if (kind === 'morning') e.am += mins; else e.pm += mins;
    e.days.add(start.slice(0, 10));
    sum.set(ym, e);
    if (Number.isFinite(az1) && Number.isFinite(az2)) {
      const lo = Math.min(az1, az2), hi = Math.max(az1, az2);
      if (kind === 'morning') { hasAm = true; amLo = Math.min(amLo, lo); amHi = Math.max(amHi, hi); }
      else if (kind === 'evening') { hasPm = true; pmLo = Math.min(pmLo, lo); pmHi = Math.max(pmHi, hi); }
    }
    allRows.push({ date: start.slice(0, 10), utc: `${start.slice(11, 16)}–${end.slice(11, 16)}`, minutes: Math.round(mins), az: `${Math.round(az1)}–${Math.round(az2)}`, kind: kind || 'morning' });
  }
  const upcoming = allRows.filter(r => r.date >= today);
  return {
    months: [...sum.entries()].map(([ym, e]) => ({
      label: MONTHS[Number(ym.slice(5, 7)) - 1],
      min: e.total / e.days.size,
      morningMin: e.am / e.days.size,
      eveningMin: e.pm / e.days.size,
    })),
    morningAz: hasAm ? [Math.round(amLo), Math.round(amHi)] : null,
    eveningAz: hasPm ? [Math.round(pmLo), Math.round(pmHi)] : null,
    windows: (upcoming.length ? upcoming : allRows).slice(0, 4),
  };
}

/** Crisp SVG solar azimuth compass showing East (morning) and West (evening) 0–7° Sun sectors. */
function azimuthCompassSvg(am: [number, number] | null, pm: [number, number] | null): string {
  const cx = 60, cy = 60, r = 44;
  const pt = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const arc = (az: [number, number] | null, cls: string) => {
    if (!az) return '';
    const [a0, a1] = az;
    const span = Math.max(8, a1 - a0);
    const [x1, y1] = pt(a0), [x2, y2] = pt(a0 + span);
    const large = span > 180 ? 1 : 0;
    return `<path class="${cls}" d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z"/>`;
  };
  return `<svg class="tour-compass-svg" viewBox="0 0 120 120" aria-hidden="true">
    <circle class="c-ring" cx="${cx}" cy="${cy}" r="${r}"/>
    <circle class="c-inner" cx="${cx}" cy="${cy}" r="24"/>
    <line class="c-axis" x1="${cx}" y1="10" x2="${cx}" y2="110"/><line class="c-axis" x1="10" y1="${cy}" x2="110" y2="${cy}"/>
    ${arc(am, 'c-am')}${arc(pm, 'c-pm')}
    <circle class="c-dot" cx="${cx}" cy="${cy}" r="3"/>
    <text x="${cx}" y="9" text-anchor="middle">N</text><text x="115" y="${cy + 3}" text-anchor="end">E</text>
    <text x="${cx}" y="118" text-anchor="middle">S</text><text x="5" y="${cy + 3}" text-anchor="start">W</text>
  </svg>`;
}

/** Step 1 visual: a globe that flies to the site with bottom padding so .tour-over never covers the pin. */
let flown: WeakSet<HTMLElement> | null = null;
async function flyTo(
  stage: HTMLElement,
  lon: number,
  lat: number,
  maps: { remove(): void; flyTo?(o: Rec): void; jumpTo?(o: Rec): void }[],
  markers: { setLngLat(c: [number, number]): void }[],
) {
  const box = stage.querySelector<HTMLElement>('#tour-map');
  if (!box || (flown ??= new WeakSet()).has(box)) return;
  flown.add(box);
  if (!hasWebGL()) { box.classList.add('static'); return; }
  try {
    const [{ default: maplibregl }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
    const map = new maplibregl.Map({
      container: box, center: [lon + 70, 10], zoom: 1.2, interactive: false, attributionControl: false, renderWorldCopies: false, fadeDuration: 0,
      style: { version: 8, projection: { type: 'globe' }, sources: { gibs: { type: 'raster', tiles: [GIBS], tileSize: 256, maxzoom: 8 } },
        layers: [{ id: 'imagery', type: 'raster', source: 'gibs' }] },
    });
    if (!box.isConnected) { map.remove(); return; }
    maps.push(map);
    map.on('load', () => {
      map.resize();
      const pin = document.createElement('div');
      pin.className = 'tour-pin';
      const mk = new maplibregl.Marker({ element: pin }).setLngLat([lon, lat]).addTo(map);
      markers.push(mk);
      const over = stage.querySelector<HTMLElement>('.tour-over');
      const bottomPad = Math.min(Math.round(box.clientHeight * 0.65), Math.round((over?.getBoundingClientRect().height ?? 260) + 16));
      const padding = { top: 0, left: 0, right: 0, bottom: bottomPad };
      if (reduced()) map.jumpTo({ center: [lon, lat], zoom: 6.2, padding });
      else map.flyTo({ center: [lon, lat], zoom: 6.2, padding, duration: 4200, essential: true });
    });
  } catch { box.classList.add('static'); }
}
