"""Home (the judge's path) in a real browser. BASE=http://localhost:5173 [BROWSER=firefox] python web/tests/home_e2e.py
   AI-assisted (Claude Code); reviewed by the author."""
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
    b = launch(p, BROWSER); errs = []
    pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/"); pg.wait_for_selector(".home"); pg.wait_for_selector(".home.landed", timeout=15000)
    hook = pg.inner_text("#home-hook"); center = pg.evaluate("window.__pen.view.getCenter()"); zoom = pg.evaluate("window.__pen.view.getZoom()")
    check("hook line states rank and N from data", hook.startswith("NASA rehearsed a lunar-pole mission here in 2012") and "#1 of 10,424" in hook and hook.rstrip().endswith("blind."), hook)
    check("the camera flew to Mauna Kea (NASA test site)", abs(center[0] + 155.47) < 0.3 and abs(center[1] - 19.76) < 0.3 and zoom > 6.5, f"{center} {zoom}")
    check("marker label names the NASA site", "Hiwahine" in pg.inner_text("#home-site"))
    nums = pg.evaluate("[...document.querySelectorAll('.home-num')].map(e => e.textContent.trim())")
    check("three big numbers: rank, rho, p", len(nums) == 3 and nums[0].startswith("#1") and nums[1].replace(".", "").isdigit() and nums[2].startswith("0."), str(nums))
    check("primary button 'See the proof' goes to #/proof", pg.get_attribute("#home-proof", "href") == "#/proof" and pg.inner_text("#home-proof") == "See the proof")
    seal = pg.inner_text("#seal"); check("permanent validation seal in the top bar", "NASA LOLA" in seal and "ρ" in seal and pg.get_attribute("#seal", "href") == "#/proof", seal)
    tries = pg.evaluate("[...document.querySelectorAll('.home-try a')].map(a => [a.textContent, a.getAttribute('href')])")
    check("three shortcuts (Moon, Mars, Mexico) with pairs from data", len(tries) == 3 and "Chichinautzin" in tries[1][0] and "Pinacate" in tries[2][0] and all(h.startswith("#/explore?target=") for _, h in tries), str(tries))
    pg.click("#home-proof"); pg.wait_for_selector("#page .page-in"); check("See the proof navigates to Proof", pg.evaluate("location.hash") == "#/proof")
    check("seal stays on other views", pg.is_visible("#seal"))
    pg.goto(BASE + "/"); pg.wait_for_selector(".home.landed", timeout=15000); pg.locator(".home-try a").nth(1).click(); pg.wait_for_selector(".ex-zone", timeout=30000); pg.wait_for_timeout(2500)
    check("Mars shortcut opens Explore on Jezero with the Earth zone shown", "Jezero" in pg.inner_text("#dd-t") and pg.locator(".ex-zone").count() == 1 and "Chichinautzin" in pg.inner_text(".ex-zone h1"), pg.inner_text("#dd-t"))
    check("Explore keeps the Home deep link in the hash", pg.evaluate("location.hash").startswith("#/explore?target=mars_jezero&region="))
    # skippable: Skip and Escape jump to the end state
    pg.goto(BASE + "/#/"); pg.wait_for_selector(".home"); pg.wait_for_timeout(600); pg.click("#home-skip"); check("Skip lands at once", pg.locator(".home.landed").count() == 1)
    pg.goto(BASE + "/#/proof"); pg.goto(BASE + "/#/"); pg.wait_for_selector(".home"); pg.wait_for_timeout(500); pg.keyboard.press("Escape"); check("Escape lands at once", pg.locator(".home.landed").count() == 1)
    pg.close()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce"); pg = ctx.new_page(); pg.goto(BASE + "/"); pg.wait_for_selector(".home.landed", timeout=8000); pg.wait_for_timeout(3500)
    c0 = pg.evaluate("window.__pen.view.getCenter()"); pg.wait_for_timeout(1200); c1 = pg.evaluate("window.__pen.view.getCenter()")
    check("reduced motion: end state at once, no spin, no flight", c0 == c1 and abs(c1[0] + 155.47) < 0.3, f"{c0} {c1}")
    ctx.close()
    # stats stub: a stubbed null.json shows a calm pending state, never a number
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
    def stub(route):
        import json
        d = route.fetch().json(); d["_stub"] = True; route.fulfill(status=200, content_type="application/json", body=json.dumps(d))
    pg.route("**/data/stats/null.json", stub); pg.goto(BASE + "/"); pg.wait_for_selector(".home.landed", timeout=15000)
    last = pg.inner_text(".home-stat:nth-child(3)")
    check("stubbed stats: p-value is pending, not a number", "—" in last and "pending" in last.lower() and "0.004" not in last, last)
    ctx.close()
    ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page(); pg.goto(BASE + "/"); pg.wait_for_selector(".home.landed", timeout=15000)
    vis = pg.evaluate("(() => { const r = document.querySelector('#home-proof').getBoundingClientRect(); const h = document.querySelector('#home-hook').getBoundingClientRect(); return [r.bottom <= innerHeight, h.bottom <= innerHeight] })()")
    check("phone: hook and 'See the proof' are visible without scrolling", all(vis), str(vis)); ctx.close()
    check("no page errors", not errs, str(errs[:2])); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); sys.exit(1 if fails else 0)
