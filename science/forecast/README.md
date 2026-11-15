# science/forecast — next-week fire model

Owner: **science team** (model by Márcia). Predicts, for each 5 km cell (0.05°) that has burned before, the **chance of at least one fire in the next 7 days** and the likely **intensity class** (low / medium / high). NASA FIRMS data only (VIIRS NOAA-20 detections + a climatology built from past years).

Reported test result: AUC **0.87** on 2023–2025 (years the model never saw), against **0.76** when using only the usual pattern for that week of the year. If these numbers change, update `RELIABILITY` in `infra/api/forecast.py`.

## Files

| File | What |
|---|---|
| `previsao_fogo.py` | The model code: `PrevisorFogo(folder).prever_regiao(detections, lat, lon, raio_km, data_ref)` |
| `artefatos/` | Trained models (`modelos_h1.joblib`, `calibracao.joblib`), cell list and climatology (`*.parquet`), `config.json` |
| `main.py`, `testar.py` | The original stand-alone service (`/prever`) and its test. Not used by the website |
| `requirements.txt` | Packages. **`scikit-learn==1.7.2` exactly**: the models were saved with it |

## How the website gets it

The team API loads this folder once at startup (`infra/api/forecast.py`) and serves `POST /api/forecast` (see `docs/api-contract.md`, endpoint 8). The website only sends the area: the API reads the last 28 days of NOAA-20 detections from our own data, without the `type` column (recent near-real-time rows have none), and uses the last complete day as `data_ref`.

## Updating the model

1. Re-export the artefacts (`exportar_artefatos.py`) and replace the files in `artefatos/`. Keep the same file names and `config.json` keys.
2. If you train with another scikit-learn version, change it in `requirements.txt` here **and** in `infra/deploy/hf_space/requirements.txt`.
3. The climatology is exported for one year (`ano_alvo` in `config.json`, now 2026). It must be re-exported in January 2027.
4. `joblib` files run code when loaded: only commit artefacts you produced yourself.
