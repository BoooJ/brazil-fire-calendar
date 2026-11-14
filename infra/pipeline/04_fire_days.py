"""Step 4 - fire-days: count every satellite the same way, on a ~1 km grid.

A fire-day = one grid cell (0.01 deg, ~1.1 km) on one UTC date with at least one valid hotspot.
A sharper sensor (VIIRS) sees more dots on the same fire, but it is still one burning cell that day.

Input : DATA_DIR/clean/hotspots/**/*.parquet                       (from step 3)
Output: DATA_DIR/derived/fire_days/satellite=<key>/year=<YYYY>/*.parquet   (rebuilt each run)
          cy, cx        grid indices: cell = floor(latitude / 0.01), floor(longitude / 0.01)
          acq_date, month
          n_hotspots    valid hotspots in that cell that day (raw detections)
          n_night       of which at night
          max_frp       strongest fire radiative power (MW)
          provisional   true if any hotspot came from near-real-time (not final) data
        DATA_DIR/derived/static_cells.parquet   cells NASA flagged as volcano / static land
                                                source / offshore (type 1, 2, 3) in final data
Near-real-time rows have no 'type', so hotspots in a static cell are dropped from them here.

Usage:
    python infra/pipeline/04_fire_days.py
"""
from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import data_dir  # noqa: E402

CELL_DEG = 0.01


def sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def main() -> None:
    root = data_dir()
    clean_glob = root / "clean" / "hotspots" / "**" / "*.parquet"
    out_dir = root / "derived" / "fire_days"
    static_file = root / "derived" / "static_cells.parquet"
    if not (root / "clean" / "hotspots").exists():
        sys.exit("No clean table yet. Run 03_clean.py first.")

    start = time.monotonic()
    con = duckdb.connect()
    con.execute(f"""
        CREATE VIEW clean AS
        SELECT *,
               CAST(floor(latitude / {CELL_DEG}) AS INTEGER)  AS cy,
               CAST(floor(longitude / {CELL_DEG}) AS INTEGER) AS cx
        FROM read_parquet({sql_path(clean_glob)}, hive_partitioning = true)
    """)
    con.execute("""
        CREATE TABLE static_cells AS
        SELECT DISTINCT cy, cx FROM clean WHERE type IN (1, 2, 3)
    """)
    n_static = con.execute("SELECT count(*) FROM static_cells").fetchone()[0]

    con.execute("""
        CREATE TABLE fire_days AS
        SELECT c.cy, c.cx, c.acq_date, c.satellite, c.year, c.month,
               count(*)                                   AS n_hotspots,
               count(*) FILTER (WHERE c.daynight = 'N')   AS n_night,
               max(c.frp)                                 AS max_frp,
               bool_or(c.data_version = 'provisional')    AS provisional
        FROM clean c
        LEFT JOIN static_cells s ON c.cy = s.cy AND c.cx = s.cx
        WHERE c.valid
          AND NOT (c.data_version = 'provisional' AND s.cy IS NOT NULL)
        GROUP BY ALL
    """)

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    con.execute(f"""
        COPY (SELECT * FROM fire_days ORDER BY satellite, acq_date, cy, cx)
        TO {sql_path(out_dir)} (FORMAT PARQUET, PARTITION_BY (satellite, year), COMPRESSION ZSTD)
    """)
    con.execute(f"COPY static_cells TO {sql_path(static_file)} (FORMAT PARQUET)")

    print(f"{n_static:,} static/industrial cells. Wrote fire-days to {out_dir} "
          f"in {time.monotonic() - start:,.0f} s\n")
    print("Fire-days per satellite (hotspots per fire-day shows how much sharper VIIRS is):")
    for sat, fd, hs, y0, y1 in con.execute("""
        SELECT satellite, count(*), sum(n_hotspots), min(year), max(year)
        FROM fire_days GROUP BY satellite ORDER BY satellite
    """).fetchall():
        print(f"  {sat:14s} {y0}-{y1}  {fd:>12,} fire-days  {hs / fd:5.2f} hotspots per fire-day")


if __name__ == "__main__":
    main()
