"""Router, navigation and lib/chart.ts checks in a real browser (dev server only: the chart is imported from /src).
   BASE=http://localhost:5173 [BROWSER=firefox] python web/tests/lib_e2e.py          AI-assisted (Claude Code); reviewed by the author."""
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from _common import launch
BASE = os.environ.get("BASE", "http://localhost:5173").rstrip("/"); BROWSER = os.environ.get("BROWSER", "chromium")
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra and not cond else "")); cond or fails.append(name)

ROUTES = {"": ".intro", "explore": ".col-r", "proof": ".page-in", "mission": ".view-wip", "when": ".page-in", "limits": "#page h1", "method": "#page h1", "dossier": ".view-wip", "tour": ".view-wip"}
with sync_playwright() as p:
    b = launch(p, BROWSER); errs = []
    ctx = b.new_context(viewport={"width": 1024, "height": 768}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for path, sel in ROUTES.items():
        pg.goto(f"{BASE}/#/{path}"); pg.wait_for_selector(sel, timeout=20000)
        want = path or "home"
        cur = pg.evaluate("[...document.querySelectorAll('[aria-current=page]')].map(e=>e.dataset.r)")
        ok_nav = (want in cur) if want not in ("home", "dossier") else not cur
        check(f"route #/{path} renders ({sel}) and nav state is right", ok_nav, str(cur))
    pg.goto(f"{BASE}/#/validation"); pg.wait_for_selector(".page-in"); check("#/validation redirects to #/proof", pg.evaluate("location.hash") == "#/proof")
    pg.goto(f"{BASE}/#/time?region=x"); pg.wait_for_selector(".page-in"); check("#/time?region=x redirects to #/when?region=x (query kept)", pg.evaluate("location.hash") == "#/when?region=x")
    pg.goto(f"{BASE}/#/nope"); pg.wait_for_selector(".intro"); check("unknown route shows Home", pg.evaluate("location.hash") == "#/")
    pg.goto(f"{BASE}/#/dossier?target=a&window=b&route=c"); pg.wait_for_selector(".view-wip"); check("query params survive in the hash", pg.evaluate("location.hash") == "#/dossier?target=a&window=b&route=c")
    # six items at 1024 px on one line, Tour is a separate quiet button, Dossier is not in the nav
    pg.goto(f"{BASE}/#/explore"); pg.wait_for_selector(".col-r")
    geo = pg.evaluate("""() => { const a=[...document.querySelectorAll('#nav a:not(.only-phone)')].map(e=>e.getBoundingClientRect()); const t=document.querySelector('.nav-tour').getBoundingClientRect(); const bar=document.querySelector('.bar').getBoundingClientRect();
      return { n: a.length, tops: [...new Set(a.map(r=>Math.round(r.top)))].length, right: Math.max(...a.map(r=>r.right)), tourTop: Math.round(t.top), tourLeft: t.left, barH: bar.height, labels: [...document.querySelectorAll('#nav a:not(.only-phone)')].map(e=>e.textContent), dossier: !!document.querySelector('#nav a[href="#/dossier"]') } }""")
    check("six primary items on one line at 1024 px, Tour clear of them, no Dossier", geo["n"] == 6 and geo["tops"] == 1 and geo["right"] < geo["tourLeft"] and geo["barH"] <= 53 and not geo["dossier"], str(geo))
    check("nav labels", geo["labels"] == ["Explore", "Proof", "Mission", "When", "Limits", "Method"], str(geo["labels"]))
    # keyboard: Tab reaches the nav links and Enter follows one
    pg.focus('#nav a[data-r="limits"]'); pg.keyboard.press("Enter"); pg.wait_for_selector("#page h1")
    check("keyboard follows a nav link", pg.evaluate("location.hash") == "#/limits")
    # lib/chart.ts and lifecycle in the browser (throwaway chart, not a view).
    # Vite's dev server may re-optimise echarts on first import and reload the page once: warm up, then run.
    for _ in range(3):
        try: pg.evaluate("import('/src/lib/chart.ts').then(() => 1)"); break
        except Exception: pg.wait_for_timeout(4000)
    pg.wait_for_timeout(2500); pg.goto(f"{BASE}/#/limits"); pg.wait_for_selector("#page h1")
    r = pg.evaluate("""async () => {
      const { mountChart } = await import('/src/lib/chart.ts'); const { beginScope, currentScope } = await import('/src/lib/lifecycle.ts');
      const host = document.createElement('div'); host.style.cssText = 'width:400px;height:240px;position:fixed;left:0;top:60px;z-index:99'; document.body.appendChild(host);
      const scope = beginScope();
      const h = mountChart(host, { xAxis: { type: 'category', data: ['a','b'] }, yAxis: { type: 'value' }, series: [{ type: 'line', data: [1,3] }] }, { summary: 'Two points rising from 1 to 3.', label: 'Throwaway chart' });
      await new Promise(r => setTimeout(r, 300));
      const out = { canvas: !!host.querySelector('canvas'), role: host.querySelector('[role=img]')?.getAttribute('aria-label'), desc: document.getElementById(host.querySelector('[role=img]').getAttribute('aria-describedby'))?.textContent,
        hidden: getComputedStyle(host.querySelector('.sr-only')).position, color0: h.instance.getOption().color?.[0], animation: h.instance.getOption().animation };
      document.documentElement.dataset.theme = 'dark'; await new Promise(r => setTimeout(r, 400)); out.color0 = h.instance.getOption().color?.[0];
      document.documentElement.dataset.theme = 'light'; await new Promise(r => setTimeout(r, 400)); out.color0Light = h.instance.getOption().color?.[0];
      host.style.width = '200px'; await new Promise(r => setTimeout(r, 300)); out.width = h.instance.getWidth();
      let threw = false; try { mountChart(document.createElement('div'), {}, { summary: '' }); } catch { threw = true; } out.threw = threw;
      scope.dispose(); out.disposed = host.querySelector('canvas') === null && !host.classList.contains('chart-host'); host.remove(); return out; }""")
    check("chart: canvas drawn with role=img, aria-label and a described-by summary", r["canvas"] and r["role"] == "Throwaway chart" and r["desc"] == "Two points rising from 1 to 3." and r["hidden"] == "absolute", str(r))
    check("chart: theme follows dark/light tokens live", r["color0"] and r["color0Light"] and r["color0"].lower() != r["color0Light"].lower(), f"{r['color0']} vs {r['color0Light']}")
    check("chart: ResizeObserver refits", r["width"] == 200, str(r["width"]))
    check("chart: summary is required", r["threw"])
    check("chart: scope disposal (route change) removes the chart", r["disposed"])
    ctx.close()
    ctx = b.new_context(viewport={"width": 800, "height": 600}, reduced_motion="reduce"); pg = ctx.new_page(); pg.goto(f"{BASE}/#/limits"); pg.wait_for_selector("#page h1")
    anim = pg.evaluate("""async () => { const { mountChart } = await import('/src/lib/chart.ts'); const host = document.createElement('div'); host.style.cssText='width:300px;height:200px'; document.body.appendChild(host);
      const h = mountChart(host, { xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }, { summary: 's' }); const a = h.instance.getOption().animation; h.dispose(); return a; }""")
    check("chart: prefers-reduced-motion turns animation off", anim is False, str(anim))
    ctx.close()
    # lazy view: a failing chunk shows an error with Retry, and Retry recovers
    ctx = b.new_context(viewport={"width": 1024, "height": 768}); pg = ctx.new_page(); state = {"fail": True}
    def gate(route):
        if state["fail"]: route.abort()
        else: route.continue_()
    pg.route("**/views/tour*", gate); pg.goto(f"{BASE}/#/explore"); pg.wait_for_selector(".col-r"); pg.evaluate("location.hash = '#/tour'")
    try:
        pg.wait_for_selector("[data-retry]", timeout=15000); check("lazy view: failed chunk shows an error state with Retry", pg.locator("[role=alert]").count() == 1)
        state["fail"] = False; pg.click("[data-retry]")
        pg.wait_for_selector(".view-wip, [data-retry]:has-text('Reload page')", timeout=15000)
        if pg.locator(".view-wip").count() == 0:   # Chromium caches the failed import: the second step is a reload of the same route
            pg.click("[data-retry]"); pg.wait_for_selector(".view-wip", timeout=20000)
        check("lazy view: Retry (or reload) recovers the view", pg.evaluate("location.hash") == "#/tour")
    except Exception as e:
        check("lazy view: error state and Retry", False, str(e)[:120])
    ctx.close()
    # phone menu
    ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page(); pg.goto(f"{BASE}/#/explore"); pg.wait_for_selector(".col-r, #dock", timeout=20000)
    pg.click("#menu"); items = pg.locator("#nav a:visible").count(); check("phone menu lists the six views and Tour", items == 7, str(items))
    pg.keyboard.press("Escape"); check("phone menu closes with Escape", pg.locator("#nav.open").count() == 0)
    check("no page errors", not errs, str(errs[:3]))
    ctx.close(); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); sys.exit(1 if fails else 0)
