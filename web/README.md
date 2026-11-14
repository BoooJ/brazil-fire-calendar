# web/ — the website

Owner: **UI/UX**. Read [`docs/api-contract.md`](../docs/api-contract.md) first.

## Start now, without the API

The real API is not ready yet. Build every screen against the fake files in [`mocks/`](mocks/). **All numbers in them are invented.**

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

## Suggested stack (your call)

React + Vite · MapLibre GL or Leaflet (with a draw plugin) · Apache ECharts (heatmap and PNG export built in). If nobody knows React: Streamlit (Python).

## Features to build

The 17 MVP features are listed in the [README](../README.md#mvp-features). Everything on screen is yours. The numbers come ready-made from the API.

## Accessibility checklist

- [ ] Counts: colour-blind-safe sequential scale (e.g. viridis, or yellow → orange → red)
- [ ] vs Average: diverging scale without red/green (e.g. purple ↔ orange), neutral colour for "normal"
- [ ] Never colour alone: numbers on hover, ▲/▼ arrows, a legend with values
- [ ] Checked with Chrome DevTools → Rendering → *Emulate vision deficiencies*
- [ ] Works at 375 px width (phone)
- [ ] Provisional and uncertain squares are visibly different (hatched or faded), with a legend
