# web/CLAUDE.md — the website

Scope: everything the user sees. `../docs/api-contract.md` is the source of truth for data. The root `CLAUDE.md` rules apply.

## How to get data

- Put all data access in **one module**: `src/api.ts`. If `VITE_API_BASE_URL` is empty, it reads `web/mocks/`; otherwise it calls the real API. Nothing else in the app should know which one it is.
- Mocks to use:

| Mock | For |
|---|---|
| `mocks/analysis.pantanal.json` | The main page (reference date 2026-11-14: partial and provisional months) |
| `mocks/analysis.pantanal.ref-2020-09-14.json` | The 2020 crisis as a past reference date. Not used by the page since "Select a day" replaced the replay (it only scrolls the calendar) |
| `mocks/hotspots.pantanal.2020-09.geojson` | Map points after a calendar click (`truncated: true`). The only month with points |
| `mocks/presets.json`, `mocks/status.json` | Preset buttons, "data updated", the data sources dialog |
| `mocks/calendar.pantanal.csv`, `mocks/hotspots.pantanal.2020-09.csv` | What the CSV buttons return |

- **Never edit `mocks/` by hand.** They come from `python infra/tools/make_mocks.py`.
- **Display, don't recompute:** `vs_avg_pct`, `rank`, `estimated_fires`, `briefing` and the averages come from the API. Don't calculate them in the browser.
- **A past reference date is sent as `ref_date` and `end`** (the page "as of" that day). With `ref_date` alone the API keeps every later month.

## Rules for the UI

- **Areas:** convert a rectangle, or lat/lon + radius (a 64-point circle), into a GeoJSON `Polygon` with **`[lon, lat]`** order before sending it (`src/geo.ts`).
- **Burning calendar:** years × months grid, with `Counts` / `vs Average` modes, an average row, year totals, hover details, and a click that opens that month on the map.
- **Every state needs a design:** loading, zero fires, API error, `truncated` hotspots ("showing 300 of N"), and `provisional` / `uncertain` / `partial` cells (dotted or faded, explained in the legend).
- **"Coming months"** always shows `next_months_label` ("not a forecast").

## Accessibility (part of "done")

- Counts use a colour-blind-safe sequential scale (yellow → orange → red, darker = more), in the bricks and in the charts. vs Average uses a diverging scale **without red/green** (purple ↔ orange) with a neutral middle.
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
- **Going online:** merging a PR that changes `web/` into `main` puts it on https://fire.37-187-37-74.sslip.io within about a minute (GitHub Actions > "Deploy website"). Run `npm run build` before merging: a failing build is not uploaded. The online build gets `VITE_API_BASE_URL` from `.github/workflows/deploy-web.yml`, not from `.env`: if the API moves, change it there (and in `netlify.toml`).
- **The two pages never share a document.** Each is a lazy chunk with its own stylesheet, and `App.tsx` reloads the page when the route changes, so the landing page and the tool cannot leak styles into each other. Shared code: `api.ts`, `types.ts`, `format.ts`, `geo.ts`, `colors.ts`, `components/Globe.tsx`, `components/Brand.tsx`.
- **One look, two stylesheets:** light theme, flat colours, **no gradients anywhere** (`grep -rn gradient src` must stay empty). Shared tokens: canvas `#fff`, bands `#f5f5f7`, ink `#1d1d1f`, secondary `#6e6e73`, hairline `#e6e6e8`/`#d6d6d6`, one accent (ember `#d9480f`); radii 10 / 20 / 28 / pill; 4 px spacing base; Inter, with JetBrains Mono uppercase for small labels; cards are flat with a hairline, only floating things (popovers, the month card, toasts) have a shadow.
- **The tool** uses plain CSS (`src/styles.css`, design tokens at the top). The globe is a canvas drawn with `d3-geo`; the quick calendar is plain HTML buttons. Two heavy parts load on demand: the map (MapLibre GL 5; basemap NASA GIBS Blue Marble, imagery only) and the detailed view's charts (Apache ECharts 5, tree-shaken in `components/EChart.tsx`).
- **The landing page** is plain React and CSS too (`src/landing/landing.css`). The tasteskill kit in `public/assets/` is **no longer loaded** (it painted gradients and forced one-screen sections); the files are still there, untouched.
  - Its pictures of the tool are **real screenshots** in `src/landing/pictures/` (never redraw the tool by hand). After the tool's look changes, re-shoot them with Playwright (location step, first screen, calendar, whole tool) and check 1440×900, 1366×768, 820×1180 and 390×844.
- **Quick view speaks plainly:** no "fire-days", "corrected count" or "rank" there (one exception, asked by Paul: the weekly calendar's hover shows the week's fire-days). Intensity is a colour and a word (`src/levels.ts`); the numbers and their one-line explanations live in the Detailed view and the month card.

| File | What |
|---|---|
| `src/api.ts` | The only data access (mocks or real API), CSV downloads, the landing page's `getShowcase()` |
| `src/types.ts` | Contract shapes (keep in sync with `docs/api-contract.md`) |
| `src/geo.ts` | Circle, rectangle, drawn polygon → GeoJSON; preset areas |
| `src/states.ts`, `src/data/brazil-states.json` | Brazil's 27 states (Natural Earth admin-1, 1:50m, simplified with mapshaper, 38 KB): search, the state under a point, a state as the page's area (its real border goes to the API) |
| `src/levels.ts` | Intensity levels (colour + word) shared by the calendar, the first screen and the coming months |
| `src/components/Status.tsx` | The first screen: a short headline ("Fire activity ▼ 52%") with its sentence under it, three answers (fire now, against typical, is this the season), a typical year as bars with this month in the middle and the coming months hollow (an estimate) |
| `src/pages/Tool.tsx` | The tool: location step, the one message, dates, the sheet, the globe/map stage |
| `src/components/LocationGate.tsx` | "Where should we look?": three tabs. State (searchable list of 27, or click the globe), Point (location or coordinates + radius), Draw |
| `src/components/Globe.tsx` | Globe, flat and light: Brazil with state borders, the state under the pointer lifts and a click selects it (`onState`), area outline, hotspot points, the picked point's marker (`pick`) |
| `src/components/MapView.tsx` | The map: hotspots by fire strength, or next week's forecast cells by chance (`cells`, viridis `CHANCE_STOPS`), popups, drawing a rectangle or polygon (no draw plugin); zooms to the forecast cells when shown and fits a month's hotspots beside the desktop month card; if the GIBS imagery fails it says so and shows the globe's country outlines instead (`loadWorld()` from Globe.tsx) |
| `src/components/FireCalendar.tsx` | Quick view calendar, GitHub style: a row per ISO year, a brick per **week** (53 columns, `data-period="week"`, week 53 empty in 52-week years) from the API's `calendar_weekly` (contract v0.4, `getAnalysis` sends `"period": "week"`; never built in the browser); falls back to 12 month bricks if an answer has no weeks. Filled = happened, dashed outline = typical (`average_by_week`, not a forecast), hatched = provisional, faded = uncertain, ring = this week. Hover: "Week 46 · 9–15 Nov 2026 · 54 fire-days · −93% vs usual (2003–2025)"; a click opens a card with its month on the map / month details (everything else stays monthly). Phones under 700 px scroll the weeks sideways with the years pinned. Newest 3 years, See more / See less; `jump` lights the week of the chosen day |
| `src/components/Detailed.tsx` | Detailed view: `BurningCalendar.tsx` (heatmap), `Charts.tsx` (typical year, year by year), PNG downloads |
| `src/components/Controls.tsx`, `Panels.tsx`, `MonthDetail.tsx` | Now / Select a day (finds a day in the calendar, never reloads or hides data) and the view switch · key numbers, reliability, data sources · one month's details (`useClosing.ts`: their close animation) |
| `src/components/ForecastPanel.tsx` | Next-week fire chance (`POST /api/forecast`, the only forecast): always with its `label` (a small line under the numbers), details behind "Read more", hidden while `forecast_available` is false |
| `src/format.ts` | Number/date formats and the status line's wording (`headlineParts`, `headlineFor`, `trendOf`, `rankLine`, `vsTypical`) |
| `src/pages/Landing.tsx`, `src/landing/` | The landing page: markup, its stylesheet, the screenshots of the tool (`pictures/`), the data pictures drawn from the API (`visuals.tsx`) |

**State borders (decided by Mike, UI/UX owner, 15 Nov 2026; overrides root rule 1 for this one dataset):** Brazil's state borders from Natural Earth (public domain) are shown on the globe and the map AND may select the data area: picking a state sends its border to the API as a `Polygon`/`MultiPolygon` in `[lon, lat]` order (under 1,000 points), like any drawn area. Every fire number is still NASA FIRMS only.

**Display only, never for numbers:** country outlines (Natural Earth, `world-atlas` npm package) and the map's imagery (NASA GIBS). All three are credited on the landing page and in the data sources dialog.

Waiting for the API: "Update now" shows the API's own answer (`/api/update` is still a stub).
