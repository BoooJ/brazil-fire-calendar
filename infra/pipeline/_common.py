"""Shared helpers for the pipeline scripts: read .env and locate DATA_DIR."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    """Read KEY=VALUE lines from the repo's .env into the environment (values are never printed)."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def data_dir() -> Path:
    """DATA_DIR from the environment or .env. Refuses a folder inside OneDrive."""
    load_env()
    value = os.environ.get("DATA_DIR")
    if not value:
        sys.exit("DATA_DIR is not set. Copy .env.example to .env and set DATA_DIR (outside OneDrive).")
    path = Path(value)
    if "onedrive" in str(path).lower():
        sys.exit(f"DATA_DIR is inside OneDrive ({path}). Use a folder outside it, e.g. C:/fire-data.")
    return path
