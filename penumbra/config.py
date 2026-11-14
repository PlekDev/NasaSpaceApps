"""Paths and site configuration (config/sites.yaml)."""
# AI-assisted (Claude, Anthropic); reviewed by the team.
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
CACHE = ROOT / "data" / "cache"
FIGURES = ROOT / "figures"

RADIUS_M = {"moon": 1737400.0, "mars": 3396190.0}


def load_config(path: Path | None = None) -> dict:
    with open(path or ROOT / "config" / "sites.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    for sid, s in cfg["sites"].items():
        s["id"] = sid
    return cfg


def references(cfg):
    return {k: v for k, v in cfg["sites"].items() if v["role"] == "reference"}


def candidates(cfg):
    return {k: v for k, v in cfg["sites"].items() if v["role"] == "candidate"}
