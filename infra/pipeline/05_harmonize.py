"""Step 5 - harmonization v1: factors that turn MODIS Terra into "NOAA-20 equivalent" fire-days.

The team decided (15 Nov 2026) to build every number from two satellites only, one per instrument,
so no fire is seen twice: VIIRS NOAA-20 (the reference) and MODIS Terra. v0 (in git history) used
S-NPP for 2012-2018 and MODIS Aqua before 2012.

  from 2018-04       NOAA-20 fire-days as they are (the reference, still flying)
  before 2018-04     MODIS Terra fire-days x k_terra[month]   (learned on 2018-05 .. 2026-07, final data)

Validation: fit k_terra on 2020-01 .. 2026-07 only, predict the 2018-05 .. 2019-12 monthly Brazil
totals from Terra, compare with NOAA-20 (same idea as v0's test).

Known limit (for science/): Terra passes over Brazil around 10:30, before the afternoon fire peak,
and its orbit has drifted earlier since 2020. It sees about 1/6 of NOAA-20's fire-days, against
1/4 for Aqua (13:30, like NOAA-20), so v1 has larger errors than v0 before 2018.

Input : DATA_DIR/derived/fire_days/**/*.parquet   (from step 4)
Output: DATA_DIR/derived/harmonization_v1.json     (read by the API)

Usage:
    python infra/pipeline/05_harmonize.py
"""
from __future__ import annotations

import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import data_dir  # noqa: E402

FIT = ((2018, 5), (2026, 7))       # NOAA-20 and Terra both in final data
TRAIN = ((2020, 1), (2026, 7))     # for the hold-out test
TEST = ((2018, 5), (2019, 12))


def in_range(ym: tuple[int, int], lo: tuple[int, int], hi: tuple[int, int]) -> bool:
    return lo <= ym <= hi


def main() -> None:
    root = data_dir()
    fd_glob = (root / "derived" / "fire_days" / "**" / "*.parquet").as_posix()
    con = duckdb.connect()
    rows = con.execute(f"""
        SELECT satellite, year, month, count(*) AS fire_days
        FROM read_parquet('{fd_glob}', hive_partitioning = true)
        WHERE satellite IN ('modis_terra', 'viirs_noaa20')
        GROUP BY ALL
    """).fetchall()
    monthly: dict[str, dict[tuple[int, int], int]] = {}
    for sat, year, month, n in rows:
        monthly.setdefault(sat, {})[(int(year), int(month))] = n
    terra, n20 = monthly["modis_terra"], monthly["viirs_noaa20"]

    def fit(lo: tuple[int, int], hi: tuple[int, int]) -> dict[int, float]:
        factors = {}
        for m in range(1, 13):
            months = [ym for ym in terra if ym[1] == m and ym in n20 and in_range(ym, lo, hi)]
            factors[m] = sum(n20[ym] for ym in months) / sum(terra[ym] for ym in months)
        return factors

    train = fit(*TRAIN)
    errors = []
    for ym in sorted(ym for ym in terra if ym in n20 and in_range(ym, *TEST)):
        actual = n20[ym]
        if actual >= 100:  # skip near-empty months, where % errors mean nothing
            errors.append(abs(terra[ym] * train[ym[1]] / actual - 1) * 100)
    k_terra = fit(*FIT)
    median_err = round(statistics.median(errors), 1)

    result = {
        "version": "v1",
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unit": "NOAA-20 equivalent fire-days (0.01 deg cell x UTC day)",
        "satellites": ["modis_terra", "viirs_noaa20"],
        "rules": [
            {"from": "2018-04", "source": "viirs_noaa20", "factor": 1.0},
            {"to": "2018-03", "source": "modis_terra", "factor_by_month": {str(m): round(f, 4) for m, f in k_terra.items()}},
        ],
        "validation": {
            "method": "fit MODIS Terra factors on 2020-01..2026-07, predict 2018-05..2019-12 monthly Brazil totals, compare with NOAA-20",
            "months_tested": len(errors),
            "median_abs_error_pct": median_err,
            "p90_abs_error_pct": round(statistics.quantiles(errors, n=10)[-1], 1) if len(errors) >= 2 else None,
            "validated_years": [2018, 2019],
            "scope": "Brazil-wide totals; small areas will have larger errors",
        },
        "reliability_note": "v1 harmonization: MODIS Terra converted to NOAA-20 with Brazil-wide monthly factors, "
                            "tested on Brazil totals for 2018-2019. Small areas have larger errors.",
        "note": "Two satellites only (MODIS Terra + VIIRS NOAA-20), team decision of 15 Nov 2026. "
                "Brazil-wide factors; to be reviewed by science/.",
    }
    out = root / "derived" / "harmonization_v1.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print("MODIS Terra -> NOAA-20 factor by month: " + ", ".join(f"{m}:{f:.2f}" for m, f in k_terra.items()))
    v = result["validation"]
    print(f"Hold-out 2018-2019 ({v['months_tested']} months): median error {v['median_abs_error_pct']}%, "
          f"90% of months under {v['p90_abs_error_pct']}%")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
