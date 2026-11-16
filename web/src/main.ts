import './tokens.css';
import './style.css';
import { loadManifest } from './data';
import { mountExplore, type Explore } from './explore';
import { mountHome } from './intro';
import { loadHome } from './lib/homeload';
import { VIEWS, enhance } from './pages';
import { startRouter } from './lib/router';
import { ROUTES, type Parsed } from './lib/routes';
import { icon } from './icons';
import { $, setTheme } from './ui';
import { footerHTML } from './footer';

const TITLE = 'P.E.N. · Planetary Environmental Navigator';
const primary = ROUTES.filter(r => r.nav === 'primary'), tour = ROUTES.find(r => r.nav === 'secondary')!;

async function boot() {
  const app = $('#app');
  const m = await loadManifest();
  const q = new URLSearchParams(location.search);
  const home = await loadHome(m);            // Home facts: the blind-test headline target (Malapert Massif) is the default target
  const t0 = m.targets.find(x => x.id === q.get('target')) ?? m.targets.find(x => x.id === home.facts?.target.id) ?? m.targets[0];
  app.innerHTML = `<header class="bar">
    <a class="brand" href="#/" aria-label="P.E.N. home"><svg class="brand-mark" viewBox="1336 56 400 400" aria-hidden="true" focusable="false"><defs><clipPath id="bm"><circle cx="1536" cy="256" r="200"/></clipPath></defs><g clip-path="url(#bm)" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round"><path d="M1536 56V456"/><ellipse cx="1536" cy="256" rx="100" ry="200"/><ellipse cx="1536" cy="256" rx="155" ry="200"/><path d="M1336 189.333H1736M1336 322.667H1736"/></g><path d="M1536 56V456A200 200 0 0 1 1536 56Z" fill="var(--bg)" fill-opacity=".65"/><circle cx="1536" cy="256" r="200" fill="none" stroke="currentColor" stroke-width="12"/><rect x="1682.14" y="158.221" width="44" height="44" transform="rotate(45 1682.14 158.221)" fill="var(--logo-gold)"/></svg><b>P.E.N.</b><span>Planetary Environmental Navigator</span></a>
    <nav class="nav" id="nav" aria-label="Views">${primary.map(r => `<a href="#/${r.path}" data-r="${r.id}">${r.title}</a>`).join('')}<a class="only-phone" href="#/${tour.path}" data-r="${tour.id}">${tour.title}</a>${home.facts?.rhoRange ? `<a class="only-phone seal-m" href="#/proof">Light model vs NASA LOLA · ρ ${home.facts.rhoRange}</a>` : ''}</nav>
    <div class="crumbs" id="crumbs" hidden></div>
    <div class="grow"></div>
    <a class="seal" id="seal" href="#/proof" ${home.facts?.rhoRange ? '' : 'hidden'} aria-label="Validation: light model against NASA LOLA">${home.facts?.rhoRange ? `<span class="seal-l">Light model vs NASA LOLA · </span>ρ ${home.facts.rhoRange}` : ''}</a>
    <a class="nav-tour" href="#/${tour.path}" data-r="${tour.id}">${tour.title}</a>
    <button class="icon-btn" id="theme" aria-label="Switch to light or dark theme"><span class="only-dark">${icon.sun}</span><span class="only-light">${icon.moon}</span></button>
    <button class="icon-btn menu" id="menu" aria-label="Menu" aria-expanded="false" aria-controls="nav">${icon.menu}</button>
  </header><div id="stage"></div><div class="page" id="page" hidden></div>`;
  const stage = $('#stage'), page = $('#page');
  const ex: Explore = mountExplore(stage, m, () => document.documentElement.dataset.theme ?? 'dark', t0.id);
  $('#theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  const nav = $('#nav'), menu = $('#menu');
  menu.addEventListener('click', () => { const o = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(o)); });
  nav.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); });

  let introOn = false, intro: { finish(): void } | null = null, overviewDone = false;
  const menuClose = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { menuClose(); menu.focus(); } });
  const router = startRouter({
    m, page, views: VIEWS,
    onChange(p: Parsed) {
      document.querySelectorAll<HTMLElement>('[data-r]').forEach(a => { if (a.dataset.r === p.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      document.title = (p.id === 'home' ? '' : `${p.def.title} · `) + TITLE;
      if (!p.def.stage) ex.view.stop();                              // no camera animation keeps rendering into the hidden map
      stage.hidden = !p.def.stage; page.hidden = p.def.stage;
      if (!p.def.stage) $('#crumbs').hidden = true;                 // the Explore breadcrumbs only belong to the map views
      if (p.id === 'home' && !intro && q.get('intro') !== '0') {
        introOn = true;
        intro = mountHome(stage, { m, view: ex.view, targetName: t0.name });
      }
      if (p.id !== 'home' && intro) { const i = intro; intro = null; introOn = false; i.finish(); }
      if (p.id === 'explore' && (p.params.target || p.params.region)) ex.focus(p.params);
      if (p.def.stage) {
        ex.show(!introOn);
        requestAnimationFrame(() => ex.view.resize());
        if (!introOn && !overviewDone) { overviewDone = true; ex.ready.then(() => ex.overview(true)); }
      }
    },
    afterPage() { enhance(page); page.insertAdjacentHTML('beforeend', footerHTML(m).replace('class="foot"', 'class="foot static"')); page.querySelector('#credits-btn')?.remove(); },
  });
  (window as unknown as { __pen: unknown }).__pen = ex;
}
boot();
