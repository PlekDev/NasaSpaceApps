# AI-assisted (Claude Code); reviewed by the author.
"""Browser smoke test (Playwright). Run with a server up:
   BASE=http://localhost:5173 python web/tests/e2e.py                     # Chromium (set CHROME=<path> to use a system browser)
   BROWSER=firefox|webkit BASE=... python web/tests/e2e.py              # needs `playwright install firefox webkit`
   BASE=http://127.0.0.1:8099/NasaSpaceApps python web/tests/e2e.py     # production build under the GitHub Pages path (tools/serve_dist.py)"""
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from _common import launch
BASE = os.environ.get("BASE", "http://localhost:5173").rstrip("/"); BROWSER = os.environ.get("BROWSER", "chromium")
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra and not cond else "")); cond or fails.append(name)

with sync_playwright() as p:
    b = launch(p, BROWSER)
    print(f"browser: {BROWSER} {b.version}  base: {BASE}")
    pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); errs = []
    bad = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 and r.url.startswith(BASE.split("/", 3)[0] + "//" + BASE.split("/")[2]) else None)
    pg.goto(BASE + "/"); pg.wait_for_selector("#go"); check("intro shows the line and one button", "Where on Earth looks" in pg.inner_text(".intro h1") and pg.locator(".intro .btn").count() == 1)
    pg.click("#go"); pg.wait_for_selector('[data-card="best"]', timeout=30000); pg.wait_for_timeout(1500)
    check("explore opens after Explore", pg.locator('[data-card="best"]').count() == 1 and pg.locator("#ex-panel h1").inner_text() != "")
    first = pg.inner_text("#ex-panel h1")
    pg.click("[data-dd=t]"); pg.wait_for_selector(".ex-dd-opt"); n = pg.locator(".ex-dd-opt").count()
    check("target menu lists every target (grouped, nothing truncated)", n >= 9 and pg.evaluate("[...document.querySelectorAll('.ex-dd-opt b')].every(e=>e.scrollWidth<=e.clientWidth+1)"))
    pg.locator(".ex-dd-opt").nth(6).click(); pg.wait_for_function("(f) => document.querySelector('#ex-panel h1')?.textContent !== f", arg=first, timeout=20000); pg.wait_for_timeout(1500)
    check("target change updates the overview", pg.inner_text("#ex-panel h1") != first and pg.locator('[data-card="best"]').count() == 1)
    pg.fill("#w-illumination", "0"); pg.dispatch_event("#w-illumination", "input"); pg.wait_for_timeout(800)
    check("weights recombine live", pg.inner_text("#w-illumination-o") == "0.0" and "Custom weights" in pg.inner_text("#ex-live"))
    above = lambda: pg.evaluate("Number(document.querySelector('[data-card=dist] [data-n]').dataset.n)")
    n60 = above(); pg.fill("#min", "99"); pg.dispatch_event("#min", "input"); pg.wait_for_timeout(1000)
    check("min score filter shrinks the count of qualifying windows", above() < n60, f"{n60} -> {above()}")
    pg.fill("#min", "60"); pg.dispatch_event("#min", "input"); pg.fill("#w-illumination", "0"); pg.fill("#w-terrain", "0"); pg.dispatch_event("#w-terrain", "input"); pg.dispatch_event("#w-illumination", "input"); pg.wait_for_timeout(800)
    check("all weights 0 -> empty state", "All weights are 0" in pg.inner_text("#ex-panel"))
    pg.click("#ex-reset"); pg.wait_for_selector('[data-card="best"]', timeout=10000); pg.wait_for_timeout(500)
    check("Reset weights restores equal weights", pg.inner_text("#w-terrain-o") == "1.0" and "Equal weights" in pg.inner_text("#ex-live"))
    pg.locator('[data-card="best"]').focus(); pg.keyboard.press("Enter"); pg.wait_for_selector("#ex-focus:not([hidden]) .ex-detail table", timeout=10000)
    check("keyboard opens a card in focus with its table", pg.locator("#ex-modal .ex-detail tbody tr").count() == 10 and pg.evaluate("document.body.classList.contains('is-focus')"))
    pg.keyboard.press("Escape"); pg.wait_for_selector("#ex-focus[hidden]", state="attached", timeout=5000)
    check("Escape closes the focus dialog", pg.locator("#ex-focus[hidden]").count() == 1)
    pg.click("[data-dd=z]"); pg.wait_for_selector(".ex-dd-opt[data-z]"); pg.locator(".ex-dd-opt[data-z]:not([data-z='-1'])").first.click(); pg.wait_for_selector(".ex-zone", timeout=20000); pg.wait_for_timeout(800)
    check("a zone opens its view with imagery and zone cards", pg.locator(".ex-pair figure").count() == 2 and pg.locator('[data-card^="z"]').count() >= 3)
    pg.wait_for_function("() => /#\\/dossier\\?target=.*&window=/.test(document.querySelector('.ex-cta a')?.getAttribute('href') || '')", timeout=20000)
    check("Open zone review links to the window's dossier", True)
    pg.click("[data-act=overview]"); pg.wait_for_selector('[data-card="best"]', timeout=10000)
    check("Overview button returns to the overview", pg.locator(".ex-zone").count() == 0)
    for route, sel in [
        ("when", ".chart"),
        ("proof", "#hm .hm, .proof"),
        ("limits", ".limits, .view-wip, .page-stub"),
        ("mission", ".mission-page, .view-wip, .page-stub"),
        ("method", ".method, .prose"),
        ("dossier", ".dossier, .view-wip, .page-stub"),
        ("tour", ".tour, .view-wip, .page-stub"),
    ]:
        pg.goto(f"{BASE}/#/{route}"); pg.wait_for_selector(sel, timeout=20000)
        if route == "proof" and pg.locator("#proof-ka").count() > 0:
            pg.wait_for_selector("#proof-ka table", state="attached", timeout=10000)
        check(f"view {route} renders", True)
    # Judge's path through Mission -> Rehearse on date -> Dossier when Mission view is active
    pg.goto(f"{BASE}/#/mission"); pg.wait_for_selector(".mission-page, .view-wip, .page-stub", timeout=20000)
    if pg.locator(".mission-page").count() > 0:
        pg.wait_for_selector(".mission-rehearse-headline", timeout=20000)
        check("mission renders synchronized dual canvases and vertical exaggeration", pg.locator(".mission-canvas").count() == 2 and "×" in pg.inner_text(".mission-exag-badge"))
        check("mission computes rehearsal window with fidelity and .ics action", "fidelity" in pg.inner_text(".mission-rehearse-headline") and pg.locator(".mission-ics-btn").count() == 1)
        pg.click(".mission-dossier-btn"); pg.wait_for_selector(".dossier", timeout=20000)
        check("mission Open dossier passes route, date and fidelity to Dossier", "Rehearsal window chosen in Mission" in pg.inner_text(".dossier"))
    pg.goto(f"{BASE}/#/validation"); pg.wait_for_selector(".proof, #hm .hm", timeout=20000)
    if pg.locator("#proof-ka").count() > 0:
        pg.wait_for_selector("#proof-ka table", state="attached", timeout=10000)
    if pg.locator("[data-zoom]").count() > 0:
        pg.locator("[data-zoom]").first.click(); pg.wait_for_selector(".lightbox"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        check("lightbox opens and closes with Escape", pg.locator(".lightbox").count() == 0)
    check("no console errors", not [e for e in errs if "GL" not in e and "WebGL" not in e], str(errs[:3]))
    check("no failed same-origin requests (assets, data, fonts, thumbs resolve under the base path)", not bad, str(bad[:4]))
    pg.close()
    # no WebGL: static intro fallback and a working Explore without the map
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); errs = []
    pg.add_init_script("HTMLCanvasElement.prototype.getContext = function(){ return null };")
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/"); pg.wait_for_selector("#go"); check("no WebGL: static NASA globe image in the intro", pg.locator(".intro-static img").count() == 1)
    pg.click("#go"); pg.wait_for_selector('[data-card="best"]', timeout=20000); check("no WebGL: cards still work", pg.locator(".ex-card").count() >= 5 and not errs, str(errs[:2]))
    ctx.close()
    # reduced motion: no spin, no transitions
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce"); pg = ctx.new_page(); pg.goto(BASE + "/"); pg.wait_for_selector("#go")
    check("reduced motion: transitions off", pg.evaluate("getComputedStyle(document.querySelector('.btn')).transitionDuration") in ("0s", "0.001s"))
    ctx.close(); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); sys.exit(1 if fails else 0)
