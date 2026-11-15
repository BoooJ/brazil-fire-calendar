import json
import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional, Union

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from previsao_fogo import COLUNAS_OBRIGATORIAS, PrevisorFogo

PASTA_ARTEFATOS = os.getenv("ARTEFATOS_PATH", "artefatos")
estado = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Carrega os modelos UMA vez, ao iniciar. Se falhar, a API não sobe.
    estado["previsor"] = PrevisorFogo(PASTA_ARTEFATOS)
    yield
    estado.clear()


app = FastAPI(title="API de Previsão de Fogo (próxima semana)", lifespan=lifespan)

# Em produção, troque "*" pelo endereço real do frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Deteccao(BaseModel):
    """Uma linha do CSV do FIRMS (somente VIIRS NOAA-20)."""
    latitude: float
    longitude: float
    acq_date: str                # AAAA-MM-DD
    acq_time: Union[int, str]    # HHMM, em UTC
    frp: float
    confidence: str              # l, n ou h
    type: Optional[int] = None   # opcional


class Pedido(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    raio_km: float = Field(50, gt=0, le=200)
    # Últimos 28 dias da região, com ~1 célula (0,05°) de margem além do raio.
    # Sem detecções: mande lista vazia e informe data_ref.
    deteccoes: list[Deteccao]
    # Último dia considerado. Padrão: último dia presente nas detecções.
    # Se esse dia estiver incompleto, informe ontem.
    data_ref: Optional[date] = None


@app.get("/health")
def health():
    cfg = estado["previsor"].cfg
    ano_alvo = int(cfg["ano_alvo"])
    resp = {"status": "ok", "climatologia_ano": ano_alvo, "sklearn": cfg["sklearn"]}
    if date.today().year != ano_alvo:
        resp["aviso"] = (f"A climatologia foi exportada para {ano_alvo}. "
                         "Peça a exportação de novo (exportar_artefatos.py).")
    return resp


@app.post("/prever")
def prever(p: Pedido):
    registros = [d.model_dump(exclude_none=True) for d in p.deteccoes]
    df = pd.DataFrame(registros, columns=None if registros else list(COLUNAS_OBRIGATORIAS))

    try:
        saida = estado["previsor"].prever_regiao(
            df, p.lat, p.lon, raio_km=p.raio_km, data_ref=p.data_ref
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    r = saida["resumo"]
    resumo = {
        "data_referencia": r["data_referencia"],
        "periodo_previsto": r["periodo_previsto"],
        "n_celulas": r["n_celulas"],
    }
    if r["n_celulas"] > 0:
        resumo.update(
            prob_media=round(r["prob_media"], 4),
            prob_max=round(r["prob_max"], 4),
            celulas_esperadas_com_fogo=round(r["celulas_esperadas_com_fogo"], 2),
            nivel_intensidade=r["nivel_intensidade"],
        )

    # O FRP numérico NÃO é exposto: está em unidade equivalente ao MODIS,
    # não é o FRP bruto. Mostre ao usuário só o risco e a classe de intensidade.
    celulas = saida["celulas"][["lat", "lon", "prob_fogo", "nivel_intensidade"]].copy()
    celulas[["lat", "lon", "prob_fogo"]] = celulas[["lat", "lon", "prob_fogo"]].astype("float64").round(4)

    return {
        "resumo": resumo,
        "celulas": json.loads(celulas.to_json(orient="records")),
        "avisos": saida["avisos"],
    }
