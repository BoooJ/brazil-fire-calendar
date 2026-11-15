"""Step 1c - the newest hours: near-real-time hotspots from the FIRMS API, after the last archive file.

The archive requests (step 1b) stop at the moment they were made. This step asks the FIRMS area API
for everything newer (MODIS and VIIRS NOAA-20 near-real-time), up to now.

Keeping only Brazil without non-NASA borders: FIRMS has no country API any more ("Invalid API call",
checked 2026-11-15), so we ask for a box around Brazil and keep a hotspot only if its 0.05 deg cell
(~5 km) already holds hotspots that NASA itself put in Brazil's files. Checked on 10-13 Nov 2026,
where the true Brazil data is known: 0.12 % of Brazil's hotspots missed, 0.40 % from next door kept,
all along the border. Only the hours after the last archive file go through this filter.

Output: DATA_DIR/brazil_csv/{product}/provisional/fire_nrt_<SRC>_api.csv, rewritten on every run.
Then run steps 3 and 4 again.

The MAP_KEY is in the URL path, so URLs and request errors are never printed.

Usage:
    python infra/pipeline/01c_download_recent.py
"""
from __future__ import annotations

import io
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import duckdb
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import data_dir  # noqa: E402

API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
HEADERS = {"User-Agent": "brazil-fire-calendar-pipeline/0.1"}
BOX = (-74.0, -33.8, -34.8, 5.3)  # west, south, east, north: Brazil plus a margin
MASK_DEG = 0.05
MAX_DAYS = 5  # FIRMS limit per call
# FIRMS source -> (product folder, archive code used in the file name, FIRMS satellite -> our key)
SOURCES = {
    "VIIRS_NOAA20_NRT": ("viirs_noaa20", "J1V-C2", {"N20": "viirs_noaa20", "N": "viirs_noaa20"}),
    "MODIS_NRT": ("modis", "M-C61", {"Terra": "modis_terra", "T": "modis_terra", "Aqua": "modis_aqua", "A": "modis_aqua"}),
}


def sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def fetch(key: str, source: str, first: date, days: int) -> pd.DataFrame:
    west, south, east, north = BOX
    url = f"{API}/{key}/{source}/{west},{south},{east},{north}/{days}/{first.isoformat()}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=300)
    except requests.RequestException as exc:  # the message would contain the URL, hence the key
        sys.exit(f"FIRMS request failed for {source} {first}: {type(exc).__name__}")
    text = response.text
    if response.status_code != 200 or not text.startswith("latitude"):
        sys.exit(f"FIRMS answered HTTP {response.status_code} for {source} {first}: {text[:80].replace(key, '***')!r}")
    return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)


def main() -> None:
    root = data_dir()
    key = os.environ.get("FIRMS_MAP_KEY")
    if not key:
        sys.exit("FIRMS_MAP_KEY is not set in .env.")
    clean = root / "clean" / "hotspots" / "**" / "*.parquet"
    if not (root / "clean" / "hotspots").exists():
        sys.exit("No clean table yet. Run steps 1-3 first.")

    con = duckdb.connect()
    con.execute(f"""
        CREATE VIEW nasa_brazil AS
        SELECT * FROM read_parquet({sql_path(clean)}, hive_partitioning = true)
        WHERE source_file NOT LIKE '%\\_api.csv' ESCAPE '\\'
    """)
    newest = dict(con.execute("""
        SELECT satellite, max(strftime(acq_date, '%Y-%m-%d') || ' ' || acq_time) FROM nasa_brazil
        WHERE year >= year(current_date) - 1 GROUP BY satellite
    """).fetchall())
    mask = con.execute(f"""
        SELECT DISTINCT CAST(floor(latitude / {MASK_DEG}) AS INTEGER) AS gy,
                        CAST(floor(longitude / {MASK_DEG}) AS INTEGER) AS gx
        FROM nasa_brazil
    """).df()
    mask_keys = set(zip(mask.gy, mask.gx, strict=True))
    print(f"Brazil mask: {len(mask_keys):,} cells of {MASK_DEG} deg that hold NASA's Brazil hotspots.")

    today = datetime.now(timezone.utc).date()
    for source, (product, code, sat_keys) in SOURCES.items():
        sats = sorted(set(sat_keys.values()))
        since = {s: newest.get(s, "0000") for s in sats}
        first = min(date.fromisoformat(since[s][:10]) for s in sats)
        frames, day = [], first
        while day <= today:
            days = min(MAX_DAYS, (today - day).days + 1)
            frames.append(fetch(key, source, day, days))
            day += timedelta(days=days)
        rows = pd.concat(frames, ignore_index=True)
        sat = rows["satellite"].map(sat_keys)
        stamp = rows["acq_date"] + " " + rows["acq_time"].str.strip().str.zfill(4)
        newer = stamp > sat.map(since).fillna("9999")
        lat = pd.to_numeric(rows["latitude"], errors="coerce")
        lon = pd.to_numeric(rows["longitude"], errors="coerce")
        cells = zip((lat // MASK_DEG).fillna(10**6).astype(int), (lon // MASK_DEG).fillna(10**6).astype(int), strict=True)
        in_brazil = pd.Series([c in mask_keys for c in cells], index=rows.index)
        kept = rows[newer & in_brazil]

        out = root / "brazil_csv" / product / "provisional" / f"fire_nrt_{code}_api.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        kept.to_csv(out, index=False)
        print(f"\n{source}: {len(rows):,} hotspots in the box since {first}; "
              f"{int(newer.sum()):,} newer than the archive; {len(kept):,} kept in Brazil -> {out.name}")
        for s in sats:
            print(f"  {s:13s} archive ends {since[s]} UTC")
        for d, n in kept.groupby("acq_date").size().items():
            print(f"  {d}: {n:,} new hotspots")
    print("\nNext: python infra/pipeline/03_clean.py && python infra/pipeline/04_fire_days.py")


if __name__ == "__main__":
    main()
