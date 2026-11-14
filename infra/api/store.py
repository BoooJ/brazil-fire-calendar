"""Data access for the API: DuckDB tables in memory + point-in-polygon cell selection (shapely)."""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import shapely

from analysis import Harmonizer

CELL_DEG = 0.01
EXPORT_COLUMNS = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument",
                  "confidence", "confidence_raw", "frp", "daynight", "data_version"]


class Store:
    def __init__(self, root: Path):
        fd = (root / "derived" / "fire_days" / "**" / "*.parquet").as_posix()
        hs = (root / "clean" / "hotspots" / "**" / "*.parquet").as_posix()
        st = (root / "derived" / "static_cells.parquet").as_posix()
        harm_file = root / "derived" / "harmonization_v0.json"
        for needed in (root / "derived" / "fire_days", harm_file):
            if not needed.exists():
                raise SystemExit(f"Missing {needed}. Run the pipeline (steps 1-5) first.")

        # Optional low-memory mode for small servers: tables live in a DuckDB file on disk.
        self.con = duckdb.connect(os.environ.get("API_DB_PATH") or ":memory:")
        if os.environ.get("API_MEMORY_LIMIT"):
            self.con.execute(f"SET memory_limit = '{os.environ['API_MEMORY_LIMIT']}'")
        if os.environ.get("API_THREADS"):
            self.con.execute(f"SET threads = {int(os.environ['API_THREADS'])}")
        self.con.execute(f"""
            CREATE OR REPLACE TABLE fire_days AS
            SELECT cy, cx, acq_date, satellite, CAST(year AS INTEGER) AS year, CAST(month AS INTEGER) AS month,
                   n_hotspots, provisional
            FROM read_parquet('{fd}', hive_partitioning = true)
            ORDER BY cy, cx, acq_date  -- sorted by place: an area query only reads its slice of the map
        """)
        self.con.execute(f"CREATE OR REPLACE TABLE static_cells AS SELECT * FROM read_parquet('{st}')")
        self.con.execute(f"""
            CREATE OR REPLACE VIEW hotspots AS
            SELECT h.* FROM read_parquet('{hs}', hive_partitioning = true) h
            LEFT JOIN static_cells s
              ON s.cy = CAST(floor(h.latitude / {CELL_DEG}) AS INTEGER)
             AND s.cx = CAST(floor(h.longitude / {CELL_DEG}) AS INTEGER)
            WHERE h.valid AND NOT (h.data_version = 'provisional' AND s.cy IS NOT NULL)
        """)

        cells = self.con.execute("SELECT DISTINCT cy, cx FROM fire_days").df()
        self.cell_cy = cells["cy"].to_numpy(dtype=np.int32)
        self.cell_cx = cells["cx"].to_numpy(dtype=np.int32)
        self.cell_lat = (self.cell_cy + 0.5) * CELL_DEG
        self.cell_lon = (self.cell_cx + 0.5) * CELL_DEG

        self.last_day: date = self.con.execute("SELECT max(acq_date) FROM fire_days").fetchone()[0]
        self.final_until = dict(self.con.execute(
            "SELECT satellite, max(acq_date) FILTER (WHERE NOT provisional) FROM fire_days GROUP BY satellite"
        ).fetchall())
        self.harm_spec = json.loads(harm_file.read_text(encoding="utf-8"))
        self.harm = Harmonizer(self.harm_spec)
        build_info = root / "derived" / "build_info.json"  # written by infra/deploy/deploy_hf.py
        if build_info.exists():
            self.data_updated = json.loads(build_info.read_text(encoding="utf-8"))["data_updated"]
        else:
            built = (root / "derived" / "fire_days").stat().st_mtime
            self.data_updated = datetime.fromtimestamp(built, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ------------------------------------------------------------------ area selection
    def select_cells(self, geom) -> pd.DataFrame:
        """Grid cells (that ever burned) whose centre is inside the area."""
        w, s, e, n = geom.bounds
        idx = np.nonzero((self.cell_lon >= w) & (self.cell_lon <= e) &
                         (self.cell_lat >= s) & (self.cell_lat <= n))[0]
        if len(idx):
            idx = idx[shapely.contains_xy(geom, self.cell_lon[idx], self.cell_lat[idx])]
        return pd.DataFrame({"cy": self.cell_cy[idx], "cx": self.cell_cx[idx]})

    # ------------------------------------------------------------------ queries (cursor has table "sel")
    # `box` = (cy_min, cy_max, cx_min, cx_max) of the selected cells: lets DuckDB skip the rest of the map.
    BOX = "f.cy BETWEEN ? AND ? AND f.cx BETWEEN ? AND ?"

    @staticmethod
    def bounds(sel: pd.DataFrame) -> tuple[int, int, int, int] | None:
        if sel.empty:
            return None
        return int(sel.cy.min()), int(sel.cy.max()), int(sel.cx.min()), int(sel.cx.max())

    @staticmethod
    def monthly(cur, end: date, box) -> dict:
        if box is None:
            return {}
        rows = cur.execute(f"""
            SELECT f.year, f.month, f.satellite, count(*), sum(f.n_hotspots), bool_or(f.provisional)
            FROM fire_days f JOIN sel USING (cy, cx)
            WHERE {Store.BOX} AND f.acq_date <= ?
            GROUP BY ALL
        """, [*box, end]).fetchall()
        out: dict = {}
        for year, month, sat, fire_days, hotspots, provisional in rows:
            out.setdefault((year, month), {})[sat] = (fire_days, int(hotspots), bool(provisional))
        return out

    @staticmethod
    def same_days(cur, month: int, day: int, until_year: int, box) -> dict:
        if box is None:
            return {}
        rows = cur.execute(f"""
            SELECT f.year, f.satellite, count(*)
            FROM fire_days f JOIN sel USING (cy, cx)
            WHERE {Store.BOX} AND f.month = ? AND day(f.acq_date) <= ? AND f.year <= ?
            GROUP BY ALL
        """, [*box, month, day, until_year]).fetchall()
        out: dict = {}
        for year, sat, fire_days in rows:
            out.setdefault(year, {})[sat] = fire_days
        return out

    @staticmethod
    def estimated_fires(cur, satellite: str, year: int, month: int, max_day: int, box,
                        cap: int = 300_000) -> int | None:
        """Burning cells touching each other (8 neighbours) on the same or the next day = one fire."""
        if box is None:
            return 0
        pts = cur.execute(f"""
            SELECT f.cy, f.cx, f.acq_date
            FROM fire_days f JOIN sel USING (cy, cx)
            WHERE {Store.BOX} AND f.satellite = ? AND f.year = ? AND f.month = ? AND day(f.acq_date) <= ?
        """, [*box, satellite, year, month, max_day]).fetchall()
        if len(pts) > cap:
            return None
        index = {(cy, cx, d.toordinal()): i for i, (cy, cx, d) in enumerate(pts)}
        parent = list(range(len(pts)))

        def find(i: int) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i, (cy, cx, d) in enumerate(pts):
            day = d.toordinal()
            for dd in (0, -1):
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dd == 0 and (dy, dx) <= (0, 0):
                            continue
                        j = index.get((cy + dy, cx + dx, day + dd))
                        if j is not None:
                            ri, rj = find(i), find(j)
                            if ri != rj:
                                parent[ri] = rj
        return len({find(i) for i in range(len(pts))})

    def hotspots_in(self, cur, geom, *, start: date | None = None, end: date | None = None,
                    year: int | None = None, month: int | None = None, cap: int = 1_000_000) -> tuple[pd.DataFrame, int]:
        """Valid hotspots inside the area. Returns (rows, total before the cap)."""
        w, s, e, n = geom.bounds
        where = ["latitude BETWEEN ? AND ?", "longitude BETWEEN ? AND ?"]
        params: list = [s, n, w, e]
        if year is not None:
            where += ["year = ?", "month = ?"]
            params += [year, month]
        else:
            where += ["year BETWEEN ? AND ?", "acq_date BETWEEN ? AND ?"]
            params += [start.year, end.year, start, end]
        cols = ", ".join(EXPORT_COLUMNS)
        sql = f"SELECT {cols} FROM hotspots WHERE {' AND '.join(where)}"
        total = cur.execute(f"SELECT count(*) FROM ({sql})", params).fetchone()[0]
        df = cur.execute(f"{sql} ORDER BY acq_date, acq_time LIMIT {cap}", params).df()
        if len(df):
            df = df[shapely.contains_xy(geom, df["longitude"].to_numpy(), df["latitude"].to_numpy())]
        return df.reset_index(drop=True), total
