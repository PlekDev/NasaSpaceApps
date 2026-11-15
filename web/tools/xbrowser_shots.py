"""Screenshots in another engine: BROWSER=firefox|webkit xbrowser_shots.py <base-url> <tag>"""
import os, sys
from playwright.sync_api import sync_playwright
base, tag = sys.argv[1].rstrip("/"), sys.argv[2]; br = os.environ.get("BROWSER", "firefox")
with sync_playwright() as p:
    b = getattr(p, br).launch()
    for w, h, theme in [(1440, 900, "dark"), (1440, 900, "light"), (390, 844, "dark")]:
        pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page()
        pg.goto(base + "/?intro=0"); pg.wait_for_selector(".match"); pg.wait_for_timeout(5000)
        pg.screenshot(path=f"/tmp/pen-web/{tag}_{br}_{w}_{theme}_explore.png")
        if w > 800:
            pg.locator(".match").first.click(); pg.wait_for_timeout(500); pg.locator(".win").first.click(); pg.wait_for_selector("#d-title"); pg.wait_for_timeout(4500)
            pg.screenshot(path=f"/tmp/pen-web/{tag}_{br}_{w}_{theme}_detail.png")
        pg.goto(base + "/#/validation"); pg.wait_for_selector("#hm .hm"); pg.wait_for_timeout(1500); pg.screenshot(path=f"/tmp/pen-web/{tag}_{br}_{w}_{theme}_validation.png")
        pg.context.close()
    b.close()
