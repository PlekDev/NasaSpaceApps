# AI-assisted (Claude Code); reviewed by the author.
"""Accessibility audit with axe-core. One-time: install axe-core into <tmp>/axe (npm i axe-core there) or set AXE_JS=<path to axe.min.js>.   BASE=<url> axe_run.py [WxH ...]   Exit 1 on any violation."""
import json, os, sys
from pathlib import Path
BASE = os.environ.get("BASE", "http://localhost:5173").rstrip("/")
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent)); from _common import launch_chromium, launch, shot_path, AXE_JS, OUT
FAILS = 0
axe_path = AXE_JS if AXE_JS.exists() else Path(__file__).resolve().parents[1] / "node_modules" / "axe-core" / "axe.min.js"
AXE = axe_path.read_text(encoding="utf-8")
VIEWS = [
    ("explore", "/?intro=0", None),
    ("intro", "/", None),
    ("zone", "/?intro=0", "zone"),
    ("focus", "/?intro=0", "focus"),
    ("picker", "/?intro=0", "picker"),
    ("when", "/#/when", None),
    ("proof", "/#/proof", None),
    ("limits", "/#/limits", None),
    ("mission", "/#/mission", None),
    ("method", "/#/method", None),
    ("dossier", "/#/dossier", None),
    ("tour", "/#/tour", None),
]
sizes = [(1440, 900), (390, 844), (1024, 768)] if len(sys.argv) < 2 else [tuple(map(int, a.split("x"))) for a in sys.argv[1:]]
themes = tuple(t.strip() for t in os.environ.get("PEN_AXE_THEMES", "dark,light").split(",") if t.strip())
wait_ms = int(os.environ.get("PEN_AXE_WAIT_MS", "2000"))
with sync_playwright() as p:
    b = launch_chromium(p)
    for w, h in sizes:
        for theme in themes:
            for name, path, act in VIEWS:
                pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page()
                pg.goto(BASE + path); pg.wait_for_selector(".bar", timeout=30000); pg.wait_for_timeout(wait_ms)
                if act == "zone":
                    pg.click("[data-dd=z]"); pg.wait_for_selector(".ex-dd-opt[data-z]"); pg.locator(".ex-dd-opt[data-z]:not([data-z='-1'])").first.click(); pg.wait_for_selector(".ex-zone"); pg.wait_for_timeout(wait_ms)
                if act == "focus": pg.wait_for_selector('[data-card="best"]'); pg.click('[data-card="best"]'); pg.wait_for_selector("#ex-focus:not([hidden]) .ex-detail"); pg.wait_for_timeout(wait_ms)
                if act == "picker": pg.click("[data-dd=t]"); pg.wait_for_timeout(500)
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
