# Brazil Fire Calendar — harmonized MODIS + VIIRS hotspots

**NASA Space Apps Challenge 2026** · Challenge: *Harmonization of MODIS and VIIRS Hot Spots*

A web app that turns 20+ years of NASA FIRMS active-fire hotspots over Brazil into one consistent **burning calendar**. MODIS (2000 →) and VIIRS (S-NPP 2012 → Nov 2026, NOAA-20 2018 →) are harmonized so that a change of satellite no longer creates fake jumps. Users pick an area and dates, see when fires usually happen and whether the current month is unusual, and download the data.

> **Status:** project skeleton. Nothing is implemented yet. Team rules: [English](docs/TEAM_RULES.md) · [Português](docs/REGRAS_DA_EQUIPE.md)

## MVP features

| # | Feature |
|---|---|
| 1 | Draw an area on the map (rectangle or polygon) |
| 2 | Type latitude/longitude + radius (km) |
| 3 | Preset buttons: Pantanal, Roraima, southern Amazon, all of Brazil |
| 4 | Date range + reference date (replay a past day) |
| 5 | **Burning calendar**: years × months, counts / vs average, hover, click → map |
| 6 | Key number cards: detected per satellite, corrected count, estimated fires, % vs average, rank, peak month |
| 7 | Fire briefing: one plain-language paragraph |
| 8 | Typical-year chart |
| 9 | Year-by-year chart: raw vs corrected |
| 10 | Fire map, linked to the calendar |
| 11 | Downloads: hotspots CSV, calendar CSV, charts as PNG |
| 12 | "How reliable is this?" panel |
| 13 | Quick view / Detailed view |
| 14 | Data sources page (100 % NASA FIRMS) |
| 15 | Accessible colours + works on phones |
| 16 | Daily update from the FIRMS API ("last updated" time, provisional data marked) |
| 17 | "What's normal for the coming months" card — based on history, **not a forecast** |
| 18 | **Next-week fire chance** per 5 km cell: the science team's model (`/api/forecast`), labelled "model estimate, experimental". The only forecast in the app |

**Extras (only after the MVP works):** day-by-day calendar, fire-season shift over the years, night fires and fire strength, chatbot answering from NASA data, Portuguese/English switch, a second country.

## Data — NASA only

| Source | Satellite / sensor | Period | How we get it |
|---|---|---|---|
| NASA FIRMS | MODIS Collection 6.1 (Terra + Aqua), 1 km | Nov 2000 → today | Yearly country files + FIRMS API |
| NASA FIRMS | VIIRS S-NPP, 375 m | 20 Jan 2012 → 2 Nov 2026 (satellite stopped) | Archive download request |
| NASA FIRMS | VIIRS NOAA-20, 375 m | 1 Apr 2018 → today | Yearly country files + FIRMS API |

- NASA publishes fast (near-real-time) data within hours and replaces it with final data about 5 months later. Recent months are shown as **provisional**.
- The harmonization method is described in [`science/`](science/).
- TODO: add the official FIRMS citation from the [FIRMS acknowledgements page](https://www.earthdata.nasa.gov/data/projects/lance#ed-firms-citation).

## How it fits together

```
NASA FIRMS files + API
  → infra/pipeline: keep Brazil, clean, Parquet, ≈1 km fire-days, harmonization
  → infra/api (FastAPI + DuckDB)          ← contract: docs/api-contract.md
  → web/ (map, burning calendar, charts, downloads)
```

## Repository layout

```
CLAUDE.md           instructions for AI coding agents (also one in infra/, web/, science/)
infra/              data pipeline + API          (owner: infrastructure)
  tools/make_mocks.py   generates the fake files in web/mocks/
web/                the website                   (owner: UI/UX)
  mocks/            fake API responses to build the website before the API exists
science/            harmonization method + validation  (owner: scientist)
docs/
  api-contract.md   the agreement between infra/ and web/
  TEAM_RULES.md     team rules (English)
  REGRAS_DA_EQUIPE.md  regras da equipe (português)
data/               local data, never committed
```

## Getting started

1. Clone the repo, then copy `.env.example` to `.env` and fill it in. Keep `DATA_DIR` **outside** OneDrive/Dropbox.
2. Infrastructure: see [`infra/README.md`](infra/README.md).
3. Website: see [`web/README.md`](web/README.md). Until the API is ready, build against [`web/mocks/`](web/mocks/).
4. Regenerate the mocks after a contract change: `python infra/tools/make_mocks.py`.
5. Working together with Git (branches, pull requests, conflicts): [`docs/GIT_GUIDE.md`](docs/GIT_GUIDE.md).
