"""When, in a real browser (the analog-card statistics checks were retired with the previous Explore). BASE=http://localhost:5173 [BROWSER=firefox] python web/tests/explore_e2e.py
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
with sync_playwright() as p:
    b = launch(p, BROWSER); errs = []
    # When opens on Mauna Kea; ?region= overrides
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.goto(BASE + "/#/when"); pg.wait_for_selector(".reg", timeout=20000); pg.wait_for_timeout(800)
    pinned = pg.evaluate("[...document.querySelectorAll('.reg[aria-pressed=true]')].map(b => b.textContent)"); first = pg.evaluate("document.querySelector('.reg[aria-pressed=true]') && [...document.querySelectorAll('.reg')].find(b => /Mauna Kea/.test(b.textContent))?.getAttribute('aria-pressed')")
    check("When opens with Mauna Kea pinned", first == "true", str(pinned))
    focus = pg.inner_text(".focus-badge, .focus-title, h2") if pg.locator(".focus-badge").count() else ""
    pg.goto(BASE + "/#/when?region=earth_atacama_yungay"); pg.wait_for_selector(".reg"); pg.wait_for_timeout(600)
    check("When ?region= opens on that region", pg.evaluate("[...document.querySelectorAll('.reg')].find(b => /Yungay/.test(b.textContent))?.getAttribute('aria-pressed')") == "true")
    check("no page errors", not errs, str(errs[:2])); ctx.close(); b.close()
print("\n%d failed" % len(fails) if fails else "\nall passed"); sys.exit(1 if fails else 0)
