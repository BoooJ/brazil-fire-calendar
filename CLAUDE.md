# CLAUDE.md — Brazil Fire Calendar

Instructions for AI coding agents working in this repo. Humans: start with `README.md` and `docs/TEAM_RULES.md`.
Each folder has its own `CLAUDE.md` with details: `infra/`, `web/`, `science/`.

## Project

NASA Space Apps Challenge 2026, challenge *"Harmonization of MODIS and VIIRS Hot Spots"*.
A web app that turns NASA FIRMS active-fire hotspots over **Brazil** (2003 → today) into one harmonized **burning calendar** (years × months). It also shows anomalies against the multi-year average, a linked hotspot map, and CSV/PNG downloads.

**Deadline:** Sunday 15 Nov 2026. Feature freeze 15:00, submission 21:00 (team local time). Finishing the 17 MVP features in `README.md` beats starting anything new.

## Hard rules

1. **NASA FIRMS data only.** No other datasets (no IBGE borders, INPE, ERA5, weather…). Preset areas are plain boxes we define.
2. **Never commit data** (CSV, zip, Parquet, DuckDB). The only exception is `web/mocks/`. Data lives in `DATA_DIR` (from `.env`), outside OneDrive.
3. **Never write secrets in tracked files.** Keys live only in `.env` (gitignored). Never print, log or echo `.env` values. The FIRMS API puts the MAP_KEY **in the URL path**, so never log request URLs.
4. **Stay in your task's folder:** `infra/`, `web/` or `science/`. Don't edit another folder unless the task explicitly says so.
5. **`docs/api-contract.md` is frozen (v0.1).** If it must change: update the contract, regenerate the mocks (`python infra/tools/make_mocks.py`), bump the version, and say so in the PR description.
6. **No forecasts.** Recent months are *provisional*. "Coming months" is history, and must be labelled "not a forecast".
7. **Git:** work on a branch (`infra/…`, `web/…`, `science/…`) and open small PRs to `main`. `main` must always run. Never force-push `main`.

## Layout

```
CLAUDE.md                this file
README.md                human overview + the 17 MVP features
docs/api-contract.md     contract between infra/api and web (source of truth)
docs/TEAM_RULES.md       team rules (EN) · docs/REGRAS_DA_EQUIPE.md (PT)
infra/                   Python: data pipeline + FastAPI/DuckDB API   → infra/CLAUDE.md
  tools/make_mocks.py    generates web/mocks/ from the contract shapes
web/                     the website                                   → web/CLAUDE.md
  mocks/                 fake API responses (all numbers invented)
science/                 harmonization method + validation             → science/CLAUDE.md
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
- **Column names have not been checked against a downloaded file yet.** Check before relying on them, then update this section.

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
```

Pipeline, API and website commands do not exist yet. **Add them here when they do.**

## Conventions

- Python 3.12, type hints, `pathlib`. Config comes from `.env` via `python-dotenv` (`FIRMS_MAP_KEY`, `DATA_DIR`, `API_PORT`, `CORS_ORIGINS`).
- Dates are ISO `YYYY-MM-DD`; times are `HHMM` in UTC; coordinates are `[lon, lat]` in GeoJSON.
- Missing values are `null`, never `0`.
- Commit messages are short and imperative ("Add calendar heatmap").

## Status — update when it changes

- [x] Repo skeleton, API contract v0.1, mocks, team rules
- [ ] FIRMS data downloaded and Brazil extracted
- [ ] Pipeline (clean → Parquet → fire-days)
- [ ] Harmonization method validated (science/)
- [ ] API serving real data
- [ ] Website on mocks → on real API
- [ ] Daily update from the FIRMS API
- [ ] Deployed online

## Maintaining this file

- Update it **in a pull request** when a fact here changes: a new command, the contract version, the status, verified column names.
- Keep it short (under ~150 lines). Folder details go in the folder's `CLAUDE.md`.
- Never put secrets, personal data or large outputs here. Every `CLAUDE.md` change gets a quick human review.
