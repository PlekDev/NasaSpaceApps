"""page_shot.py <route> <selector-to-scroll-to> <WxH> <theme> <out>"""
import sys
from playwright.sync_api import sync_playwright
route, sel, size, theme, out = sys.argv[1:6]; w, h = map(int, size.split("x"))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium-browser", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page(); errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://127.0.0.1:8099/NasaSpaceApps/#/{route}"); pg.wait_for_selector(".page-in", timeout=30000); pg.wait_for_timeout(2500)
    pg.evaluate(f"(()=>{{const e=document.querySelector('{sel}'); const p=document.querySelector('#page'); p.scrollTo(0, e.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop - 24)}})()"); pg.wait_for_timeout(1500)
    pg.screenshot(path=out)
    for e in errs[:5]: print("error:", e[:160])
    b.close()
