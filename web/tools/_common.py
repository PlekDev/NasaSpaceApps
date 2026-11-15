"""Shared helpers for the developer scripts in web/tools and web/tests (cross-platform: pathlib, tempfile, no hard-coded /tmp)."""
import os, sys, tempfile
from pathlib import Path

OUT = Path(os.environ.get("PEN_OUT") or tempfile.gettempdir()) / "pen-web"          # screenshots and reports
OUT.mkdir(parents=True, exist_ok=True)
AXE_JS = Path(os.environ.get("AXE_JS") or Path(tempfile.gettempdir()) / "axe" / "node_modules" / "axe-core" / "axe.min.js")
GL_ARGS = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] if sys.platform.startswith("linux") else []


def launch_chromium(p):
    """Playwright's own Chromium by default; set CHROME=<path to a system Chromium/Chrome> to use that instead (needed on this Linux box)."""
    exe = os.environ.get("CHROME")
    return p.chromium.launch(executable_path=exe, args=GL_ARGS) if exe else p.chromium.launch(args=GL_ARGS)


def launch(p, browser="chromium"):
    return launch_chromium(p) if browser == "chromium" else getattr(p, browser).launch()


def shot_path(name):
    return str(OUT / name)
