"""Serve web/dist under a path prefix with gzip, like GitHub Pages: serve_dist.py [prefix=/NasaSpaceApps] [port=8099]"""
import gzip, http.server, mimetypes, os, sys
prefix = (sys.argv[1] if len(sys.argv) > 1 else "/NasaSpaceApps").rstrip("/"); port = int(sys.argv[2]) if len(sys.argv) > 2 else 8099
root = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist"))
TEXT = ("text/", "application/javascript", "application/json", "image/svg+xml", "text/javascript")
mimetypes.add_type("application/javascript", ".js"); mimetypes.add_type("font/woff2", ".woff2")
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0].split("#")[0]
        if not (path == prefix or path.startswith(prefix + "/")): return self.send_error(404)
        rel = path[len(prefix):].lstrip("/") or "index.html"
        f = os.path.realpath(os.path.join(root, rel))
        if not f.startswith(root) or not os.path.isfile(f): return self.send_error(404)
        body = open(f, "rb").read(); ct = mimetypes.guess_type(f)[0] or "application/octet-stream"
        self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Cache-Control", "no-store")
        if ct.startswith(TEXT) and "gzip" in self.headers.get("Accept-Encoding", ""):
            body = gzip.compress(body, 6); self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
