# web/CLAUDE.md — the website

Scope: everything the user sees. `../docs/api-contract.md` is the source of truth for data. The root `CLAUDE.md` rules apply.

## How to get data

- Put all data access in **one module** (e.g. `src/api.ts`). If `VITE_API_BASE_URL` is empty, it reads `web/mocks/`; otherwise it calls the real API. Nothing else in the app should know which one it is.
- Mocks to use:

| Mock | For |
|---|---|
| `mocks/analysis.pantanal.json` | The main page (reference date 2026-11-14: partial and provisional months) |
| `mocks/analysis.pantanal.ref-2020-09-14.json` | The 2020 crisis replay (huge anomaly) |
| `mocks/hotspots.pantanal.2020-09.geojson` | Map points after a calendar click (`truncated: true`) |
| `mocks/presets.json`, `mocks/status.json` | Preset buttons, "data updated" |

- **Never edit `mocks/` by hand.** They come from `python infra/tools/make_mocks.py`.
- **Display, don't recompute:** `vs_avg_pct`, `rank`, `estimated_fires`, `briefing` and the averages come from the API. Don't calculate them in the browser.

## Rules for the UI

- **Areas:** convert a rectangle, or lat/lon + radius (a 64-point circle), into a GeoJSON `Polygon` with **`[lon, lat]`** order before sending it.
- **Burning calendar:** years × months grid, with `Counts` / `vs Average` modes, an average row, year totals, hover details, and a click that opens that month on the map.
- **Every state needs a design:** loading, zero fires, API error, `truncated` hotspots ("showing 300 of N"), and `provisional` / `uncertain` / `partial` cells (hatched or faded, explained in the legend).
- **"Coming months"** always shows `next_months_label` ("not a forecast").

## Accessibility (part of "done")

- Counts use a colour-blind-safe sequential scale (viridis, or yellow → orange → red). vs Average uses a diverging scale **without red/green** (e.g. purple ↔ orange) with a neutral middle.
- Never rely on colour alone: numbers on hover, ▲/▼ arrows, legends with values.
- Check with Chrome DevTools → Rendering → *Emulate vision deficiencies*. Works at 375 px width.

## Stack (chosen)

React 19 + Vite + TypeScript. No UI framework: plain CSS in `src/styles.css` (design tokens at the top).
The globe is a canvas drawn with `d3-geo` (orthographic); the calendar is plain HTML buttons.

```bash
cd web
npm install
npm run dev        # http://localhost:5173 — uses web/mocks/ while VITE_API_BASE_URL is empty
npm run build      # type-check + production build into web/dist/
npm run preview    # serve the build
```

- `.env` is read from the **repo root** (`envDir: '..'`). Leave `VITE_API_BASE_URL` empty to use the mocks.
- Routes are hash-based: `#/` landing page, `#/app` the tool.

| File | What |
|---|---|
| `src/api.ts` | The only data access (mocks or real API) |
| `src/types.ts` | Contract shapes (keep in sync with `docs/api-contract.md`) |
| `src/geo.ts` | Circle → 64-point polygon, preset areas |
| `src/pages/Landing.tsx`, `src/pages/Tool.tsx` | The two pages |
| `src/components/Globe.tsx` | Globe: Brazil lit, area outline, hotspot points |
| `src/components/LocationGate.tsx` | "Where should we look?" step, shown before anything else |
| `src/components/FireCalendar.tsx` | Burning calendar (filled = happened, dotted = typical, hatched = provisional) |
| `src/components/MonthDetail.tsx` | Month details + "show on the map" |

**Country outlines** on the globe come from Natural Earth (`world-atlas` npm package). They are decoration only, like a basemap: never use them to select, clip or count data. Credit them on the landing page.

Not built yet: area drawing (rectangle/polygon), date range, typical-year and year-by-year charts, downloads, Quick/Detailed view, data sources page, "Update now".
