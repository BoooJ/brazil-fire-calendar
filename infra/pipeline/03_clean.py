"""Step 3 - clean: one table, same columns for every satellite, saved as Parquet.

Input : DATA_DIR/brazil_csv/{product}/{final|provisional}/*.csv   (from step 2)
Output: DATA_DIR/clean/hotspots/satellite=<key>/year=<YYYY>/*.parquet  (rebuilt each run)

Every row is kept and flagged, so the cleaning rules can change without re-running this step:
  valid        true if the row passes the rules below
  drop_reason  why not: bad_row | unknown_satellite | non_vegetation | low_confidence
Rules (owned by science/, keep in sync with science/README.md):
  - type present and not 0 (volcano, static land source, offshore) -> non_vegetation
  - confidence low (MODIS < 30, VIIRS 'l')                           -> low_confidence
Exact duplicates (same point, date, time, satellite) are removed; final data wins over provisional.

Read it back with DuckDB:
    SELECT * FROM read_parquet('<DATA_DIR>/clean/hotspots/**/*.parquet', hive_partitioning = true)

Usage:
    python infra/pipeline/03_clean.py
"""
from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import data_dir  # noqa: E402


def sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def main() -> None:
    root = data_dir()
    csv_root = root / "brazil_csv"
    out_dir = root / "clean" / "hotspots"
    files = sorted(csv_root.rglob("*.csv"))
    if not files:
        sys.exit(f"No CSV in {csv_root}. Run 02_extract_brazil.py first.")

    start = time.monotonic()
    con = duckdb.connect()
    file_list = "[" + ", ".join(sql_path(f) for f in files) + "]"
    con.execute(f"""
        CREATE TABLE raw AS
        SELECT * FROM read_csv({file_list}, header = true, all_varchar = true,
                               union_by_name = true, filename = true)
    """)
    columns = {row[0] for row in con.execute("DESCRIBE raw").fetchall()}

    def col(name: str) -> str:
        """The column if some file has it, otherwise NULL (e.g. NRT files have no 'type')."""
        return name if name in columns else "NULL"

    brightness = (f"COALESCE({col('brightness')}, {col('bright_ti4')})"
                  if {"brightness", "bright_ti4"} & columns else "NULL")

    con.execute(f"""
        CREATE TABLE std AS
        WITH src AS (
            SELECT *,
                   regexp_extract(replace(filename, '\\', '/'), 'brazil_csv/([^/]+)/([^/]+)/([^/]+)$', 1) AS product,
                   regexp_extract(replace(filename, '\\', '/'), 'brazil_csv/([^/]+)/([^/]+)/([^/]+)$', 2) AS data_version,
                   regexp_extract(replace(filename, '\\', '/'), 'brazil_csv/([^/]+)/([^/]+)/([^/]+)$', 3) AS source_file
            FROM raw
        )
        SELECT
            TRY_CAST(latitude AS DOUBLE)  AS latitude,
            TRY_CAST(longitude AS DOUBLE) AS longitude,
            TRY_CAST(acq_date AS DATE)    AS acq_date,
            lpad(trim(acq_time), 4, '0')  AS acq_time,
            CASE
                WHEN product = 'modis' AND upper(trim({col('satellite')})) IN ('TERRA', 'T') THEN 'modis_terra'
                WHEN product = 'modis' AND upper(trim({col('satellite')})) IN ('AQUA', 'A')  THEN 'modis_aqua'
                WHEN product = 'modis' THEN NULL
                ELSE product
            END AS satellite,
            CASE WHEN product = 'modis' THEN 'MODIS' ELSE 'VIIRS' END AS instrument,
            CASE
                WHEN product = 'modis' THEN
                    CASE WHEN TRY_CAST(confidence AS INTEGER) < 30 THEN 'low'
                         WHEN TRY_CAST(confidence AS INTEGER) < 80 THEN 'nominal'
                         WHEN TRY_CAST(confidence AS INTEGER) IS NOT NULL THEN 'high' END
                ELSE
                    CASE lower(trim(confidence))
                         WHEN 'l' THEN 'low' WHEN 'low' THEN 'low'
                         WHEN 'n' THEN 'nominal' WHEN 'nominal' THEN 'nominal'
                         WHEN 'h' THEN 'high' WHEN 'high' THEN 'high' END
            END AS confidence,
            confidence                       AS confidence_raw,
            TRY_CAST({brightness} AS DOUBLE) AS brightness_k,
            TRY_CAST(frp AS DOUBLE)          AS frp,
            daynight,
            TRY_CAST({col('type')} AS INTEGER) AS type,
            data_version,
            source_file
        FROM src
    """)

    con.execute("""
        CREATE TABLE clean AS
        WITH flagged AS (
            SELECT *,
                CASE
                    WHEN latitude IS NULL OR longitude IS NULL OR acq_date IS NULL THEN 'bad_row'
                    WHEN satellite IS NULL THEN 'unknown_satellite'
                    WHEN type IS NOT NULL AND type <> 0 THEN 'non_vegetation'
                    WHEN confidence = 'low' THEN 'low_confidence'
                END AS drop_reason
            FROM std
        )
        SELECT *, drop_reason IS NULL AS valid,
               year(acq_date) AS year, month(acq_date) AS month
        FROM flagged
        QUALIFY row_number() OVER (
            PARTITION BY latitude, longitude, acq_date, acq_time, satellite
            ORDER BY (data_version = 'final') DESC, source_file
        ) = 1
    """)

    total_raw = con.execute("SELECT count(*) FROM raw").fetchone()[0]
    total_clean = con.execute("SELECT count(*) FROM clean").fetchone()[0]

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"""
        COPY (SELECT * FROM clean ORDER BY satellite, acq_date, acq_time)
        TO {sql_path(out_dir)} (FORMAT PARQUET, PARTITION_BY (satellite, year), COMPRESSION ZSTD)
    """)

    print(f"Read {len(files)} CSV file(s): {total_raw:,} rows; {total_raw - total_clean:,} exact duplicates removed.")
    print(f"Wrote {total_clean:,} rows to {out_dir} in {time.monotonic() - start:,.0f} s\n")
    print("Rows per satellite and year (valid / total):")
    for sat, year, valid, total in con.execute("""
        SELECT satellite, year, count(*) FILTER (WHERE valid), count(*)
        FROM clean GROUP BY ALL ORDER BY satellite, year
    """).fetchall():
        print(f"  {str(sat):14s} {year}  {valid:>10,} / {total:>10,}")
    print("\nWhy rows are flagged invalid:")
    for reason, n in con.execute("""
        SELECT drop_reason, count(*) FROM clean WHERE NOT valid GROUP BY ALL ORDER BY 2 DESC
    """).fetchall():
        print(f"  {reason:18s} {n:>10,}")


if __name__ == "__main__":
    main()
