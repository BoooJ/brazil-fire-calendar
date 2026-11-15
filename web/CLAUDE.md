# web/CLAUDE.md — the website

Scope: everything the user sees. `../docs/api-contract.md` is the source of truth for data. The root `CLAUDE.md` rules apply.

## How to get data

- Put all data access in **one module**: `src/api.ts`. If `VITE_API_BASE_URL` is empty, it reads `web/mocks/`; otherwise it calls the real API. Nothing else in the app should know which one it is.
- Mocks to use:

| Mock | For |
|---|---|
| `mocks/analysis.pantanal.json` | The main page (reference date 2026-11-14: partial and provisional months) |
| `mocks/analysis.pantanal.ref-2020-09-14.json` | The 2020 crisis replay (huge anomaly). Used for every reference date up to 2020 |
| `mocks/hotspots.pantanal.2020-09.geojson` | Map points after a calendar click (`truncated: true`). The only month with points |
| `mocks/presets.json`, `mocks/status.json` | Preset buttons, "data updated", the data sources dialog |
| `mocks/calendar.pantanal.csv`, `mocks/hotspots.pantanal.2020-09.csv` | What the CSV buttons return |

- **Never edit `mocks/` by hand.** They come from `python infra/tools/make_mocks.py`.
- **Display, don't recompute:** `vs_avg_pct`, `rank`, `estimated_fires`, `briefing` and the averages come from the API. Don't calculate them in the browser.
- **A past reference date is sent as `ref_date` and `end`** (the page "as of" that day). With `ref_date` alone the API keeps every later month.

## Rules for the UI

- **Areas:** convert a rectangle, or lat/lon + radius (a 64-point circle), into a GeoJSON `Polygon` with **`[lon, lat]`** order before sending it (`src/geo.ts`).
- **Burning calendar:** years × months grid, with `Counts` / `vs Average` modes, an average row, year totals, hover details, and a click that opens that month on the map.
- **Every state needs a design:** loading, zero fires, API error, `truncated` hotspots ("showing 300 of N"), and `provisional` / `uncertain` / `partial` cells (hatched or faded, explained in the legend).
- **"Coming months"** always shows `next_months_label` ("not a forecast").

## Accessibility (part of "done")

- Counts use a colour-blind-safe sequential scale (yellow → orange → red on the white sheet, inferno on the dark panels). vs Average uses a diverging scale **without red/green** (purple ↔ orange) with a neutral middle.
- Never rely on colour alone: numbers on hover, ▲/▼ arrows, legends with values.
- Check with Chrome DevTools → Rendering → *Emulate vision deficiencies*. Works at 375 px width.

## Stack (chosen 2026-11-14)

React 19 + Vite + TypeScript. One app, hash routes: `#/` the landing page, `#/app` the tool.

```bash
cd web
npm install
npm run dev        # http://localhost:5173 — uses web/mocks/ while VITE_API_BASE_URL is empty
npm run build      # type-check + production build into web/dist/
npm run preview    # serve the build
```

- `.env` is read from the **repo root** (`envDir: '..'`). Leave `VITE_API_BASE_URL` empty to use the mocks.
- **The two pages never share a document.** Each is a lazy chunk with its own stylesheet, and `App.tsx` reloads the page when the route changes, so the landing page's kit and the tool's CSS cannot leak into each other. Shared code: `api.ts`, `types.ts`, `format.ts`, `geo.ts`, `colors.ts`, `components/Globe.tsx`, `components/Brand.tsx`.
- **The tool** uses plain CSS (`src/styles.css`, design tokens at the top). The globe is a canvas drawn with `d3-geo`; the quick calendar is plain HTML buttons. Two heavy parts load on demand: the map (MapLibre GL 5; basemap NASA GIBS Blue Marble, imagery only) and the detailed view's charts (Apache ECharts 5, tree-shaken in `components/EChart.tsx`).
- **The landing page** is laid out with the tasteskill design kit (MIT, licence beside it) in `public/assets/`. **Never edit the kit's files**: `src/landing/kit.ts` loads them at run time as they are, `src/landing/landing.css` sets the kit's palette and fonts to ours.
  - The kit makes every `main > section` one screen tall with its `h2` first. After changing words or sections, look at 1440×900, 1366×768, 820×1180 and 390×844.
  - The kit's scripts change the page's DOM (they split the `h1`, add canvases). Keep the landing page's markup static: only `landing/visuals.tsx` re-renders, when its data arrives.
  - The kit outlines "apology" wording in red (`placeholder`, `sample`, `are invented`, text in `[brackets]`). On the landing page the demo label is just "Demo data".

| File | What |
|---|---|
| `src/api.ts` | The only data access (mocks or real API), CSV downloads, the landing page's `getShowcase()` |
| `src/types.ts` | Contract shapes (keep in sync with `docs/api-contract.md`) |
| `src/geo.ts` | Circle, rectangle, drawn polygon → GeoJSON; preset areas |
| `src/pages/Tool.tsx` | The tool: location step, the one message, dates, the sheet, the globe/map stage |
| `src/components/LocationGate.tsx` | "Where should we look?": location, region, point + radius, or draw on the map |
| `src/components/Globe.tsx` | Globe: Brazil lit, area outline, hotspot points, the picked point's marker (`pick`) |
| `src/components/MapView.tsx` | The map: hotspots by fire strength, or next week's forecast cells by chance (`cells`, viridis `CHANCE_STOPS`), popups, drawing a rectangle or polygon (no draw plugin); zooms to the forecast cells when shown and fits a month's hotspots beside the desktop month card; if the GIBS imagery fails it says so and shows the globe's country outlines instead (`loadWorld()` from Globe.tsx) |
| `src/components/FireCalendar.tsx` | Quick view calendar, GitHub style: a row per year, a rounded brick per month (filled = happened, dotted = typical, hatched = provisional), a card anchored to the clicked brick; the average row is labelled as next year's typical row (not a forecast); newest 3 years first; bricks per year set by `--n` (ready for weeks) |
| `src/components/Detailed.tsx` | Detailed view: `BurningCalendar.tsx` (heatmap), `Charts.tsx` (typical year, year by year), PNG downloads |
| `src/components/Controls.tsx`, `Panels.tsx`, `MonthDetail.tsx` | Dates and view switch · key numbers, reliability, data sources · one month's details (`useClosing.ts`: their close animation) |
| `src/components/ForecastPanel.tsx` | Next-week fire chance (`POST /api/forecast`, the only forecast): always with its `label`, hidden while `forecast_available` is false |
| `src/format.ts` | Number/date formats and the one message's wording (`headlineFor`, `trendOf`, `rankLine`), shared by the tool and the landing page |
| `src/pages/Landing.tsx`, `src/landing/` | The landing page: markup, the kit loader, its stylesheet, the product UI drawn from the data |

**Display only, never for numbers:** country outlines on the globe and on the map when its imagery fails (Natural Earth, `world-atlas` npm package) and the map's imagery (NASA GIBS). Never use them to select, clip or count data. Both are credited on the landing page and in the data sources dialog.

Waiting for the API: "Update now" shows the API's own answer (`/api/update` is still a stub).
