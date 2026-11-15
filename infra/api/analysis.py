"""Build the /api/analysis response (docs/api-contract.md) from monthly fire-day counts."""
from __future__ import annotations

import calendar as cal
import statistics
from datetime import date, timedelta

FIRST_YEAR = 2003
# Two satellites only, one per instrument, so no fire is seen twice (team decision, 15 Nov 2026).
# The data keeps MODIS Aqua and VIIRS S-NPP, but the API never reads them.
SATELLITES = ("modis_terra", "viirs_noaa20")
SAT_PERIODS = {  # FIRMS coverage dates
    "modis_terra": (date(2000, 11, 1), None),
    "viirs_noaa20": (date(2018, 4, 1), None),
}
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def days_in_month(year: int, month: int) -> int:
    return cal.monthrange(year, month)[1]


def sat_active(sat: str, year: int, month: int, until: date) -> bool:
    start, stop = SAT_PERIODS[sat]
    first = date(year, month, 1)
    last = min(date(year, month, days_in_month(year, month)), until)
    return first <= last and start <= last and (stop is None or stop >= first)


class Harmonizer:
    """Turns fire-days into NOAA-20 equivalent fire-days (rules from harmonization_v*.json).
    Each month uses ONE source satellite times its factor: counts are never summed across satellites."""

    def __init__(self, spec: dict):
        self.spec = spec
        self.rules = []
        for r in spec["rules"]:
            lo = tuple(int(x) for x in r["from"].split("-")) if "from" in r else (0, 1)
            hi = tuple(int(x) for x in r["to"].split("-")) if "to" in r else (9999, 12)
            by_month = {int(m): float(f) for m, f in r.get("factor_by_month", {}).items()}
            self.rules.append((lo, hi, r["source"], float(r.get("factor", 1.0)), by_month))

    def _rule(self, year: int, month: int) -> tuple:
        for rule in self.rules:
            if rule[0] <= (year, month) <= rule[1]:
                return rule
        raise ValueError(f"No harmonization rule for {year}-{month:02d}")

    def source(self, year: int, month: int) -> str:
        return self._rule(year, month)[2]

    def factor(self, year: int, month: int) -> float:
        _lo, _hi, _src, factor, by_month = self._rule(year, month)
        return by_month.get(month, factor)

    def corrected(self, year: int, month: int, fire_days: dict[str, int]) -> float:
        return fire_days.get(self.source(year, month), 0) * self.factor(year, month)


def _stats(values: list[float]) -> dict:
    if not values:
        return {"mean": 0.0, "median": 0.0, "p10": 0.0, "p90": 0.0}
    if len(values) == 1:
        v = round(values[0], 1)
        return {"mean": v, "median": v, "p10": v, "p90": v}
    deciles = statistics.quantiles(values, n=10, method="inclusive")
    return {"mean": round(statistics.fmean(values), 1), "median": round(statistics.median(values), 1),
            "p10": round(deciles[0], 1), "p90": round(deciles[-1], 1)}


def _rank(value: float, others: list[float]) -> tuple[int, int]:
    """1 = highest. `others` includes `value` itself."""
    return 1 + sum(1 for o in others if o > value), len(others)


def _pct(count: float, expected: float | None) -> float | None:
    return round((count / expected - 1) * 100, 1) if expected else None


def build_analysis(*, monthly: dict, same_days: dict, estimated_fires: int | None, harm: Harmonizer,
                   start: date, end: date, ref: date, area_km2: float, data_updated: str,
                   reliability: dict, warning: str | None = None) -> dict:
    """monthly[(y, m)][sat] = (fire_days, hotspots, provisional) for dates <= end.
    same_days[y][sat] = fire_days in month ref.month, days <= ref.day (for a partial reference month)."""
    last_ym = (end.year, end.month)
    full: dict[tuple[int, int], float] = {}
    for y in range(FIRST_YEAR, end.year + 1):
        for m in range(1, 13):
            if (y, m) > last_ym:
                break
            counts = {s: v[0] for s, v in monthly.get((y, m), {}).items()}
            full[(y, m)] = harm.corrected(y, m, counts)

    def is_partial(y: int, m: int) -> bool:
        return (y, m) == last_ym and end.day < days_in_month(y, m)

    def days_covered(y: int, m: int) -> int:
        return end.day if (y, m) == last_ym else days_in_month(y, m)

    base_years = list(range(FIRST_YEAR, ref.year))
    averages, mean_of = [], {}
    for m in range(1, 13):
        values = [full[(y, m)] for y in base_years if (y, m) in full]
        s = _stats(values)
        mean_of[m] = s["mean"]
        averages.append({"month": m, **s, "years": len(values)})

    ref_partial = is_partial(ref.year, ref.month)
    same = {y: harm.corrected(y, ref.month, same_days.get(y, {}))
            for y in range(FIRST_YEAR, ref.year + 1)} if ref_partial else {}
    same_base = [same[y] for y in base_years if y in same]
    same_mean = statistics.fmean(same_base) if same_base else None

    def cell_values(y: int, m: int) -> dict:
        count = full[(y, m)]
        partial = is_partial(y, m)
        covered = days_covered(y, m)
        dim = days_in_month(y, m)
        complete_others = [full[(y2, m)] for y2 in range(FIRST_YEAR, end.year + 1)
                           if (y2, m) in full and not is_partial(y2, m)]
        if partial and (y, m) == (ref.year, ref.month):
            vs = _pct(count, same_mean)
            rank, of = _rank(same[y], list(same.values()))
        elif partial:
            vs = _pct(count, mean_of[m] * covered / dim)
            rank, of = _rank(count * dim / covered, complete_others + [count * dim / covered])
        else:
            vs = _pct(count, mean_of[m])
            rank, of = _rank(count, complete_others)
        src = harm.source(y, m)
        month_rows = monthly.get((y, m), {})
        return {
            "year": y, "month": m, "count": round(count), "vs_avg_pct": vs, "rank": rank, "of_years": of,
            "detected": {s: (month_rows[s][1] if s in month_rows else 0) if sat_active(s, y, m, end) else None
                         for s in SATELLITES},
            "provisional": bool(month_rows.get(src, (0, 0, False))[2]),
            "uncertain": count < 10,
            "partial": partial,
            "days_covered": covered,
        }

    calendar = [cell_values(y, m) for (y, m) in sorted(full)
                if (start.year, start.month) <= (y, m) <= last_ym]

    yearly = []
    for y in sorted({c["year"] for c in calendar}):
        cells = [c for c in calendar if c["year"] == y]
        detected = {}
        for s in SATELLITES:
            vals = [c["detected"][s] for c in cells if c["detected"][s] is not None]
            detected[s] = sum(vals) if vals else None
        yearly.append({"year": y, "count": sum(c["count"] for c in cells), "detected": detected,
                       "provisional": any(c["provisional"] for c in cells),
                       "complete": len(cells) == 12 and not cells[-1]["partial"]})

    complete_years = {y: sum(full[(y, m)] for m in range(1, 13))
                      for y in range(FIRST_YEAR, end.year + 1)
                      if all((y, m) in full and not is_partial(y, m) for m in range(1, 13))}
    total_avg = sum(mean_of.values())
    peak_month = max(range(1, 13), key=lambda m: mean_of[m]) if total_avg > 0 else None
    worst_year = max(complete_years, key=complete_years.get) if complete_years and max(complete_years.values()) > 0 else None

    ref_cell = cell_values(ref.year, ref.month)
    cards = {
        "ref_year": ref.year, "ref_month": ref.month, "count": ref_cell["count"],
        "detected": ref_cell["detected"], "estimated_fires": estimated_fires,
        "vs_avg_pct": ref_cell["vs_avg_pct"], "rank": ref_cell["rank"], "of_years": ref_cell["of_years"],
        "partial": ref_cell["partial"], "days_covered": ref_cell["days_covered"],
        "peak_month": peak_month, "worst_year": worst_year,
    }

    next_months, (y, m) = [], (ref.year, ref.month)
    for _ in range(3):
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        a = averages[m - 1]
        next_months.append({"year": y, "month": m, "mean": a["mean"], "median": a["median"],
                            "p10": a["p10"], "p90": a["p90"]})

    period = {"from": base_years[0], "to": base_years[-1]} if base_years else None
    result = {
        "query": {"start": start.isoformat(), "end": end.isoformat(), "ref_date": ref.isoformat(),
                  "area_km2": round(area_km2)},
        "data_updated": data_updated,
        "unit": {"main": "corrected fire-days (NOAA-20 equivalent)", "raw": "hotspots detected"},
        "calendar": calendar,
        "average_by_month": averages,
        "average_period": period,
        "yearly": yearly,
        "cards": cards,
        "next_months": next_months,
        "next_months_label": (f"Based on history ({period['from']}-{period['to']}), not a forecast"
                              if period else "Not enough history, not a forecast"),
        "briefing": _briefing(cards, mean_of, complete_years, next_months, period),
        "reliability": reliability,
    }
    if warning:
        result["warning"] = warning
    return result


def _briefing(cards: dict, mean_of: dict, complete_years: dict, next_months: list, period: dict | None) -> str:
    if not cards["peak_month"]:
        return ("No fires were detected by satellite in this area since 2003. "
                "Source: NASA FIRMS (MODIS + VIIRS), harmonized.")
    peak = cards["peak_month"]
    season = [m for m in range(1, 13) if mean_of[m] >= 0.33 * mean_of[peak]]
    parts = [f"In this area, fire activity usually peaks in {MONTH_NAMES[peak - 1]}, and the main fire "
             f"season runs from {MONTH_NAMES[season[0] - 1]} to {MONTH_NAMES[season[-1] - 1]}."]
    if cards["worst_year"]:
        mean_year = statistics.fmean(complete_years.values())
        factor = complete_years[cards["worst_year"]] / mean_year if mean_year else 0
        parts.append(f"The most active year since {FIRST_YEAR} was {cards['worst_year']} "
                     f"({factor:.1f}x an average year).")
    vs = cards["vs_avg_pct"]
    when = f"{MONTH_NAMES[cards['ref_month'] - 1]} {cards['ref_year']}"
    if vs is not None:
        direction = "above" if vs >= 0 else "below"
        same = " for the same days" if cards["partial"] else ""
        lead = "So far in" if cards["partial"] else "In"
        parts.append(f"{lead} {when}, activity is {abs(vs):.0f}% {direction} the average{same} "
                     f"(rank {cards['rank']} of {cards['of_years']} years).")
    nxt = max(next_months, key=lambda n: n["mean"])
    if nxt["mean"] > 0:
        parts.append(f"Of the next three months, {MONTH_NAMES[nxt['month'] - 1]} is historically the most "
                     f"active (average {nxt['mean']:.0f} hotspots).")
    parts.append("Source: NASA FIRMS (MODIS + VIIRS), harmonized.")
    return " ".join(parts)


def iso_weeks_in(year: int) -> int:
    """52 or 53: 28 December is always in the last ISO week of its year."""
    return date(year, 12, 28).isocalendar().week


def build_weekly(*, weekly: dict, harm: Harmonizer, start: date, end: date, ref: date) -> dict:
    """calendar_weekly + average_by_week (contract v0.4), from Store.weekly.
    Weeks are ISO weeks (Monday-Sunday, UTC days). Every piece of a week (cut by calendar month) uses its
    own month's rule, so the weeks of a month add up to the month's count (before rounding)."""
    last = end.isocalendar()
    counts: dict[tuple[int, int], float] = {}
    provisional: dict[tuple[int, int], bool] = {}
    for y in range(FIRST_YEAR, last.year + 1):
        for w in range(1, iso_weeks_in(y) + 1):
            if (y, w) > (last.year, last.week):
                break
            total, prov = 0.0, False
            for (py, pm), sats in weekly.get((y, w), {}).items():
                total += harm.corrected(py, pm, {s: v[0] for s, v in sats.items()})
                prov = prov or sats.get(harm.source(py, pm), (0, False))[1]
            counts[(y, w)], provisional[(y, w)] = total, prov

    def days_covered(y: int, w: int) -> int:
        first = date.fromisocalendar(y, w, 1)
        return min(7, (end - first).days + 1)

    base_years = range(FIRST_YEAR, ref.year)  # same years as the monthly average: complete years before ref
    averages, mean_of = [], {}
    for w in range(1, 54):
        values = [counts[(y, w)] for y in base_years if (y, w) in counts]
        if values:
            s = _stats(values)
            mean_of[w] = s["mean"]
            averages.append({"week": w, **s, "years": len(values)})

    calendar = []
    for (y, w), count in sorted(counts.items()):
        first = date.fromisocalendar(y, w, 1)
        last_day = first + timedelta(days=6)
        if last_day < start:
            continue
        covered = days_covered(y, w)
        mean = mean_of.get(w)
        calendar.append({
            "year": y, "week": w, "start": first.isoformat(), "end": last_day.isoformat(),
            "count": round(count),
            "vs_avg_pct": _pct(count, mean * covered / 7 if mean is not None else None),
            "provisional": provisional[(y, w)],
            "uncertain": count < 10,
            "partial": covered < 7,
            "days_covered": covered,
        })
    return {"calendar_weekly": calendar, "average_by_week": averages}
