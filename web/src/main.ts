import './tokens.css';
import './style.css';
import { loadManifest } from './data';
import { mountExplore, type Explore } from './explore';
import { mountIntro } from './intro';
import { renderPage } from './pages';
import { icon } from './icons';
import { $, setTheme, isPhone } from './ui';
import { footerHTML } from './footer';

const ROUTES: [string, string][] = [['', 'Explore'], ['time', 'Analog in time'], ['validation', 'Validation'], ['method', 'Method']];
function wireCredits() { /* the credits dialog lives in the Explore view; on pages the footer links to the README instead */ document.querySelector('#page #credits-btn')?.remove(); }
const route = () => location.hash.replace(/^#\/?/, '').split('?')[0];

async function boot() {
  const app = $('#app');
  const m = await loadManifest();
  const q = new URLSearchParams(location.search);
  const t0 = m.targets.find(x => x.id === q.get('target')) ?? m.targets[0];
  app.innerHTML = `<header class="bar">
    <a class="brand" href="#/" aria-label="P.E.N. home"><b>P.E.N.</b><span>Planetary Environmental Navigator</span></a>
    <nav class="nav" id="nav" aria-label="Views">${ROUTES.map(([r, n]) => `<a href="#/${r}" data-r="${r}">${n}</a>`).join('')}</nav>
    <div class="grow"></div>
    <button class="icon-btn" id="theme" aria-label="Switch to light or dark theme"><span class="only-dark">${icon.sun}</span><span class="only-light">${icon.moon}</span></button>
    <button class="icon-btn menu" id="menu" aria-label="Menu" aria-expanded="false" aria-controls="nav">${icon.menu}</button>
  </header><div id="stage"></div><div class="page" id="page" hidden></div>`;
  const stage = $('#stage'), page = $('#page');
  const ex: Explore = mountExplore(stage, m, () => document.documentElement.dataset.theme ?? 'dark', t0.id);
  $('#theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  const nav = $('#nav'), menu = $('#menu');
  menu.addEventListener('click', () => { const o = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(o)); });
  nav.addEventListener('click', () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); });

  let introOn = false;
  const apply = () => {
    const r = route(), explore = r === '';
    nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.r === r));
    nav.querySelectorAll('a').forEach(a => { if (a.dataset.r === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    stage.hidden = !explore; page.hidden = explore;
    ex.show(explore && !introOn);
    if (explore) requestAnimationFrame(() => ex.view.map.resize?.());
    else { page.scrollTop = 0; renderPage(page, r, m).then(() => { page.insertAdjacentHTML('beforeend', footerHTML(m).replace('class="foot"', 'class="foot static"')); document.getElementById('credits-btn') && wireCredits(); }); }
    document.title = (explore ? '' : `${ROUTES.find(x => x[0] === r)?.[1] ?? ''} · `) + 'P.E.N. · Planetary Environmental Navigator';
  };
  addEventListener('hashchange', apply);

  let seen = false; try { seen = sessionStorage.getItem('pen-intro') === '1'; } catch { /* storage blocked */ }
  const skip = q.get('intro') === '0' || seen || route() !== '';
  if (!skip) {
    introOn = true;
    mountIntro(stage, t0, ex.view, () => { introOn = false; ex.show(true); ex.overview(true); });
  }
  apply();
  if (skip) ex.ready.then(() => ex.overview(false));
  (window as unknown as { __pen: unknown }).__pen = ex;
}
boot();
