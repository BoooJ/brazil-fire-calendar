# CLAUDE.md — Brazil Fire Calendar

Instructions for AI coding agents working in this repo. Humans: start with `README.md` and `docs/TEAM_RULES.md`.
Each folder has its own `CLAUDE.md` with details: `infra/`, `web/`, `science/`.

## Project

NASA Space Apps Challenge 2026, challenge *"Harmonization of MODIS and VIIRS Hot Spots"*.
A web app that turns NASA FIRMS active-fire hotspots over **Brazil** (2003 → today) into one harmonized **burning calendar** (years × months). It also shows anomalies against the multi-year average, a linked hotspot map, and CSV/PNG downloads.

**Deadline:** Sunday 15 Nov 2026. Feature freeze 15:00, submission 21:00 (team local time). Finishing the 17 MVP features in `README.md` beats starting anything new.

## Hard rules

1. **NASA FIRMS data only.** No other datasets (no IBGE borders, INPE, ERA5, weather…). Preset areas are plain boxes we define.
2. **Never commit data** (CSV, zip, Parquet, DuckDB). Exceptions: `web/mocks/` and the forecast model files in `science/forecast/artefatos/` (~21 MB). Data lives in `DATA_DIR` (from `.env`), outside OneDrive.
3. **Never write secrets in tracked files.** Keys live only in `.env` (gitignored). Never print, log or echo `.env` values. The FIRMS API puts the MAP_KEY **in the URL path**, so never log request URLs.
4. **Stay in your task's folder:** `infra/`, `web/` or `science/`. Don't edit another folder unless the task explicitly says so.
5. **`docs/api-contract.md` is frozen (v0.2).** If it must change: update the contract, regenerate the mocks (`python infra/tools/make_mocks.py`), bump the version, and say so in the PR description.
6. **One forecast only, always labelled.** The calendar, averages and "coming months" are history ("not a forecast"); recent months are *provisional*. The only forecast is `POST /api/forecast` (the science team's next-week model), always shown with its `label` "Model estimate (experimental), not an official fire warning."
7. **Git:** work on a branch (`infra/…`, `web/…`, `science/…`) and open small PRs to `main`. `main` must always run. Never force-push `main`.

## Layout

```
CLAUDE.md                this file
README.md                human overview + the 17 MVP features
docs/api-contract.md     contract between infra/api and web (source of truth)
docs/TEAM_RULES.md       team rules (EN) · docs/REGRAS_DA_EQUIPE.md (PT)
docs/GIT_GUIDE.md        how the team uses branches, pull requests, conflicts
infra/                   Python: data pipeline + FastAPI/DuckDB API   → infra/CLAUDE.md
  tools/make_mocks.py    generates web/mocks/ from the contract shapes
web/                     the website                                   → web/CLAUDE.md
  mocks/                 fake API responses (all numbers invented)
science/                 harmonization method + validation             → science/CLAUDE.md
  forecast/              next-week fire model (previsao_fogo.py + artefatos/), served by infra/api/forecast.py
data/                    local only, gitignored
```

## Data flow

```
FIRMS yearly country zips + archive request + FIRMS API (latest days)
  → infra/pipeline: keep Brazil, clean, unify columns → Parquet in DATA_DIR
  → fire-days on a ≈1 km grid → harmonized monthly table (method: science/)
  → infra/api (FastAPI + DuckDB), endpoints in docs/api-contract.md
  → web (map, burning calendar, charts, downloads)
```

## NASA FIRMS facts (checked on the FIRMS site, Nov 2026)

| Product | Coverage | Notes |
|---|---|---|
| MODIS C6.1 (Terra AM, Aqua PM), 1 km | 2000-11-01 → present | Yearly country zips 2000–2025 |
| VIIRS S-NPP, 375 m | 2012-01-20 → **2026-11-02 (ended)** | Not in the yearly zips → archive request |
| VIIRS NOAA-20, 375 m | 2018-04-01 → present | Yearly zips 2018–2025 (named `viirs-jpss1_*`) |
| VIIRS NOAA-21, 375 m | 2023-03-01 → present | Not used in the MVP |

- Final data (SP) replaces near-real-time data (NRT) about 5 months later. **NRT has no `type` column.**
- Area API: `/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE 1..5}/{YYYY-MM-DD}`. Sources include `MODIS_NRT`, `MODIS_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_SNPP_SP`. Limit: 5,000 transactions per 10 minutes.
- **Yearly zip layout (checked 2026-11-14):** `modis/YYYY/modis_YYYY_<Country>.csv`, one CSV per country (e.g. `modis/2000/modis_2000_Brazil.csv`). Downloaded by `infra/pipeline/01_download.py` from `https://firms.modaps.eosdis.nasa.gov/data/country/zips/`.
- **MODIS columns (checked):** `latitude, longitude, brightness, scan, track, acq_date (YYYY-MM-DD), acq_time (HHMM text, UTC, zero-padded), satellite (Terra/Aqua), instrument, confidence (0–100), version, bright_t31, frp, daynight (D/N), type`. Values of `type` seen: `0` vegetation fire, `2` other static land source, `3` offshore. The files say `version` = `6.2`, while the FIRMS page says C6.1: keep the value as given.
- **Archive-request zips (checked):** `DL_FIRE_<SRC>_<id>.zip` with SRC `M-C61` (MODIS), `SV-C2` (S-NPP), `J1V-C2` (NOAA-20). Inside: `fire_archive_<SRC>_<id>.csv` (final), `fire_nrt_<SRC>_<id>.csv` (near-real-time), `Readme.txt`. Download with `infra/pipeline/01b_download_archive.py`; files stay on NASA's server 45 days. One account can have at most **20 pending requests**, each covering at most **1 year**.
- **VIIRS columns in archive files (checked):** same names as MODIS (`brightness`, `bright_t31`, …); `confidence` is `l`/`n`/`h`; `satellite` is `SNPP` or `N20`. NRT files have no `type` column. The `viirs-jpss1_*` yearly zips are **not checked yet**: they may use `bright_ti4`/`bright_ti5`.
- **2026 final vs NRT split (checked):** VIIRS final until 2026-07-31, MODIS final until 2026-08-31; NRT after that.
- **Open question for science/:** MODIS yearly zips (2000–2025) say `version` `6.2`; the 2026 archive says `61.03` (final) and `6.1NRT`. Check whether the collections differ before harmonizing.

## Vocabulary (use these exact names in code)

| Term | Meaning |
|---|---|
| hotspot / detection | One FIRMS row |
| fire-day | Distinct (≈1 km cell, UTC date) with ≥ 1 valid hotspot |
| `count` | Corrected (harmonized) fire-days, NOAA-20 equivalent |
| `detected` | Raw hotspots per satellite, after cleaning |
| `provisional` / `uncertain` / `partial` | See `docs/api-contract.md` |
| satellite keys | `modis_terra`, `modis_aqua`, `viirs_snpp`, `viirs_noaa20` |

## Commands

```bash
python -m venv .venv          # then activate it
pip install -r infra/requirements.txt
python infra/tools/make_mocks.py   # regenerate web/mocks/

# data pipeline (re-runnable; DATA_DIR comes from .env)
python infra/pipeline/01_download.py        # FIRMS yearly zips -> DATA_DIR/raw (one copy at a time)
python infra/pipeline/01c_download_recent.py # newest hours (after the last archive file) from the FIRMS API
python infra/pipeline/02_extract_brazil.py  # Brazil CSVs -> DATA_DIR/brazil_csv
python infra/pipeline/03_clean.py           # one flagged table -> DATA_DIR/clean/hotspots (Parquet)
python infra/pipeline/04_fire_days.py       # fire-days on a 0.01 deg grid -> DATA_DIR/derived/fire_days
python infra/pipeline/05_harmonize.py       # v0 conversion factors -> DATA_DIR/derived/harmonization_v0.json

# API (data loads in a few s, the forecast model ~20 s more; docs at http://localhost:8000/docs)
pip install scikit-learn==1.7.2 joblib   # needed by /api/forecast (exact version: the model was saved with it)
python -m uvicorn main:app --app-dir infra/api --port 8000

# website (React + Vite + MapLibre + ECharts): landing page at #/, the tool at #/app
cd web && npm install && npm run dev   # http://localhost:5173 (mocks while VITE_API_BASE_URL is empty)
cd web && npm run build                # type-check + production build
```

**Add new commands here when you create them.**

## Conventions

- Python 3.12, type hints, `pathlib`. Config comes from `.env` via `python-dotenv` (`FIRMS_MAP_KEY`, `DATA_DIR`, `API_PORT`, `CORS_ORIGINS`).
- Dates are ISO `YYYY-MM-DD`; times are `HHMM` in UTC; coordinates are `[lon, lat]` in GeoJSON.
- Missing values are `null`, never `0`.
- Commit messages are short and imperative ("Add calendar heatmap").

## Status — update when it changes

- [x] Repo skeleton, API contract v0.1, mocks, team rules
- [x] FIRMS data downloaded and cleaned: MODIS 2000–2026, S-NPP 2012-01-20 → 2026-11-02, NOAA-20 2018-04 → today (41.6 M rows). Final data until 2026-07-31 (VIIRS) / 2026-08-31 (MODIS), NRT after
- [x] Pipeline steps 1–3: download → Brazil extraction → clean Parquet
- [x] Pipeline steps 4–5: fire-days + **v0** harmonization (Brazil-wide factors; hold-out 2018–2019 median error 6.6 % on Brazil totals)
- [ ] Harmonization method validated and refined (science/: per-block factors)
- [x] API serving real data: every contract endpoint works (`/api/update` is still a stub)
- [x] Website on mocks → on real API (set `VITE_API_BASE_URL=https://fire-api.37-187-37-74.sslip.io`)
- [ ] Daily update from the FIRMS API. By hand for now: `01c_download_recent.py`, steps 3–4, then the data update in `infra/deploy/README.md` (last run: data updated 2026-11-15 04:18 UTC)
- [x] Next-week fire chance: science model in `science/forecast/`, served by `POST /api/forecast` (contract v0.2, mock `web/mocks/forecast.pantanal.json`). Website panel: done (PR #9)
- [x] API deployed online: https://fire-api.37-187-37-74.sslip.io (OVH VPS, Docker + Caddy; see `infra/deploy/README.md`)
- [x] Website deployed online: https://fire.37-187-37-74.sslip.io (static build served by the VPS's Caddy). **Pushing or merging to GitHub does not update it:** after each merge to `main`, redeploy by hand (about 1 minute, steps in `infra/deploy/README.md`). Last deploy: 2026-11-15, `main` after PR #9

## Maintaining this file

- Update it **in a pull request** when a fact here changes: a new command, the contract version, the status, verified column names.
- Keep it short (under ~150 lines). Folder details go in the folder's `CLAUDE.md`.
- Never put secrets, personal data or large outputs here. Every `CLAUDE.md` change gets a quick human review.
