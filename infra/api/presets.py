"""Preset areas for the website buttons: plain boxes we define ourselves (no outside border data)."""
from __future__ import annotations


def box(w: float, s: float, e: float, n: float) -> dict:
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


PRESETS = [
    {"id": "brazil", "name": "All of Brazil", "area": box(-74.0, -33.8, -34.8, 5.3)},
    {"id": "pantanal", "name": "Pantanal", "area": box(-58.5, -22.0, -55.0, -15.5)},
    {"id": "roraima", "name": "Roraima", "area": box(-64.8, -1.5, -59.0, 5.2)},
    {"id": "southern_amazon", "name": "Southern Amazon", "area": box(-64.0, -12.0, -50.0, -7.0)},
]
