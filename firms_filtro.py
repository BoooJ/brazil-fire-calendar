"""Focos de calor do NASA FIRMS, filtrados, como rota FastAPI.

Uso no main.py (duas linhas):
    from firms_filtro import router as firms_router
    app.include_router(firms_router)

Requer a variável de ambiente FIRMS_MAP_KEY (nunca coloque a chave no código).
Exemplo de chamada:
    GET /focos?area=-55,-15,-50,-10&confianca=n,h&frp_min=5&periodo=D
"""
import io
import json
import os
import time
from typing import Optional

import pandas as pd
import requests
from fastapi import APIRouter, HTTPException, Query

BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SENSORES = {"VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"}
CACHE_SEGUNDOS = 300  # evita repetir a mesma consulta e gastar o limite da chave
COLUNAS = ["latitude", "longitude", "frp", "confidence", "acq_date", "acq_time", "daynight", "satellite"]

router = APIRouter(prefix="/focos", tags=["FIRMS"])
_cache: dict = {}


def baixar(sensor: str, area: str, dias: int) -> pd.DataFrame:
    chave = os.environ.get("FIRMS_MAP_KEY")
    if not chave:
        raise RuntimeError("Variável de ambiente FIRMS_MAP_KEY não definida")
    k, agora = (sensor, area, dias), time.time()
    if k in _cache and agora - _cache[k][0] < CACHE_SEGUNDOS:
        return _cache[k][1]
    r = requests.get(f"{BASE}/{chave}/{sensor}/{area}/{dias}", timeout=60)
    if r.status_code != 200 or not r.text.startswith("latitude"):
        raise RuntimeError(r.text.strip()[:200] or f"HTTP {r.status_code}")
    df = pd.read_csv(io.StringIO(r.text))
    _cache[k] = (agora, df)
    return df


def filtrar(df: pd.DataFrame, sensor: str, confianca: list, frp_min: float, periodo: Optional[str]) -> pd.DataFrame:
    if sensor.startswith("MODIS"):  # no MODIS a confiança é numérica (0 a 100)
        df = df[pd.to_numeric(df["confidence"], errors="coerce") >= 30]
    elif confianca:  # no VIIRS: l (baixa), n (nominal), h (alta)
        df = df[df["confidence"].isin(confianca)]
    df = df[df["frp"] >= frp_min]
    if periodo:
        df = df[df["daynight"] == periodo]
    return df


@router.get("")
def listar_focos(
    sensor: str = "VIIRS_SNPP_NRT",
    area: str = Query("-74,-34.5,-34,6", description="oeste,sul,leste,norte (padrão: Brasil)"),
    dias: int = Query(1, ge=1, le=5),
    confianca: str = Query("n,h", description="VIIRS: l, n, h separados por vírgula"),
    frp_min: float = Query(0, ge=0, description="intensidade mínima, em MW"),
    periodo: Optional[str] = Query(None, description="D (dia) ou N (noite)"),
    limite: int = Query(5000, ge=1, le=50000),
):
    if sensor not in SENSORES:
        raise HTTPException(400, f"Sensor inválido. Use um destes: {sorted(SENSORES)}")
    if periodo is not None and periodo not in ("D", "N"):
        raise HTTPException(400, "periodo deve ser D ou N")
    try:
        oeste, sul, leste, norte = [float(x) for x in area.split(",")]
        assert oeste < leste and sul < norte
    except Exception:
        raise HTTPException(400, "area deve ser 'oeste,sul,leste,norte', por exemplo -55,-15,-50,-10")

    try:
        df = baixar(sensor, area, dias)
    except Exception as e:
        raise HTTPException(502, f"Falha ao consultar o FIRMS: {e}")

    lista = [c.strip().lower() for c in confianca.split(",") if c.strip()]
    saida = filtrar(df, sensor, lista, frp_min, periodo)
    cols = [c for c in COLUNAS if c in saida.columns]
    return {
        "total_baixado": len(df),
        "total_filtrado": len(saida),
        "retornados": min(len(saida), limite),
        "focos": json.loads(saida[cols].head(limite).to_json(orient="records")),
    }
