"""LCP and transferred bytes on the production build, throttled like 'Fast 4G' (1.6 Mbit/s down, 150 ms RTT).  perf.py [url]"""
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/?intro=0"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium-browser", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
    cdp.send("Network.enable"); cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 1.6e6 / 8 * 0.9, "uploadThroughput": 750e3 / 8})
    cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    sizes = {}
    cdp.on("Network.loadingFinished", lambda e: sizes.__setitem__(e["requestId"], e["encodedDataLength"]))
    urls = {}
    cdp.on("Network.responseReceived", lambda e: urls.__setitem__(e["requestId"], e["response"]["url"]))
    pg.add_init_script("""window.__lcp=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});""")
    pg.goto(url, wait_until="load"); pg.wait_for_selector("#go, .match", timeout=90000); pg.wait_for_timeout(2500)
    lcp = pg.evaluate("window.__lcp")
    mine = {i: s for i, s in sizes.items() if "localhost" in urls.get(i, "")}
    tot = sum(mine.values()); by = {}
    for i, s in mine.items():
        u = urls[i].split("localhost:4173")[1].split("?")[0]; k = ("js" if u.endswith(".js") else "css" if u.endswith(".css") else "fonts" if "fonts" in u else "data" if "/data/" in u else "thumbs" if "thumbs" in u else "html" if u in ("/", "/index.html") else "other")
        by[k] = by.get(k, 0) + s
    ext = sum(s for i, s in sizes.items() if "localhost" not in urls.get(i, ""))
    print(json.dumps({"lcp_ms": round(lcp), "own_transfer_kB": round(tot / 1024), "by_type_kB": {k: round(v / 1024) for k, v in by.items()}, "external_tiles_kB": round(ext / 1024)}))
    b.close()
