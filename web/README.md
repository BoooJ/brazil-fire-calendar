# web/ — the website

Owner: **UI/UX**. Read [`docs/api-contract.md`](../docs/api-contract.md) first.

## Run it

```bash
cd web
npm install
npm run dev      # landing page: http://localhost:5173 · the tool: http://localhost:5173/#/app
```

Needs Node.js 20+. With `VITE_API_BASE_URL` empty in `.env` (or no `.env`), the site shows the mocks and says "Demo data".

## Two pages

| Page | What is on it |
|---|---|
| Landing page (`#/`) | What the project is, the four satellites, raw against corrected, the method, questions, team and credits |
| The tool (`#/app`) | Pick an area (your location, a region, a point and a radius, or a shape drawn on the map), read one message, then the burning calendar |

In the tool, **Quick view** shows the calendar as marked days. **Detailed view** adds key numbers, a heatmap calendar, the typical-year and year-by-year charts and the reliability panel. A click on a month opens its details and its hotspots on the map. Downloads: calendar CSV, hotspots CSV, charts as PNG.

## Without the API

Until the real API is reachable, the site runs on the fake files in [`mocks/`](mocks/). **All numbers in them are invented.**

| File | Use it for |
|---|---|
| `presets.json` | Preset buttons |
| `status.json` | "Data updated" time + what each satellite covers |
| `analysis.pantanal.json` | The whole page. Reference date 14 Nov 2026: includes **partial** and **provisional** months |
| `analysis.pantanal.ref-2020-09-14.json` | Replay of the 2020 crisis (huge anomaly) |
| `hotspots.pantanal.2020-09.geojson` | Map points after clicking Sep 2020 (only 300 of many: `truncated: true`) |
| `calendar.pantanal.csv`, `hotspots.pantanal.2020-09.csv` | What the download buttons return |

- Regenerate them with `python infra/tools/make_mocks.py`.
- Switch to the real API by setting `VITE_API_BASE_URL` in `.env`.

## Stack

React + TypeScript + Vite · a `d3-geo` globe · MapLibre GL (NASA GIBS imagery) · Apache ECharts · the landing page uses the tasteskill design kit in `public/assets/` (MIT). Details and rules in [`CLAUDE.md`](CLAUDE.md).

## Features

The 17 MVP features are listed in the [README](../README.md#mvp-features). Everything on screen is yours. The numbers come ready-made from the API.

## Accessibility checklist

- [x] Counts: colour-blind-safe sequential scale (yellow → orange → red, inferno on the dark panels)
- [x] vs Average: diverging scale without red/green (purple ↔ orange), neutral colour for "normal"
- [x] Never colour alone: numbers on hover, ▲/▼ arrows, a legend with values
- [ ] Checked with Chrome DevTools → Rendering → *Emulate vision deficiencies*
- [x] Works at 375 px width (phone)
- [x] Provisional and uncertain months are visibly different (hatched or faded), with a legend
