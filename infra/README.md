# infra/ — data pipeline + API

Owner: **infrastructure**. Read [`docs/api-contract.md`](../docs/api-contract.md) first.

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    Mac/Linux: source .venv/bin/activate
pip install -r infra/requirements.txt
cp .env.example .env    # then fill in FIRMS_MAP_KEY and DATA_DIR
```

## Planned layout

```
infra/
  pipeline/
    01_download.py        yearly country zips (MODIS 2000–2025, VIIRS NOAA-20 2018–2025) → DATA_DIR/raw/
    02_extract_brazil.py  read only Brazil's CSV inside each zip
    03_clean.py           same column names for all satellites, vegetation fires only,
                          low confidence removed, duplicates removed → DATA_DIR/clean/*.parquet
    04_fire_days.py       ≈1 km grid: fire-days per cell, day and satellite
    05_harmonize.py       conversion factors (method in science/) → corrected monthly table
    update_recent.py      FIRMS API: last 5 days (MODIS_NRT, VIIRS_NOAA20_NRT)
  api/
    main.py               FastAPI app with the endpoints from the contract
  tools/
    make_mocks.py         fake files for web/mocks/ (done)
```

## Data sources (all NASA FIRMS)

| What | Where | Account |
|---|---|---|
| MODIS yearly country files 2000–2025 | [FIRMS country yearly summary](https://firms.modaps.eosdis.nasa.gov/country/) | None |
| VIIRS NOAA-20 yearly country files 2018–2025 | Same page | None |
| VIIRS S-NPP, Brazil, 2012-01-20 → 2026-11-02 | [FIRMS archive download](https://firms.modaps.eosdis.nasa.gov/download/), CSV | Earthdata login |
| MODIS + NOAA-20, Brazil, 2026-01-01 → today | Same archive page | Earthdata login |
| The last few days | FIRMS API: `/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{1..5}/{YYYY-MM-DD}` | [MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/) |

Good to know:

- **Final vs fast data:** final data (SP) replaces near-real-time data (NRT) about 5 months later. NRT has no `type` column, so industrial sites are filtered with a list of cells flagged as industrial in older final data.
- **API limits:** 5,000 transactions per 10 minutes; at most 5 days per call.
- **S-NPP stopped on 2 Nov 2026.** For the latest days use NOAA-20 (and MODIS).
- The yearly zips contain **every country**, so keep them: adding another country later = re-running the pipeline.

## First-hour checklist

- [ ] Earthdata login + FIRMS MAP_KEY created
- [ ] Both archive requests sent (they wait in a queue)
- [ ] Yearly zip downloads started (≈ 5 GB in total) into `DATA_DIR`, not OneDrive
- [ ] Opened one zip: checked the file names and column names, and updated this README
