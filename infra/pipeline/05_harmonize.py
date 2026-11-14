"""Step 5 - harmonization v0: factors that turn every satellite into "NOAA-20 equivalent" fire-days.

This is a FIRST, deliberately simple version so the app can run end to end. The scientist owns the
real method (science/README.md: per 1 deg block, more checks). v0 uses Brazil-wide factors:

  from 2018-04          NOAA-20 fire-days as they are (the reference, still flying)
  2012-02 .. 2018-03    S-NPP fire-days  x  k_snpp            (same sensor; learned on 2018-05 .. 2026-07)
  before 2012-02        MODIS Aqua fire-days x k_aqua[month]  (learned on 2012-02 .. 2019-12, stable orbits)

Validation: fit k_aqua on 2012-2017 only, predict 2018-2019 from MODIS, compare with VIIRS.

Input : DATA_DIR/derived/fire_days/**/*.parquet   (from step 4)
Output: DATA_DIR/derived/harmonization_v0.json

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

SNPP_FIT = ((2018, 5), (2026, 7))       # both VIIRS satellites in final data
AQUA_FIT = ((2012, 2), (2019, 12))      # S-NPP full months, Aqua still on its stable orbit
AQUA_FIT_TRAIN_END = (2017, 12)         # for the hold-out test on 2018-2019


def in_range(ym: tuple[int, int], lo: tuple[int, int], hi: tuple[int, int]) -> bool:
    return lo <= ym <= hi


def main() -> None:
    root = data_dir()
    fd_glob = (root / "derived" / "fire_days" / "**" / "*.parquet").as_posix()
    con = duckdb.connect()
    rows = con.execute(f"""
        SELECT satellite, year, month, count(*) AS fire_days
        FROM read_parquet('{fd_glob}', hive_partitioning = true)
        GROUP BY ALL
    """).fetchall()
    monthly: dict[str, dict[tuple[int, int], int]] = {}
    for sat, year, month, n in rows:
        monthly.setdefault(sat, {})[(year, month)] = n
    snpp, n20, aqua = monthly["viirs_snpp"], monthly["viirs_noaa20"], monthly["modis_aqua"]

    # S-NPP -> NOAA-20 (one number: same sensor, ~50 min apart)
    both = [ym for ym in snpp if ym in n20 and in_range(ym, *SNPP_FIT)]
    k_snpp = sum(n20[ym] for ym in both) / sum(snpp[ym] for ym in both)

    def viirs_eq(ym: tuple[int, int]) -> float:
        return snpp[ym] * k_snpp

    def fit_aqua(hi: tuple[int, int]) -> dict[int, float]:
        factors = {}
        for m in range(1, 13):
            months = [ym for ym in aqua if ym[1] == m and ym in snpp and in_range(ym, AQUA_FIT[0], hi)]
            factors[m] = sum(viirs_eq(ym) for ym in months) / sum(aqua[ym] for ym in months)
        return factors

    # Hold-out test: learn on 2012-2017, predict 2018-2019 from MODIS Aqua alone.
    train = fit_aqua(AQUA_FIT_TRAIN_END)
    errors = []
    for ym in sorted(ym for ym in aqua if ym in snpp and in_range(ym, (2018, 1), (2019, 12))):
        actual = viirs_eq(ym)
        if actual >= 100:  # skip near-empty months, where % errors mean nothing
            errors.append(abs(aqua[ym] * train[ym[1]] / actual - 1) * 100)
    k_aqua = fit_aqua(AQUA_FIT[1])

    result = {
        "version": "v0",
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unit": "NOAA-20 equivalent fire-days (0.01 deg cell x UTC day)",
        "rules": [
            {"from": "2018-04", "source": "viirs_noaa20", "factor": 1.0},
            {"from": "2012-02", "to": "2018-03", "source": "viirs_snpp", "factor": round(k_snpp, 4)},
            {"to": "2012-01", "source": "modis_aqua", "factor_by_month": {str(m): round(f, 4) for m, f in k_aqua.items()}},
        ],
        "validation": {
            "method": "fit MODIS Aqua factors on 2012-02..2017-12, predict 2018-2019 monthly Brazil totals, compare with VIIRS",
            "months_tested": len(errors),
            "median_abs_error_pct": round(statistics.median(errors), 1) if errors else None,
            "p90_abs_error_pct": round(statistics.quantiles(errors, n=10)[-1], 1) if len(errors) >= 2 else None,
            "validated_years": [2018, 2019],
            "scope": "Brazil-wide totals; small areas will have larger errors",
        },
        "note": "v0 placeholder. Brazil-wide factors. Replace with the science/ method (per-block factors).",
    }
    out = root / "derived" / "harmonization_v0.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"S-NPP -> NOAA-20 factor: {k_snpp:.3f}")
    print("MODIS Aqua -> NOAA-20 factor by month: " + ", ".join(f"{m}:{f:.2f}" for m, f in k_aqua.items()))
    v = result["validation"]
    print(f"Hold-out 2018-2019 ({v['months_tested']} months): median error {v['median_abs_error_pct']}%, "
          f"90% of months under {v['p90_abs_error_pct']}%")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
