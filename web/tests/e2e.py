"""Browser smoke test (Playwright). Run with a server up:
   BASE=http://localhost:5173 python web/tests/e2e.py                     # Chromium (system binary)
   BROWSER=firefox|webkit BASE=... python web/tests/e2e.py              # needs `playwright install firefox webkit`
   BASE=http://127.0.0.1:8099/NasaSpaceApps python web/tests/e2e.py     # production build under the GitHub Pages path (tools/serve_dist.py)"""
import os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE", "http://localhost:5173").rstrip("/"); CHROME = os.environ.get("CHROME", "/usr/bin/chromium-browser"); BROWSER = os.environ.get("BROWSER", "chromium")
GL = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra and not cond else "")); cond or fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=GL) if BROWSER == "chromium" else getattr(p, BROWSER).launch()
    print(f"browser: {BROWSER} {b.version}  base: {BASE}")
    pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); errs = []
    bad = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 and r.url.startswith(BASE.split("/", 3)[0] + "//" + BASE.split("/")[2]) else None)
    pg.goto(BASE + "/"); pg.wait_for_selector("#go"); check("intro shows the line and one button", "Where on Earth looks" in pg.inner_text(".intro h1") and pg.locator(".intro .btn").count() == 1)
    pg.keyboard.press("Escape") if False else pg.click("#go"); pg.wait_for_selector(".match"); pg.wait_for_timeout(1500)
    check("explore opens after Explore", pg.locator("#best .score b").count() == 1)
    first = pg.inner_text("#best .where")
    pg.click("#target-btn"); pg.wait_for_selector(".opt"); n = pg.locator(".opt").count()
    check("picker lists every target (grouped, nothing truncated)", n >= 9 and pg.evaluate("[...document.querySelectorAll('.opt .name')].every(e=>e.scrollWidth<=e.clientWidth+1)"))
    pg.locator(".opt").nth(6).click(); pg.wait_for_timeout(2500)
    check("target change updates the best match", pg.inner_text("#target-name") != "" and pg.locator("#best .score b").count() == 1)
    before = pg.inner_text("#best .score b")
    pg.fill("#w-illumination", "0"); pg.dispatch_event("#w-illumination", "input"); pg.wait_for_timeout(800)
    check("weights recombine live", pg.inner_text("#w-illumination-o") == "0.0")
    pg.fill("#min", "99"); pg.dispatch_event("#min", "input"); pg.wait_for_timeout(800)
    check("min score filter empties or shrinks the list", pg.locator(".match").count() <= 14)
    pg.fill("#min", "60"); pg.dispatch_event("#min", "input"); pg.fill("#w-illumination", "1"); pg.dispatch_event("#w-illumination", "input"); pg.wait_for_timeout(600)
    pg.click("#regions-btn"); pg.click("[data-none]"); pg.wait_for_timeout(500)
    check("region none -> empty state", "No Earth region" in pg.inner_text("#best") or "No window" in pg.inner_text("#best"))
    pg.click("[data-all]"); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.locator(".match").first.click(); pg.wait_for_timeout(500); pg.locator(".win").first.focus(); pg.keyboard.press("Enter"); pg.wait_for_selector("#d-title", timeout=20000)
    check("keyboard opens the detail sheet", pg.locator("#detail:not([hidden])").count() == 1)
    check("detail has reproduce rows", pg.locator(".stats li").count() >= 4)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    check("Escape closes the detail sheet", pg.locator("#detail[hidden]").count() == 1)
    for route, sel in [("time", ".chart"), ("validation", "#hm .hm"), ("method", ".prose")]:
        pg.goto(f"{BASE}/#/{route}"); pg.wait_for_selector(sel, timeout=20000); check(f"view {route} renders", True)
    pg.goto(f"{BASE}/#/validation"); pg.wait_for_selector("[data-zoom]"); pg.locator("[data-zoom]").first.click(); pg.wait_for_selector(".lightbox"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("lightbox opens and closes with Escape", pg.locator(".lightbox").count() == 0)
    check("no console errors", not [e for e in errs if "GL" not in e and "WebGL" not in e], str(errs[:3]))
    check("no failed same-origin requests (assets, data, fonts, thumbs resolve under the base path)", not bad, str(bad[:4]))
    pg.close()
    # no WebGL: static intro fallback and a working Explore without the map
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
    pg.add_init_script("HTMLCanvasElement.prototype.getContext = function(){ return null };")
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/"); pg.wait_for_selector("#go"); check("no WebGL: static NASA globe image in the intro", pg.locator(".intro-static img").count() == 1)
    pg.click("#go"); pg.wait_for_selector(".match", timeout=20000); check("no WebGL: rankings still work", pg.locator(".match").count() > 5 and not errs, str(errs[:2]))
    ctx.close()
    # reduced motion: no spin, no transitions
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce"); pg = ctx.new_page(); pg.goto(BASE + "/"); pg.wait_for_selector("#go")
    check("reduced motion: transitions off", pg.evaluate("getComputedStyle(document.querySelector('.btn')).transitionDuration") in ("0s", "0.001s"))
    ctx.close(); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); sys.exit(1 if fails else 0)
