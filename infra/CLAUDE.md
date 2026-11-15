# infra/CLAUDE.md — data pipeline + API

Scope: everything between NASA FIRMS and the API. Read `../docs/api-contract.md` before touching `api/`. The root `CLAUDE.md` rules apply.

## Pipeline (planned — update as scripts land)

| Step | Script | Output (in `DATA_DIR`) |
|---|---|---|
| 1 (done) | `pipeline/01_download.py` | `raw/`: yearly country zips (MODIS 2000–2025, `viirs-jpss1` 2018–2025) + archive-request CSVs (S-NPP 2012-01-20 → 2026-11-02, all of 2026) |
| 2 (done) | `pipeline/02_extract_brazil.py` | `brazil_csv/<product>/<final or provisional>/*.csv`: Brazil's CSV copied out of each yearly zip, plus the archive-request files |
| 3 (done) | `pipeline/03_clean.py` | `clean/hotspots/satellite=…/year=…/*.parquet`: one table, every row kept and flagged |
| 4 (done) | `pipeline/04_fire_days.py` | `derived/fire_days/`: one row per 0.01° cell × UTC day × satellite; NRT hotspots in static cells dropped; `derived/static_cells.parquet` |
| 5 (done, v0) | `pipeline/05_harmonize.py` | `derived/harmonization_v0.json`: NOAA-20 from 2018-04; S-NPP × 1.015 for 2012-02..2018-03; MODIS Aqua × monthly factor (3.4–5.0) before. Replace with the `science/` method |
| — | `pipeline/update_recent.py` | Last 5 days from the FIRMS API (`MODIS_NRT`, `VIIRS_NOAA20_NRT`) |

Make each step re-runnable: skip work whose output already exists, and never re-download what is already in `raw/`.

## Clean Parquet schema (built by `03_clean.py`)

Read it with `read_parquet('<DATA_DIR>/clean/hotspots/**/*.parquet', hive_partitioning = true)`.

`latitude, longitude, acq_date (DATE), acq_time (HHMM text, UTC), satellite (key, partition), year (partition), month, instrument, confidence (low/nominal/high), confidence_raw, brightness_k, frp, daynight (D/N), type (nullable — NRT has none), data_version (final/provisional), source_file, valid (bool), drop_reason`

Cleaning rules (owned by `science/`; keep them in sync with `science/README.md`). **Rows are flagged, not deleted:** filter with `WHERE valid`.

- `type` present and not 0 → `drop_reason = 'non_vegetation'`.
- Low confidence (MODIS `< 30`, VIIRS `l`) → `drop_reason = 'low_confidence'`.
- Exact duplicates on `(latitude, longitude, acq_date, acq_time, satellite)` are removed; final data wins over provisional.
- Still to do in the fire-days step: NRT rows have no `type`, so drop cells flagged as static or industrial (`type == 2`) in the final data.

First real run (MODIS 2000–2013): 5.69 M rows in 14 s, ~6 % flagged invalid. Pantanal peaks in September, Roraima in March.

## API (`api/`)

- **Status:** implemented in `main.py` (endpoints, errors), `store.py` (DuckDB + shapely area selection), `analysis.py` (calendar, averages, ranks, cards, briefing), `presets.py`. `/api/update` returns `status: failed` until the daily update exists.
- `forecast.py` serves the science team's next-week model (`science/forecast/previsao_fogo.py`, loaded once at startup in the warm-up thread; if it fails, only `/api/forecast` is off). It feeds the model the last 28 days of valid NOAA-20 hotspots **without** `type` (NRT rows have none), with `ref_date` = the last complete day. The model works on a circle: we use the circle around the area, then keep the 5 km cells whose centre is inside.
- Areas are matched by **cell centre** (0.01°) inside the polygon. A partial reference month is compared with the **same days** of other years. `estimated_fires` = connected burning cells (8 neighbours, same or next day) for the reference month.
- FastAPI + DuckDB reading the Parquet in `DATA_DIR`. Settings come from `.env`: `DATA_DIR`, `API_PORT`, `CORS_ORIGINS`, `FIRMS_MAP_KEY`.
- Implement **exactly** the endpoints, fields and error format of `docs/api-contract.md`. Response shapes must match `web/mocks/` (minus `_mock`).
- An area with no fires returns 200 with zeros, never an error.
- `/api/update`: allowed at most once every 15 minutes, and it must never put `FIRMS_MAP_KEY` into logs or responses. FIRMS URLs contain the key, so log the source and date range, not the URL.

## Checks before a PR

- `python infra/tools/make_mocks.py` still runs.
- For API changes: compare a real response for the Pantanal preset with `web/mocks/analysis.pantanal.json`. Same keys, same types.
- `git status` shows no data files and no `.env`.
