# API contract — v0.1

This file is the agreement between **`infra/`** (the API) and **`web/`** (the website).

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
| Satellite keys | `modis_terra`, `modis_aqua`, `viirs_snpp`, `viirs_noaa20` (`viirs_noaa21` reserved for later) |
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
  "contract_version": "0.1",
  "calendar_from": "2003-01",
  "final_until": "2026-05-31",
  "coverage": [ { "satellite": "viirs_snpp", "from": "2012-01-20", "to": "2026-11-02" } ]
}
```

- `final_until`: data after this date is NASA's fast (near-real-time) version → shown as **provisional**.
- `to: null` = still active.

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
  "detected": { "modis_terra": 1650, "modis_aqua": 1590, "viirs_snpp": 15400, "viirs_noaa20": 14420 },
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

`year, month, count, vs_avg_pct, rank, of_years, provisional, uncertain, partial, detected_modis_terra, detected_modis_aqua, detected_viirs_snpp, detected_viirs_noaa20`

Mock: [`calendar.pantanal.csv`](../web/mocks/calendar.pantanal.csv)

### 7. `POST /api/update` — the "Update now" button

No body. Asks the FIRMS API for the last days and adds them. Limited to once every 15 minutes.

```json
{ "status": "updated", "data_updated": "2026-11-14T15:20:00Z", "new_hotspots": 128 }
```

`status`: `updated`, `too_soon` (HTTP 429) or `failed`.

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
| `SERVER_ERROR` | 500 | Anything else |

**An area with no fires is not an error**: HTTP 200 with zeros. An area outside the covered region also returns 200, plus `"warning": "This area is outside the region we cover (Brazil)."`
