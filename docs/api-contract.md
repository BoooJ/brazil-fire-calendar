# API contract — v0.4

This file is the agreement between **`infra/`** (the API) and **`web/`** (the website).

**v0.4 (15 Nov):** weeks, as an addition only. `POST /api/analysis` takes an optional `"period": "week"` and then also returns `calendar_weekly[]` and `average_by_week[]` (section 3, "Weekly calendar"). Without it, nothing changes. Mock: `analysis.pantanal.week.json`.

**v0.3 (15 Nov):** two satellites only, one per instrument, so no fire is counted or drawn twice: **MODIS Terra** and **VIIRS NOAA-20**. `detected` objects, `/api/status` `coverage`, hotspot points and both CSV exports only use the keys `modis_terra` and `viirs_noaa20` (MODIS Aqua and VIIRS S-NPP are gone). `count` = NOAA-20 fire-days from 2018-04, MODIS Terra fire-days × a monthly factor before (harmonization v1). Same fields and types otherwise.

**v0.2 (14 Nov):** adds `POST /api/forecast` (next-week fire chance, endpoint 8), `forecast_available` in `/api/status`, and the error `FORECAST_UNAVAILABLE`. Nothing else changed.

- Until the real API is ready, the website is built against the fake files in [`web/mocks/`](../web/mocks/). Switching to the real API = changing `VITE_API_BASE_URL`.
- **Frozen after kickoff.** To change anything: (1) say it in the team chat, (2) update this file **and** the mocks in the same pull request (`python infra/tools/make_mocks.py`), (3) bump the version above.

---

## Conventions

| Topic | Rule |
|---|---|
| Base URL | `VITE_API_BASE_URL` (local: `http://localhost:8000`). Every path starts with `/api/` |
| Format | JSON in and out (`Content-Type: application/json`), except the CSV exports |
| Area | Always a **GeoJSON geometry** (`Polygon` or `MultiPolygon`), coordinates `[longitude, latitude]` (WGS84). The website converts rectangles and "lat/lon + radius" into a polygon (a circle becomes a 64-point polygon) before sending. Max 1,000 points |
| Dates | `YYYY-MM-DD`. Months: `year` + `month` (1–12). Times: `HHMM` in **UTC** |
| Calendar range | 2003-01 → today. A request outside this range is clipped, not rejected |
| Main unit (`count`) | **Corrected fire-days (NOAA-20 equivalent)**: number of distinct (≈1 km grid cell, day) pairs with at least one valid hotspot, harmonized across satellites |
| Raw unit (`detected`) | **Hotspots detected**: raw FIRMS detections per satellite, after cleaning (vegetation fires only, low confidence removed) |
| Satellite keys | `modis_terra`, `viirs_noaa20` (v0.3: one satellite per instrument, so a fire is never seen twice) |
| Missing values | `null` (e.g. a satellite that did not exist yet), never `0` |
| Mocks only | Every mock file has a `"_mock"` field. The real API never sends it |

## Common request body (all `POST` endpoints)

```json
{
  "area": { "type": "Polygon", "coordinates": [[[-58.5, -22.0], [-55.0, -22.0], [-55.0, -15.5], [-58.5, -15.5], [-58.5, -22.0]]] },
  "start": "2003-01-01",
  "end": "2026-11-14",
  "ref_date": "2026-11-14"
}
```

| Field | Required | Meaning |
|---|---|---|
| `area` | yes | The area of interest |
| `start`, `end` | no | Period shown. Default: `2003-01-01` → today |
| `ref_date` | no | "Today" for the anomaly cards. Lets users replay the past, e.g. `2020-09-14`. Default: today |
| `period` | no | `/api/analysis` only. `"month"` (default) or `"week"`: `"week"` adds the weekly calendar to the answer. Anything else → `INVALID_DATES` |

---

## Endpoints

### 1. `GET /api/presets`

Ready-made areas for the preset buttons. Boxes we draw ourselves (no outside border data).

```json
{ "presets": [ { "id": "pantanal", "name": "Pantanal", "area": { "type": "Polygon", "coordinates": [[[-58.5, -22.0], "..."]] } } ] }
```

Mock: [`presets.json`](../web/mocks/presets.json)

### 2. `GET /api/status`

When the data was last updated, and what each satellite covers.

```json
{
  "data_updated": "2026-11-14T15:20:00Z",
  "contract_version": "0.3",
  "calendar_from": "2003-01",
  "final_until": "2026-05-31",
  "coverage": [ { "satellite": "modis_terra", "from": "2000-11-01", "to": null },
                { "satellite": "viirs_noaa20", "from": "2018-04-01", "to": null } ],
  "forecast_available": true
}
```

- `final_until`: data after this date is NASA's fast (near-real-time) version → shown as **provisional**.
- `to: null` = still active.
- `forecast_available`: `false` while the forecast model loads (about 20 s after a restart) or if it is missing. Hide the forecast panel when `false`.

Mock: [`status.json`](../web/mocks/status.json)

### 3. `POST /api/analysis` — everything the page needs, in one call

Body: common request body. Response:

| Field | Content |
|---|---|
| `query` | Echo of `start`, `end`, `ref_date`, plus `area_km2` |
| `data_updated` | Same as `/api/status` |
| `unit` | `{ "main": "...", "raw": "..." }` labels to display |
| `calendar[]` | One object per month (see below) |
| `average_by_month[]` | 12 objects: `month`, `mean`, `median`, `p10`, `p90`, `years` (number of years used) |
| `average_period` | `{ "from": 2003, "to": 2025 }` — complete years before the reference year |
| `yearly[]` | Per year: `year`, `count`, `detected{...}`, `provisional`, `complete` |
| `cards` | Key numbers for the month of `ref_date` (see below) |
| `next_months[]` | The 3 months after `ref_date`: `year`, `month`, `mean`, `median`, `p10`, `p90` |
| `next_months_label` | Text to show next to it, e.g. "Based on history (2003–2025), not a forecast" |
| `briefing` | Plain-language paragraph (English), ready to copy |
| `reliability` | `median_error_pct`, `validated_years[]`, `note` |

**`calendar[]` item**

```json
{
  "year": 2020, "month": 9,
  "count": 4812,
  "vs_avg_pct": 320.4,
  "rank": 1, "of_years": 23,
  "detected": { "modis_terra": 1650, "viirs_noaa20": 14420 },
  "provisional": false,
  "uncertain": false,
  "partial": false,
  "days_covered": 30
}
```

| Field | Rule |
|---|---|
| `count` | Corrected fire-days for that month (or for `days_covered` days if the month is not finished) |
| `vs_avg_pct` | `(count ÷ expected − 1) × 100`, where expected = that month's `mean` (× `days_covered ÷ days in month` if `partial`). `null` if the average is 0 |
| `rank` / `of_years` | 1 = highest of all years for that same month. A partial month is compared with the **same days** in other years |
| `provisional` | `true` if the month contains near-real-time (not final) data |
| `uncertain` | `true` if the number is less reliable (very few fires, or high conversion error) — shown hatched/faded |
| `partial` | `true` if the month is not finished at `end` |

**`cards`**

```json
{
  "ref_year": 2026, "ref_month": 11,
  "count": 41, "detected": { "...": "..." },
  "estimated_fires": 5,
  "vs_avg_pct": -12.5, "rank": 14, "of_years": 24,
  "partial": true, "days_covered": 14,
  "peak_month": 8, "worst_year": 2020
}
```

`estimated_fires` = burning cells that touch each other on consecutive days are grouped into one fire.

Mocks: [`analysis.pantanal.json`](../web/mocks/analysis.pantanal.json) (reference date 2026-11-14) and [`analysis.pantanal.ref-2020-09-14.json`](../web/mocks/analysis.pantanal.ref-2020-09-14.json) (replaying the 2020 crisis).

**Weekly calendar** (only with `"period": "week"`, v0.4). Everything above stays the same; two fields are added:

```json
"calendar_weekly": [
  { "year": 2026, "week": 46, "start": "2026-11-09", "end": "2026-11-15",
    "count": 31, "vs_avg_pct": -40.2, "provisional": true, "uncertain": false,
    "partial": true, "days_covered": 6 }
],
"average_by_week": [ { "week": 46, "mean": 60.0, "median": 52.0, "p10": 12.0, "p90": 130.5, "years": 23 } ]
```

| Field | Rule |
|---|---|
| `year`, `week` | **ISO week** (Monday → Sunday, UTC days, weeks 1–53). `year` is the ISO year: 29 Dec 2025 is in 2026 week 1 |
| `start`, `end` | The week's Monday and Sunday |
| `count` | Corrected fire-days that week. A week across two months uses each month's conversion, so the weeks of a period add up to its months (up to rounding) |
| `vs_avg_pct` | `(count ÷ expected − 1) × 100`, expected = that week number's `mean` (× `days_covered ÷ 7` if `partial`). `null` if there is no average or it is 0 |
| `provisional`, `uncertain`, `partial`, `days_covered` | Same rules as the monthly calendar (`uncertain`: fewer than 10 fire-days) |
| `average_by_week[]` | Per week number: `mean`, `median`, `p10`, `p90`, `years`, over the same years as `average_period`. Week 53 exists only in some years, so it has fewer `years` |

Weeks run from the ISO week containing `start` to the week containing `end` (the last one is usually `partial`). About 1,250 weeks for 2003 → today. Weekly numbers are noisier than monthly ones, especially before 2018-04 (MODIS Terra) and for small areas.

### 4. `POST /api/hotspots` — fire points for the map

Body: `area` + `"year"` + `"month"` + optional `"limit"` (default 5,000). Response: GeoJSON `FeatureCollection` of `Point`s.

```json
{
  "type": "FeatureCollection",
  "total": 33060, "returned": 300, "truncated": true,
  "features": [ {
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [-56.91, -16.83] },
    "properties": { "date": "2020-09-07", "time_utc": "1715", "satellite": "viirs_noaa20",
                    "confidence": "nominal", "confidence_raw": "n", "frp": 12.3,
                    "daynight": "D", "provisional": false }
  } ]
}
```

- `confidence`: `low` / `nominal` / `high` for every satellite (MODIS 0–100 is converted: <30 low, 30–79 nominal, ≥80 high). `confidence_raw` keeps the original value.
- `frp`: fire strength in megawatts.
- If `truncated` is `true`, the website says "showing 300 of 33,060".

Mock: [`hotspots.pantanal.2020-09.geojson`](../web/mocks/hotspots.pantanal.2020-09.geojson)

### 5. `POST /api/export/hotspots.csv`

Body: common request body. Returns `text/csv` (download) with these columns:

`latitude, longitude, acq_date, acq_time_utc, satellite, instrument, confidence, confidence_raw, frp, daynight, data_version`

`data_version` = `final` or `provisional`. Capped at 1,000,000 rows; if capped, the response header `X-Truncated: true` is set.

Mock: [`hotspots.pantanal.2020-09.csv`](../web/mocks/hotspots.pantanal.2020-09.csv)

### 6. `POST /api/export/calendar.csv`

Body: common request body. Returns `text/csv` with these columns:

`year, month, count, vs_avg_pct, rank, of_years, provisional, uncertain, partial, detected_modis_terra, detected_viirs_noaa20`

Mock: [`calendar.pantanal.csv`](../web/mocks/calendar.pantanal.csv)

### 7. `POST /api/update` — the "Update now" button

No body. Asks the FIRMS API for the last days and adds them. Limited to once every 15 minutes.

```json
{ "status": "updated", "data_updated": "2026-11-14T15:20:00Z", "new_hotspots": 128 }
```

`status`: `updated`, `too_soon` (HTTP 429) or `failed`.

### 8. `POST /api/forecast` — chance of fire next week (model estimate, experimental)

The **only forecast** in the app. Everything else (calendar, averages, "coming months") is history. Model by the science team (`science/forecast/`): gradient boosting on **5 km cells**, fed with the last 28 days of VIIRS NOAA-20 detections (read by the API from our data) and the usual pattern for that week of the year.

Body: `area` + optional `ref_date` (last day of data used; default = yesterday's data, the last complete day; later dates are clipped; must be `2018-04-29` or later) + optional `limit` (cells returned, default 2,000, max 20,000).

```json
{
  "query": { "ref_date": "2026-11-13", "area_km2": 266959.7 },
  "data_updated": "2026-11-14T15:20:00Z",
  "based_on": { "satellite": "viirs_noaa20", "from": "2026-10-17", "to": "2026-11-13" },
  "period": { "from": "2026-11-14", "to": "2026-11-20" },
  "label": "Model estimate (experimental), not an official fire warning.",
  "cell_size_km": 5,
  "summary": {
    "cells": 7774,
    "expected_cells_with_fire": 80.5,
    "expected_share_pct": 1.04,
    "max_probability": 0.628,
    "intensity_if_fire": "high",
    "recent_detections": 519
  },
  "briefing": "For 14 Nov - 20 Nov 2026, the model expects fire in about 80 of the 7,774 cells (5 km) ...",
  "reliability": { "auc": 0.87, "baseline_auc": 0.76, "test_years": [2023, 2024, 2025], "note": "..." },
  "total": 7774, "returned": 2000, "truncated": true,
  "cells": { "type": "FeatureCollection", "features": [ {
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [-55.925, -16.375] },
    "properties": { "probability": 0.628, "intensity_if_fire": "high" }
  } ] },
  "notes": []
}
```

| Field | Meaning |
|---|---|
| `period` | The 7 days predicted: the days after `ref_date` |
| `summary.cells` | 5 km cells of the area that have burned before (the model only covers those) |
| `summary.expected_cells_with_fire` | Sum of the cell probabilities = how many cells are expected to have at least one fire that week |
| `summary.expected_share_pct` | Same, as a % of `cells`. `null` if `cells` is 0 |
| `summary.max_probability` | Highest chance (0–1) of any cell |
| `summary.intensity_if_fire` | `low` / `medium` / `high`: likely strength if it burns (weighted by probability). Classes only: the model's power number is in MODIS-equivalent units, so it is not shown |
| `summary.recent_detections` | Valid NOAA-20 detections inside the area during `based_on` |
| `cells` | Point = cell centre. Sorted by `probability`, highest first; capped at `limit` (`truncated`, like `/api/hotspots`) |
| `notes[]` | Plain-English remarks to show: outside Brazil, no fire in the last 28 days (estimate from the usual pattern only), a past date replayed (looks better than a real forecast), model needs re-export |

**Display rules:** always show `label` next to the numbers; use a sequential (colour-blind-safe) ramp for `probability`; never call it an official warning. Past dates can be replayed (e.g. `ref_date: "2020-09-01"` for the Pantanal), and then `notes` says so.

Mock: [`forecast.pantanal.json`](../web/mocks/forecast.pantanal.json)

---

## Errors

HTTP 4xx/5xx with:

```json
{ "error": { "code": "INVALID_AREA", "message": "The polygon is not closed." } }
```

| Code | HTTP | When |
|---|---|---|
| `INVALID_AREA` | 400 | Not a valid Polygon/MultiPolygon |
| `AREA_TOO_COMPLEX` | 400 | More than 1,000 points |
| `INVALID_DATES` | 400 | Bad format, or `start` after `end` |
| `UPDATE_TOO_SOON` | 429 | `/api/update` called within 15 minutes |
| `FORECAST_UNAVAILABLE` | 503 | `/api/forecast` while the model is loading, or if it is missing on the server |
| `SERVER_ERROR` | 500 | Anything else |

**An area with no fires is not an error**: HTTP 200 with zeros. An area outside the covered region also returns 200, plus `"warning": "This area is outside the region we cover (Brazil)."`
