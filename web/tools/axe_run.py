"""Accessibility audit with axe-core. One-time: install axe-core into <tmp>/axe (npm i axe-core there) or set AXE_JS=<path to axe.min.js>.   BASE=<url> axe_run.py [WxH ...]   Exit 1 on any violation."""
import json, os, sys
BASE = os.environ.get("BASE", "http://localhost:5173").rstrip("/")
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent)); from _common import launch_chromium, launch, shot_path, AXE_JS, OUT
FAILS = 0
AXE = AXE_JS.read_text(encoding="utf-8")
VIEWS = [("explore", "/?intro=0", None), ("intro", "/", None), ("detail", "/?intro=0", "detail"), ("picker", "/?intro=0", "picker"), ("regions", "/?intro=0", "regions"),
         ("time", "/#/time", None), ("validation", "/#/validation", None), ("method", "/#/method", None)]
sizes = [(1440, 900), (390, 844), (1024, 768)] if len(sys.argv) < 2 else [tuple(map(int, a.split("x"))) for a in sys.argv[1:]]
with sync_playwright() as p:
    b = launch_chromium(p)
    for w, h in sizes:
        for theme in ("dark", "light"):
            for name, path, act in VIEWS:
                pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page()
                pg.goto(BASE + path); pg.wait_for_selector(".bar", timeout=30000); pg.wait_for_timeout(3500)
                if act == "detail":
                    pg.locator(".match").first.click(); pg.wait_for_timeout(500); pg.locator(".win").first.click(); pg.wait_for_selector("#d-title"); pg.wait_for_timeout(3500)
                if act == "picker": pg.click("#target-btn"); pg.wait_for_timeout(500)
                if act == "regions": pg.click("#regions-btn"); pg.wait_for_timeout(500)
                pg.evaluate(AXE)
                res = pg.evaluate("axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}, resultTypes:['violations']})")
                v = res["violations"]
                print(f"{w}x{h} {theme:5} {name:10} violations={len(v)}"); FAILS += len(v)
                for x in v:
                    print("   -", x["id"], x["impact"], f"({len(x['nodes'])} nodes)", x["help"][:80])
                    for n in x["nodes"][:2]: print("       ", n["target"], (n.get("any") or n.get("all") or [{}])[0].get("message", "")[:140])
                pg.context.close()
    b.close()
sys.exit(1 if FAILS else 0)
