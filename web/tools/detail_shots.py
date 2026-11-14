import sys
from playwright.sync_api import sync_playwright
size, theme, tag = sys.argv[1], sys.argv[2], sys.argv[3]; target = sys.argv[4] if len(sys.argv) > 4 else ""; w, h = map(int, size.split("x"))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium-browser", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page(); errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://localhost:5173/?intro=0{('&target=' + target) if target else ''}"); pg.wait_for_selector(".match"); pg.wait_for_timeout(4000)
    pg.locator(".match").first.click(); pg.wait_for_timeout(800)
    pg.locator(".win").first.click(); pg.wait_for_selector("#d-title", timeout=20000); pg.wait_for_timeout(5500)
    pg.screenshot(path=f"/tmp/pen-web/{tag}_{w}_{theme}_a.png")
    body = pg.locator(".d-body")
    body.evaluate("e => e.scrollTo(0, 560)"); pg.wait_for_timeout(500); pg.screenshot(path=f"/tmp/pen-web/{tag}_{w}_{theme}_m.png")
    body.evaluate("e => e.scrollTo(0, e.scrollHeight)"); pg.wait_for_timeout(600); pg.screenshot(path=f"/tmp/pen-web/{tag}_{w}_{theme}_b.png")
    for e in errs[:6]: print("error:", e[:200])
    b.close()
