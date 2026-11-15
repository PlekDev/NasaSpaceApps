"""Template for a web data exporter (copy to web/tools/exports/<name>.py; files starting with "_" are skipped).

Reads data/processed/ only, writes web/public/data/<name>/ only, ends with write_index(). Contract: README.md here.
AI-assisted (Claude); reviewed by the author."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # web/tools, for export_data's helpers (run with python -I)
from export_data import DATA, PROC, read_json, write_index, write_json  # noqa: E402

NAME = Path(__file__).stem          # "_template" here; your exporter's folder is web/public/data/<NAME>/
STUB = True                         # set False once the real numbers are in data/processed/


def main():
    files = []
    if STUB:
        write_json(DATA / NAME / "example.json", {"_stub": True, "values": [0, 0, 0]})
    else:
        src = read_json(PROC / "example.json")                         # your result file in data/processed/
        write_json(DATA / NAME / "example.json", {"values": src["values"]})
    files.append("example.json")
    write_index(NAME, files, {"_stub": True} if STUB else None)


if __name__ == "__main__":
    main()
