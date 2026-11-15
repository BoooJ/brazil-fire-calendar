"""Generate FAKE data files for the website (web/mocks/).

The files follow docs/api-contract.md so the website can be built before the
real API exists. Every number in them is invented (seeded random values).

Run from anywhere:

    python infra/tools/make_mocks.py
"""
from __future__ import annotations

import calendar as cal
import csv
import json
import math
import random
import statistics
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "mocks"

SEED = 42
FAKE_NOTE = (
    "FAKE DATA - for website development only. "
    "Shapes follow docs/api-contract.md; every number is invented."
)
CONTRACT_VERSION = "0.4"
DATA_UPDATED = "2026-11-14T15:20:00Z"
TODAY = date(2026, 11, 14)
FINAL_UNTIL = date(2026, 5, 31)  # after this: NASA near-real-time data -> "provisional"
FIRST_YEAR = 2003

SATELLITES = ("modis_terra", "viirs_noaa20")  # contract v0.3: one satellite per instrument
SAT_PERIODS = {  # real FIRMS coverage dates
    "modis_terra": (date(2000, 11, 1), None),
    "viirs_noaa20": (date(2018, 4, 1), None),
}
RAW_PER_FIRE_DAY = {  # fake ratio: raw hotspots detected per corrected fire-day
    "modis_terra": (0.18, 0.24),
    "viirs_noaa20": (2.7, 3.3),
}
MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Fake Pantanal-like fire season: peak in August-September.
MONTH_WEIGHTS = [0.02, 0.02, 0.02, 0.03, 0.05, 0.08, 0.15, 0.25, 0.22, 0.10, 0.04, 0.02]
SPECIAL_YEARS = {2019: 1.7, 2020: 4.2, 2021: 1.3, 2023: 0.7, 2024: 3.1}
BASE_FIRE_DAYS_PER_YEAR = 2500


def box(w: float, s: float, e: float, n: float) -> dict:
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


def box_area_km2(w: float, s: float, e: float, n: float) -> float:
    r = 6371.0088
    return math.radians(e - w) * r * r * abs(math.sin(math.radians(n)) - math.sin(math.radians(s)))


PRESETS = [
    {"id": "brazil", "name": "All of Brazil", "area": box(-74.0, -33.8, -34.8, 5.3)},
    {"id": "pantanal", "name": "Pantanal", "area": box(-58.5, -22.0, -55.0, -15.5)},
    {"id": "roraima", "name": "Roraima", "area": box(-64.8, -1.5, -59.0, 5.2)},
    {"id": "southern_amazon", "name": "Southern Amazon", "area": box(-64.0, -12.0, -50.0, -7.0)},
]
PANTANAL_BOX = (-58.5, -22.0, -55.0, -15.5)


def days_in_month(year: int, month: int) -> int:
    return cal.monthrange(year, month)[1]


# ---------------------------------------------------------------- fake series

def make_series(rng: random.Random) -> tuple[dict, dict]:
    """Full-month fake fire-days and fake raw ratios, 2003-01 .. TODAY's month."""
    fire_days: dict[tuple[int, int], int] = {}
    ratios: dict[tuple[int, int], dict[str, float]] = {}
    for year in range(FIRST_YEAR, TODAY.year + 1):
        year_factor = SPECIAL_YEARS.get(year, rng.uniform(0.55, 1.35))
        for month in range(1, 13):
            if (year, month) > (TODAY.year, TODAY.month):
                break
            weight = MONTH_WEIGHTS[month - 1]
            if year == 2024 and month == 6:
                weight *= 4  # fake early-season spike
            noise = rng.lognormvariate(0, 0.35)
            fire_days[(year, month)] = round(BASE_FIRE_DAYS_PER_YEAR * year_factor * weight * noise)
            ratios[(year, month)] = {s: rng.uniform(*RAW_PER_FIRE_DAY[s]) for s in SATELLITES}
    return fire_days, ratios


def active_days(sat: str, year: int, month: int, until: date) -> int:
    """Days of the month (up to `until`) when the satellite delivered data."""
    start = date(year, month, 1)
    end = min(date(year, month, days_in_month(year, month)), until)
    sat_from, sat_to = SAT_PERIODS[sat]
    lo = max(start, sat_from)
    hi = min(end, sat_to) if sat_to else end
    return max(0, (hi - lo).days + 1)


def detected_for(full: int, ratio: dict, year: int, month: int, until: date) -> dict:
    dim = days_in_month(year, month)
    out = {}
    for sat in SATELLITES:
        days = active_days(sat, year, month, until)
        out[sat] = round(full * ratio[sat] * days / dim) if days else None
    return out


def sum_detected(items: list[dict]) -> dict:
    out = {}
    for sat in SATELLITES:
        values = [d[sat] for d in items if d[sat] is not None]
        out[sat] = sum(values) if values else None
    return out


# ---------------------------------------------------------------- analysis

def build_analysis(fire_days: dict, ratios: dict, start: date, end: date, ref: date, area_km2: float) -> dict:
    # Average by month: complete years before the reference year.
    base_years = list(range(FIRST_YEAR, ref.year))
    averages = []
    for month in range(1, 13):
        values = [fire_days[(y, month)] for y in base_years]
        deciles = statistics.quantiles(values, n=10, method="inclusive")
        averages.append({
            "month": month,
            "mean": round(statistics.fmean(values), 1),
            "median": round(statistics.median(values), 1),
            "p10": round(deciles[0], 1),
            "p90": round(deciles[-1], 1),
            "years": len(values),
        })
    mean_of = {a["month"]: a["mean"] for a in averages}

    # Calendar cells.
    cells = []
    for year in range(max(FIRST_YEAR, start.year), end.year + 1):
        for month in range(1, 13):
            if (year, month) < (start.year, start.month) or (year, month) > (end.year, end.month):
                continue
            dim = days_in_month(year, month)
            covered = dim if (year, month) < (end.year, end.month) else min(end.day, dim)
            full = fire_days[(year, month)]
            count = round(full * covered / dim)
            expected = mean_of[month] * covered / dim
            cells.append({
                "year": year,
                "month": month,
                "count": count,
                "vs_avg_pct": round((count / expected - 1) * 100, 1) if expected > 0 else None,
                "rank": None,
                "of_years": None,
                "detected": detected_for(full, ratios[(year, month)], year, month, end),
                "provisional": date(year, month, 1) > FINAL_UNTIL,
                "uncertain": count < 10,
                "partial": covered < dim,
                "days_covered": covered,
                "_scaled": count * dim / covered if covered else 0,  # removed below
            })

    # Rank each cell among the same month of every shown year (1 = highest).
    for month in range(1, 13):
        same = [c for c in cells if c["month"] == month]
        for c in same:
            c["rank"] = 1 + sum(1 for o in same if o["_scaled"] > c["_scaled"])
            c["of_years"] = len(same)
    for c in cells:
        del c["_scaled"]

    # Yearly totals.
    yearly = []
    for year in sorted({c["year"] for c in cells}):
        ys = [c for c in cells if c["year"] == year]
        yearly.append({
            "year": year,
            "count": sum(c["count"] for c in ys),
            "detected": sum_detected([c["detected"] for c in ys]),
            "provisional": any(c["provisional"] for c in ys),
            "complete": len(ys) == 12 and not ys[-1]["partial"],
        })

    complete_years = [y for y in yearly if y["complete"]]
    worst = max(complete_years, key=lambda y: y["count"])
    mean_year = statistics.fmean(y["count"] for y in complete_years)
    peak_month = max(averages, key=lambda a: a["mean"])["month"]
    season = [a["month"] for a in averages if a["mean"] >= 0.33 * mean_of[peak_month]]

    ref_cell = next(c for c in cells if (c["year"], c["month"]) == (ref.year, ref.month))
    cards = {
        "ref_year": ref.year,
        "ref_month": ref.month,
        "count": ref_cell["count"],
        "detected": ref_cell["detected"],
        "estimated_fires": round(ref_cell["count"] * 0.12),
        "vs_avg_pct": ref_cell["vs_avg_pct"],
        "rank": ref_cell["rank"],
        "of_years": ref_cell["of_years"],
        "partial": ref_cell["partial"],
        "days_covered": ref_cell["days_covered"],
        "peak_month": peak_month,
        "worst_year": worst["year"],
    }

    next_months = []
    y, m = ref.year, ref.month
    for _ in range(3):
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        a = averages[m - 1]
        next_months.append({"year": y, "month": m, "mean": a["mean"], "median": a["median"],
                            "p10": a["p10"], "p90": a["p90"]})

    return {
        "_mock": FAKE_NOTE,
        "query": {"start": start.isoformat(), "end": end.isoformat(), "ref_date": ref.isoformat(),
                  "area_km2": round(area_km2)},
        "data_updated": DATA_UPDATED,
        "unit": {"main": "corrected fire-days (NOAA-20 equivalent)", "raw": "hotspots detected"},
        "calendar": cells,
        "average_by_month": averages,
        "average_period": {"from": base_years[0], "to": base_years[-1]},
        "yearly": yearly,
        "cards": cards,
        "next_months": next_months,
        "next_months_label": f"Based on history ({base_years[0]}-{base_years[-1]}), not a forecast",
        "briefing": briefing(cards, season, worst["year"], worst["count"] / mean_year, next_months),
        "reliability": {"median_error_pct": 12.0, "validated_years": [2016, 2019],
                        "note": "FAKE. The real value comes from the validation in science/."},
    }


def briefing(cards: dict, season: list[int], worst_year: int, worst_factor: float, next_months: list) -> str:
    vs = cards["vs_avg_pct"]
    direction = "above" if vs is not None and vs >= 0 else "below"
    so_far = "So far in" if cards["partial"] else "In"
    same_days = " for the same days" if cards["partial"] else ""
    nxt = max(next_months, key=lambda n: n["mean"])
    return (
        f"In this area, fire activity usually peaks in {MONTH_NAMES[cards['peak_month'] - 1]}, "
        f"and the main fire season runs from {MONTH_NAMES[season[0] - 1]} to {MONTH_NAMES[season[-1] - 1]}. "
        f"The most active year since {FIRST_YEAR} was {worst_year} ({worst_factor:.1f}x an average year). "
        f"{so_far} {MONTH_NAMES[cards['ref_month'] - 1]} {cards['ref_year']}, activity is "
        f"{abs(vs):.0f}% {direction} the average{same_days} "
        f"(rank {cards['rank']} of {cards['of_years']} years). "
        f"Of the next three months, {MONTH_NAMES[nxt['month'] - 1]} is historically the most active "
        f"(average {nxt['mean']:.0f} fire-days). This is what is normal, not a forecast. "
        f"Source: NASA FIRMS (MODIS + VIIRS), harmonized."
    )


# ---------------------------------------------------------------- hotspots

PASS_WINDOWS = {  # rough UTC overpass windows over Brazil (fake but plausible)
    "modis_terra": [("D", 1300, 1430), ("N", 100, 230)],
    "viirs_noaa20": [("D", 1530, 1730), ("N", 330, 530)],
}


def fake_time(rng: random.Random, lo: int, hi: int) -> str:
    minutes = rng.randint((lo // 100) * 60 + lo % 100, (hi // 100) * 60 + hi % 100)
    return f"{minutes // 60:02d}{minutes % 60:02d}"


def make_hotspots(rng: random.Random, year: int, month: int, total: int, n: int = 300) -> dict:
    w, s, e, nn = PANTANAL_BOX
    centers = [(rng.uniform(w + 0.2, e - 0.2), rng.uniform(s + 0.2, nn - 0.2)) for _ in range(25)]
    features = []
    for _ in range(n):
        cx, cy = rng.choice(centers)
        lon = min(max(rng.gauss(cx, 0.06), w), e)
        lat = min(max(rng.gauss(cy, 0.06), s), nn)
        sat = rng.choices(SATELLITES, weights=[0.2, 0.8])[0]
        daynight, lo, hi = rng.choice(PASS_WINDOWS[sat])
        if sat.startswith("modis"):
            raw = rng.randint(30, 100)
            conf = "high" if raw >= 80 else "nominal"
        else:
            raw = rng.choices(["n", "h"], weights=[0.8, 0.2])[0]
            conf = {"n": "nominal", "h": "high"}[raw]
        day = rng.randint(1, days_in_month(year, month))
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
            "properties": {
                "date": date(year, month, day).isoformat(),
                "time_utc": fake_time(rng, lo, hi),
                "satellite": sat,
                "confidence": conf,
                "confidence_raw": raw,
                "frp": round(rng.lognormvariate(2.5, 1.0), 1),
                "daynight": daynight,
                "provisional": date(year, month, 1) > FINAL_UNTIL,
            },
        })
    features.sort(key=lambda f: (f["properties"]["date"], f["properties"]["time_utc"]))
    return {"_mock": FAKE_NOTE, "type": "FeatureCollection", "total": total, "returned": n,
            "truncated": total > n, "features": features}


def make_forecast(rng: random.Random, n: int = 300, total: int = 7774) -> dict:
    """Fake /api/forecast answer for the Pantanal (contract v0.2): 5 km cells, highest chance first."""
    w, s, e, nn = PANTANAL_BOX
    cell = 0.05
    centers = [(rng.uniform(w + 0.3, e - 0.3), rng.uniform(s + 0.3, nn - 0.3)) for _ in range(12)]
    seen, features = set(), []
    while len(features) < n:
        cx, cy = rng.choice(centers)
        ix, iy = math.floor(rng.gauss(cx, 0.25) / cell), math.floor(rng.gauss(cy, 0.25) / cell)
        if (ix, iy) in seen:
            continue
        seen.add((ix, iy))
        prob = min(0.95, rng.betavariate(1.2, 12.0) * 3)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round((ix + 0.5) * cell, 3), round((iy + 0.5) * cell, 3)]},
            "properties": {"probability": round(prob, 3),
                           "intensity_if_fire": rng.choices(["low", "medium", "high"], weights=[2, 5, 3])[0]},
        })
    features.sort(key=lambda f: -f["properties"]["probability"])
    expected = round(sum(f["properties"]["probability"] for f in features) + rng.uniform(10, 30), 1)
    briefing = (f"For 14 Nov - 20 Nov 2026, the model expects fire in about {expected:,.0f} of the {total:,} cells "
                f"(5 km) of this area that have burned before ({expected / total * 100:.1f} %). The highest chance "
                f"in one cell is {features[0]['properties']['probability'] * 100:.0f} %. If fires happen, their "
                "intensity would most likely be high. Based on 519 NASA FIRMS VIIRS NOAA-20 detections here in the "
                "28 days up to 13 Nov 2026. Model estimate (experimental), not an official fire warning.")
    return {
        "_mock": FAKE_NOTE,
        "query": {"ref_date": "2026-11-13", "area_km2": round(box_area_km2(*PANTANAL_BOX), 1)},
        "data_updated": DATA_UPDATED,
        "based_on": {"satellite": "viirs_noaa20", "from": "2026-10-17", "to": "2026-11-13"},
        "period": {"from": "2026-11-14", "to": "2026-11-20"},
        "label": "Model estimate (experimental), not an official fire warning.",
        "cell_size_km": 5,
        "summary": {"cells": total, "expected_cells_with_fire": expected,
                    "expected_share_pct": round(expected / total * 100, 2),
                    "max_probability": features[0]["properties"]["probability"],
                    "intensity_if_fire": "high", "recent_detections": 519},
        "briefing": briefing,
        "reliability": {"auc": 0.87, "baseline_auc": 0.76, "test_years": [2023, 2024, 2025],
                        "note": "Tested on 2023-2025, years the model never saw: AUC 0.87 (1 = perfect, "
                                "0.5 = coin flip). Using only the usual pattern for that week of the year gives 0.76."},
        "total": total, "returned": n, "truncated": total > n,
        "cells": {"type": "FeatureCollection", "features": features},
        "notes": [],
    }


# ---------------------------------------------------------------- writers

def make_weekly(rng: random.Random, fire_days: dict, end: date, ref: date) -> dict:
    """Fake calendar_weekly + average_by_week (contract v0.4): each fake month spread over its days, cut into
    ISO weeks (Monday-Sunday). Same rules as the API: vs average of that week number, partial last week."""
    daily: dict[date, float] = {}
    for (year, month), n in fire_days.items():
        dim = days_in_month(year, month)
        for d in range(1, dim + 1):
            day = date(year, month, d)
            if day <= end:
                daily[day] = n / dim * rng.uniform(0.5, 1.5)
    weeks: dict[tuple[int, int], list[date]] = {}
    for day in sorted(daily):
        iso = day.isocalendar()
        if iso.year >= FIRST_YEAR:
            weeks.setdefault((iso.year, iso.week), []).append(day)
    counts = {k: sum(daily[d] for d in days) for k, days in weeks.items()}
    base = range(FIRST_YEAR, ref.year)
    averages, mean_of = [], {}
    for w in range(1, 54):
        values = sorted(counts[(y, w)] for y in base if (y, w) in counts)
        if values:
            q = statistics.quantiles(values, n=10, method="inclusive") if len(values) > 1 else [values[0]] * 9
            mean_of[w] = statistics.fmean(values)
            averages.append({"week": w, "mean": round(mean_of[w], 1), "median": round(statistics.median(values), 1),
                             "p10": round(q[0], 1), "p90": round(q[-1], 1), "years": len(values)})
    calendar = []
    for (y, w), count in sorted(counts.items()):
        first = date.fromisocalendar(y, w, 1)
        covered = len(weeks[(y, w)]) if (first + timedelta(days=6)) > end else 7
        mean = mean_of.get(w)
        expected = mean * covered / 7 if mean else None
        calendar.append({
            "year": y, "week": w, "start": first.isoformat(), "end": (first + timedelta(days=6)).isoformat(),
            "count": round(count),
            "vs_avg_pct": round((count / expected - 1) * 100, 1) if expected else None,
            "provisional": first + timedelta(days=6) > FINAL_UNTIL,
            "uncertain": count < 10,
            "partial": covered < 7,
            "days_covered": covered,
        })
    return {"calendar_weekly": calendar, "average_by_week": averages}


def write_json(name: str, data: dict) -> None:
    with open(OUT / name, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_calendar_csv(name: str, analysis: dict) -> None:
    cols = ["year", "month", "count", "vs_avg_pct", "rank", "of_years", "provisional", "uncertain", "partial"]
    with open(OUT / name, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(cols + [f"detected_{s}" for s in SATELLITES])
        for c in analysis["calendar"]:
            w.writerow([c[k] for k in cols] + [c["detected"][s] for s in SATELLITES])


def write_hotspots_csv(name: str, geo: dict) -> None:
    instrument = {"modis_terra": "MODIS", "viirs_noaa20": "VIIRS"}
    with open(OUT / name, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["latitude", "longitude", "acq_date", "acq_time_utc", "satellite", "instrument",
                    "confidence", "confidence_raw", "frp", "daynight", "data_version"])
        for feat in geo["features"]:
            p = feat["properties"]
            lon, lat = feat["geometry"]["coordinates"]
            w.writerow([lat, lon, p["date"], p["time_utc"], p["satellite"], instrument[p["satellite"]],
                        p["confidence"], p["confidence_raw"], p["frp"], p["daynight"],
                        "provisional" if p["provisional"] else "final"])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    fire_days, ratios = make_series(rng)
    area = box_area_km2(*PANTANAL_BOX)

    write_json("presets.json", {"_mock": FAKE_NOTE, "presets": PRESETS})
    write_json("status.json", {
        "_mock": FAKE_NOTE,
        "data_updated": DATA_UPDATED,
        "contract_version": CONTRACT_VERSION,
        "calendar_from": f"{FIRST_YEAR}-01",
        "final_until": FINAL_UNTIL.isoformat(),
        "coverage": [
            {"satellite": s, "from": SAT_PERIODS[s][0].isoformat(),
             "to": SAT_PERIODS[s][1].isoformat() if SAT_PERIODS[s][1] else None}
            for s in SATELLITES
        ],
        "forecast_available": True,
    })

    now = build_analysis(fire_days, ratios, date(FIRST_YEAR, 1, 1), TODAY, TODAY, area)
    write_json("analysis.pantanal.json", now)
    write_calendar_csv("calendar.pantanal.csv", now)
    # same answer asked with "period": "week" (v0.4); its own random stream, so the other files do not change
    write_json("analysis.pantanal.week.json", {**now, **make_weekly(random.Random(SEED + 2), fire_days, TODAY, TODAY)})

    replay_day = date(2020, 9, 14)
    replay = build_analysis(fire_days, ratios, date(FIRST_YEAR, 1, 1), replay_day, replay_day, area)
    write_json("analysis.pantanal.ref-2020-09-14.json", replay)

    sep_2020 = next(c for c in now["calendar"] if (c["year"], c["month"]) == (2020, 9))
    total = sum(v for v in sep_2020["detected"].values() if v is not None)
    geo = make_hotspots(rng, 2020, 9, total)
    write_json("hotspots.pantanal.2020-09.geojson", geo)
    write_hotspots_csv("hotspots.pantanal.2020-09.csv", geo)

    write_json("forecast.pantanal.json", make_forecast(random.Random(SEED + 1)))

    for p in sorted(OUT.iterdir()):
        print(f"wrote {p.relative_to(ROOT)}  ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
