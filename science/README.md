# science/ — harmonization method + validation

Owner: **scientist**. Notebooks and method notes go here.

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
