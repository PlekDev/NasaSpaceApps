"""Exporter "light" (owner: D. Lizárraga): proof 2, our light model against NASA's LOLA illumination map.

Reads   data/processed/stats/light_<site>.json and light_summary.json (written by scripts/stats/light_agreement.py)
Writes  web/public/data/light/<target>.json, light/summary.json and light/index.json
Nothing is computed here: the files are copied as they are, so the web shows exactly the numbers of data/processed.
Run on its own with:  python -I web/tools/exports/light.py      (the orchestrator in export_data.py also runs it)
AI-assisted (Claude, Anthropic); reviewed by the team."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from export_data import DATA, PROC, copy_atomic, read_json, source_stamp, write_json  # noqa: E402

NAME = "light"


def main():
    src, out = PROC / "stats", DATA / NAME
    files = []
    summary = src / "light_summary.json"
    if not summary.exists():
        print(f"{NAME}: no data/processed/stats/light_summary.json yet (run scripts/stats/light_agreement.py); nothing exported")
        return
    for sid in read_json(summary)["sites"]:
        f = src / f"light_{sid}.json"
        if f.exists():
            copy_atomic(f, out / f"{sid}.json"); files.append(f"{sid}.json")
    copy_atomic(summary, out / "summary.json"); files.append("summary.json")
    write_json(out / "index.json", dict(files=files, generated=source_stamp()[0]))
    print(f"{NAME}: exported {len(files)} files")


if __name__ == "__main__":
    main()
