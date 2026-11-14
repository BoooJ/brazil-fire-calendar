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

## Stack (chosen 2026-11-14)

React 19 + TypeScript + Vite 6 · MapLibre GL 5 (basemap: NASA GIBS Blue Marble, imagery only) · Apache ECharts 5 (tree-shaken, see `src/components/EChart.tsx`).

```bash
cd web
npm install        # once
npm run dev        # http://localhost:5173 (reads mocks while VITE_API_BASE_URL is empty)
npm run build      # type-check + production build into web/dist/
```

- Vite reads the **repo-root** `.env` (`envDir: '..'`). Leave `VITE_API_BASE_URL` empty to use the mocks.
- Layout: `src/api.ts` (all data access) · `src/types.ts` (contract shapes) · `src/geo.ts` (rectangle/circle → Polygon) · `src/colors.ts` (scales) · `src/components/` (BurningCalendar, MapView, Charts, Panels, Controls).
- **Two pages.** `app.html` is the fire calendar (React, built by Vite). `public/index.html` is the landing page: plain HTML, copied to `dist/` as is.
- **The landing page** was designed with the `design-taste-frontend` skill (tasteskill, MIT, kit files in `public/assets/`, only the ones it uses). Edit `landing/index.template.html`, then run `python3 landing/gen.py`: it draws the product UI on the page as live HTML from `mocks/`. Never edit `public/index.html` by hand. The app does **not** use that skill or its kit.
- Drawing on the map is built in (`MapView.tsx`: rectangle by drag, polygon by clicks), no draw plugin.
