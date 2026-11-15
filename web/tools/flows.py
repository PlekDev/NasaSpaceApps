"""Interaction screenshots for the Explore view. usage: flows.py <tag> <WxH> <theme>"""
import sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent)); from _common import launch_chromium, launch, shot_path, AXE_JS, OUT
tag, size, theme = sys.argv[1], sys.argv[2], sys.argv[3]; w, h = map(int, size.split("x")); phone = w <= 820
with sync_playwright() as p:
    b = launch_chromium(p)
    pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page(); errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    shot = lambda n: pg.screenshot(path=shot_path(f"{tag}_{w}_{theme}_{n}.png"))
    pg.goto("http://localhost:5173/"); pg.wait_for_selector("#go"); pg.wait_for_timeout(5000); shot("0intro")
    pg.click("#go"); pg.wait_for_timeout(5000); shot("1explore")
    pg.click("#target-btn"); pg.wait_for_timeout(600); shot("2picker"); pg.keyboard.press("Escape")
    pg.click("#regions-btn"); pg.wait_for_timeout(600); shot("3regions"); pg.keyboard.press("Escape")
    if phone:
        pg.click("#grab"); pg.wait_for_timeout(800); shot("4half"); pg.click("#grab"); pg.wait_for_timeout(800); shot("4full"); pg.click("#grab"); pg.wait_for_timeout(600)
    pg.locator(".match").first.click(); pg.wait_for_timeout(3500); shot("5region")
    pg.locator(".win").first.click(); pg.wait_for_timeout(4500); shot("6window")
    for e in errs[:6]: print("error:", e[:200])
    b.close()
