"""Playwright screenshots: python web/tools/shots.py <tag> [url] [sizes] ; themes dark+light."""
import sys
from playwright.sync_api import sync_playwright
tag = sys.argv[1]; url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5173/"
sizes = [tuple(map(int, s.split("x"))) for s in (sys.argv[3] if len(sys.argv) > 3 else "1440x900,390x844").split(",")]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium-browser", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for w, h in sizes:
        for theme in ("dark", "light"):
            ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme)
            pg = ctx.new_page(); pg.on("console", lambda m: print("console:", m.text) if m.type == "error" else None)
            pg.goto(url); pg.wait_for_selector(".bar", timeout=30000); pg.wait_for_timeout(9000)
            pg.screenshot(path=f"/tmp/pen-web/{tag}_{w}_{theme}.png"); ctx.close()
    b.close()
