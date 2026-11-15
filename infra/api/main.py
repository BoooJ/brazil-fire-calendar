"""Brazil Fire Calendar API - implements docs/api-contract.md (v0.4).

Run from the repo root (loads ~25 M fire-days in memory, takes a few seconds):
    .venv/Scripts/python -m uvicorn main:app --app-dir infra/api --port 8000
Interactive docs: http://localhost:8000/docs
"""
from __future__ import annotations

import json
import math
import os
import sys
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import date
from functools import partial
from pathlib import Path
from typing import Literal

import numpy as np
import shapely
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from shapely.geometry import shape

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "pipeline"))
from _common import data_dir, load_env  # noqa: E402
from analysis import FIRST_YEAR, SAT_PERIODS, SATELLITES, build_analysis, build_weekly, days_in_month  # noqa: E402
from forecast import FIRST_REF, Forecaster, find_model_dir  # noqa: E402
from presets import PRESETS, box  # noqa: E402
from store import Store  # noqa: E402

CONTRACT_VERSION = "0.4"
MAX_POINTS = 1000
MIN_AREA_KM2 = 4.0    # the data is on a ~1.1 km grid: smaller areas may contain no grid cell at all
CACHE_SIZE = 256      # analysis answers kept in memory (presets and recently viewed areas)
_cache: OrderedDict[str, dict] = OrderedDict()
_cache_lock = threading.Lock()


def _cache_get(key: str) -> dict | None:
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    return None


def _cache_put(key: str, value: dict) -> None:
    with _cache_lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)


def _load_forecast() -> None:
    """Load the science team's next-week model. If it fails, every other endpoint keeps working."""
    global FORECAST, FORECAST_STATE
    started = time.monotonic()
    folder = find_model_dir()
    if folder is None:
        FORECAST_STATE = "missing"
        print("Forecast model not found (science/forecast): /api/forecast is off.", flush=True)
        return
    try:
        FORECAST = Forecaster(folder)
        FORECAST_STATE = "ready"
        print(f"Forecast model loaded in {time.monotonic() - started:.0f} s", flush=True)
    except Exception as exc:
        FORECAST_STATE = "failed"
        print(f"Forecast model failed to load: {type(exc).__name__}: {exc}", flush=True)


def _warm_cache() -> None:
    """Load the forecast model, then compute the preset areas once, so they answer instantly (even all of Brazil)."""
    _load_forecast()
    started = time.monotonic()
    weekly_request = partial(AreaRequest, period="week")
    for run, body in ((run_analysis, AreaRequest), (run_analysis, weekly_request), (run_forecast, ForecastRequest)):
        for preset in PRESETS:
            try:
                run(body(area=preset["area"]))
            except Exception as exc:  # warming must never break the API
                print(f"cache warm-up failed for {preset['id']} ({run.__name__}): {exc}", flush=True)
    print(f"Presets pre-computed in {time.monotonic() - started:.0f} s", flush=True)


BRAZIL = shape(box(-74.0, -33.8, -34.8, 5.3))
STORE: Store | None = None
FORECAST: Forecaster | None = None
FORECAST_STATE = "loading"  # loading -> ready | missing | failed


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code, self.message, self.status = code, message, status


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global STORE
    started = time.monotonic()
    STORE = Store(data_dir())
    print(f"Data loaded in {time.monotonic() - started:.0f} s (last complete day: {STORE.last_day}, "
          f"newest data: {STORE.newest_day})", flush=True)
    threading.Thread(target=_warm_cache, daemon=True).start()
    yield


load_env()
app = FastAPI(title="Brazil Fire Calendar API", version=CONTRACT_VERSION, lifespan=lifespan)
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-Truncated", "Content-Disposition"])


@app.exception_handler(ApiError)
async def _api_error(_request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(RequestValidationError)
async def _validation_error(_request, exc: RequestValidationError):
    fields = {str(part) for err in exc.errors() for part in err.get("loc", ())}
    code = "INVALID_DATES" if fields & {"start", "end", "ref_date", "year", "month", "period"} else "INVALID_AREA"
    return JSONResponse(status_code=400, content={"error": {"code": code, "message": exc.errors()[0].get("msg", "")}})


@app.exception_handler(Exception)
async def _server_error(_request, exc: Exception):
    print(f"SERVER_ERROR: {type(exc).__name__}: {exc}", flush=True)
    return JSONResponse(status_code=500, content={"error": {"code": "SERVER_ERROR", "message": "Unexpected server error."}})


# ---------------------------------------------------------------- request models and helpers
class AreaRequest(BaseModel):
    area: dict
    start: date | None = None
    end: date | None = None
    ref_date: date | None = None
    period: Literal["month", "week"] = "month"  # "week" adds calendar_weekly + average_by_week (contract v0.4)


class HotspotsRequest(BaseModel):
    area: dict
    year: int
    month: int
    limit: int = 5000


class ForecastRequest(BaseModel):
    area: dict
    ref_date: date | None = None
    limit: int = 2000


def parse_area(area: dict):
    if area.get("type") not in ("Polygon", "MultiPolygon"):
        raise ApiError("INVALID_AREA", "The area must be a GeoJSON Polygon or MultiPolygon.")
    try:
        geom = shape(area)
    except Exception:
        raise ApiError("INVALID_AREA", "The polygon could not be read.")
    if shapely.get_num_coordinates(geom) > MAX_POINTS:
        raise ApiError("AREA_TOO_COMPLEX", f"The area has more than {MAX_POINTS} points.")
    if geom.is_empty:
        raise ApiError("INVALID_AREA", "The polygon is empty.")
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
    shapely.prepare(geom)
    return geom


def resolve_dates(start: date | None, end: date | None, ref: date | None) -> tuple[date, date, date]:
    last = STORE.last_day
    first = date(FIRST_YEAR, 1, 1)
    end = min(end or last, last)
    start = max(start or first, first)
    if start > end:
        raise ApiError("INVALID_DATES", "start is after end (or after the last day with data).")
    ref = min(ref or end, end)
    if ref < first:
        raise ApiError("INVALID_DATES", f"ref_date must be in {FIRST_YEAR} or later.")
    if (ref.year, ref.month) == (end.year, end.month):
        end = ref  # "as of ref_date"
    return start, end, ref


def area_km2(geom) -> float:
    return geom.area * 111.32 ** 2 * math.cos(math.radians(geom.centroid.y))


def run_analysis(req: AreaRequest) -> dict:
    geom = parse_area(req.area)
    start, end, ref = resolve_dates(req.start, req.end, req.ref_date)
    key = json.dumps({"area": req.area, "start": start.isoformat(), "end": end.isoformat(),
                      "ref": ref.isoformat(), "period": req.period, "data": STORE.data_updated}, sort_keys=True)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    result = _compute_analysis(geom, start, end, ref, req.period)
    _cache_put(key, result)
    return result


def _compute_analysis(geom, start: date, end: date, ref: date, period: str = "month") -> dict:
    harm = STORE.harm
    ref_partial = (ref.year, ref.month) == (end.year, end.month) and ref.day < days_in_month(ref.year, ref.month)
    cur = STORE.con.cursor()
    try:
        sel = STORE.select_cells(geom)
        box = STORE.bounds(sel)
        cur.register("sel", sel)
        monthly = STORE.monthly(cur, end, box)
        same = STORE.same_days(cur, ref.month, ref.day, ref.year, box) if ref_partial else {}
        estimated = STORE.estimated_fires(cur, harm.source(ref.year, ref.month), ref.year, ref.month,
                                          ref.day if ref_partial else 31, box)
        weekly = STORE.weekly(cur, end, box) if period == "week" else None
    finally:
        cur.close()
    validation = STORE.harm_spec.get("validation", {})
    reliability = {
        "median_error_pct": validation.get("median_abs_error_pct"),
        "validated_years": validation.get("validated_years", []),
        "note": STORE.harm_spec.get("reliability_note")
                or "Brazil-wide factors, tested on Brazil totals for 2018-2019. Small areas have larger errors.",
    }
    km2 = area_km2(geom)
    if not geom.intersects(BRAZIL):
        warning = "This area is outside the region we cover (Brazil)."
    elif km2 < MIN_AREA_KM2:
        warning = (f"This area is very small ({km2:.1f} km²). The data is on a ~1 km grid, "
                   "so draw an area at least ~2 km across to see fires.")
    else:
        warning = None
    result = build_analysis(monthly=monthly, same_days=same, estimated_fires=estimated, harm=harm,
                            start=start, end=end, ref=ref, area_km2=km2,
                            data_updated=STORE.data_updated, reliability=reliability, warning=warning)
    if weekly is not None:
        result.update(build_weekly(weekly=weekly, harm=harm, start=start, end=end, ref=ref))
    return result


def run_forecast(req: ForecastRequest) -> dict:
    if FORECAST is None:
        message = ("The forecast model is still loading, try again in a few seconds." if FORECAST_STATE == "loading"
                   else "The forecast model is not available on this server.")
        raise ApiError("FORECAST_UNAVAILABLE", message, 503)
    geom = parse_area(req.area)
    latest = STORE.last_day  # the last complete day (see Store)
    ref = min(req.ref_date or latest, latest)
    if ref < FIRST_REF:
        raise ApiError("INVALID_DATES", f"ref_date must be {FIRST_REF.isoformat()} or later (NOAA-20 data).")
    limit = max(1, min(req.limit, 20_000))
    key = json.dumps({"forecast": req.area, "ref": ref.isoformat(), "limit": limit,
                      "data": STORE.data_updated}, sort_keys=True)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    cur = STORE.con.cursor()
    try:
        result = FORECAST.run(STORE, cur, geom, ref, limit)
    finally:
        cur.close()
    if not geom.intersects(BRAZIL):
        result["notes"].insert(0, "This area is outside the region we cover (Brazil).")
    result = {"query": {"ref_date": ref.isoformat(), "area_km2": round(area_km2(geom), 1)},
              "data_updated": STORE.data_updated, **{k: v for k, v in result.items() if k != "ref_date"}}
    _cache_put(key, result)
    return result


def _csv(df, filename: str, truncated: bool = False) -> Response:
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if truncated:
        headers["X-Truncated"] = "true"
    return Response(content=df.to_csv(index=False), media_type="text/csv", headers=headers)


# ---------------------------------------------------------------- endpoints
@app.get("/api/presets")
def presets():
    return {"presets": PRESETS}


@app.get("/api/status")
def status():
    final = STORE.final_until.get("viirs_noaa20")
    return {
        "data_updated": STORE.data_updated,
        "contract_version": CONTRACT_VERSION,
        "calendar_from": f"{FIRST_YEAR}-01",
        "final_until": final.isoformat() if final else None,
        "coverage": [{"satellite": s, "from": SAT_PERIODS[s][0].isoformat(),
                      "to": SAT_PERIODS[s][1].isoformat() if SAT_PERIODS[s][1] else None} for s in SATELLITES],
        "forecast_available": FORECAST is not None,
    }


@app.post("/api/analysis")
def analysis(req: AreaRequest):
    return run_analysis(req)


@app.post("/api/forecast")
def forecast(req: ForecastRequest):
    return run_forecast(req)


@app.post("/api/hotspots")
def hotspots(req: HotspotsRequest):
    if not 1 <= req.month <= 12:
        raise ApiError("INVALID_DATES", "month must be 1-12.")
    geom = parse_area(req.area)
    cur = STORE.con.cursor()
    try:
        df, _ = STORE.hotspots_in(cur, geom, year=req.year, month=req.month)
    finally:
        cur.close()
    total = len(df)
    limit = max(1, min(req.limit, 50_000))
    if total > limit:
        df = df.iloc[np.linspace(0, total - 1, limit).astype(int)]
    features = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(float(r.longitude), 4), round(float(r.latitude), 4)]},
        "properties": {
            "date": str(r.acq_date)[:10],
            "time_utc": r.acq_time, "satellite": r.satellite, "confidence": r.confidence,
            "confidence_raw": r.confidence_raw, "frp": None if r.frp != r.frp else float(r.frp),
            "daynight": r.daynight, "provisional": r.data_version == "provisional",
        },
    } for r in df.itertuples(index=False)]
    return {"type": "FeatureCollection", "total": total, "returned": len(features),
            "truncated": total > len(features), "features": features}


@app.post("/api/export/hotspots.csv")
def export_hotspots(req: AreaRequest):
    geom = parse_area(req.area)
    start, end, _ = resolve_dates(req.start, req.end, req.ref_date)
    cur = STORE.con.cursor()
    try:
        df, total_bbox = STORE.hotspots_in(cur, geom, start=start, end=end)
    finally:
        cur.close()
    df = df.rename(columns={"acq_time": "acq_time_utc"})
    return _csv(df, f"hotspots_{start:%Y%m%d}_{end:%Y%m%d}.csv", truncated=total_bbox > 1_000_000)


@app.post("/api/export/calendar.csv")
def export_calendar(req: AreaRequest):
    import pandas as pd
    result = run_analysis(req)
    rows = [{**{k: c[k] for k in ("year", "month", "count", "vs_avg_pct", "rank", "of_years",
                                   "provisional", "uncertain", "partial")},
             **{f"detected_{s}": c["detected"][s] for s in SATELLITES}} for c in result["calendar"]]
    q = result["query"]
    return _csv(pd.DataFrame(rows), f"calendar_{q['start']}_{q['end']}.csv")


@app.post("/api/update")
def update():
    return {"status": "failed", "data_updated": STORE.data_updated, "new_hotspots": 0,
            "message": "The daily update is not implemented yet."}
