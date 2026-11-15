"""Tall capture of a scrolling page: scrollshots.py <hash-route> <WxH> <theme> <out> [selector]"""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image
route, size, theme, out = sys.argv[1:5]; w, h = map(int, size.split("x")); sel = sys.argv[5] if len(sys.argv) > 5 else "#page"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium-browser", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_context(viewport={"width": w, "height": h}, color_scheme=theme).new_page(); errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://localhost:5173/#/{route}"); pg.wait_for_selector(".page-in", timeout=30000); pg.wait_for_timeout(3000)
    total = pg.evaluate(f"document.querySelector('{sel}').scrollHeight"); step = h - 52; shots = []; y = 0
    while y < total and len(shots) < 14:
        pg.evaluate(f"document.querySelector('{sel}').scrollTo(0,{y})"); pg.wait_for_timeout(500)
        f = f"/tmp/pen-web/_s{len(shots)}.png"; pg.screenshot(path=f, clip={"x": 0, "y": 52, "width": w, "height": h - 52}); shots.append(f); y += step
    ims = [Image.open(f) for f in shots]; cols = 3 if len(ims) > 3 else len(ims); rowsN = -(-len(ims) // cols)
    sheet = Image.new("RGB", (cols * w // 2, rowsN * (h - 52) // 2), (30, 30, 30))
    for i, im in enumerate(ims): sheet.paste(im.resize((w // 2, (h - 52) // 2)), ((i % cols) * w // 2, (i // cols) * (h - 52) // 2))
    sheet.save(out); print(len(ims), "strips; total", total)
    for e in errs[:5]: print("error:", e[:160])
    b.close()
