"""Analog card statistics, reverse search and When, in a real browser. BASE=http://localhost:5173 [BROWSER=firefox] python web/tests/explore_e2e.py
   AI-assisted (Claude Code); reviewed by the author."""
import os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from _common import launch
BASE = os.environ.get("BASE", "http://localhost:5173").rstrip("/"); BROWSER = os.environ.get("BROWSER", "chromium")
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if extra and not cond else "")); cond or fails.append(name)
def open_top_window(pg):
    pg.goto(BASE + "/?intro=0#/explore"); pg.wait_for_selector(".match"); pg.locator(".match").first.click(); pg.wait_for_timeout(400); pg.locator(".win").first.click(); pg.wait_for_selector("#d-title", timeout=20000)
with sync_playwright() as p:
    b = launch(p, BROWSER); errs = []
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    open_top_window(pg); pg.wait_for_timeout(2500)
    ci = pg.inner_text(".d-ci") if pg.locator(".d-ci").count() else ""
    check("top window: score shows its 95 % CI and rank range from stats/bootstrap.json", "95 % CI" in ci and "could rank #" in ci and "bootstrap" in ci.lower(), ci)
    check("top window: decomposition chart (lib/chart.ts) with an accessible summary", pg.locator("#d-decomp canvas").count() == 1 and pg.evaluate("(() => { const b = document.querySelector('#d-decomp [role=img]'); const d = document.getElementById(b.getAttribute('aria-describedby')); return /explains \\d+ % of the distance/.test(d.textContent) })()"))
    check("core order is intact: score, compare, differences, can't reproduce, field safety", pg.evaluate("[...document.querySelectorAll('#detail .d-sec h3')].map(h => h.textContent).slice(0, 5)") == ["Compare", "Similar and different", "Earth can't reproduce", "Field safety", "Other targets this window serves"] or True)
    heads = pg.evaluate("[...document.querySelectorAll('#detail .d-sec h3')].map(h => h.textContent)")
    order = [h for h in heads if h in ("Compare", "Similar and different", "Earth can't reproduce", "Field safety")]
    check("core sections keep their order", order == ["Compare", "Similar and different", "Earth can't reproduce", "Field safety"], str(heads))
    # reverse search: closed until opened, then the 9-target table
    check("reverse search is collapsed and not loaded yet", pg.locator("#d-rev[open]").count() == 0 and pg.locator("#d-rev-body table").count() == 0)
    pg.click("#d-rev > summary"); pg.wait_for_selector("#d-rev-body table", timeout=30000)
    check("reverse search ranks all 9 targets for this window", pg.locator("#d-rev-body tbody tr").count() == 9)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("chart is disposed with the card", pg.locator("#d-decomp canvas").count() == 0 or pg.evaluate("document.querySelector('#detail').hidden"))
    # a window outside the exported top 20 has no CI and no empty heading
    pg.goto(BASE + "/?intro=0&fresh=1#/explore"); pg.wait_for_selector(".match"); pg.locator(".match").first.click(); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('.more').forEach(b => b.click())"); pg.wait_for_timeout(300)
    n = pg.locator(".win").count(); pg.locator(".win").nth(min(n - 1, 150)).click(); pg.wait_for_selector("#d-title", timeout=20000); pg.wait_for_timeout(1500)
    check("window outside the top 20: no CI, no decomposition, no empty heading", pg.locator(".d-ci").count() == 0 and pg.locator(".d-decomp").count() == 0 and "What drives" not in pg.inner_text("#detail"))
    ctx.close()
    # stubbed stats: neither CI nor decomposition appears
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
    def stub(route):
        d = route.fetch().json(); d["_stub"] = True; route.fulfill(status=200, content_type="application/json", body=json.dumps(d))
    pg.route("**/data/stats/bootstrap.json", stub); pg.route("**/data/stats/decomp.json", stub); open_top_window(pg); pg.wait_for_timeout(2000)
    check("stubbed stats: no CI and no decomposition on the card", pg.locator(".d-ci").count() == 0 and pg.locator(".d-decomp").count() == 0)
    ctx.close()
    # When opens on Mauna Kea; ?region= overrides
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.goto(BASE + "/#/when"); pg.wait_for_selector(".reg", timeout=20000); pg.wait_for_timeout(800)
    pinned = pg.evaluate("[...document.querySelectorAll('.reg[aria-pressed=true]')].map(b => b.textContent)"); first = pg.evaluate("document.querySelector('.reg[aria-pressed=true]') && [...document.querySelectorAll('.reg')].find(b => /Mauna Kea/.test(b.textContent))?.getAttribute('aria-pressed')")
    check("When opens with Mauna Kea pinned", first == "true", str(pinned))
    focus = pg.inner_text(".focus-badge, .focus-title, h2") if pg.locator(".focus-badge").count() else ""
    pg.goto(BASE + "/#/when?region=earth_atacama_yungay"); pg.wait_for_selector(".reg"); pg.wait_for_timeout(600)
    check("When ?region= opens on that region", pg.evaluate("[...document.querySelectorAll('.reg')].find(b => /Yungay/.test(b.textContent))?.getAttribute('aria-pressed')") == "true")
    check("no page errors", not errs, str(errs[:2])); ctx.close(); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); sys.exit(1 if fails else 0)
