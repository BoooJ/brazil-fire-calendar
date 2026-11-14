# science/CLAUDE.md — harmonization method + validation

Scope: the method that makes MODIS and VIIRS comparable, and the proof that it works. The method itself is in `README.md` here (v1, to be confirmed by the team's scientist). The root `CLAUDE.md` rules apply.

## Rules

- The scientist decides the method. Agents may propose changes but must not change the method silently. Write every change in `README.md` with the reason.
- Notebooks read data from `DATA_DIR` (from `.env`) and never from the repo. Commit notebooks with outputs cleared, plus small figures (< 1 MB PNG) when they help. Never commit data.
- NASA FIRMS data only.
- Keep the cleaning rules identical to `infra/CLAUDE.md`. If you change one, change both in the same PR.

## Validation to deliver

- **Hold-out test:** fit the conversion on some overlap years, predict the held-out years, and report the **median error (%)** of the monthly counts per block, with the years used. This feeds `reliability` in the API and the "How reliable is this?" panel.
- **Sanity checks:**
  - Pantanal 2020 and 2024 stand out.
  - Roraima peaks around January–March.
  - The raw jumps at 2012 (S-NPP) and 2018 (NOAA-20) disappear after correction.
- **Fallback** if the S-NPP archive is late: MODIS + NOAA-20 only, calibrated on 2018-04 → 2021.

## Handoff to infra/

The conversion-factor table format is not decided yet. Agree on it with `infra/` and write the final format in `README.md` here.
