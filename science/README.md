# science/ — harmonization method + validation

Owner: **scientist**. Notebooks and method notes go here.

## What the API uses now (15 Nov 2026): MODIS Terra + VIIRS NOAA-20 only

**Team decision (Paul, 15 Nov):** build every number from two satellites, one per instrument, so no fire is counted or drawn twice. MODIS Aqua and VIIRS S-NPP stay in the data but the API no longer uses them (contract v0.3, `infra/pipeline/05_harmonize.py` → `harmonization_v1.json`).

- From 2018-04: NOAA-20 fire-days as they are. Before: MODIS Terra fire-days × a Brazil-wide factor per month of the year (4.1 in March → 7.4 in December), fitted on 2018-05 → 2026-07.
- Hold-out test (fit on 2020-01 → 2026-07, predict 2018-05 → 2019-12 Brazil monthly totals): **median error 10.0 %**, 90 % of months under 21.5 %. The previous v0 (S-NPP for 2012-2018, Aqua before) had 6.6 % and 15.6 %.
- Why Terra is weaker (for the scientist to review): it passes around 10:30, before the afternoon fire peak, and its orbit has drifted earlier since 2020. Against NOAA-20 over 2018-2025, monthly median error: S-NPP 1.9 %, Aqua 7.9 %, Terra 13.0 % (NOAA-20/Terra ratio 5.1–6.9 depending on the year).

## Method v1 (to confirm by the scientist)

1. **Clean:** vegetation fires only (`type` = 0); drop low confidence (MODIS < 30, VIIRS `l`).
2. **Count the same way for every satellite:** *fire-days* = distinct (≈1 km cell, day) pairs with at least one hotspot.
3. **One unit, "NOAA-20 equivalent":**
   - S-NPP → NOAA-20: learned on their overlap (2018-04 → 2026-11). Same sensor, so expect a small adjustment.
   - MODIS Aqua → VIIRS: learned on 2012–2019 (stable orbits), per 1° × 1° block × month of the year. Blocks with few fires use a Brazil-wide factor.
4. **Series:** MODIS converted before 2012, VIIRS from 2012.
5. **Validate:** hide some years, predict them, measure the error. That number goes in the "How reliable is this?" panel.
6. **Sanity checks:** Pantanal 2020 and 2024 stand out; Roraima peaks around January–March; the raw jumps in 2012 and 2018 disappear after correction.

**Fallback** if the S-NPP data arrives late: MODIS + NOAA-20 only, calibrated on 2018-04 → 2021.

## What the others need from science/

- [ ] Format of the conversion-factor table (agree with infrastructure)
- [ ] Validation result: median error (%) and years used → reliability panel
- [ ] Texts for "How reliable is this?" and the data sources page (to UI/UX)
- [ ] List of known fire events used as checks
