"""Previsao de fogo para a proxima semana, por celula de 5 km (FIRMS VIIRS NOAA-20).

Uso (back end):

    from previsao_fogo import PrevisorFogo

    previsor = PrevisorFogo("./artefatos")          # carrega uma vez, ao iniciar a API
    saida = previsor.prever_regiao(deteccoes, lat=-27.6, lon=-48.6, raio_km=50)

    saida["resumo"]    # dict com o resumo da regiao
    saida["celulas"]   # DataFrame: uma linha por celula
    saida["avisos"]    # lista de textos (vazia se esta tudo certo)

ENTRADA `deteccoes` (DataFrame, formato do CSV do FIRMS, so VIIRS NOAA-20):
    latitude, longitude, acq_date, acq_time, frp, confidence  (obrigatorias)
    type                                                      (opcional; se existir, usa type == 0)
  - Precisa cobrir os ULTIMOS 28 DIAS da regiao, com ~1 celula (0,05 grau) de margem
    alem do raio. "Ultimas horas" nao basta: o modelo usa 4 semanas de historico.
  - Se a regiao nao teve nenhuma deteccao, mande o DataFrame vazio (com as colunas) e
    informe data_ref. Isso e valido: significa "sem fogo recente".
  - acq_time em UTC (formato HHMM). O modulo converte para UTC-3.

`data_ref`: ultimo dia (inclusive) considerado. Padrao: ultimo dia presente nas
deteccoes. Se o ultimo dia estiver incompleto, passe data_ref = ontem.
A previsao vale para os 7 dias seguintes a data_ref.
"""
import json
import os

import joblib
import numpy as np
import pandas as pd

CELL = 0.05
BLOCO = 100
N_LAGS = 4
FUSO_HORAS = -3
SEM_LOG = ("doy_sin", "doy_cos", "lat", "lon")
COLUNAS_OBRIGATORIAS = ("latitude", "longitude", "acq_date", "acq_time", "frp", "confidence")
COLUNAS_CELULAS = ["cy", "cx", "lat", "lon", "prob_fogo", "frp_se_houver_fogo", "nivel_intensidade"]


class PrevisorFogo:
    def __init__(self, pasta):
        pasta = os.path.expanduser(pasta)
        with open(os.path.join(pasta, "config.json"), encoding="utf-8") as f:
            self.cfg = json.load(f)
        mod = joblib.load(os.path.join(pasta, self.cfg["arquivo_modelos"]))
        self.clf, self.reg, self.features = mod["presenca"], mod["intensidade"], list(mod["features"])
        cal = joblib.load(os.path.join(pasta, "calibracao.joblib"))
        self.f_n, self.g_n = cal["f_n"].to_dict(), float(cal["g_n"])
        self.f_f, self.g_f = cal["f_f"].to_dict(), float(cal["g_f"])
        self.div = max(int(self.cfg["ano_alvo"]) - 2000, 1)
        self.celulas = pd.read_parquet(os.path.join(pasta, "celulas.parquet"))
        self.clim = {
            nome: {w: g for w, g in pd.read_parquet(os.path.join(pasta, f"clim_{nome}.parquet")).groupby("woy")}
            for nome in ("cel", "cel3", "reg")
        }

    # ------------------------------------------------------------------ entrada
    def _filtrar(self, det):
        faltam = [c for c in COLUNAS_OBRIGATORIAS if c not in det.columns]
        if faltam:
            raise ValueError(f"Faltam colunas nas deteccoes: {faltam}")
        d = det.copy()
        if "type" in d.columns:
            d = d[pd.to_numeric(d["type"], errors="coerce") == 0]
        conf = d["confidence"].astype(str).str.strip().str.lower().str[:1]
        d = d[conf.isin(["n", "h"])].copy()
        hhmm = pd.to_numeric(d["acq_time"], errors="coerce").fillna(0).astype(int)
        dt = (pd.to_datetime(d["acq_date"]) + pd.to_timedelta(hhmm // 100, unit="h")
              + pd.to_timedelta(hhmm % 100, unit="m") + pd.Timedelta(hours=FUSO_HORAS))
        d["dia"] = dt.dt.floor("D")
        d["frp"] = pd.to_numeric(d["frp"], errors="coerce").astype("float32")
        d["cy"] = np.floor(d["latitude"].astype("float32") / CELL).astype("int32")
        d["cx"] = np.floor(d["longitude"].astype("float32") / CELL).astype("int32")
        return d.dropna(subset=["frp"])

    def _celulas_na_regiao(self, lat, lon, raio_km):
        c = self.celulas
        clat = (c["cy"].to_numpy() + 0.5) * CELL
        clon = (c["cx"].to_numpy() + 0.5) * CELL
        dlat = raio_km / 111.0
        dlon = raio_km / (111.0 * max(np.cos(np.radians(lat)), 0.1))
        m = (np.abs(clat - lat) <= dlat) & (np.abs(clon - lon) <= dlon)
        c, clat, clon = c[m].copy(), clat[m], clon[m]
        p1, p2 = np.radians(lat), np.radians(clat)
        a = (np.sin((p2 - p1) / 2) ** 2
             + np.cos(p1) * np.cos(p2) * np.sin(np.radians(clon - lon) / 2) ** 2)
        dist = 2 * 6371.0 * np.arcsin(np.sqrt(a))
        c["lat"], c["lon"] = clat, clon
        return c[dist <= raio_km].reset_index(drop=True)

    def _juntar_clim(self, X, nome, woy, chave, col):
        t = self.clim[nome].get(woy)
        if t is None:
            X[col] = np.float32(0.0)
            return X
        t = t[chave + ["soma"]].rename(columns={"soma": col})
        X = X.merge(t, on=chave, how="left")
        X[col] = (X[col].fillna(0) / self.div).astype("float32")
        return X

    # ---------------------------------------------------------------- features
    def _features(self, deteccoes, lat, lon, raio_km, data_ref):
        avisos = []
        d = self._filtrar(deteccoes)
        if data_ref is None:
            if d.empty:
                raise ValueError("Sem deteccoes validas e sem data_ref: informe data_ref.")
            data_ref = d["dia"].max()
        data_ref = pd.Timestamp(data_ref).normalize()
        alvo = data_ref + pd.Timedelta(days=1)
        if d.empty:
            avisos.append("Nenhuma deteccao valida na entrada: previsao baseada so na climatologia.")

        cand = self._celulas_na_regiao(lat, lon, raio_km)
        if cand.empty:
            return None, avisos + ["Nenhuma celula com historico de fogo dentro do raio."], data_ref, alvo

        # blocos moveis de 7 dias terminando em data_ref: k=0 (ultimos 7 dias) ... k=3
        d = d[(d["dia"] <= data_ref) & (d["dia"] > data_ref - pd.Timedelta(days=7 * N_LAGS))].copy()
        d["k"] = ((data_ref - d["dia"]).dt.days // 7).astype("int8")
        g = (d.groupby(["cy", "cx", "k"], as_index=False)
               .agg(n_det=("frp", "size"), frp_sum=("frp", "sum")))
        if g.empty:
            g = pd.DataFrame({"cy": pd.Series(dtype="int32"), "cx": pd.Series(dtype="int32"),
                              "k": pd.Series(dtype="int8"), "n_det": pd.Series(dtype="int64"),
                              "frp_sum": pd.Series(dtype="float32")})

        # calibracao VIIRS -> equivalente MODIS (fator por regiao e mes, como no treino)
        inicio = data_ref - pd.to_timedelta(g["k"].astype(int) * 7 + 6, unit="D")
        mes = inicio.dt.month.to_numpy()
        regs = ((g["cy"] // BLOCO).astype(str) + "_" + (g["cx"] // BLOCO).astype(str)).to_numpy()
        fn = np.array([self.f_n.get((r, m), self.g_n) for r, m in zip(regs, mes)], dtype="float64")
        ff = np.array([self.f_f.get((r, m), self.g_f) for r, m in zip(regs, mes)], dtype="float64")
        g["n_harm"] = (g["n_det"].to_numpy() * fn).astype("float32")
        g["frp_harm"] = (g["frp_sum"].to_numpy() * ff).astype("float32")

        # vizinhanca: soma das 8 celulas vizinhas, por bloco
        nbs = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if (dy, dx) != (0, 0):
                    p = g[["cy", "cx", "k", "n_harm"]].copy()
                    p["cy"] = p["cy"] + dy
                    p["cx"] = p["cx"] + dx
                    nbs.append(p)
        nb = pd.concat(nbs, ignore_index=True).groupby(["cy", "cx", "k"], as_index=False)["n_harm"].sum()

        X = cand[["cy", "cx", "lat", "lon"]].copy()
        lagcols = []
        for k in range(N_LAGS):
            gk = (g[g["k"] == k][["cy", "cx", "n_harm", "frp_harm"]]
                  .rename(columns={"n_harm": f"n_l{k}", "frp_harm": f"frp_l{k}"}))
            nk = nb[nb["k"] == k][["cy", "cx", "n_harm"]].rename(columns={"n_harm": f"nb_l{k}"})
            X = X.merge(gk, on=["cy", "cx"], how="left").merge(nk, on=["cy", "cx"], how="left")
            lagcols += [f"n_l{k}", f"frp_l{k}", f"nb_l{k}"]
        X[lagcols] = X[lagcols].fillna(0).astype("float32")

        # climatologia (so anos anteriores ao ano_alvo, vinda dos artefatos)
        woy = int((alvo.dayofyear - 1) // 7)
        X = self._juntar_clim(X, "cel", woy, ["cy", "cx"], "clim_n")
        X = self._juntar_clim(X, "cel3", woy, ["cy", "cx"], "clim_n3")
        X["ry"] = (X["cy"] // BLOCO).astype("int16")
        X["rx"] = (X["cx"] // BLOCO).astype("int16")
        X = self._juntar_clim(X, "reg", woy, ["ry", "rx"], "clim_reg")

        # calendario e posicao da semana-alvo
        doy = alvo.dayofyear
        X["doy_sin"] = np.float32(np.sin(2 * np.pi * doy / 365.25))
        X["doy_cos"] = np.float32(np.cos(2 * np.pi * doy / 365.25))
        X["lat"] = ((X["cy"] + 0.5) * CELL).astype("float32")
        X["lon"] = ((X["cx"] + 0.5) * CELL).astype("float32")
        if alvo.year != int(self.cfg["ano_alvo"]):
            avisos.append(f"A climatologia foi exportada para {self.cfg['ano_alvo']}, "
                          f"mas a semana prevista e de {alvo.year}. Rode exportar_artefatos.py de novo.")
        return X, avisos, data_ref, alvo

    # --------------------------------------------------------------- previsao
    def _nivel(self, li):
        a, b = self.cfg["limiar_log_baixa_media"], self.cfg["limiar_log_media_alta"]
        return np.where(li < a, "baixa", np.where(li < b, "media", "alta"))

    def prever_regiao(self, deteccoes, lat, lon, raio_km=50.0, data_ref=None):
        X, avisos, data_ref, alvo = self._features(deteccoes, lat, lon, raio_km, data_ref)
        periodo = [str(alvo.date()), str((alvo + pd.Timedelta(days=6)).date())]
        if X is None:
            resumo = {"data_referencia": str(data_ref.date()), "periodo_previsto": periodo,
                      "n_celulas": 0}
            return {"celulas": pd.DataFrame(columns=COLUNAS_CELULAS), "resumo": resumo, "avisos": avisos}

        M = X[self.features].astype("float32")
        if self.cfg.get("prep_log"):
            for c in self.features:
                if c not in SEM_LOG:
                    M[c] = np.log1p(M[c])
        p = self.clf.predict_proba(M)[:, 1]
        li = self.reg.predict(M)  # log1p do FRP somado, condicional a haver fogo

        celulas = pd.DataFrame({
            "cy": X["cy"].to_numpy(), "cx": X["cx"].to_numpy(),
            "lat": X["lat"].to_numpy(), "lon": X["lon"].to_numpy(),
            "prob_fogo": p,
            "frp_se_houver_fogo": np.clip(np.expm1(li), 0, None),
            "nivel_intensidade": self._nivel(li),
        })

        w = p / p.sum() if p.sum() > 0 else np.full(len(p), 1.0 / len(p))
        li_med = float((w * li).sum())
        resumo = {
            "data_referencia": str(data_ref.date()),
            "periodo_previsto": periodo,
            "n_celulas": int(len(celulas)),
            "prob_media": float(p.mean()),
            "prob_max": float(p.max()),
            "celulas_esperadas_com_fogo": float(p.sum()),
            "frp_se_houver_fogo": float(max(np.expm1(li_med), 0.0)),
            "nivel_intensidade": str(self._nivel(np.array([li_med]))[0]),
        }
        return {"celulas": celulas, "resumo": resumo, "avisos": avisos}
