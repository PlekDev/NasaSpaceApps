import './tokens.css';
import './style.css';
import { loadManifest } from './data';
import { mountExplore, type Explore } from './explore';
import { mountIntro } from './intro';
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
  const t0 = m.targets.find(x => x.id === q.get('target')) ?? m.targets[0];
  app.innerHTML = `<header class="bar">
    <a class="brand" href="#/" aria-label="P.E.N. home"><b>P.E.N.</b><span>Planetary Environmental Navigator</span></a>
    <nav class="nav" id="nav" aria-label="Views">${primary.map(r => `<a href="#/${r.path}" data-r="${r.id}">${r.title}</a>`).join('')}<a class="only-phone" href="#/${tour.path}" data-r="${tour.id}">${tour.title}</a></nav>
    <div class="grow"></div>
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
      stage.hidden = !p.def.stage; page.hidden = p.def.stage;
      if (p.id === 'home' && !intro && q.get('intro') !== '0') {
        introOn = true;
        intro = mountIntro(stage, t0, ex.view, () => { introOn = false; intro = null; if (router.current().id === 'home') router.navigate('explore'); }, m);
      }
      if (p.id !== 'home' && intro) { const i = intro; intro = null; introOn = false; i.finish(); }
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
