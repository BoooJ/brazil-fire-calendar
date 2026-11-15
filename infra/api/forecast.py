"""Next-week fire chance for an area, using the science team's model (science/forecast/previsao_fogo.py).

The model needs the last 28 days of VIIRS NOAA-20 detections around the area. The API reads them from
our own cleaned NASA FIRMS data, so the website only sends the area. The model works on a circle: we use
the circle around the area, then keep the model's 5 km cells whose centre is inside the area.
"""
from __future__ import annotations

import importlib.util
import math
import os
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import shapely

HERE = Path(__file__).resolve().parent
LAG_DAYS = 28                 # the model looks at 4 weeks of detections
FIRST_REF = date(2018, 4, 29)  # NOAA-20 data starts 2018-04-01
UTC_OFFSET_H = -3             # the model counts days in Brazil time (UTC-3)
LABEL = "Model estimate (experimental), not an official fire warning."
INTENSITY = {"baixa": "low", "media": "medium", "alta": "high"}
# Reported by the model's author (science team) on years the model never saw. Update if the model changes.
RELIABILITY = {
    "auc": 0.87,
    "baseline_auc": 0.76,
    "test_years": [2023, 2024, 2025],
    "note": "Tested on 2023-2025, years the model never saw: AUC 0.87 (1 = perfect, 0.5 = coin flip). "
            "Using only the usual pattern for that week of the year gives 0.76.",
}
# Messages of the science module we replace with our own (English) wording.
_KNOWN_PT = ("Nenhuma deteccao valida", "Nenhuma celula com historico", "A climatologia foi exportada")


def find_model_dir() -> Path | None:
    """science/forecast in the repo, or forecast/ next to api/ in the Docker image."""
    for folder in (os.environ.get("FORECAST_DIR"), HERE.parent / "forecast", HERE.parents[1] / "science" / "forecast"):
        if folder and (Path(folder) / "previsao_fogo.py").exists():
            return Path(folder)
    return None


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _period_text(first: date, last: date) -> str:
    return f"{first.day} {first:%b} - {last.day} {last:%b %Y}"


class Forecaster:
    def __init__(self, folder: Path):
        spec = importlib.util.spec_from_file_location("previsao_fogo", folder / "previsao_fogo.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.model = module.PrevisorFogo(str(folder / "artefatos"))
        self.cell_deg = float(module.CELL)
        self.cell_km = 5  # 0.05 degrees is about 5.5 km; the model calls it a 5 km cell
        self.model_year = int(self.model.cfg["ano_alvo"])
        try:  # reading the model's tables leaves ~140 MB in pyarrow's memory pool: give it back
            import pyarrow as pa
            pa.default_memory_pool().release_unused()
        except Exception:
            pass

    def run(self, store, cur, geom, ref: date, limit: int) -> dict:
        w, s, e, n = geom.bounds
        lat0, lon0 = (s + n) / 2, (w + e) / 2
        radius = max(_km(lat0, lon0, la, lo) for la in (s, n) for lo in (w, e)) + 2 * self.cell_deg * 111
        margin = 2 * self.cell_deg  # neighbour cells count too
        det = store.noaa20_detections(cur, (w - margin, s - margin, e + margin, n + margin),
                                      ref - timedelta(days=LAG_DAYS), ref + timedelta(days=1))
        out = self.model.prever_regiao(det, lat0, lon0, raio_km=radius, data_ref=pd.Timestamp(ref))
        cells = out["celulas"]
        if len(cells):
            lon, lat = cells["lon"].to_numpy(float), cells["lat"].to_numpy(float)
            inside = shapely.contains_xy(geom, lon, lat)
            if not inside.any():  # area smaller than one 5 km cell: use the cells it touches
                half = self.cell_deg / 2
                inside = shapely.intersects(geom, shapely.box(lon - half, lat - half, lon + half, lat + half))
            cells = cells[inside]
        cells = cells.sort_values("prob_fogo", ascending=False, kind="stable").reset_index(drop=True)

        first, last = ref + timedelta(days=1), ref + timedelta(days=7)
        recent = self._recent_in_area(det, geom, ref)
        p = cells["prob_fogo"].to_numpy(float)
        if len(p):
            log_intensity = np.log1p(cells["frp_se_houver_fogo"].to_numpy(float))
            weights = p / p.sum() if p.sum() > 0 else np.full(len(p), 1.0 / len(p))
            level = INTENSITY[str(self.model._nivel(np.array([float((weights * log_intensity).sum())]))[0])]
            summary = {
                "cells": int(len(p)),
                "expected_cells_with_fire": round(float(p.sum()), 1),
                "expected_share_pct": round(float(p.mean()) * 100, 2),
                "max_probability": round(float(p.max()), 3),
                "intensity_if_fire": level,
                "recent_detections": recent,
            }
        else:
            summary = {"cells": 0, "expected_cells_with_fire": 0.0, "expected_share_pct": None,
                       "max_probability": None, "intensity_if_fire": None, "recent_detections": recent}

        top = cells.head(max(1, min(limit, 20_000)))
        features = [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(float(r.lon), 3), round(float(r.lat), 3)]},
            "properties": {"probability": round(float(r.prob_fogo), 3),
                           "intensity_if_fire": INTENSITY.get(str(r.nivel_intensidade))},
        } for r in top.itertuples(index=False)]

        notes = [a for a in out["avisos"] if not a.startswith(_KNOWN_PT)]
        if summary["cells"] == 0:
            notes.append(f"No {self.cell_km} km cell in this area has a fire history in the model, "
                         "so there is nothing to estimate.")
        elif recent == 0:
            notes.append(f"No fire was detected here in the {LAG_DAYS} days before {ref.isoformat()}: "
                         "the estimate rests on the usual pattern for this week of the year.")
        if first.year < self.model_year:
            notes.append("Replaying a past date: the model learned from data that includes this period, "
                         "so it will look more accurate than a real forecast.")
        elif last.year > self.model_year:
            notes.append(f"The model's seasonal reference was built for {self.model_year}. "
                         "Ask the science team to re-export it (exportar_artefatos.py).")

        return {
            "ref_date": ref.isoformat(),
            "based_on": {"satellite": "viirs_noaa20",
                         "from": (ref - timedelta(days=LAG_DAYS - 1)).isoformat(), "to": ref.isoformat()},
            "period": {"from": first.isoformat(), "to": last.isoformat()},
            "label": LABEL,
            "cell_size_km": self.cell_km,
            "summary": summary,
            "briefing": self._briefing(summary, first, last, ref),
            "reliability": RELIABILITY,
            "total": int(len(cells)), "returned": len(features), "truncated": len(cells) > len(features),
            "cells": {"type": "FeatureCollection", "features": features},
            "notes": notes,
        }

    @staticmethod
    def _recent_in_area(det: pd.DataFrame, geom, ref: date) -> int:
        """Valid NOAA-20 detections inside the area in the model's 28-day window (days in Brazil time)."""
        if det.empty:
            return 0
        hhmm = pd.to_numeric(det["acq_time"], errors="coerce").fillna(0).astype(int)
        local = (pd.to_datetime(det["acq_date"]) + pd.to_timedelta(hhmm // 100, unit="h")
                 + pd.to_timedelta(hhmm % 100, unit="m") + pd.Timedelta(hours=UTC_OFFSET_H)).dt.floor("D")
        end = pd.Timestamp(ref)
        window = ((local <= end) & (local > end - pd.Timedelta(days=LAG_DAYS))).to_numpy()
        inside = shapely.contains_xy(geom, det["longitude"].to_numpy(float), det["latitude"].to_numpy(float))
        return int((window & inside).sum())

    def _briefing(self, summary: dict, first: date, last: date, ref: date) -> str:
        period = _period_text(first, last)
        if summary["cells"] == 0:
            return f"For {period}, the model has no {self.cell_km} km cell with a fire history in this area. {LABEL}"
        return (f"For {period}, the model expects fire in about {summary['expected_cells_with_fire']:,.0f} of the "
                f"{summary['cells']:,} cells ({self.cell_km} km) of this area that have burned before "
                f"({summary['expected_share_pct']:.1f} %). The highest chance in one cell is "
                f"{summary['max_probability'] * 100:.0f} %. If fires happen, their intensity would most likely be "
                f"{summary['intensity_if_fire']}. Based on {summary['recent_detections']:,} NASA FIRMS VIIRS "
                f"NOAA-20 detections here in the {LAG_DAYS} days up to {ref:%d %b %Y}. {LABEL}")
