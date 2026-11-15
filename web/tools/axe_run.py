"""Accessibility audit with axe-core (installed in /tmp/axe): axe_run.py  -> prints violations per view/theme/size."""
import json, sys
from playwright.sync_api import sync_playwright
AXE = open("/tmp/axe/node_modules/axe-core/axe.min.js").read()
VIEWS = [("explore", "/?intro=0", None), ("intro", "/", None), ("detail", "/?intro=0", "detail"), ("picker", "/?intro=0", "picker"), ("regions", "/?intro=0", "regions"),
         ("time", "/#/time", None), ("validation", "/#/validation", None), ("method", "/#/method", None)]
sizes = [(1440, 900), (390, 844)] if len(sys.argv) < 2 else [tuple(map(int, a.split("x"))) for a in sys.argv[1:]]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium-browser", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    for w, h in sizes:
        for theme in ("dark", "light"):
            for name, path, act in VIEWS:
                pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page()
                pg.goto("http://localhost:5173" + path); pg.wait_for_selector(".bar", timeout=30000); pg.wait_for_timeout(3500)
                if act == "detail":
                    pg.locator(".match").first.click(); pg.wait_for_timeout(500); pg.locator(".win").first.click(); pg.wait_for_selector("#d-title"); pg.wait_for_timeout(3500)
                if act == "picker": pg.click("#target-btn"); pg.wait_for_timeout(500)
                if act == "regions": pg.click("#regions-btn"); pg.wait_for_timeout(500)
                pg.evaluate(AXE)
                res = pg.evaluate("axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}, resultTypes:['violations']})")
                v = res["violations"]
                print(f"{w}x{h} {theme:5} {name:10} violations={len(v)}")
                for x in v:
                    print("   -", x["id"], x["impact"], f"({len(x['nodes'])} nodes)", x["help"][:80])
                    for n in x["nodes"][:2]: print("       ", n["target"], (n.get("any") or n.get("all") or [{}])[0].get("message", "")[:140])
                pg.context.close()
    b.close()
