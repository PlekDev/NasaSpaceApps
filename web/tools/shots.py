"""Playwright screenshots. usage: shots.py <tag> [path] [sizes] [themes]. Flags via env: ACT=js to run after load."""
import os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent)); from _common import launch_chromium, launch, shot_path, AXE_JS, OUT
tag = sys.argv[1]; path = sys.argv[2] if len(sys.argv) > 2 else "/?intro=0"
sizes = [tuple(map(int, s.split("x"))) for s in (sys.argv[3] if len(sys.argv) > 3 else "1440x900,390x844").split(",")]
themes = (sys.argv[4] if len(sys.argv) > 4 else "dark,light").split(",")
act = os.environ.get("ACT", ""); wait = int(os.environ.get("WAIT", "7000")); base = os.environ.get("BASE", "http://localhost:5173")
with sync_playwright() as p:
    b = launch_chromium(p)
    for w, h in sizes:
        for theme in themes:
            ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme)
            pg = ctx.new_page(); errs = []
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(base + path); pg.wait_for_selector(".bar", timeout=30000); pg.wait_for_timeout(wait)
            if act: pg.evaluate(act); pg.wait_for_timeout(int(os.environ.get("WAIT2", "3500")))
            pg.screenshot(path=shot_path(f"{tag}_{w}_{theme}.png"))
            for e in errs[:5]: print(f"[{w} {theme}] error:", e[:200])
            ctx.close()
    b.close()
