---
title: Brazil Fire Calendar API
emoji: 🔥
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
short_description: Harmonized NASA FIRMS burning calendar for Brazil
---

# Brazil Fire Calendar — API

NASA Space Apps Challenge 2026 · *Harmonization of MODIS and VIIRS Hot Spots*.

This Space serves the API of the Brazil Fire Calendar: 20+ years of NASA FIRMS active-fire hotspots over Brazil
(MODIS 2000 →, VIIRS S-NPP 2012 → Nov 2026, VIIRS NOAA-20 2018 →), harmonized into one consistent unit
(NOAA-20-equivalent fire-days).

- Interactive documentation: `/docs`
- Endpoints: `GET /api/presets`, `GET /api/status`, `POST /api/analysis`, `POST /api/hotspots`,
  `POST /api/export/hotspots.csv`, `POST /api/export/calendar.csv`

Data: NASA Fire Information for Resource Management System (FIRMS). The harmonization is a first version (v0):
Brazil-wide factors, tested on 2018–2019 Brazil totals (median error 6.6 %). Not a forecast.
